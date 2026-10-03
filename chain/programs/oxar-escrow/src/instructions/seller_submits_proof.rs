use anchor_lang::prelude::*;

use crate::{error::EscrowError, state::Sale};

/// Продавец показывает вещь в деле: логотипы напечатаны, вещь вышла в мир.
///
/// Сам пруф - фото, видео, ссылки - лежит у нас: в блокчейн он не помещается
/// и не должен. Сюда приходит его хеш, и он уходит событием в транзакцию:
/// подменить пруф задним числом нельзя, хеш не сойдётся. Время пруфа
/// записывается в торг - от него идут семьдесят два часа на спор.
///
/// Один раз на торг и только между закрытием и сроком: раньше печатать нечего,
/// позже победители уже вправе забрать ставки.
#[derive(Accounts)]
pub struct SellerSubmitsProof<'info> {
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sale", sale.sale.as_ref()],
        bump = sale.bump,
        has_one = seller,
    )]
    pub sale: Account<'info, Sale>,
}

#[event]
pub struct ProofSubmitted {
    pub sale: Pubkey,
    /// Хеш пруфа, как его посчитали у нас: по нему пруф сверяется с записью.
    pub proof_hash: [u8; 32],
    pub proved_at: i64,
}

pub fn submit_proof(ctx: Context<SellerSubmitsProof>, proof_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let sale = &mut ctx.accounts.sale;
    require!(sale.takes_proof(now), EscrowError::ProofNotTaken);

    sale.proved_at = now;
    emit!(ProofSubmitted {
        sale: sale.key(),
        proof_hash,
        proved_at: now,
    });
    Ok(())
}
