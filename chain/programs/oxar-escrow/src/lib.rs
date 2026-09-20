pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("Hzh8CjF8ZmmtqVro2dVR54uFVcyjWfp3Aenvh782QYr5");

/// Эскроу OXAR: деньги отдаются за время, которое размещение реально простояло.
///
/// Две половины. Сделка - то, что было и раньше: покупатель отдал сумму,
/// продавец получает её по расписанию. Торг - то, что появилось потом: ставки
/// обеспечены деньгами, а выигравшая переезжает в сделку, не возвращаясь в
/// кошелёк. Победителю не надо платить отдельно, и «выиграл и пропал»
/// перестаёт быть возможным.
///
/// Типа места здесь нет и не будет: блокчейну всё равно, аватарка это или бок
/// чемодана. Все различия между поверхностями живут в нашей базе.
#[program]
pub mod oxar_escrow {
    use super::*;

    /// Покупатель кладёт всю сумму в хранилище сделки.
    pub fn buyer_opens_deal(
        ctx: Context<BuyerOpensDeal>,
        booking: [u8; 16],
        amount: u64,
        starts_at: i64,
        ends_at: i64,
        refundable_until: i64,
        fee_bps: u16,
    ) -> Result<()> {
        buyer_opens_deal::open_deal(
            ctx,
            booking,
            amount,
            starts_at,
            ends_at,
            refundable_until,
            fee_bps,
        )
    }

    /// Продавец забирает натёкшее, не закрывая сделку.
    pub fn seller_takes_earned(ctx: Context<SellerTakesEarned>) -> Result<()> {
        seller_takes_earned::take_earned(ctx)
    }

    /// Любая из сторон закрывает сделку: продавцу за отстоявшее, остальное назад.
    pub fn party_closes_deal(ctx: Context<PartyClosesDeal>) -> Result<()> {
        party_closes_deal::close_deal(ctx)
    }

    /// Продавец открывает торг. Денег в хранилище ещё нет.
    pub fn seller_opens_lot(
        ctx: Context<SellerOpensLot>,
        auction: [u8; 16],
        reserve: u64,
        min_step: u64,
        closes_at: i64,
        extend_seconds: i64,
        fee_bps: u16,
    ) -> Result<()> {
        seller_opens_lot::open_lot(
            ctx,
            auction,
            reserve,
            min_step,
            closes_at,
            extend_seconds,
            fee_bps,
        )
    }

    /// Ставка: деньги уходят в хранилище, прежнему лидеру возвращаются тут же.
    pub fn bidder_places_bid(ctx: Context<BidderPlacesBid>, amount: u64) -> Result<()> {
        bidder_places_bid::place_bid(ctx, amount)
    }

    /// Торг кончился с победителем: ставка переезжает в сделку.
    pub fn lot_becomes_deal(
        ctx: Context<LotBecomesDeal>,
        booking: [u8; 16],
        starts_at: i64,
        ends_at: i64,
        refundable_until: i64,
    ) -> Result<()> {
        lot_becomes_deal::settle_lot(ctx, booking, starts_at, ends_at, refundable_until)
    }

    /// Торг кончился ничем: ставка ниже резерва возвращается, аккаунты закрываются.
    pub fn seller_closes_lot(ctx: Context<SellerClosesLot>) -> Result<()> {
        seller_closes_lot::close_lot(ctx)
    }
}
