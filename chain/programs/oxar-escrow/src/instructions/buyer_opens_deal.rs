use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{error::EscrowError, state::Deal};

/// Покупатель открывает сделку и кладёт всю сумму в хранилище.
///
/// Деньги уходят из его кошелька сразу и целиком - иначе обещание «место
/// забронировано» ничем не обеспечено. Обратно они текут по одной из двух
/// дорог: продавцу за отстоявшее время или покупателю за неотстоявшее.
#[derive(Accounts)]
#[instruction(booking: [u8; 16])]
pub struct BuyerOpensDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: адрес получателя, подписи не требует. Его правильность - забота
    /// покупателя: он платит и он же выбирает, кому.
    pub seller: UncheckedAccount<'info>,

    /// CHECK: владелец счёта комиссии. Тоже только адрес.
    pub platform: UncheckedAccount<'info>,

    /// Идентификатор брони из нашей базы - шестнадцать байт uuid. Сделка на одну
    /// бронь может быть только одна: повторный вызов упрётся в уже занятый PDA.
    #[account(
        init,
        payer = buyer,
        space = 8 + Deal::INIT_SPACE,
        seeds = [b"deal", booking.as_ref()],
        bump
    )]
    pub deal: Account<'info, Deal>,

    /// Хранилище сделки. Владеет им сама сделка, то есть никто из людей: ключа
    /// от него нет ни у покупателя, ни у продавца, ни у площадки.
    #[account(
        init,
        payer = buyer,
        seeds = [b"vault", deal.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = deal,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_tokens: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn open_deal(
    ctx: Context<BuyerOpensDeal>,
    booking: [u8; 16],
    amount: u64,
    starts_at: i64,
    ends_at: i64,
    fee_bps: u16,
) -> Result<()> {
    require!(amount > 0, EscrowError::AmountIsZero);
    require!(ends_at >= starts_at, EscrowError::EndsBeforeStart);
    require!(fee_bps <= 10_000, EscrowError::FeeTooHigh);

    // Начало в прошлом означало бы, что часть срока уже «отстояла», хотя
    // размещение ещё не встало: продавец получил бы за время до сделки.
    let now = Clock::get()?.unix_timestamp;
    require!(starts_at >= now, EscrowError::StartsInThePast);

    let deal = &mut ctx.accounts.deal;
    deal.booking = booking;
    deal.buyer = ctx.accounts.buyer.key();
    deal.seller = ctx.accounts.seller.key();
    deal.platform = ctx.accounts.platform.key();
    deal.mint = ctx.accounts.mint.key();
    deal.amount = amount;
    deal.released = 0;
    deal.starts_at = starts_at;
    deal.ends_at = ends_at;
    deal.fee_bps = fee_bps;
    deal.bump = ctx.bumps.deal;
    deal.vault_bump = ctx.bumps.vault;
    deal.reserved = [0u8; 64];

    // Подпись покупателя, а не сделки: деньги пока его.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.buyer_tokens.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    Ok(())
}
