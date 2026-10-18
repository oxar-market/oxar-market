//! Фазз-харнесс эскроу OXAR на Trident.
//!
//! Фаззер ведётся по жизненному циклу торга: площадка настраивается один раз
//! на итерацию, дальше случайно чередуются открытие торгов и мест, ставки
//! (в том числе заведомо негодные), прыжки во времени и разбор мест после
//! закрытия: выплата, спор с арбитром, возврат.
//!
//! После каждого потока проверяются инварианты, которые программа обязана
//! держать при любой последовательности:
//!   1. в хранилище открытого места лежит ровно его лучшая ставка;
//!   2. сумма монеты по всем известным счетам и хранилищам равна всему, что
//!      было намятено, - деньги не появляются и не исчезают;
//!   3. срок торга никогда не уменьшается и не уходит за жёсткий потолок;
//!   4. при разборе места сумма выплат равна ставке до единицы.

use fuzz_accounts::*;
use trident_fuzz::fuzzing::*;
mod fuzz_accounts;
mod types;
use types::*;

const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DECIMALS: u8 = 6;
const MAX_EXTEND_SECONDS: i64 = 3_600;
const TOTAL_EXTEND_SECONDS: i64 = 3_600;
const MAX_SALE_SECONDS: i64 = 30 * 24 * 60 * 60;
const APPEAL_SECONDS: i64 = 72 * 60 * 60;
const ARBITER_SECONDS: i64 = 30 * 24 * 60 * 60;

// Коды ошибок программы: Anchor нумерует пользовательские ошибки с 6000.
const ERR_LOT_CLOSED: u32 = 6005;
const ERR_BID_TOO_LOW: u32 = 6006;
const ERR_LOT_STILL_OPEN: u32 = 6007;
const ERR_WRONG_PREVIOUS_BIDDER: u32 = 6008;
const ERR_NO_WINNER: u32 = 6009;
const ERR_LOT_HAS_WINNER: u32 = 6010;
const ERR_NOT_PAYABLE_YET: u32 = 6018;
const ERR_APPEAL_CLOSED: u32 = 6019;
const ERR_LOT_DISPUTED: u32 = 6021;

#[derive(Clone)]
struct SaleInfo {
    key: Pubkey,
    seller: Pubkey,
    /// Последний виденный срок: инвариант 3 сравнивает с ним.
    last_closes_at: i64,
    hard_closes_at: i64,
}

#[derive(Clone)]
struct LotInfo {
    key: Pubkey,
    vault: Pubkey,
    sale: Pubkey,
    seller: Pubkey,
    /// Место разобрано: хранилище закрыто, в инвариантах не участвует.
    settled: bool,
}

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,

    mint: Pubkey,
    mint_authority: Pubkey,
    admin: Pubkey,
    platform: Pubkey,
    config: Pubkey,
    fee_bps: u16,

    /// Все кошельки, у которых есть счёт монеты: участники, продавцы, площадка.
    wallets: Vec<Pubkey>,
    bidders: Vec<Pubkey>,
    sellers: Vec<Pubkey>,
    sales: Vec<SaleInfo>,
    lots: Vec<LotInfo>,
    total_minted: u64,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
            mint: Pubkey::default(),
            mint_authority: Pubkey::default(),
            admin: Pubkey::default(),
            platform: Pubkey::default(),
            config: Pubkey::default(),
            fee_bps: 0,
            wallets: Vec::new(),
            bidders: Vec::new(),
            sellers: Vec::new(),
            sales: Vec::new(),
            lots: Vec::new(),
            total_minted: 0,
        }
    }

    // ------------------------------------------------------------------
    // Подготовка площадки: раз на итерацию.
    // ------------------------------------------------------------------

    #[init]
    fn start(&mut self) {
        self.fuzz_accounts = AccountAddresses::default();
        self.wallets.clear();
        self.bidders.clear();
        self.sellers.clear();
        self.sales.clear();
        self.lots.clear();
        self.total_minted = 0;

        // Время должно быть живым: программа сравнивает сроки с часами цепи.
        self.trident.warp_to_timestamp(1_760_000_000);

        let mint_authority = self.fuzz_accounts.admin.insert(&mut self.trident, None);
        self.trident.airdrop(&mint_authority, 100 * LAMPORTS_PER_SOL);
        self.mint_authority = mint_authority;

        let mint = self.fuzz_accounts.mint.insert(&mut self.trident, None);
        let ixs = self.trident.initialize_mint(&mint_authority, &mint, DECIMALS, &mint_authority, None);
        let res = self.trident.process_transaction(&ixs, Some("init_mint"));
        assert!(res.is_success(), "mint init failed: {}", res.logs());
        self.mint = mint;

        // Админ площадки. Данных программы в TridentSVM нет, поэтому первая
        // настройка пропускает проверку владельца - так же, как в деплой-скрипте.
        let admin = self.fuzz_accounts.admin.insert(&mut self.trident, None);
        self.trident.airdrop(&admin, 100 * LAMPORTS_PER_SOL);
        self.admin = admin;

        let platform = self.fuzz_accounts.platform.insert(&mut self.trident, None);
        self.trident.airdrop(&platform, LAMPORTS_PER_SOL);
        self.platform = platform;
        self.ensure_ata(platform);

        let (config, _) = self
            .trident
            .find_program_address(&[b"config"], &oxar_escrow::program_id());
        self.config = config;
        let program_data = self
            .trident
            .get_program_data_address_v3(&oxar_escrow::program_id());

        // Комиссия случайная: от нуля до всей ставки, инварианты обязаны
        // держаться при любой.
        self.fee_bps = self.trident.random_from_range(0..=10_000u16);
        let ix = oxar_escrow::AdminSetsTermsInstruction::data(
            oxar_escrow::AdminSetsTermsInstructionData::new(self.fee_bps, None),
        )
        .accounts(oxar_escrow::AdminSetsTermsInstructionAccounts::new(
            admin,
            config,
            platform,
            mint,
            program_data,
        ))
        .instruction();
        let res = self.trident.process_transaction(&[ix], Some("admin_sets_terms"));
        assert!(res.is_success(), "admin_sets_terms failed: {}", res.logs());

        // Продавцы и участники с деньгами.
        for _ in 0..2 {
            let seller = self.fuzz_accounts.seller.insert(&mut self.trident, None);
            self.trident.airdrop(&seller, 100 * LAMPORTS_PER_SOL);
            self.ensure_ata(seller);
            self.sellers.push(seller);
        }
        for _ in 0..4 {
            let bidder = self.fuzz_accounts.bidder.insert(&mut self.trident, None);
            self.trident.airdrop(&bidder, 100 * LAMPORTS_PER_SOL);
            let ata = self.ensure_ata(bidder);
            let amount: u64 = 1_000_000_000_000; // миллион монет по 6 знаков
            let ix = self.trident.mint_to(&ata, &mint, &mint_authority, amount);
            let res = self.trident.process_transaction(&[ix], Some("mint_to"));
            assert!(res.is_success(), "mint_to failed: {}", res.logs());
            self.total_minted += amount;
            self.bidders.push(bidder);
        }
    }

    // ------------------------------------------------------------------
    // Потоки.
    // ------------------------------------------------------------------

    #[flow]
    fn open_sale(&mut self) {
        let seller = self.pick(&self.sellers.clone());
        let now = self.trident.get_current_timestamp();

        let mut sale_id = [0u8; 16];
        self.trident.random_bytes(&mut sale_id);
        // Чаще короткие торги, чтобы фаззер доводил места до разбора; иногда до месяца.
        let long: u8 = self.trident.random_from_range(0..100u8);
        let duration: i64 = if long < 80 {
            self.trident.random_from_range(600..2 * 24 * 3600)
        } else {
            self.trident.random_from_range(2 * 24 * 3600..MAX_SALE_SECONDS)
        };
        let closes_at = now + duration;
        let extend_seconds: i64 = self.trident.random_from_range(0..=MAX_EXTEND_SECONDS);
        let proof_gap: i64 = self.trident.random_from_range(1..3 * 24 * 3600);
        let proof_deadline = closes_at + TOTAL_EXTEND_SECONDS + proof_gap;

        let sale = self.fuzz_accounts.sale.insert(
            &mut self.trident,
            Some(PdaSeeds::new(&[b"sale", &sale_id], oxar_escrow::program_id())),
        );

        let ix = oxar_escrow::SellerOpensSaleInstruction::data(
            oxar_escrow::SellerOpensSaleInstructionData::new(
                sale_id,
                closes_at,
                extend_seconds,
                proof_deadline,
            ),
        )
        .accounts(oxar_escrow::SellerOpensSaleInstructionAccounts::new(
            seller, sale, self.config,
        ))
        .instruction();
        let res = self.trident.process_transaction(&[ix], Some("seller_opens_sale"));
        assert!(res.is_success(), "open_sale failed: {}", res.logs());

        let on_chain: Sale = self.read(sale);
        assert_eq!(on_chain.fee_bps, self.fee_bps, "комиссия должна копироваться из настроек");
        assert_eq!(on_chain.platform, self.platform, "получатель комиссии должен копироваться из настроек");
        assert_eq!(on_chain.hard_closes_at, closes_at + TOTAL_EXTEND_SECONDS);

        self.sales.push(SaleInfo {
            key: sale,
            seller,
            last_closes_at: closes_at,
            hard_closes_at: on_chain.hard_closes_at,
        });
        self.check_invariants();
    }

    #[flow]
    fn open_lot(&mut self) {
        if self.sales.is_empty() {
            return;
        }
        let sale = self.pick(&self.sales.clone());
        let now = self.trident.get_current_timestamp();
        let sale_state: Sale = self.read(sale.key);

        let mut auction = [0u8; 16];
        self.trident.random_bytes(&mut auction);
        let reserve: u64 = self.trident.random_from_range(1..5_000_000_000u64);
        let min_step: u64 = self.trident.random_from_range(1..500_000_000u64);

        let lot = self.fuzz_accounts.lot.insert(
            &mut self.trident,
            Some(PdaSeeds::new(&[b"lot", &auction], oxar_escrow::program_id())),
        );
        let vault = self.fuzz_accounts.vault.insert(
            &mut self.trident,
            Some(PdaSeeds::new(&[b"lot_vault", lot.as_ref()], oxar_escrow::program_id())),
        );

        let ix = oxar_escrow::SellerOpensLotInstruction::data(
            oxar_escrow::SellerOpensLotInstructionData::new(auction, reserve, min_step),
        )
        .accounts(oxar_escrow::SellerOpensLotInstructionAccounts::new(
            sale.seller, sale.key, self.config, lot, vault, self.mint,
        ))
        .instruction();
        let res = self.trident.process_transaction(&[ix], Some("seller_opens_lot"));

        if now >= sale_state.closes_at {
            assert!(
                res.is_custom_error_with_code(ERR_LOT_CLOSED),
                "место на закрытом торге должно отвергаться: {}",
                res.logs()
            );
            return;
        }
        assert!(res.is_success(), "open_lot failed: {}", res.logs());
        self.lots.push(LotInfo {
            key: lot,
            vault,
            sale: sale.key,
            seller: sale.seller,
            settled: false,
        });
        self.check_invariants();
    }

    #[flow]
    fn place_bid(&mut self) {
        let open: Vec<LotInfo> = self.lots.iter().filter(|l| !l.settled).cloned().collect();
        if open.is_empty() {
            return;
        }
        let lot = self.pick(&open);
        let bidder = self.pick(&self.bidders.clone());
        let now = self.trident.get_current_timestamp();

        let lot_before: Lot = self.read(lot.key);
        let sale_before: Sale = self.read(lot.sale);
        let min_next = min_next_bid(&lot_before);

        // Чаще годная ставка, иногда заведомо низкая, иногда подмена перебитого.
        let roll: u8 = self.trident.random_from_range(0..100u8);
        let amount: u64 = if roll < 15 && min_next > 1 {
            self.trident.random_from_range(1..min_next)
        } else {
            let headroom: u64 = self.trident.random_from_range(0..=min_next.min(1_000_000_000));
            min_next.saturating_add(headroom)
        };
        let honest_previous = lot_before.top_bidder.unwrap_or(bidder);
        let previous = if roll >= 85 && lot_before.top_bidder.is_some() {
            self.pick(&self.bidders.clone())
        } else {
            honest_previous
        };

        let bidder_tokens = self.ata(bidder);
        let previous_tokens = self.ata(previous);
        let previous_balance_before = self.token_balance(self.ata(honest_previous));
        let bidder_balance_before = self.token_balance(bidder_tokens);

        let ix = oxar_escrow::BidderPlacesBidInstruction::data(
            oxar_escrow::BidderPlacesBidInstructionData::new(amount),
        )
        .accounts(oxar_escrow::BidderPlacesBidInstructionAccounts::new(
            bidder,
            lot.sale,
            lot.key,
            lot.vault,
            bidder_tokens,
            previous,
            previous_tokens,
            self.mint,
        ))
        .instruction();
        let res = self.trident.process_transaction(&[ix], Some("bidder_places_bid"));

        let lot_after: Lot = self.read(lot.key);
        let sale_after: Sale = self.read(lot.sale);

        if now >= sale_before.closes_at {
            assert!(res.is_custom_error_with_code(ERR_LOT_CLOSED), "ставка после закрытия: {}", res.logs());
        } else if amount < min_next {
            assert!(res.is_custom_error_with_code(ERR_BID_TOO_LOW), "ставка ниже шага: {}", res.logs());
        } else if previous != honest_previous {
            assert!(
                res.is_custom_error_with_code(ERR_WRONG_PREVIOUS_BIDDER),
                "подмена перебитого: {}",
                res.logs()
            );
        } else if bidder_balance_before < amount {
            assert!(res.is_error(), "ставка деньгами, которых нет, должна упасть");
        } else {
            assert!(res.is_success(), "годная ставка упала: {}", res.logs());
            assert_eq!(lot_after.top_bidder, Some(bidder));
            assert_eq!(lot_after.top_bid, amount);
            // Перебитому вернулась ровно его ставка той же транзакцией.
            if let Some(prev) = lot_before.top_bidder {
                if prev != bidder {
                    let now_balance = self.token_balance(self.ata(prev));
                    assert_eq!(
                        now_balance,
                        previous_balance_before + lot_before.top_bid,
                        "перебитому вернулось не ровно его ставка"
                    );
                }
            }
            // Продление: только вперёд и только до потолка.
            assert!(sale_after.closes_at >= sale_before.closes_at, "срок укоротился");
            assert!(sale_after.closes_at <= sale_after.hard_closes_at, "срок ушёл за потолок");
            if sale_before.closes_at - now < sale_before.extend_seconds {
                let expected = (now + sale_before.extend_seconds)
                    .min(sale_before.hard_closes_at)
                    .max(sale_before.closes_at);
                assert_eq!(sale_after.closes_at, expected, "продление посчитано не так");
            } else {
                assert_eq!(sale_after.closes_at, sale_before.closes_at, "продление вне окна");
            }
        }

        if !res.is_success() {
            assert_eq!(lot_after.top_bid, lot_before.top_bid, "упавшая ставка изменила место");
            assert_eq!(lot_after.top_bidder, lot_before.top_bidder);
        }
        self.remember_close(lot.sale, sale_after.closes_at);
        self.check_invariants();
    }

    #[flow]
    fn time_passes(&mut self) {
        let roll: u8 = self.trident.random_from_range(0..100u8);
        let seconds: i64 = if roll < 40 {
            self.trident.random_from_range(30..3 * 3600)
        } else if roll < 80 {
            self.trident.random_from_range(3 * 3600..2 * 24 * 3600)
        } else if roll < 95 {
            self.trident.random_from_range(2 * 24 * 3600..10 * 24 * 3600)
        } else {
            self.trident.random_from_range(10 * 24 * 3600..40 * 24 * 3600)
        };
        self.trident.forward_in_time(seconds);
        self.check_invariants();
    }

    #[flow]
    fn settle_lot(&mut self) {
        let open: Vec<LotInfo> = self.lots.iter().filter(|l| !l.settled).cloned().collect();
        if open.is_empty() {
            return;
        }
        let now = self.trident.get_current_timestamp();
        // Предпочитаем места на уже закрытых торгах: там живёт вся поздняя логика.
        let mut closed: Vec<LotInfo> = Vec::new();
        for l in &open {
            let s: Sale = self.read(l.sale);
            if now >= s.closes_at {
                closed.push(l.clone());
            }
        }
        let prefer_closed: u8 = self.trident.random_from_range(0..100u8);
        let lot = if !closed.is_empty() && prefer_closed < 85 { self.pick(&closed) } else { self.pick(&open) };
        let lot_state: Lot = self.read(lot.key);
        let sale_state: Sale = self.read(lot.sale);
        let sale_open = now < sale_state.closes_at;
        let has_winner = lot_state.top_bidder.is_some() && lot_state.top_bid >= lot_state.reserve;

        if sale_open || !has_winner {
            self.try_close(&lot, &lot_state, &sale_state, sale_open);
            self.check_invariants();
            return;
        }

        // Есть победитель. Пруф ещё не прислан - шлём, если окно открыто;
        // окно упущено - место возвращается победителю закрытием.
        if sale_state.proved_at == 0 {
            if now <= sale_state.proof_deadline {
                let mut hash = [0u8; 32];
                self.trident.random_bytes(&mut hash);
                let ix = oxar_escrow::SellerSubmitsProofInstruction::data(
                    oxar_escrow::SellerSubmitsProofInstructionData::new(hash),
                )
                .accounts(oxar_escrow::SellerSubmitsProofInstructionAccounts::new(
                    lot.seller, lot.sale,
                ))
                .instruction();
                let res = self.trident.process_transaction(&[ix], Some("seller_submits_proof"));
                assert!(res.is_success(), "пруф в окне отвергнут: {}", res.logs());
            } else {
                self.try_close(&lot, &lot_state, &sale_state, false);
            }
            self.check_invariants();
            return;
        }

        // Пруф есть. Случайно: спор, досрочная выплата победителем, выплата
        // кранком после окна, или попытка выплаты кранком внутри окна.
        let winner = lot_state.top_bidder.unwrap();
        let appeal_open = now < sale_state.proved_at + APPEAL_SECONDS;
        let roll: u8 = self.trident.random_from_range(0..100u8);

        if lot_state.disputed {
            self.try_arbiter(&lot, &lot_state, &sale_state, winner);
        } else if appeal_open && roll < 30 {
            let ix = oxar_escrow::WinnerDisputesInstruction::data(
                oxar_escrow::WinnerDisputesInstructionData::new(),
            )
            .accounts(oxar_escrow::WinnerDisputesInstructionAccounts::new(
                winner, lot.sale, lot.key,
            ))
            .instruction();
            let res = self.trident.process_transaction(&[ix], Some("winner_disputes"));
            assert!(res.is_success(), "спор в окне отвергнут: {}", res.logs());
            let after: Lot = self.read(lot.key);
            assert!(after.disputed && after.disputed_at == now);
        } else {
            let crank = if roll < 65 {
                winner
            } else {
                let c = self.fuzz_accounts.crank.insert(&mut self.trident, None);
                self.trident.airdrop(&c, LAMPORTS_PER_SOL);
                c
            };
            self.try_pay(&lot, &lot_state, &sale_state, crank, winner, appeal_open);
        }
        self.check_invariants();
    }

    #[flow]
    fn dispute_late(&mut self) {
        // Спор после окна обязан отвергаться, даже от настоящего победителя.
        let candidates: Vec<LotInfo> = self.lots.iter().filter(|l| !l.settled).cloned().collect();
        if candidates.is_empty() {
            return;
        }
        let lot = self.pick(&candidates);
        let now = self.trident.get_current_timestamp();
        let lot_state: Lot = self.read(lot.key);
        let sale_state: Sale = self.read(lot.sale);
        let Some(winner) = lot_state.top_bidder else { return };
        if sale_state.proved_at == 0 || now < sale_state.proved_at + APPEAL_SECONDS || lot_state.disputed {
            return;
        }
        let ix = oxar_escrow::WinnerDisputesInstruction::data(
            oxar_escrow::WinnerDisputesInstructionData::new(),
        )
        .accounts(oxar_escrow::WinnerDisputesInstructionAccounts::new(
            winner, lot.sale, lot.key,
        ))
        .instruction();
        let res = self.trident.process_transaction(&[ix], Some("winner_disputes_late"));
        assert!(
            res.is_custom_error_with_code(ERR_APPEAL_CLOSED) || res.is_custom_error_with_code(ERR_NO_WINNER),
            "поздний спор прошёл: {}",
            res.logs()
        );
        self.check_invariants();
    }

    #[end]
    fn end(&mut self) {
        self.check_invariants();
    }

    // ------------------------------------------------------------------
    // Разбор места: три исхода, у каждого своя арифметика.
    // ------------------------------------------------------------------

    fn try_close(&mut self, lot: &LotInfo, lot_state: &Lot, sale_state: &Sale, sale_open: bool) {
        let now = self.trident.get_current_timestamp();
        let last_bidder = lot_state.top_bidder.unwrap_or(lot.seller);
        let seller_tokens = self.ata(lot.seller);
        let last_tokens = self.ata(last_bidder);
        let last_before = self.token_balance(last_tokens);
        let seller_before = self.token_balance(seller_tokens);

        // Открытый торг закрывает только продавец; закрытый - кто угодно.
        let roll: u8 = self.trident.random_from_range(0..100u8);
        let crank = if sale_open || roll < 50 {
            if roll < 20 {
                let c = self.fuzz_accounts.crank.insert(&mut self.trident, None);
                self.trident.airdrop(&c, LAMPORTS_PER_SOL);
                c
            } else {
                lot.seller
            }
        } else {
            let c = self.fuzz_accounts.crank.insert(&mut self.trident, None);
            self.trident.airdrop(&c, LAMPORTS_PER_SOL);
            c
        };

        let ix = oxar_escrow::SellerClosesLotInstruction::data(
            oxar_escrow::SellerClosesLotInstructionData::new(),
        )
        .accounts(oxar_escrow::SellerClosesLotInstructionAccounts::new(
            crank,
            lot.sale,
            lot.key,
            lot.vault,
            lot.seller,
            seller_tokens,
            last_bidder,
            last_tokens,
            self.mint,
        ))
        .instruction();
        let res = self.trident.process_transaction(&[ix], Some("seller_closes_lot"));

        let has_winner = lot_state.top_bidder.is_some() && lot_state.top_bid >= lot_state.reserve;
        let proof_missed = sale_state.proof_deadline != 0
            && sale_state.proved_at == 0
            && !sale_open
            && now > sale_state.proof_deadline;
        let dispute_lapsed = lot_state.disputed && now >= lot_state.disputed_at + ARBITER_SECONDS;

        if sale_open && lot_state.top_bidder.is_some() {
            assert!(res.is_custom_error_with_code(ERR_LOT_STILL_OPEN), "{}", res.logs());
            return;
        }
        if sale_open && crank != lot.seller {
            assert!(res.is_error(), "чужой снял пустое место на идущем торге");
            return;
        }
        if has_winner && !proof_missed && !dispute_lapsed {
            assert!(res.is_custom_error_with_code(ERR_LOT_HAS_WINNER), "{}", res.logs());
            return;
        }
        assert!(res.is_success(), "закрытие упало: {}", res.logs());

        // Последняя ставка вернулась тому, кто её делал, ровно.
        if let Some(prev) = lot_state.top_bidder {
            let refund = lot_state.top_bid;
            if prev == lot.seller {
                assert_eq!(self.token_balance(seller_tokens), seller_before + refund);
            } else {
                assert_eq!(self.token_balance(last_tokens), last_before + refund, "возврат не равен ставке");
                assert_eq!(self.token_balance(seller_tokens), seller_before, "продавцу досталось лишнее");
            }
        }
        assert!(self.account_gone(lot.vault), "хранилище не закрыто");
        self.mark_settled(lot.key);
    }

    fn try_pay(
        &mut self,
        lot: &LotInfo,
        lot_state: &Lot,
        sale_state: &Sale,
        crank: Pubkey,
        winner: Pubkey,
        appeal_open: bool,
    ) {
        let seller_tokens = self.ata(lot.seller);
        let platform_tokens = self.ata(self.platform);
        let seller_before = self.token_balance(seller_tokens);
        let platform_before = self.token_balance(platform_tokens);

        let ix = oxar_escrow::LotPaysSellerInstruction::data(
            oxar_escrow::LotPaysSellerInstructionData::new(),
        )
        .accounts(oxar_escrow::LotPaysSellerInstructionAccounts::new(
            crank,
            lot.sale,
            lot.key,
            lot.vault,
            lot.seller,
            seller_tokens,
            self.platform,
            platform_tokens,
            self.mint,
        ))
        .instruction();
        let res = self.trident.process_transaction(&[ix], Some("lot_pays_seller"));

        if lot_state.disputed {
            assert!(res.is_custom_error_with_code(ERR_LOT_DISPUTED), "{}", res.logs());
            return;
        }
        if appeal_open && crank != winner {
            assert!(
                res.is_custom_error_with_code(ERR_NOT_PAYABLE_YET),
                "кранк выплатил внутри окна спора: {}",
                res.logs()
            );
            return;
        }
        assert!(res.is_success(), "выплата упала: {}", res.logs());

        let fee = ((lot_state.top_bid as u128) * (sale_state.fee_bps as u128) / 10_000) as u64;
        let to_seller = lot_state.top_bid - fee;
        assert_eq!(self.token_balance(platform_tokens), platform_before + fee, "комиссия не та");
        assert_eq!(self.token_balance(seller_tokens), seller_before + to_seller, "выручка не та");
        assert!(self.account_gone(lot.vault), "хранилище не закрыто");
        self.mark_settled(lot.key);
    }

    fn try_arbiter(&mut self, lot: &LotInfo, lot_state: &Lot, sale_state: &Sale, winner: Pubkey) {
        let seller_tokens = self.ata(lot.seller);
        let platform_tokens = self.ata(self.platform);
        let winner_tokens = self.ata(winner);
        let seller_before = self.token_balance(seller_tokens);
        let platform_before = self.token_balance(platform_tokens);
        let winner_before = self.token_balance(winner_tokens);

        let seller_bps: u16 = self.trident.random_from_range(0..=10_000u16);
        let ix = oxar_escrow::ArbiterDecidesInstruction::data(
            oxar_escrow::ArbiterDecidesInstructionData::new(seller_bps),
        )
        .accounts(oxar_escrow::ArbiterDecidesInstructionAccounts::new(
            self.admin,
            self.config,
            lot.sale,
            lot.key,
            lot.vault,
            lot.seller,
            seller_tokens,
            self.platform,
            platform_tokens,
            winner,
            winner_tokens,
            self.mint,
        ))
        .instruction();
        let res = self.trident.process_transaction(&[ix], Some("arbiter_decides"));
        assert!(res.is_success(), "решение арбитра упало: {}", res.logs());

        let paid = (self.token_balance(seller_tokens) - seller_before)
            + (self.token_balance(platform_tokens) - platform_before)
            + (self.token_balance(winner_tokens) - winner_before);
        assert_eq!(paid, lot_state.top_bid, "арбитр раздал не ровно ставку");
        let _ = sale_state;
        assert!(self.account_gone(lot.vault), "хранилище не закрыто");
        self.mark_settled(lot.key);
    }

    // ------------------------------------------------------------------
    // Инварианты.
    // ------------------------------------------------------------------

    fn check_invariants(&mut self) {
        // 1. Хранилище открытого места держит ровно лучшую ставку.
        let mut in_vaults: u64 = 0;
        for lot in self.lots.clone() {
            if lot.settled {
                continue;
            }
            let state: Lot = self.read(lot.key);
            let vault = self.token_balance(lot.vault);
            let expected = if state.top_bidder.is_some() { state.top_bid } else { 0 };
            assert_eq!(vault, expected, "в хранилище {} не ровно лучшая ставка", lot.key);
            in_vaults += vault;
        }

        // 2. Сохранение монеты.
        let mut on_wallets: u64 = 0;
        for w in self.wallets.clone() {
            on_wallets += self.token_balance(self.ata(w));
        }
        assert_eq!(on_wallets + in_vaults, self.total_minted, "монета появилась или исчезла");

        // 3. Срок торга только вперёд и не выше потолка.
        for sale in self.sales.clone() {
            let state: Sale = self.read(sale.key);
            assert!(state.closes_at >= sale.last_closes_at, "срок торга укоротился");
            assert!(state.closes_at <= sale.hard_closes_at, "срок торга выше потолка");
            assert_eq!(state.fee_bps, self.fee_bps, "комиссия торга изменилась после открытия");
        }
    }

    // ------------------------------------------------------------------
    // Мелочи.
    // ------------------------------------------------------------------

    fn pick<T: Clone>(&mut self, items: &[T]) -> T {
        let i: usize = self.trident.random_from_range(0..items.len());
        items[i].clone()
    }

    fn read<T: BorshDeserialize>(&mut self, key: Pubkey) -> T {
        self.trident
            .get_account_with_type::<T>(&key, 8)
            .unwrap_or_else(|| panic!("аккаунт {} не читается", key))
    }

    fn ata(&self, owner: Pubkey) -> Pubkey {
        self.trident
            .get_associated_token_address(&self.mint, &owner, &TOKEN_PROGRAM)
    }

    fn ensure_ata(&mut self, owner: Pubkey) -> Pubkey {
        let ata = self.ata(owner);
        let ix = self
            .trident
            .initialize_associated_token_account(&self.mint_authority, &self.mint, &owner);
        let res = self.trident.process_transaction(&[ix], Some("create_ata"));
        assert!(res.is_success(), "ATA failed: {}", res.logs());
        if !self.wallets.contains(&owner) {
            self.wallets.push(owner);
        }
        ata
    }

    fn token_balance(&mut self, token_account: Pubkey) -> u64 {
        match self.trident.get_token_account(token_account) {
            Ok(acc) => acc.account.amount,
            Err(_) => 0,
        }
    }

    fn account_gone(&mut self, key: Pubkey) -> bool {
        self.trident.get_account(&key).lamports() == 0
    }

    fn mark_settled(&mut self, lot_key: Pubkey) {
        if let Some(l) = self.lots.iter_mut().find(|l| l.key == lot_key) {
            l.settled = true;
        }
    }

    fn remember_close(&mut self, sale_key: Pubkey, closes_at: i64) {
        if let Some(s) = self.sales.iter_mut().find(|s| s.key == sale_key) {
            s.last_closes_at = closes_at;
        }
    }
}

/// Минимальная следующая ставка, как её считает программа.
fn min_next_bid(lot: &Lot) -> u64 {
    if lot.top_bidder.is_none() {
        return lot.reserve;
    }
    let five_percent = lot.top_bid.saturating_mul(5) / 100;
    lot.top_bid.saturating_add(five_percent.max(lot.min_step))
}

fn main() {
    FuzzTest::fuzz(1000, 120);
}
