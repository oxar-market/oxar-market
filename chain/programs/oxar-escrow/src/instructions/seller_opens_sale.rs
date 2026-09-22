use anchor_lang::prelude::*;

use crate::{
    error::EscrowError,
    state::{Sale, MAX_EXTEND_SECONDS},
};

/// Продавец открывает торг вещи.
///
/// Это первый шаг: сперва заводится торг, потом на него вешаются места. Срок,
/// продление и комиссия задаются здесь один раз и общие на всю вещь - ровно
/// потому, что продаётся футболка целиком, а не пятнадцать независимых
/// табличек.
#[derive(Accounts)]
#[instruction(sale_id: [u8; 16])]
pub struct SellerOpensSale<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        init,
        payer = seller,
        space = 8 + Sale::INIT_SPACE,
        seeds = [b"sale", sale_id.as_ref()],
        bump
    )]
    pub sale: Account<'info, Sale>,

    /// CHECK: владелец счёта, на который пойдёт комиссия со всех мест.
    /// Записывается здесь и дальше не меняется: выплату зовёт кто угодно, и
    /// называй получателя он - комиссию уводили бы себе.
    pub platform: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn open_sale(
    ctx: Context<SellerOpensSale>,
    sale_id: [u8; 16],
    closes_at: i64,
    extend_seconds: i64,
    fee_bps: u16,
) -> Result<()> {
    require!(fee_bps <= 10_000, EscrowError::FeeTooHigh);
    require!(
        extend_seconds >= 0 && extend_seconds <= MAX_EXTEND_SECONDS,
        EscrowError::ExtensionTooLong
    );

    // Торг, закрытый в прошлом, нельзя ни выиграть, ни отменить осмысленно: он
    // рождался бы сразу несостоявшимся.
    let now = Clock::get()?.unix_timestamp;
    require!(closes_at > now, EscrowError::ClosesInThePast);

    let sale = &mut ctx.accounts.sale;
    sale.sale = sale_id;
    sale.seller = ctx.accounts.seller.key();
    sale.platform = ctx.accounts.platform.key();
    sale.closes_at = closes_at;
    sale.extend_seconds = extend_seconds;
    sale.fee_bps = fee_bps;
    sale.bump = ctx.bumps.sale;
    sale.reserved = [0u8; 32];

    Ok(())
}
