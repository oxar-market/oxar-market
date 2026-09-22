import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  transfer,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { OxarEscrow } from "../target/types/oxar_escrow";

/**
 * Проверки торга против настоящего валидатора.
 *
 * Главное, что здесь проверяется: ставку нельзя сделать деньгами, которых нет,
 * а перебитый получает своё обратно той же транзакцией. Всё остальное - сроки,
 * шаг, продление - вокруг этого.
 *
 * Сроки взяты секундами, а не днями: валидатору всё равно, а тест должен
 * заканчиваться, пока человек смотрит.
 */

const FEE_BPS = 1_000;
const DECIMALS = 6;
const RESERVE = 100_000_000; // $100
const MIN_STEP = 1_000_000; // $1, как в core

describe("oxar-escrow: торг", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.oxarEscrow as Program<OxarEscrow>;
  const connection = provider.connection;

  let mint: PublicKey;
  const seller = Keypair.generate();
  const platform = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();

  let aliceTokens: PublicKey;
  let bobTokens: PublicKey;

  function auctionId(): number[] {
    return Array.from(Keypair.generate().publicKey.toBytes().slice(0, 16));
  }

  const lotPda = (id: number[]) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("lot"), Buffer.from(id)],
      program.programId,
    )[0];

  /** Настройки площадки. Сиды постоянные - аккаунт один на всю программу. */
  const configPda = () =>
    PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)[0];

  const salePda = (id: number[]) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("sale"), Buffer.from(id)],
      program.programId,
    )[0];

  const lotVaultPda = (lot: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("lot_vault"), lot.toBuffer()],
      program.programId,
    )[0];

  const balance = async (ata: PublicKey) => {
    const info = await connection.getAccountInfo(ata);
    return info ? (await getAccount(connection, ata)).amount : 0n;
  };

  const now = async () => {
    const slot = await connection.getSlot();
    return (await connection.getBlockTime(slot))!;
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * Открыть торг, закрывающийся через столько-то секунд.
   *
   * Продление по умолчанию секундное: с настоящими пятью минутами тест на
   * закрытие шёл бы пять минут, потому что ставка сама двигает срок. Само
   * продление проверяется отдельно, с боевым значением.
   */
  async function openSale(closesInSeconds: number, extendSeconds = 1) {
    const saleId = auctionId();
    const sale = salePda(saleId);
    const closesAt = (await now()) + closesInSeconds;

    await program.methods
      .sellerOpensSale(saleId, new anchor.BN(closesAt), new anchor.BN(extendSeconds))
      .accounts({ seller: seller.publicKey })
      .signers([seller])
      .rpc();

    return { saleId, sale, closesAt };
  }

  /** Повесить место на уже открытый торг. */
  async function addLot(sale: PublicKey, reserve = RESERVE, coin = mint) {
    const id = auctionId();
    const lot = lotPda(id);

    await program.methods
      .sellerOpensLot(id, new anchor.BN(reserve), new anchor.BN(MIN_STEP))
      .accountsPartial({
        seller: seller.publicKey,
        sale,
        mint: coin,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    return { id, lot, vault: lotVaultPda(lot) };
  }

  /** Торг с одним местом: самый частый случай в этих проверках. */
  async function openLot(closesInSeconds: number, extendSeconds = 1, reserve = RESERVE) {
    const { sale, closesAt } = await openSale(closesInSeconds, extendSeconds);
    const { id, lot, vault } = await addLot(sale, reserve);
    return { id, lot, vault, sale, closesAt };
  }

  /**
   * Поставить. `previous` - тот, кого перебиваем; когда ставок ещё не было,
   * передаём самого участника, и возврата не происходит.
   */
  async function bid(
    lot: PublicKey,
    who: Keypair,
    amount: number,
    previous?: PublicKey,
    sale?: PublicKey,
  ) {
    const prev = previous ?? who.publicKey;
    const saleKey = sale ?? (await program.account.lot.fetch(lot)).sale;
    await program.methods
      .bidderPlacesBid(new anchor.BN(amount))
      .accountsPartial({
        bidder: who.publicKey,
        sale: saleKey,
        lot,
        previousBidder: prev,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc();
  }

  before(async () => {
    for (const who of [seller, platform, alice, bob]) {
      const sig = await connection.requestAirdrop(who.publicKey, 2_000_000_000);
      await connection.confirmTransaction(sig);
    }

    mint = await createMint(connection, alice, alice.publicKey, null, DECIMALS);
    aliceTokens = await createAssociatedTokenAccount(connection, alice, mint, alice.publicKey);
    bobTokens = await createAssociatedTokenAccount(connection, bob, mint, bob.publicKey);
    await createAssociatedTokenAccount(connection, seller, mint, seller.publicKey);
    await createAssociatedTokenAccount(connection, platform, mint, platform.publicKey);

    await mintTo(connection, alice, mint, aliceTokens, alice, 1_000_000_000_000);
    await mintTo(connection, alice, mint, bobTokens, alice, 1_000_000_000_000);

    // Условия площадки заводятся один раз за выкатом программы. Админом
    // становится подписавший первый вызов - здесь это кошелёк провайдера.
    await program.methods
      .adminSetsTerms(FEE_BPS)
      .accounts({ platform: platform.publicKey, mint })
      .rpc();
  });

  it("чужой не перепишет комиссию на себя", async () => {
    // Ровно то, ради чего настройки и заведены: Боб не админ, и его попытка
    // назначить получателем себя обязана отбиться. Иначе продавец, открывая
    // аукцион, ставил бы себе ноль процентов.
    try {
      await program.methods
        .adminSetsTerms(0)
        .accounts({ admin: bob.publicKey, platform: bob.publicKey, mint })
        .signers([bob])
        .rpc();
      assert.fail("чужой переписал условия площадки");
    } catch (error) {
      assert.include(String(error), "NotTheAdmin");
    }

    const config = await program.account.config.fetch(configPda());
    assert.equal(config.feeBps, FEE_BPS, "комиссия уехала");
    assert.equal(
      config.platform.toBase58(),
      platform.publicKey.toBase58(),
      "получатель комиссии уехал",
    );
  });

  it("место в чужой монете не открыть", async () => {
    // Монету выбирает площадка, а не продавец. Иначе место ушло бы за токен,
    // заведённый продавцом тем же утром: победитель заплатил бы фантиком, и
    // комиссия пришла бы в нём же.
    const ownCoin = await createMint(connection, seller, seller.publicKey, null, DECIMALS);
    const { sale } = await openSale(60);

    try {
      await addLot(sale, RESERVE, ownCoin);
      assert.fail("место открылось в чужой монете");
    } catch (error) {
      assert.include(String(error), "WrongMint");
    }

    // А в монете площадки то же самое место открывается.
    const ok = await addLot(sale);
    assert.equal(
      (await program.account.lot.fetch(ok.lot)).mint.toBase58(),
      mint.toBase58(),
    );
  });

  it("подменить настройки площадки своим аккаунтом нельзя", async () => {
    // Сиды у настроек постоянные, поэтому адрес на всю программу один, и
    // завести второй такой аккаунт нельзя в принципе. Остаётся подставить в
    // транзакцию посторонний - Anchor выводит адрес сам и чужой не берёт.
    const { sale } = await openSale(60);

    // Свой PDA по своим сидам: такого аккаунта просто нет.
    const [mine] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), bob.publicKey.toBuffer()],
      program.programId,
    );
    // И настоящий аккаунт этой же программы - торг вместо настроек.
    for (const fake of [mine, sale]) {
      try {
        await program.methods
          .sellerOpensLot(auctionId(), new anchor.BN(RESERVE), new anchor.BN(MIN_STEP))
          .accountsPartial({
            seller: seller.publicKey,
            sale,
            config: fake,
            mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        assert.fail(`чужой аккаунт настроек прошёл: ${fake.toBase58()}`);
      } catch (error) {
        assert.include(
          String(error),
          "caused by account: config",
          "отбилось не на настройках",
        );
      }
    }
  });

  it("торг берёт комиссию из настроек, а не от того, кто его открыл", async () => {
    const { sale } = await openSale(60);
    const state = await program.account.sale.fetch(sale);

    assert.equal(state.feeBps, FEE_BPS, "торг взял чужую комиссию");
    assert.equal(
      state.platform.toBase58(),
      platform.publicKey.toBase58(),
      "торг взял чужого получателя",
    );
  });

  it("ставка ниже резерва не принимается", async () => {
    const { lot } = await openLot(60);
    try {
      await bid(lot, alice, RESERVE - 1);
      assert.fail("ставка ниже резерва прошла");
    } catch (error) {
      assert.include(String(error), "BidTooLow");
    }
  });

  it("ставку нельзя сделать деньгами, которых нет", async () => {
    const { lot } = await openLot(60);
    const broke = Keypair.generate();
    const sig = await connection.requestAirdrop(broke.publicKey, 2_000_000_000);
    await connection.confirmTransaction(sig);
    await createAssociatedTokenAccount(connection, broke, mint, broke.publicKey);

    // Счёт заведён, но пуст: ставка обязана отлететь на переводе.
    try {
      await bid(lot, broke, RESERVE);
      assert.fail("ставка без денег прошла");
    } catch (error) {
      assert.match(String(error), /insufficient funds|0x1\b/i);
    }
  });

  it("первая ставка запирает деньги в хранилище торга", async () => {
    const { lot, vault } = await openLot(60);
    const before = await balance(aliceTokens);

    await bid(lot, alice, RESERVE);

    assert.equal(before - (await balance(aliceTokens)), BigInt(RESERVE));
    assert.equal(await balance(vault), BigInt(RESERVE));

    const state = await program.account.lot.fetch(lot);
    assert.equal(state.topBidder!.toBase58(), alice.publicKey.toBase58());
    assert.equal(state.topBid.toNumber(), RESERVE);
  });

  it("шаг обязателен: перебить на копейку нельзя", async () => {
    const { lot } = await openLot(60);
    await bid(lot, alice, RESERVE);

    try {
      await bid(lot, bob, RESERVE + 1, alice.publicKey);
      assert.fail("ставка без шага прошла");
    } catch (error) {
      assert.include(String(error), "BidTooLow");
    }
  });

  it("перебитому возвращается ровно его ставка, той же транзакцией", async () => {
    const { lot, vault } = await openLot(60);
    await bid(lot, alice, RESERVE);

    const aliceBefore = await balance(aliceTokens);
    const next = RESERVE + Math.max(MIN_STEP, Math.floor((RESERVE * 5) / 100));
    await bid(lot, bob, next, alice.publicKey);

    assert.equal(
      (await balance(aliceTokens)) - aliceBefore,
      BigInt(RESERVE),
      "перебитому вернулось не ровно столько, сколько он ставил",
    );
    assert.equal(
      await balance(vault),
      BigInt(next),
      "в хранилище должна лежать ровно текущая высшая ставка",
    );
  });

  it("нельзя подсунуть чужого на место перебиваемого", async () => {
    const { lot } = await openLot(60);
    await bid(lot, alice, RESERVE);

    const next = RESERVE + Math.max(MIN_STEP, Math.floor((RESERVE * 5) / 100));
    try {
      await bid(lot, bob, next, platform.publicKey);
      assert.fail("возврат ушёл постороннему");
    } catch (error) {
      assert.include(String(error), "WrongPreviousBidder");
    }
  });

  it("ставка под конец продлевает торг всей вещи, а не одного места", async () => {
    // Два места одного торга: ставим только на первое, а сдвинуться обязаны оба.
    // Это и есть главное правило - футболка продаётся целиком.
    const { sale } = await openSale(4, 300);
    const first = await addLot(sale);
    const second = await addLot(sale);

    const before = (await program.account.sale.fetch(sale)).closesAt.toNumber();

    await bid(first.lot, alice, RESERVE, undefined, sale);

    const after = (await program.account.sale.fetch(sale)).closesAt.toNumber();
    assert.ok(after > before, "срок не сдвинулся");
    assert.ok(after - (await now()) >= 290, "продлили меньше чем на пять минут");

    // У второго места своего срока нет вовсе: оно смотрит в тот же торг, и
    // значит закрывается ровно тогда же.
    const secondLot = await program.account.lot.fetch(second.lot);
    assert.equal(
      secondLot.sale.toBase58(),
      sale.toBase58(),
      "второе место должно принадлежать тому же торгу",
    );
  });

  it("после закрытия ставки не принимаются", async () => {
    const { lot } = await openLot(2);
    await sleep(3500);

    try {
      await bid(lot, alice, RESERVE);
      assert.fail("ставка прошла после закрытия");
    } catch (error) {
      assert.include(String(error), "LotClosed");
    }
  });

  it("торг без ставок закрывается, аренда возвращается продавцу", async () => {
    const { lot, vault } = await openLot(2);
    await sleep(3500);

    const before = await connection.getBalance(seller.publicKey);
    await program.methods
      .sellerClosesLot()
      .accountsPartial({
        crank: seller.publicKey,
        sale: (await program.account.lot.fetch(lot)).sale,
        lot,
        seller: seller.publicKey,
        lastBidder: seller.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    assert.isNull(await connection.getAccountInfo(lot), "лот не закрылся");
    assert.isNull(await connection.getAccountInfo(vault), "хранилище не закрылось");
    assert.ok(
      (await connection.getBalance(seller.publicKey)) > before,
      "аренда не вернулась продавцу",
    );
  });

  it("выигранная ставка делится между продавцом и площадкой", async () => {
    // Срок с запасом: открыть торг, повесить место и поставить - это три
    // транзакции, и в две секунды они на холодном валидаторе не всегда влезают.
    const { lot, vault } = await openLot(5);
    await bid(lot, alice, RESERVE);
    await sleep(6500);

    const sellerTokens = getAssociatedTokenAddressSync(mint, seller.publicKey);
    const platformTokens = getAssociatedTokenAddressSync(mint, platform.publicKey);

    const sellerBefore = await balance(sellerTokens);
    const platformBefore = await balance(platformTokens);
    const aliceBefore = await balance(aliceTokens);

    await program.methods
      .lotPaysSeller()
      .accountsPartial({
        crank: seller.publicKey,
        sale: (await program.account.lot.fetch(lot)).sale,
        lot,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const fee = BigInt(RESERVE) / 10n; // FEE_BPS = 1000, то есть 10%
    assert.equal(
      await balance(platformTokens),
      platformBefore + fee,
      "площадка недополучила комиссию",
    );
    assert.equal(
      await balance(sellerTokens),
      sellerBefore + (BigInt(RESERVE) - fee),
      "продавец получил не остаток",
    );
    assert.equal(
      await balance(aliceTokens),
      aliceBefore,
      "победителю вернули деньги, а он купил место",
    );
    assert.isNull(await connection.getAccountInfo(vault), "хранилище не закрылось");
    assert.isNull(await connection.getAccountInfo(lot), "лот не закрылся");
  });

  it("монета, присланная в хранилище мимо торга, не запирает выплату", async () => {
    // Адрес хранилища выводится из адреса лота, а лот виден всем. Значит кто
    // угодно может прислать туда одну базовую единицу монеты - это стоит доли
    // цента. Закрыть токен-счёт с ненулевым остатком SPL не даёт, поэтому
    // выплата обязана выгребать хранилище дочиста, иначе ставка победителя и
    // выручка продавца заперты в нём навсегда.
    const { lot, vault } = await openLot(5);
    await bid(lot, alice, RESERVE);
    await transfer(connection, bob, bobTokens, vault, bob, 1);
    await sleep(6500);

    const sellerTokens = getAssociatedTokenAddressSync(mint, seller.publicKey);
    const platformTokens = getAssociatedTokenAddressSync(mint, platform.publicKey);
    const sellerBefore = await balance(sellerTokens);
    const platformBefore = await balance(platformTokens);

    await program.methods
      .lotPaysSeller()
      .accountsPartial({
        crank: seller.publicKey,
        sale: (await program.account.lot.fetch(lot)).sale,
        lot,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const fee = BigInt(RESERVE) / 10n;
    assert.equal(
      (await balance(platformTokens)) - platformBefore,
      fee,
      "подарок не должен менять комиссию: делится ставка, а не остаток счёта",
    );
    assert.equal(
      (await balance(sellerTokens)) - sellerBefore,
      BigInt(RESERVE) - fee + 1n,
      "лишнее обязано уйти продавцу вместе с выручкой",
    );
    assert.isNull(await connection.getAccountInfo(vault), "хранилище не закрылось");
  });

  it("монета, присланная в хранилище мимо торга, не запирает закрытие", async () => {
    // Та же дешёвая помеха с другой стороны: места без ставок тоже надо
    // закрывать, и подарок не должен оставлять аккаунты висеть навсегда.
    const { lot, vault } = await openLot(3);
    await transfer(connection, bob, bobTokens, vault, bob, 1);
    await sleep(4500);

    const sellerTokens = getAssociatedTokenAddressSync(mint, seller.publicKey);
    const sellerBefore = await balance(sellerTokens);

    await program.methods
      .sellerClosesLot()
      .accountsPartial({
        crank: seller.publicKey,
        sale: (await program.account.lot.fetch(lot)).sale,
        lot,
        seller: seller.publicKey,
        lastBidder: seller.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    assert.equal(
      (await balance(sellerTokens)) - sellerBefore,
      1n,
      "лишнее обязано уйти продавцу",
    );
    assert.isNull(await connection.getAccountInfo(vault), "хранилище не закрылось");
    assert.isNull(await connection.getAccountInfo(lot), "лот не закрылся");
  });

  it("выплату зовёт кто угодно, но комиссия идёт только тому, кто записан в лоте", async () => {
    // Срок с запасом по той же причине, что и выше: три транзакции до ставки в
    // две секунды не всегда укладываются, и тест падал не по делу.
    const { lot } = await openLot(5);
    await bid(lot, alice, RESERVE);
    await sleep(6500);

    // Боб не продавец и не площадка. Позвать выплату он вправе - иначе она
    // зависела бы от того, откроет ли кто-то вкладку. А вот подставить себя
    // получателем комиссии не может: адрес сверяется с записанным в лоте.
    try {
      await program.methods
        .lotPaysSeller()
        .accountsPartial({
          crank: bob.publicKey,
          sale: (await program.account.lot.fetch(lot)).sale,
          lot,
          seller: seller.publicKey,
          platform: bob.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([bob])
        .rpc();
      assert.fail("комиссию увели на чужой кошелёк");
    } catch (error) {
      assert.include(String(error), "ConstraintHasOne");
    }

    // А с правильным получателем та же выплата от того же Боба проходит.
    await program.methods
      .lotPaysSeller()
      .accountsPartial({
        crank: bob.publicKey,
        sale: (await program.account.lot.fetch(lot)).sale,
        lot,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([bob])
      .rpc();

    assert.isNull(await connection.getAccountInfo(lot), "лот не закрылся");
  });

  it("торг без победителя выплатить нельзя", async () => {
    // Ставок не было вовсе - хранилище пустое, платить не из чего и некому.
    // Ставки ниже резерва здесь не проверить: такую программа не принимает на
    // входе, поэтому лота со ставкой и без победителя просто не бывает.
    const { lot } = await openLot(2);
    await sleep(3500);

    try {
      await program.methods
        .lotPaysSeller()
        .accountsPartial({
          crank: seller.publicKey,
          sale: (await program.account.lot.fetch(lot)).sale,
          lot,
          seller: seller.publicKey,
          platform: platform.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      assert.fail("продавцу отдали чужие деньги");
    } catch (error) {
      assert.include(String(error), "NoWinner");
    }
  });

  it("торг с победителем нельзя закрыть как несостоявшийся", async () => {
    // Срок с запасом: ставку надо успеть сделать, пока торг идёт, а открытие
    // места и сама ставка - это две транзакции на валидаторе.
    const { lot } = await openLot(5);
    await bid(lot, alice, RESERVE);
    await sleep(6500);

    try {
      await program.methods
        .sellerClosesLot()
        .accountsPartial({
          crank: seller.publicKey,
          sale: (await program.account.lot.fetch(lot)).sale,
          lot,
          seller: seller.publicKey,
          lastBidder: alice.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      assert.fail("у победителя отобрали выигранное место");
    } catch (error) {
      assert.include(String(error), "LotHasWinner");
    }
  });

  it("идущий торг нельзя ни закрыть, ни выплатить", async () => {
    const { lot } = await openLot(120);
    await bid(lot, alice, RESERVE);

    try {
      await program.methods
        .sellerClosesLot()
        .accountsPartial({
          crank: seller.publicKey,
          sale: (await program.account.lot.fetch(lot)).sale,
          lot,
          seller: seller.publicKey,
          lastBidder: alice.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      assert.fail("закрыли торг, который ещё идёт");
    } catch (error) {
      assert.include(String(error), "LotStillOpen");
    }

    // Выплата на идущем торге опаснее закрытия: Алису ещё могут перебить, и
    // тогда деньги в хранилище - её, а не продавца.
    try {
      await program.methods
        .lotPaysSeller()
        .accountsPartial({
          crank: seller.publicKey,
          sale: (await program.account.lot.fetch(lot)).sale,
          lot,
          seller: seller.publicKey,
          platform: platform.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      assert.fail("выплатили с торга, который ещё идёт");
    } catch (error) {
      assert.include(String(error), "LotStillOpen");
    }
  });
});
