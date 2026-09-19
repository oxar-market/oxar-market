use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
        TransferChecked,
    },
};

use crate::{
    error::EscrowError,
    state::{Deal, Lot},
};

/// Торг кончился - выигравшая ставка становится сделкой.
///
/// Победителю не надо платить отдельно: он заплатил, когда поставил. Деньги
/// переезжают из хранилища торга в хранилище сделки, не возвращаясь в кошелёк,
/// поэтому «выиграл и пропал» перестаёт быть возможным в принципе.
///
/// Звать может кто угодно. Это работа планировщика, а не одолжение победителя:
/// иначе сделка не начиналась бы, пока он не откроет вкладку.
#[derive(Accounts)]
#[instruction(booking: [u8; 16])]
pub struct LotBecomesDeal<'info> {
    /// Кто двигает торг дальше. Платит за два аккаунта сделки и подписи не
    /// требует ни от кого: условия уже записаны в лоте.
    #[account(mut)]
    pub crank: Signer<'info>,

    #[account(
        mut,
        seeds = [b"lot", lot.auction.as_ref()],
        bump = lot.bump,
        has_one = mint,
        has_one = seller,
        close = seller,
    )]
    pub lot: Box<Account<'info, Lot>>,

    #[account(
        mut,
        seeds = [b"lot_vault", lot.key().as_ref()],
        bump = lot.vault_bump,
    )]
    pub lot_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: продавец получает обратно аренду за аккаунты торга.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    /// CHECK: владелец счёта комиссии, переезжает в сделку как есть.
    pub platform: UncheckedAccount<'info>,

    #[account(
        init,
        payer = crank,
        space = 8 + Deal::INIT_SPACE,
        seeds = [b"deal", booking.as_ref()],
        bump
    )]
    pub deal: Box<Account<'info, Deal>>,

    #[account(
        init,
        payer = crank,
        seeds = [b"vault", deal.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = deal,
        token::token_program = token_program,
    )]
    pub deal_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn settle_lot(
    ctx: Context<LotBecomesDeal>,
    booking: [u8; 16],
    starts_at: i64,
    ends_at: i64,
    refundable_until: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lot = &*ctx.accounts.lot;

    require!(!lot.is_open(now), EscrowError::LotStillOpen);
    require!(lot.has_winner(), EscrowError::NoWinner);
    require!(ends_at >= starts_at, EscrowError::EndsBeforeStart);
    require!(refundable_until <= ends_at, EscrowError::RefundWindowTooLong);
    require!(starts_at >= now, EscrowError::StartsInThePast);

    let winner = lot.top_bidder.ok_or(EscrowError::NoWinner)?;
    let amount = lot.top_bid;

    let deal = &mut *ctx.accounts.deal;
    deal.booking = booking;
    deal.buyer = winner;
    deal.seller = lot.seller;
    deal.platform = ctx.accounts.platform.key();
    deal.mint = lot.mint;
    deal.amount = amount;
    deal.released = 0;
    deal.starts_at = starts_at;
    deal.ends_at = ends_at;
    deal.refundable_until = refundable_until;
    deal.fee_bps = lot.fee_bps;
    deal.bump = ctx.bumps.deal;
    deal.vault_bump = ctx.bumps.deal_vault;
    deal.reserved = [0u8; 64];

    let auction = lot.auction;
    let bump = [lot.bump];
    let seeds: &[&[u8]] = &[b"lot", auction.as_ref(), &bump];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.lot_vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.deal_vault.to_account_info(),
                authority: ctx.accounts.lot.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    // Хранилище торга пусто - закрываем и возвращаем аренду продавцу. Сам лот
    // закрывает Anchor по `close = seller`.
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.lot_vault.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.lot.to_account_info(),
        },
        &[seeds],
    ))?;

    Ok(())
}
