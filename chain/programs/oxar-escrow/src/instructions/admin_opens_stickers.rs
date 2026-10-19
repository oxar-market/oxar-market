use anchor_lang::prelude::*;

use crate::{
    error::EscrowError,
    state::{Config, StickerSheet},
};

/// Админ заводит лист стикеров: сколько, почём и кому деньги.
///
/// Заводит админ, а не продавец: стикеры - не торг, и продают их на нашей
/// вещи по нашей цене. Продавцу от этого ничего не грозит - деньги идут ему
/// напрямую, мимо нас. Комиссия, её получатель и монета - из настроек.
#[derive(Accounts)]
#[instruction(sheet_id: [u8; 16])]
pub struct AdminOpensStickers<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ EscrowError::NotTheAdmin,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = 8 + StickerSheet::INIT_SPACE,
        seeds = [b"stickers", sheet_id.as_ref()],
        bump
    )]
    pub sheet: Account<'info, StickerSheet>,

    pub system_program: Program<'info, System>,
}

pub fn open_stickers(
    ctx: Context<AdminOpensStickers>,
    sheet_id: [u8; 16],
    seller: Pubkey,
    price: u64,
    cap: u16,
) -> Result<()> {
    require!(price > 0 && cap > 0, EscrowError::BadStickerTerms);
    let config = &ctx.accounts.config;
    // Монета в настройках ещё не названа - продавать не в чем.
    require!(config.mint != Pubkey::default(), EscrowError::WrongMint);

    let sheet = &mut ctx.accounts.sheet;
    sheet.id = sheet_id;
    sheet.seller = seller;
    sheet.platform = config.platform;
    sheet.mint = config.mint;
    sheet.price = price;
    sheet.fee_bps = config.fee_bps;
    sheet.cap = cap;
    sheet.sold = 0;
    sheet.bump = ctx.bumps.sheet;
    Ok(())
}
