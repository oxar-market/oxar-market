use anchor_lang::prelude::*;
use anchor_spl::token::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, Token,
    TransferChecked,
};

use crate::{
    error::EscrowError,
    state::{Config, Lot, Sale},
};

/// Арбитр решает оспоренное место: сколько ставки продавцу, сколько назад
/// победителю.
///
/// Арбитр - админ настроек площадки. Его власть узкая: деньги места уходят
/// только продавцу и победителю этого места, по адресам, записанным в торге и
/// лоте. Забрать их себе или отправить третьему код не даст. Комиссия - только
/// с доли продавца: возврат победителю не облагается.
///
/// Место закрывается в той же транзакции: решить его дважды нельзя.
// Аккаунтов четырнадцать, и разобранные на стеке они не влезают в его четыре
// килобайта - программа падала с нарушением доступа. Тяжёлые лежат в куче.
#[derive(Accounts)]
pub struct ArbiterDecides<'info> {
    pub arbiter: Signer<'info>,

    /// Настройки площадки: из них - кто арбитр. Сиды постоянные, аккаунт один
    /// на всю программу.
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.admin == arbiter.key() @ EscrowError::NotTheAdmin,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        has_one = seller,
        has_one = platform,
    )]
    pub sale: Box<Account<'info, Sale>>,

    #[account(
        mut,
        seeds = [b"lot", lot.auction.as_ref()],
        bump = lot.bump,
        has_one = mint,
        has_one = sale,
        close = seller,
    )]
    pub lot: Account<'info, Lot>,

    #[account(
        mut,
        seeds = [b"lot_vault", lot.key().as_ref()],
        bump = lot.vault_bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: получает долю продавца и аренду. Сверяется с `sale.seller`.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_tokens: Box<Account<'info, TokenAccount>>,

    /// CHECK: получатель комиссии. Сверяется с `sale.platform`.
    pub platform: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = platform,
        associated_token::token_program = token_program,
    )]
    pub platform_tokens: Box<Account<'info, TokenAccount>>,

    /// CHECK: победитель места. Сверяется с `lot.top_bidder`.
    pub winner: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = winner,
        associated_token::token_program = token_program,
    )]
    pub winner_tokens: Box<Account<'info, TokenAccount>>,

    pub mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
}

pub fn decide(ctx: Context<ArbiterDecides>, seller_bps: u16) -> Result<()> {
    let lot = &ctx.accounts.lot;
    require!(lot.disputed, EscrowError::LotNotDisputed);
    require!(
        lot.top_bidder == Some(ctx.accounts.winner.key()),
        EscrowError::NotTheWinner
    );

    let (to_seller, fee, to_winner) = lot.arbiter_split(seller_bps, ctx.accounts.sale.fee_bps)?;
    // Лишнее в хранилище - чей-то подарок на его адрес - продавцу, как и в
    // выплате: иначе хранилище не закрыть.
    let extra = ctx.accounts.vault.amount.saturating_sub(lot.top_bid);
    let to_seller = to_seller.checked_add(extra).ok_or(EscrowError::MathOverflow)?;

    let auction = lot.auction;
    let bump = [lot.bump];
    let seeds: &[&[u8]] = &[b"lot", auction.as_ref(), &bump];
    let decimals = ctx.accounts.mint.decimals;

    for (amount, to) in [
        (to_seller, ctx.accounts.seller_tokens.to_account_info()),
        (fee, ctx.accounts.platform_tokens.to_account_info()),
        (to_winner, ctx.accounts.winner_tokens.to_account_info()),
    ] {
        if amount == 0 {
            continue;
        }
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to,
                    authority: ctx.accounts.lot.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            decimals,
        )?;
    }

    // Закрытие требует нулевого остатка: разойдись деление с хранилищем хоть
    // на единицу - транзакция не пройдёт целиком.
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.lot.to_account_info(),
        },
        &[seeds],
    ))?;

    Ok(())
}
