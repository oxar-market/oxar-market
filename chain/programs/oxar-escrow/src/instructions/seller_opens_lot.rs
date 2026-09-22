use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    error::EscrowError,
    state::{Config, Lot, Sale},
};

/// Продавец открывает место на вещи.
///
/// Денег здесь ещё нет: хранилище заводится пустым и наполняется первой же
/// ставкой. Продавец платит аренду за два аккаунта и получает её обратно, когда
/// место закрывается.
///
/// Срока у места нет: он берётся из торга, к которому место привязано. Так
/// пятнадцать мест одной футболки закрываются в одну секунду, сколько бы
/// времени ни прошло между их открытием.
///
/// Монету выбирает не продавец, а площадка: торги идут в USDC, и всё остальное
/// здесь отбивается. Иначе место ушло бы за токен, который продавец завёл сам
/// утром того же дня, - победитель заплатил бы настоящими деньгами разве что по
/// недоразумению, а комиссия площадки пришла бы в том же фантике.
#[derive(Accounts)]
#[instruction(auction: [u8; 16])]
pub struct SellerOpensLot<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    /// Торг вещи. Место без торга не открыть, и открыть его может только тот,
    /// кто этот торг завёл.
    #[account(
        seeds = [b"sale", sale.sale.as_ref()],
        bump = sale.bump,
        has_one = seller,
    )]
    pub sale: Account<'info, Sale>,

    /// Настройки площадки: отсюда монета торгов. Сиды постоянные, аккаунт один
    /// на всю программу - подставить свой нельзя.
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

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

    /// Хранилище места. Владеет им сам лот: ни у продавца, ни у участников, ни
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

    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn open_lot(
    ctx: Context<SellerOpensLot>,
    auction: [u8; 16],
    reserve: u64,
    min_step: u64,
) -> Result<()> {
    require!(reserve > 0, EscrowError::AmountIsZero);
    require!(min_step > 0, EscrowError::AmountIsZero);

    // Монета одна на всю площадку. Проверка стоит только здесь, и этого
    // довольно: дальше монета места прибита к нему через `has_one = mint`, и ни
    // ставка, ни выплата подменить её уже не могут.
    require_keys_eq!(
        ctx.accounts.mint.key(),
        ctx.accounts.config.mint,
        EscrowError::WrongMint
    );

    // Место в уже закрытый торг не вешают: оно родилось бы сразу
    // несостоявшимся, и ставку на него принять было бы нельзя.
    let now = Clock::get()?.unix_timestamp;
    require!(ctx.accounts.sale.is_open(now), EscrowError::LotClosed);

    let lot = &mut ctx.accounts.lot;
    lot.sale = ctx.accounts.sale.key();
    lot.mint = ctx.accounts.mint.key();
    lot.top_bidder = None;
    lot.top_bid = 0;
    lot.reserve = reserve;
    lot.min_step = min_step;
    lot.auction = auction;
    lot.bump = ctx.bumps.lot;
    lot.vault_bump = ctx.bumps.vault;
    lot.reserved = [0u8; 32];

    Ok(())
}
