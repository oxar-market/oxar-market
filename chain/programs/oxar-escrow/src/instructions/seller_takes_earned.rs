use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{error::EscrowError, instructions::payout, state::Deal};

/// Продавец забирает то, что уже натекло, не закрывая сделку.
///
/// Без этой инструкции деньги стояли бы в хранилище до конца срока, и обещание
/// «платим за время, которое место стоит» выполнялось бы только задним числом.
/// Звать её может кто угодно: деньги всё равно уходят на счёт продавца, а кто
/// заплатил за транзакцию - неважно.
#[derive(Accounts)]
pub struct SellerTakesEarned<'info> {
    #[account(
        mut,
        seeds = [b"deal", deal.booking.as_ref()],
        bump = deal.bump,
        has_one = seller,
        has_one = platform,
        has_one = mint,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        seeds = [b"vault", deal.key().as_ref()],
        bump = deal.vault_bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: сверяется с `deal.seller` через has_one.
    pub seller: UncheckedAccount<'info>,

    /// CHECK: сверяется с `deal.platform` через has_one.
    pub platform: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_tokens: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = platform,
        associated_token::token_program = token_program,
    )]
    pub platform_tokens: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<SellerTakesEarned>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let deal = &ctx.accounts.deal;

    let earned = deal.earned_at(now)?;
    let payable = earned
        .checked_sub(deal.released)
        .ok_or(EscrowError::MathOverflow)?;
    require!(payable > 0, EscrowError::NothingToWithdraw);

    payout::release(
        deal,
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.seller_tokens.to_account_info(),
        &ctx.accounts.platform_tokens.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        ctx.accounts.mint.decimals,
        payable,
    )?;

    // Запоминаем после перевода, а не до: если перевод сорвётся, инструкция
    // откатится целиком, но порядок всё равно должен читаться как «сначала
    // отдали, потом записали».
    ctx.accounts.deal.released = earned;
    Ok(())
}
