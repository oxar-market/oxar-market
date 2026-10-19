use anchor_lang::prelude::*;

use crate::{
    error::EscrowError,
    state::{Config, SalePermit},
};

/// Админ разрешает продавцу открыть торг без пруфа.
///
/// Разрешение - на конкретный торг: его адрес выводится из id торга, а id
/// продавец берёт из подготовленной для него вещи. Выдать дважды на один торг
/// нельзя - аккаунт уже есть.
#[derive(Accounts)]
#[instruction(sale_id: [u8; 16])]
pub struct AdminPermitsSale<'info> {
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
        space = 8 + SalePermit::INIT_SPACE,
        seeds = [b"permit", sale_id.as_ref()],
        bump
    )]
    pub permit: Account<'info, SalePermit>,

    pub system_program: Program<'info, System>,
}

pub fn permit_sale(ctx: Context<AdminPermitsSale>, _sale_id: [u8; 16], seller: Pubkey) -> Result<()> {
    let permit = &mut ctx.accounts.permit;
    permit.seller = seller;
    permit.bump = ctx.bumps.permit;
    Ok(())
}
