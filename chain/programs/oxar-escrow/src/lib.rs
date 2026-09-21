pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("Hzh8CjF8ZmmtqVro2dVR54uFVcyjWfp3Aenvh782QYr5");

/// Эскроу OXAR: торги, в которых ставка обеспечена деньгами.
///
/// Четыре инструкции и один путь через них. Продавец открывает лот. Участники
/// ставят, и деньги уходят из кошелька сразу, а перебитому возвращаются той же
/// транзакцией. Дальше одно из двух: резерв взят - выручка делится между
/// продавцом и площадкой; не взят - последняя ставка возвращается хозяину.
/// В обоих случаях аккаунты закрываются и аренда идёт обратно продавцу.
///
/// Сделки со стримингом здесь больше нет. Она осталась от прежнего продукта,
/// где место оплачивалось за простоявшее время, и вместе с ним ушла. Держать
/// её «на всякий случай» было нельзя: у выигравшего лота оказывалось два
/// выхода, и второй позволял тому, кто его вызовет, назначить получателем
/// комиссии себя.
///
/// Типа места здесь нет и не будет: блокчейну всё равно, аватарка это или бок
/// чемодана. Все различия между поверхностями живут в нашей базе.
#[program]
pub mod oxar_escrow {
    use super::*;

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

    /// Торг кончился с победителем: выручка продавцу, комиссия площадке.
    pub fn lot_pays_seller(ctx: Context<LotPaysSeller>) -> Result<()> {
        lot_pays_seller::pay_seller(ctx)
    }

    /// Торг кончился ничем: ставка ниже резерва возвращается, аккаунты закрываются.
    pub fn seller_closes_lot(ctx: Context<SellerClosesLot>) -> Result<()> {
        seller_closes_lot::close_lot(ctx)
    }
}
