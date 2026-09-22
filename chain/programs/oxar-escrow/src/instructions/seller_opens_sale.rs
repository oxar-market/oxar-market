use anchor_lang::prelude::*;

use crate::{
    error::EscrowError,
    state::{Config, Sale, MAX_EXTEND_SECONDS, MAX_SALE_SECONDS},
};

/// Продавец открывает торг вещи.
///
/// Это первый шаг: сперва заводится торг, потом на него вешаются места. Срок и
/// продление задаются здесь один раз и общие на всю вещь - ровно потому, что
/// продаётся футболка целиком, а не пятнадцать независимых табличек.
///
/// А вот комиссию и её получателя продавец не задаёт вовсе: они берутся из
/// настроек площадки. Раньше их называл открывающий, и пока торги открывали мы
/// сами, это работало. Но инструкция общая: стоит продавцам заводить аукционы
/// самостоятельно, и они поставили бы себе ноль процентов.
///
/// В торг условия всё равно переписываются, а не читаются из настроек при
/// выплате. Так открывший аукцион под десять процентов не обнаружит однажды
/// тридцать: смена настроек действует на будущие торги, а не на идущие.
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

    /// Настройки площадки: отсюда берутся комиссия и её получатель. Сиды
    /// постоянные, поэтому подставить сюда свой аккаунт нельзя - адрес
    /// единственный на всю программу.
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn open_sale(
    ctx: Context<SellerOpensSale>,
    sale_id: [u8; 16],
    closes_at: i64,
    extend_seconds: i64,
) -> Result<()> {
    require!(
        extend_seconds >= 0 && extend_seconds <= MAX_EXTEND_SECONDS,
        EscrowError::ExtensionTooLong
    );

    // Торг, закрытый в прошлом, нельзя ни выиграть, ни отменить осмысленно: он
    // рождался бы сразу несостоявшимся.
    let now = Clock::get()?.unix_timestamp;
    require!(closes_at > now, EscrowError::ClosesInThePast);
    // И слишком длинный тоже нельзя: отменить торг нечем, а ставка участника
    // заперта, пока его не перебьют. Лишний ноль в часах стоил бы ему денег на
    // годы вперёд.
    require!(
        closes_at <= now.saturating_add(MAX_SALE_SECONDS),
        EscrowError::SaleTooLong
    );

    let sale = &mut ctx.accounts.sale;
    sale.sale = sale_id;
    sale.seller = ctx.accounts.seller.key();
    sale.platform = ctx.accounts.config.platform;
    sale.closes_at = closes_at;
    sale.extend_seconds = extend_seconds;
    sale.fee_bps = ctx.accounts.config.fee_bps;
    sale.bump = ctx.bumps.sale;
    sale.reserved = [0u8; 32];

    Ok(())
}
