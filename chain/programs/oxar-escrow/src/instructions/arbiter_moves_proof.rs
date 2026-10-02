use anchor_lang::prelude::*;

use crate::{
    error::EscrowError,
    state::{Config, Sale},
};

/// Арбитр отодвигает срок пруфа: ивент, на котором вещь покажут, перенесли.
///
/// Только позже и только пока пруфа нет и срок не вышел. Вышедший срок уже дал
/// победителям право забрать ставки, и перенос его не отнимет. Перенос
/// задерживает деньги победителей, поэтому он у арбитра, а не у продавца:
/// продавец двигал бы срок бесконечно. Каждый перенос уходит событием -
/// победители и приложение видят, с какого срока на какой.
#[derive(Accounts)]
pub struct ArbiterMovesProof<'info> {
    pub arbiter: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.admin == arbiter.key() @ EscrowError::NotTheAdmin,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"sale", sale.sale.as_ref()],
        bump = sale.bump,
    )]
    pub sale: Account<'info, Sale>,
}

#[event]
pub struct ProofDeadlineMoved {
    pub sale: Pubkey,
    pub from: i64,
    pub to: i64,
}

pub fn move_proof(ctx: Context<ArbiterMovesProof>, new_deadline: i64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let sale = &mut ctx.accounts.sale;
    require!(sale.moves_proof(now, new_deadline), EscrowError::ProofDeadlineFixed);

    let from = sale.proof_deadline;
    sale.proof_deadline = new_deadline;
    emit!(ProofDeadlineMoved {
        sale: sale.key(),
        from,
        to: new_deadline,
    });
    Ok(())
}
