use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{error::EscrowError, state::Lot};

/// Участник ставит, и деньги уходят из его кошелька сразу.
///
/// Это и есть ответ на «поставлю миллиард, а платить не буду»: ставка не
/// принимается, если перевод не прошёл. Обеспечена всегда ровно одна ставка -
/// текущая высшая, - поэтому хранилище на лот одно.
///
/// Той же транзакцией прежнему лидеру возвращается его сумма. Не «придёт и
/// заберёт», а прямо сейчас: схема «забери потом» оставляет забытые деньги
/// навсегда и заставляет проигравшего возвращаться.
#[derive(Accounts)]
pub struct BidderPlacesBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"lot", lot.auction.as_ref()],
        bump = lot.bump,
        has_one = mint,
    )]
    pub lot: Account<'info, Lot>,

    #[account(
        mut,
        seeds = [b"lot_vault", lot.key().as_ref()],
        bump = lot.vault_bump,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bidder,
        associated_token::token_program = token_program,
    )]
    pub bidder_tokens: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: прежний лидер торга. Сверяется в обработчике с `lot.top_bidder`.
    /// Когда ставок ещё не было, сюда передаётся сам участник - возврата не
    /// будет, и счёт остаётся нетронутым.
    pub previous_bidder: UncheckedAccount<'info>,

    /// Счёт, на который вернётся прежняя ставка.
    ///
    /// `init_if_needed` здесь не для удобства, а против атаки: прежний лидер
    /// может закрыть свой токен-счёт, и тогда возврат провалится, а вместе с
    /// ним и любая новая ставка - торг замёрз бы на его сумме навсегда. Счёт
    /// заводится заново за счёт того, кто ставит: атакующий теряет свою аренду,
    /// новый участник - доли цента, торг идёт дальше.
    #[account(
        init_if_needed,
        payer = bidder,
        associated_token::mint = mint,
        associated_token::authority = previous_bidder,
        associated_token::token_program = token_program,
    )]
    pub previous_bidder_tokens: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn place_bid(ctx: Context<BidderPlacesBid>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lot = &ctx.accounts.lot;

    require!(lot.is_open(now), EscrowError::LotClosed);
    require!(amount >= lot.min_next_bid()?, EscrowError::BidTooLow);

    // Сначала забираем новую ставку, потом возвращаем прежнюю. Порядок важен:
    // в обратном хранилище на миг оказалось бы пустым, и неудача второго
    // перевода оставила бы лот без обеспечения.
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.bidder_tokens.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.bidder.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    if let Some(previous) = lot.top_bidder {
        require_keys_eq!(
            previous,
            ctx.accounts.previous_bidder.key(),
            EscrowError::WrongPreviousBidder
        );

        let auction = lot.auction;
        let bump = [lot.bump];
        let seeds: &[&[u8]] = &[b"lot", auction.as_ref(), &bump];

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.previous_bidder_tokens.to_account_info(),
                    authority: ctx.accounts.lot.to_account_info(),
                },
                &[seeds],
            ),
            lot.top_bid,
            ctx.accounts.mint.decimals,
        )?;
    }

    let lot = &mut ctx.accounts.lot;
    lot.closes_at = lot.extended(now);
    lot.top_bidder = Some(ctx.accounts.bidder.key());
    lot.top_bid = amount;

    Ok(())
}
