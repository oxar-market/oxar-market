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
/// Три инструкции и ни одной лишней. Аукциона здесь нет намеренно: торг решает,
/// кто покупатель и почём, и к моменту появления денег он уже кончился. Типа
/// места здесь тоже нет - блокчейну всё равно, аватарка это или бок чемодана.
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
        fee_bps: u16,
    ) -> Result<()> {
        buyer_opens_deal::handler(ctx, booking, amount, starts_at, ends_at, fee_bps)
    }

    /// Продавец забирает натёкшее, не закрывая сделку.
    pub fn seller_takes_earned(ctx: Context<SellerTakesEarned>) -> Result<()> {
        seller_takes_earned::handler(ctx)
    }

    /// Любая из сторон закрывает сделку: продавцу за отстоявшее, остальное назад.
    pub fn party_closes_deal(ctx: Context<PartyClosesDeal>) -> Result<()> {
        party_closes_deal::handler(ctx)
    }
}
