use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    error::EscrowError,
    state::{StickerOrder, StickerSheet},
};

/// Покупка стикеров: цена - продавцу и площадке сразу, номера - покупателю.
///
/// Деньги идут прямо из кошелька покупателя, хранилища нет. Сколько кому -
/// решает лист, а не покупатель: адреса получателей сверяются с листом, доля
/// считается из его комиссии. Перевод мимо этой инструкции - просто перевод:
/// номера он не занимает и в витрину не попадает.
///
/// Адрес покупки выводится из числа уже проданных. Двое купили одновременно -
/// второй упрётся в занятый адрес, и его транзакция откатится целиком, вместе
/// с деньгами.
#[derive(Accounts)]
pub struct BuyerBuysStickers<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stickers", sheet.id.as_ref()],
        bump = sheet.bump,
        has_one = mint,
        has_one = seller,
        has_one = platform,
    )]
    pub sheet: Account<'info, StickerSheet>,

    #[account(
        init,
        payer = buyer,
        space = 8 + StickerOrder::INIT_SPACE,
        seeds = [b"sticker", sheet.key().as_ref(), &sheet.sold.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, StickerOrder>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_tokens: Account<'info, TokenAccount>,

    /// CHECK: получатель цены. Сверяется с `sheet.seller` через `has_one`.
    pub seller: UncheckedAccount<'info>,

    /// Счёт продавца заводится, если его нет: иначе продажа стояла бы, пока
    /// продавец не заведёт его сам.
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_tokens: Account<'info, TokenAccount>,

    /// CHECK: получатель комиссии. Сверяется с `sheet.platform` через `has_one`.
    pub platform: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = platform,
        associated_token::token_program = token_program,
    )]
    pub platform_tokens: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn buy_stickers(ctx: Context<BuyerBuysStickers>, count: u16, tag: [u8; 16]) -> Result<()> {
    let sheet = &ctx.accounts.sheet;
    require!(count > 0, EscrowError::BadStickerTerms);
    require!(sheet.fits(count), EscrowError::StickersSoldOut);
    let (fee, to_seller) = sheet.split(count)?;

    for (to, amount) in [
        (ctx.accounts.seller_tokens.to_account_info(), to_seller),
        (ctx.accounts.platform_tokens.to_account_info(), fee),
    ] {
        if amount == 0 {
            continue;
        }
        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.buyer_tokens.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to,
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
    }

    let order = &mut ctx.accounts.order;
    order.sheet = ctx.accounts.sheet.key();
    order.buyer = ctx.accounts.buyer.key();
    order.first = ctx.accounts.sheet.sold;
    order.count = count;
    order.tag = tag;
    order.bump = ctx.bumps.order;

    let sheet = &mut ctx.accounts.sheet;
    sheet.sold += count;
    Ok(())
}
