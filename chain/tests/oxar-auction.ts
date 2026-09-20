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

  const lotVaultPda = (lot: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("lot_vault"), lot.toBuffer()],
      program.programId,
    )[0];

  const dealPda = (id: number[]) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("deal"), Buffer.from(id)],
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
  async function openLot(closesInSeconds: number, extendSeconds = 1, reserve = RESERVE) {
    const id = auctionId();
    const lot = lotPda(id);
    const closesAt = (await now()) + closesInSeconds;

    await program.methods
      .sellerOpensLot(
        id,
        new anchor.BN(reserve),
        new anchor.BN(MIN_STEP),
        new anchor.BN(closesAt),
        new anchor.BN(extendSeconds),
        FEE_BPS,
      )
      .accounts({
        seller: seller.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    return { id, lot, vault: lotVaultPda(lot), closesAt };
  }

  /**
   * Поставить. `previous` - тот, кого перебиваем; когда ставок ещё не было,
   * передаём самого участника, и возврата не происходит.
   */
  async function bid(lot: PublicKey, who: Keypair, amount: number, previous?: PublicKey) {
    const prev = previous ?? who.publicKey;
    await program.methods
      .bidderPlacesBid(new anchor.BN(amount))
      .accounts({
        bidder: who.publicKey,
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

  it("ставка под конец продлевает торг", async () => {
    const { lot } = await openLot(4, 300);
    const before = (await program.account.lot.fetch(lot)).closesAt.toNumber();

    await bid(lot, alice, RESERVE);

    const after = (await program.account.lot.fetch(lot)).closesAt.toNumber();
    assert.ok(after > before, "срок не сдвинулся");
    assert.ok(after - (await now()) >= 290, "продлили меньше чем на пять минут");
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
      .accounts({
        crank: seller.publicKey,
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

  it("выигравшая ставка переезжает в сделку, не возвращаясь в кошелёк", async () => {
    const { lot, vault } = await openLot(2);
    await bid(lot, alice, RESERVE);
    await sleep(3500);

    const booking = auctionId();
    const deal = dealPda(booking);
    const dealVault = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), deal.toBuffer()],
      program.programId,
    )[0];

    const aliceBefore = await balance(aliceTokens);
    const startsAt = (await now()) + 2;

    await program.methods
      .lotBecomesDeal(
        booking,
        new anchor.BN(startsAt),
        new anchor.BN(startsAt + 60),
        new anchor.BN(startsAt + 60),
      )
      .accounts({
        crank: seller.publicKey,
        lot,
        seller: seller.publicKey,
        platform: platform.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    assert.equal(
      await balance(aliceTokens),
      aliceBefore,
      "деньги победителя вернулись в кошелёк, а должны были переехать",
    );
    assert.equal(await balance(dealVault), BigInt(RESERVE), "сделка недополучила");
    assert.isNull(await connection.getAccountInfo(lot), "лот остался открытым");
    assert.isNull(await connection.getAccountInfo(vault), "хранилище торга осталось");

    const state = await program.account.deal.fetch(deal);
    assert.equal(state.buyer.toBase58(), alice.publicKey.toBase58());
    assert.equal(state.seller.toBase58(), seller.publicKey.toBase58());
    assert.equal(state.amount.toNumber(), RESERVE);
    assert.equal(state.feeBps, FEE_BPS);
  });

  it("торг с победителем нельзя закрыть как несостоявшийся", async () => {
    const { lot } = await openLot(2);
    await bid(lot, alice, RESERVE);
    await sleep(3500);

    try {
      await program.methods
        .sellerClosesLot()
        .accounts({
          crank: seller.publicKey,
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

  it("идущий торг нельзя ни закрыть, ни превратить в сделку", async () => {
    const { lot } = await openLot(120);
    await bid(lot, alice, RESERVE);

    try {
      await program.methods
        .sellerClosesLot()
        .accounts({
          crank: seller.publicKey,
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
  });
});
