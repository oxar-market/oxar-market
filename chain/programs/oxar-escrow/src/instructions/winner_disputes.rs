use anchor_lang::prelude::*;

use crate::{
    error::EscrowError,
    state::{Lot, Sale},
};

/// Победитель места говорит «пруф не тот».
///
/// Деньги при этом не возвращаются, а замораживаются: иначе любой победитель
/// получал бы рекламу бесплатно, оспорив пруф. Решает арбитр - отдать
/// продавцу, вернуть победителю или поделить. Спор касается только этого
/// места: остальные места вещи платятся как обычно.
///
/// Оспорить может только победитель и только в окно после пруфа.
#[derive(Accounts)]
pub struct WinnerDisputes<'info> {
    pub winner: Signer<'info>,

    pub sale: Account<'info, Sale>,

    #[account(
        mut,
        seeds = [b"lot", lot.auction.as_ref()],
        bump = lot.bump,
        has_one = sale,
    )]
    pub lot: Account<'info, Lot>,
}

pub fn dispute(ctx: Context<WinnerDisputes>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lot = &mut ctx.accounts.lot;

    require!(lot.has_winner(), EscrowError::NoWinner);
    require!(
        lot.top_bidder == Some(ctx.accounts.winner.key()),
        EscrowError::NotTheWinner
    );
    require!(ctx.accounts.sale.appeal_open(now), EscrowError::AppealClosed);
    require!(!lot.disputed, EscrowError::LotDisputed);

    lot.disputed = true;
    Ok(())
}
