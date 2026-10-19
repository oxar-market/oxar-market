use anchor_lang::prelude::*;

use crate::{
    error::EscrowError,
    state::{Config, SalePermit},
};

/// Админ отзывает разрешение на торг без пруфа, аренда возвращается ему.
///
/// До открытия торга отзыв его запрещает. После открытия режим торга уже
/// записан и не меняется - отзыв лишь возвращает аренду.
#[derive(Accounts)]
#[instruction(sale_id: [u8; 16])]
pub struct AdminRevokesPermit<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.admin == admin.key() @ EscrowError::NotTheAdmin,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        close = admin,
        seeds = [b"permit", sale_id.as_ref()],
        bump = permit.bump,
    )]
    pub permit: Account<'info, SalePermit>,
}

pub fn revoke_permit(_ctx: Context<AdminRevokesPermit>, _sale_id: [u8; 16]) -> Result<()> {
    Ok(())
}
