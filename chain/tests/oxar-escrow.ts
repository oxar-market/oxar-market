import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { OxarEscrow } from "../target/types/oxar_escrow";

/**
 * Проверки эскроу против настоящего валидатора.
 *
 * Арифметика выплаты проверена юнит-тестами в самой программе, где время
 * задаётся числом. Здесь проверяется другое: что деньги действительно уходят
 * туда, куда посчитано, что закрытые аккаунты возвращают ренту и что чужой не
 * может закрыть чужую сделку.
 *
 * Сроки взяты секундами, а не днями: валидатору всё равно, а тест должен
 * заканчиваться, пока человек смотрит. Утверждения при этом не зависят от того,
 * на какой именно секунде он успел выполниться - проверяется сходимость сумм, а
 * не конкретная цифра.
 */

const FEE_BPS = 1_000; // 10%, как у нас в core
const DECIMALS = 6; // как у USDC
const AMOUNT = 2_505_000_000; // $2505.00 в базовых единицах: цена с нечётным центом

describe("oxar-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.oxarEscrow as Program<OxarEscrow>;
  const connection = provider.connection;

  let mint: PublicKey;
  const buyer = Keypair.generate();
  const seller = Keypair.generate();
  const platform = Keypair.generate();

  let buyerTokens: PublicKey;
  let sellerTokens: PublicKey;
  let platformTokens: PublicKey;

  /** Свежий идентификатор брони: шестнадцать байт, как uuid из нашей базы. */
  function booking(): number[] {
    return Array.from(Keypair.generate().publicKey.toBytes().slice(0, 16));
  }

  function dealPda(id: number[]): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("deal"), Buffer.from(id)],
      program.programId,
    )[0];
  }

  function vaultPda(deal: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), deal.toBuffer()],
      program.programId,
    )[0];
  }

  const balance = async (ata: PublicKey) => {
    const info = await connection.getAccountInfo(ata);
    return info ? (await getAccount(connection, ata)).amount : 0n;
  };

  const now = async () => {
    const slot = await connection.getSlot();
    return (await connection.getBlockTime(slot))!;
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Открыть сделку и вернуть её адреса. Срок задаётся в секундах от текущей. */
  async function open(opts: {
    inSeconds: number;
    lastsSeconds: number;
    amount?: number;
    /** Окно отказа, секунд от текущей. По умолчанию - весь срок, как у потока. */
    refundableForSeconds?: number;
  }) {
    const id = booking();
    const deal = dealPda(id);
    const startsAt = (await now()) + opts.inSeconds;
    const endsAt = startsAt + opts.lastsSeconds;
    const refundableUntil =
      opts.refundableForSeconds === undefined
        ? endsAt
        : (await now()) + opts.refundableForSeconds;

    await program.methods
      .buyerOpensDeal(
        id,
        new anchor.BN(opts.amount ?? AMOUNT),
        new anchor.BN(startsAt),
        new anchor.BN(endsAt),
        new anchor.BN(refundableUntil),
        FEE_BPS,
      )
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    return { id, deal, vault: vaultPda(deal), startsAt };
  }

  async function close(deal: PublicKey, party: Keypair) {
    await program.methods
      .partyClosesDeal()
      .accounts({
        party: party.publicKey,
        deal,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([party])
      .rpc();
  }

  before(async () => {
    for (const who of [buyer, seller, platform]) {
      const sig = await connection.requestAirdrop(who.publicKey, 2_000_000_000);
      await connection.confirmTransaction(sig);
    }

    mint = await createMint(connection, buyer, buyer.publicKey, null, DECIMALS);
    buyerTokens = await createAssociatedTokenAccount(connection, buyer, mint, buyer.publicKey);
    sellerTokens = await createAssociatedTokenAccount(connection, seller, mint, seller.publicKey);
    platformTokens = await createAssociatedTokenAccount(
      connection,
      platform,
      mint,
      platform.publicKey,
    );

    await mintTo(connection, buyer, mint, buyerTokens, buyer, 1_000_000_000_000);
  });

  it("сделка открывается, и вся сумма уходит в хранилище", async () => {
    const before = await balance(buyerTokens);
    const { deal, vault } = await open({ inSeconds: 2, lastsSeconds: 60 });

    assert.equal((await balance(vault)).toString(), String(AMOUNT), "в хранилище не вся сумма");
    assert.equal(
      (before - (await balance(buyerTokens))).toString(),
      String(AMOUNT),
      "с покупателя списано не столько",
    );

    const state = await program.account.deal.fetch(deal);
    assert.equal(state.amount.toString(), String(AMOUNT));
    assert.equal(state.released.toString(), "0");
    assert.equal(state.feeBps, FEE_BPS);
    assert.isTrue(state.buyer.equals(buyer.publicKey));
    assert.isTrue(state.seller.equals(seller.publicKey));
  });

  it("хранилищем владеет сделка, а не кто-то из людей", async () => {
    const { deal, vault } = await open({ inSeconds: 30, lastsSeconds: 60 });
    const account = await getAccount(connection, vault);
    assert.isTrue(account.owner.equals(deal), "у хранилища человеческий владелец");
  });

  it("одна бронь - одна сделка, повтор не проходит", async () => {
    const id = booking();
    const startsAt = (await now()) + 30;
    const call = () =>
      program.methods
        .buyerOpensDeal(
          id,
          new anchor.BN(AMOUNT),
          new anchor.BN(startsAt),
          new anchor.BN(startsAt + 60),
          new anchor.BN(startsAt + 60),
          FEE_BPS,
        )
        .accounts({
          buyer: buyer.publicKey,
          seller: seller.publicKey,
          platform: platform.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

    await call();
    try {
      await call();
      assert.fail("вторая сделка на ту же бронь прошла");
    } catch (error) {
      assert.match(String(error), /already in use|custom program error/i);
    }
  });

  it("разовый платёж: нулевой срок отдаёт продавцу всё сразу", async () => {
    const sellerBefore = await balance(sellerTokens);
    const platformBefore = await balance(platformTokens);
    const buyerBefore = await balance(buyerTokens);

    const { deal } = await open({ inSeconds: 1, lastsSeconds: 0 });
    await sleep(2500);
    await close(deal, buyer);

    const toSeller = (await balance(sellerTokens)) - sellerBefore;
    const toPlatform = (await balance(platformTokens)) - platformBefore;
    const fromBuyer = buyerBefore - (await balance(buyerTokens));

    assert.equal(toPlatform.toString(), String(AMOUNT / 10), "комиссия не десять процентов");
    assert.equal(toSeller.toString(), String(AMOUNT - AMOUNT / 10));
    assert.equal(fromBuyer.toString(), String(AMOUNT), "покупателю что-то вернулось");
  });

  it("отмена в середине срока: что не отстояло, то возвращается", async () => {
    const sellerBefore = await balance(sellerTokens);
    const platformBefore = await balance(platformTokens);
    const buyerBefore = await balance(buyerTokens);

    const { deal } = await open({ inSeconds: 1, lastsSeconds: 30 });
    await sleep(3000);
    await close(deal, buyer);

    const toSeller = (await balance(sellerTokens)) - sellerBefore;
    const toPlatform = (await balance(platformTokens)) - platformBefore;
    const fromBuyer = buyerBefore - (await balance(buyerTokens));

    // Ни одна базовая единица не потерялась и не возникла.
    assert.equal(
      (toSeller + toPlatform).toString(),
      fromBuyer.toString(),
      "сумма не сошлась",
    );
    // Продавцу досталась только часть: срок тридцать секунд, прошло около трёх.
    assert.isTrue(toSeller + toPlatform < BigInt(AMOUNT), "ушло всё, хотя срок не вышел");
    assert.isTrue(toSeller + toPlatform > 0n, "не ушло ничего, хотя время шло");
    // Комиссия ровно десятая часть заработанного, а не всей сделки.
    assert.equal(
      toPlatform.toString(),
      ((toSeller + toPlatform) / 10n).toString(),
      "комиссия взята не с заработанного",
    );
  });

  it("продавец забирает натёкшее, не закрывая сделку, и второй раз берёт только новое", async () => {
    const { deal } = await open({ inSeconds: 1, lastsSeconds: 40 });
    await sleep(3000);

    const take = () =>
      program.methods
        .sellerTakesEarned()
        .accounts({
          deal,
          seller: seller.publicKey,
          platform: platform.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

    const before = await balance(sellerTokens);
    await take();
    const afterFirst = await balance(sellerTokens);
    assert.isTrue(afterFirst > before, "первый раз ничего не пришло");

    const state = await program.account.deal.fetch(deal);
    assert.isTrue(state.released.toNumber() > 0, "released не записан");

    await sleep(2500);
    await take();
    const afterSecond = await balance(sellerTokens);
    assert.isTrue(afterSecond > afterFirst, "второй раз ничего не пришло");
    assert.isTrue(
      afterSecond - afterFirst < afterFirst - before + BigInt(AMOUNT),
      "второй раз пришло больше, чем могло натечь",
    );
  });

  it("до начала срока продавцу брать нечего", async () => {
    const { deal } = await open({ inSeconds: 60, lastsSeconds: 60 });
    try {
      await program.methods
        .sellerTakesEarned()
        .accounts({
          deal,
          seller: seller.publicKey,
          platform: platform.publicKey,
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("забрал деньги до начала размещения");
    } catch (error) {
      assert.match(String(error), /NothingToWithdraw/);
    }
  });

  it("закрыть сделку может продавец", async () => {
    const { deal } = await open({ inSeconds: 1, lastsSeconds: 30 });
    await sleep(2000);
    await close(deal, seller);
    assert.isNull(await connection.getAccountInfo(deal), "сделка не закрылась");
  });

  it("посторонний закрыть сделку не может", async () => {
    const stranger = Keypair.generate();
    const sig = await connection.requestAirdrop(stranger.publicKey, 1_000_000_000);
    await connection.confirmTransaction(sig);

    const { deal } = await open({ inSeconds: 1, lastsSeconds: 30 });
    await sleep(2000);
    try {
      await close(deal, stranger);
      assert.fail("чужой закрыл чужую сделку");
    } catch (error) {
      assert.match(String(error), /NotAParty/);
    }
  });

  it("после закрытия рента возвращается покупателю, а аккаунты исчезают", async () => {
    const { deal, vault } = await open({ inSeconds: 1, lastsSeconds: 10 });
    const lamportsBefore = await connection.getBalance(buyer.publicKey);
    await sleep(2000);
    await close(deal, seller); // платит за транзакцию продавец, рента идёт покупателю

    assert.isNull(await connection.getAccountInfo(deal), "сделка осталась");
    assert.isNull(await connection.getAccountInfo(vault), "хранилище осталось");
    assert.isTrue(
      (await connection.getBalance(buyer.publicKey)) > lamportsBefore,
      "рента не вернулась покупателю",
    );
  });

  it("после конца срока продавцу достаётся всё, покупателю ничего", async () => {
    const sellerBefore = await balance(sellerTokens);
    const platformBefore = await balance(platformTokens);
    const buyerBefore = await balance(buyerTokens);

    const { deal } = await open({ inSeconds: 1, lastsSeconds: 2 });
    await sleep(5000);
    await close(deal, buyer);

    const toSeller = (await balance(sellerTokens)) - sellerBefore;
    const toPlatform = (await balance(platformTokens)) - platformBefore;
    const fromBuyer = buyerBefore - (await balance(buyerTokens));

    assert.equal((toSeller + toPlatform).toString(), String(AMOUNT), "ушло не всё");
    assert.equal(fromBuyer.toString(), String(AMOUNT), "покупателю что-то вернулось");
    assert.equal(toPlatform.toString(), String(AMOUNT / 10));
  });

  describe("заморозка: сделка, где продавец несёт расходы до начала", () => {
    it("покупатель не достанет деньги из середины, а после конца всё уходит продавцу", async () => {
      const sellerBefore = await balance(sellerTokens);
      const platformBefore = await balance(platformTokens);
      const buyerBefore = await balance(buyerTokens);

      // Срок нулевой и стоит в конце: до него не натекает никому. Окно отказа
      // закрывается через две секунды - с этого момента расходы невозвратны.
      const { deal } = await open({
        inSeconds: 6,
        lastsSeconds: 0,
        refundableForSeconds: 2,
      });

      await sleep(3000);
      try {
        await close(deal, buyer);
        assert.fail("покупатель забрал деньги из заморозки");
      } catch (error) {
        assert.match(String(error), /NotRefundable/);
      }

      // Продавцу в заморозке тоже не достаётся ничего.
      try {
        await program.methods
          .sellerTakesEarned()
          .accounts({
            deal,
            seller: seller.publicKey,
            platform: platform.publicKey,
            mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("продавец взял деньги из заморозки");
      } catch (error) {
        assert.match(String(error), /NothingToWithdraw/);
      }

      await sleep(4500);
      await close(deal, buyer);

      const toSeller = (await balance(sellerTokens)) - sellerBefore;
      const toPlatform = (await balance(platformTokens)) - platformBefore;
      const fromBuyer = buyerBefore - (await balance(buyerTokens));

      assert.equal((toSeller + toPlatform).toString(), String(AMOUNT), "ушло не всё");
      assert.equal(fromBuyer.toString(), String(AMOUNT), "покупателю что-то вернулось");
    });

    it("до закрытия окна покупатель ещё волен передумать", async () => {
      const buyerBefore = await balance(buyerTokens);
      const { deal } = await open({
        inSeconds: 30,
        lastsSeconds: 0,
        refundableForSeconds: 25,
      });
      await close(deal, buyer);
      assert.equal(
        (await balance(buyerTokens)).toString(),
        buyerBefore.toString(),
        "вернулось не всё",
      );
    });

    it("продавец может закрыть заморозку сам и отказаться от денег", async () => {
      const buyerBefore = await balance(buyerTokens);
      const { deal } = await open({
        inSeconds: 30,
        lastsSeconds: 0,
        refundableForSeconds: 1,
      });
      await sleep(2000);
      await close(deal, seller);
      assert.equal(
        (await balance(buyerTokens)).toString(),
        buyerBefore.toString(),
        "продавец закрыл, но деньги не вернулись покупателю",
      );
    });
  });

  describe("сделку с негодными условиями открыть нельзя", () => {
    const bad = async (
      amount: number,
      shift: number,
      length: number,
      feeBps: number,
      expected: RegExp,
    ) => {
      const id = booking();
      const startsAt = (await now()) + shift;
      try {
        await program.methods
          .buyerOpensDeal(
            id,
            new anchor.BN(amount),
            new anchor.BN(startsAt),
            new anchor.BN(startsAt + length),
            new anchor.BN(startsAt + length),
            feeBps,
          )
          .accounts({
            buyer: buyer.publicKey,
            seller: seller.publicKey,
            platform: platform.publicKey,
            mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
        assert.fail("негодная сделка открылась");
      } catch (error) {
        assert.match(String(error), expected);
      }
    };

    it("окно отказа переживает саму сделку", async () => {
      const id = booking();
      const startsAt = (await now()) + 30;
      try {
        await program.methods
          .buyerOpensDeal(
            id,
            new anchor.BN(AMOUNT),
            new anchor.BN(startsAt),
            new anchor.BN(startsAt + 60),
            new anchor.BN(startsAt + 61), // на секунду дольше сделки
            FEE_BPS,
          )
          .accounts({
            buyer: buyer.publicKey,
            seller: seller.publicKey,
            platform: platform.publicKey,
            mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
        assert.fail("окно отказа длиннее сделки прошло");
      } catch (error) {
        assert.match(String(error), /RefundWindowTooLong/);
      }
    });

    it("нулевая сумма", async () => bad(0, 30, 60, FEE_BPS, /AmountIsZero/));
    it("конец раньше начала", async () => bad(AMOUNT, 30, -10, FEE_BPS, /EndsBeforeStart/));
    it("начало в прошлом", async () => bad(AMOUNT, -60, 60, FEE_BPS, /StartsInThePast/));
    it("комиссия больше всей сделки", async () =>
      bad(AMOUNT, 30, 60, 10_001, /FeeTooHigh/));
  });
});
