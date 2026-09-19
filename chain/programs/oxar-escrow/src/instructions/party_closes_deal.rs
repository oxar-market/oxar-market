use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::{error::EscrowError, instructions::payout, state::Deal};

/// Закрыть сделку. Продавец получает за отстоявшее время, покупатель забирает
/// остальное, аккаунты закрываются и рента возвращается.
///
/// Звать может любая из двух сторон, и это не симметрия ради красоты. Честный
/// продавец, снявший размещение раньше срока, должен иметь возможность
/// остановить счётчик сам и не брать чужого; покупатель - вернуть своё, когда
/// места на месте больше нет. Площадка закрыть сделку не может: у неё здесь
/// нет никаких прав, кроме получения комиссии.
///
/// После конца срока результат тот же, что и при отмене: `earned_at` отдаёт всю
/// сумму, покупателю не возвращается ничего. Отдельной инструкции «завершить»
/// поэтому нет.
/// Аккаунты вынесены на кучу через `Box`. Их здесь десять, и Anchor по
/// умолчанию раскладывает их на стеке, которого у программы четыре килобайта:
/// без `Box` инструкция падает с «Access violation in stack frame». Поймано
/// интеграционным тестом, а не рассуждением.
#[derive(Accounts)]
pub struct PartyClosesDeal<'info> {
    #[account(mut)]
    pub party: Signer<'info>,

    #[account(
        mut,
        seeds = [b"deal", deal.booking.as_ref()],
        bump = deal.bump,
        has_one = buyer,
        has_one = seller,
        has_one = platform,
        has_one = mint,
        // Рента за сделку возвращается тому, кто за неё платил.
        close = buyer,
        constraint = party.key() == deal.buyer || party.key() == deal.seller
            @ EscrowError::NotAParty,
    )]
    pub deal: Box<Account<'info, Deal>>,

    #[account(
        mut,
        seeds = [b"vault", deal.key().as_ref()],
        bump = deal.vault_bump,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: сверяется с `deal.buyer` через has_one.
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,

    /// CHECK: сверяется с `deal.seller` через has_one.
    pub seller: UncheckedAccount<'info>,

    /// CHECK: сверяется с `deal.platform` через has_one.
    pub platform: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_tokens: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_tokens: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = platform,
        associated_token::token_program = token_program,
    )]
    pub platform_tokens: Box<InterfaceAccount<'info, TokenAccount>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn close_deal(ctx: Context<PartyClosesDeal>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let deal = &ctx.accounts.deal;

    let earned = deal.earned_at(now)?;
    let payable = earned
        .checked_sub(deal.released)
        .ok_or(EscrowError::MathOverflow)?;

    payout::release(
        deal,
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.seller_tokens.to_account_info(),
        &ctx.accounts.platform_tokens.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        ctx.accounts.mint.decimals,
        payable,
    )?;

    let booking = deal.booking;
    let bump = [deal.bump];
    let seeds: &[&[u8]] = &[b"deal", booking.as_ref(), &bump];
    let signer: &[&[&[u8]]] = &[seeds];

    // Возврат считается по остатку в хранилище, а не по формуле. Остаток от
    // целочисленного деления при каждой выплате оставался здесь, и вернуть его
    // надо тому, кто его вносил.
    ctx.accounts.vault.reload()?;
    let refund = ctx.accounts.vault.amount;

    if refund > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.buyer_tokens.to_account_info(),
                    authority: ctx.accounts.deal.to_account_info(),
                },
                signer,
            ),
            refund,
            ctx.accounts.mint.decimals,
        )?;
    }

    // Пустое хранилище закрывается, и его рента тоже уходит покупателю.
    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.buyer.to_account_info(),
            authority: ctx.accounts.deal.to_account_info(),
        },
        signer,
    ))?;

    Ok(())
}
