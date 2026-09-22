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
/// Продаётся вещь целиком, а не место по отдельности. Торг открывается один на
/// футболку, места вешаются на него, и закрываются они все в одну и ту же
/// секунду: срок живёт в торге, а не в месте. Ставка на любое место двигает
/// конец всей вещи - иначе на соседнем месте можно было бы выиграть по
/// таймеру, пока внимание приковано к одному.
///
/// Пять инструкций и один путь через них. Продавец открывает торг вещи, потом
/// её места. Участники ставят, и деньги уходят из кошелька сразу, а перебитому
/// возвращаются той же транзакцией. Когда торг кончился, у каждого места одно
/// из двух: резерв взят - выручка делится между продавцом и площадкой; не взят
/// - последняя ставка возвращается хозяину. В обоих случаях аккаунты места
/// закрываются и аренда идёт обратно продавцу.
///
/// Деньги у мест раздельные: своё хранилище, свой победитель, своя выплата.
/// Общее у них - время, продавец, комиссия и её получатель.
///
/// Типа места здесь нет и не будет: блокчейну всё равно, аватарка это или бок
/// чемодана. Все различия между поверхностями живут в нашей базе.
#[program]
pub mod oxar_escrow {
    use super::*;

    /// Продавец открывает торг вещи: срок, продление и комиссия - на всю вещь.
    pub fn seller_opens_sale(
        ctx: Context<SellerOpensSale>,
        sale_id: [u8; 16],
        closes_at: i64,
        extend_seconds: i64,
        fee_bps: u16,
    ) -> Result<()> {
        seller_opens_sale::open_sale(ctx, sale_id, closes_at, extend_seconds, fee_bps)
    }

    /// Продавец открывает место на вещи. Денег в хранилище ещё нет.
    pub fn seller_opens_lot(
        ctx: Context<SellerOpensLot>,
        auction: [u8; 16],
        reserve: u64,
        min_step: u64,
    ) -> Result<()> {
        seller_opens_lot::open_lot(ctx, auction, reserve, min_step)
    }

    /// Ставка: деньги уходят в хранилище, прежнему лидеру возвращаются тут же,
    /// а конец торга всей вещи двигается вперёд, если ставка пришла под конец.
    pub fn bidder_places_bid(ctx: Context<BidderPlacesBid>, amount: u64) -> Result<()> {
        bidder_places_bid::place_bid(ctx, amount)
    }

    /// Место ушло с победителем: выручка продавцу, комиссия площадке.
    pub fn lot_pays_seller(ctx: Context<LotPaysSeller>) -> Result<()> {
        lot_pays_seller::pay_seller(ctx)
    }

    /// Место кончилось ничем: ставка ниже резерва возвращается, аккаунты
    /// закрываются.
    pub fn seller_closes_lot(ctx: Context<SellerClosesLot>) -> Result<()> {
        seller_closes_lot::close_lot(ctx)
    }
}
