use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    error::EscrowError,
    state::{Lot, MAX_EXTEND_SECONDS},
};

/// Продавец открывает торг.
///
/// Денег здесь ещё нет: хранилище заводится пустым и наполняется первой же
/// ставкой. Продавец платит аренду за два аккаунта и получает её обратно, когда
/// лот закрывается.
#[derive(Accounts)]
#[instruction(auction: [u8; 16])]
pub struct SellerOpensLot<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// Идентификатор лота из нашей базы - шестнадцать байт uuid. Торг на один
    /// лот может быть только один: повторный вызов упрётся в занятый PDA.
    #[account(
        init,
        payer = seller,
        space = 8 + Lot::INIT_SPACE,
        seeds = [b"lot", auction.as_ref()],
        bump
    )]
    pub lot: Account<'info, Lot>,

    /// Хранилище торга. Владеет им сам лот: ни у продавца, ни у участников, ни
    /// у площадки ключа от него нет.
    #[account(
        init,
        payer = seller,
        seeds = [b"lot_vault", lot.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = lot,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: владелец счёта, на который пойдёт комиссия. Записывается в лот и
    /// дальше не меняется. Называет его продавец, открывая торг, и только он:
    /// к моменту выплаты спорить об этом уже поздно, а выплату зовёт кто угодно.
    pub platform: UncheckedAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn open_lot(
    ctx: Context<SellerOpensLot>,
    auction: [u8; 16],
    reserve: u64,
    min_step: u64,
    closes_at: i64,
    extend_seconds: i64,
    fee_bps: u16,
) -> Result<()> {
    require!(reserve > 0, EscrowError::AmountIsZero);
    require!(min_step > 0, EscrowError::AmountIsZero);
    require!(fee_bps <= 10_000, EscrowError::FeeTooHigh);
    require!(
        extend_seconds >= 0 && extend_seconds <= MAX_EXTEND_SECONDS,
        EscrowError::ExtensionTooLong
    );

    // Торг, закрытый в прошлом, нельзя ни выиграть, ни отменить осмысленно: он
    // рождался бы сразу несостоявшимся.
    let now = Clock::get()?.unix_timestamp;
    require!(closes_at > now, EscrowError::ClosesInThePast);

    let lot = &mut ctx.accounts.lot;
    lot.auction = auction;
    lot.seller = ctx.accounts.seller.key();
    lot.mint = ctx.accounts.mint.key();
    lot.top_bidder = None;
    lot.top_bid = 0;
    lot.reserve = reserve;
    lot.min_step = min_step;
    lot.closes_at = closes_at;
    lot.extend_seconds = extend_seconds;
    lot.fee_bps = fee_bps;
    lot.bump = ctx.bumps.lot;
    lot.vault_bump = ctx.bumps.vault;
    lot.platform = ctx.accounts.platform.key();
    lot.reserved = [0u8; 32];

    Ok(())
}
