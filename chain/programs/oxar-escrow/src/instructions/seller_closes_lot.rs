use anchor_lang::prelude::*;
use anchor_spl::token::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, Token,
    TransferChecked,
};

use crate::{
    error::EscrowError,
    state::{Lot, Sale},
};

/// Место кончилось ничем: ставок не было или все они ниже резерва.
///
/// Единственная ставка ниже резерва всё равно обеспечена и лежит в хранилище,
/// поэтому её надо вернуть, а не просто закрыть аккаунты. Иначе деньги
/// участника остались бы запертыми навсегда.
///
/// Зовёт кто угодно: продавцу в любом случае возвращается аренда, участнику -
/// его ставка, и ждать чьей-то доброй воли тут нечего.
///
/// До срока место снять тоже можно, но только пустое и только рукой продавца.
/// Это единственная кнопка «стоп» во всей программе: ошибся сроком, передумал
/// продавать спину - снял, пока никто не поставил. Как только ставка сделана,
/// кнопка пропадает: снимать место из-под участника нельзя, даже если его
/// ставка ниже резерва, - он держит её до конца и вправе рассчитывать, что
/// торг дойдёт до конца. Посторонний не снимет и пустое: иначе любой прохожий
/// раздевал бы витрину.
#[derive(Accounts)]
pub struct SellerClosesLot<'info> {
    pub crank: Signer<'info>,

    /// Торг вещи: из него срок и продавец.
    #[account(has_one = seller)]
    pub sale: Account<'info, Sale>,

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
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: получает обратно аренду за аккаунты торга. Сверяется с
    /// `sale.seller` через `has_one`.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    /// Счёт продавца: на него уходит лишнее из хранилища, если оно там есть.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_tokens: Account<'info, TokenAccount>,

    /// CHECK: последний участник, если он был. Сверяется с `lot.top_bidder`.
    pub last_bidder: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = last_bidder,
        associated_token::token_program = token_program,
    )]
    pub last_bidder_tokens: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn close_lot(ctx: Context<SellerClosesLot>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lot = &ctx.accounts.lot;

    // Пока торг идёт, место снимает только продавец и только пустое.
    if ctx.accounts.sale.is_open(now) {
        require!(lot.top_bidder.is_none(), EscrowError::LotStillOpen);
        require_keys_eq!(
            ctx.accounts.crank.key(),
            ctx.accounts.sale.seller,
            EscrowError::NotTheSeller
        );
    }
    // Состоявшееся место закрывается только выплатой. Иначе этой инструкцией
    // можно было бы отобрать у победителя уже выигранное место.
    require!(!lot.has_winner(), EscrowError::LotHasWinner);

    let auction = lot.auction;
    let bump = [lot.bump];
    let seeds: &[&[u8]] = &[b"lot", auction.as_ref(), &bump];

    if let Some(last) = lot.top_bidder {
        require_keys_eq!(
            last,
            ctx.accounts.last_bidder.key(),
            EscrowError::WrongPreviousBidder
        );

        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.last_bidder_tokens.to_account_info(),
                    authority: ctx.accounts.lot.to_account_info(),
                },
                &[seeds],
            ),
            lot.top_bid,
            ctx.accounts.mint.decimals,
        )?;
    }

    // Сверх ставки в хранилище может лежать чужой подарок: адрес выводится из
    // адреса лота и виден всем, а закрыть токен-счёт с ненулевым остатком SPL
    // не даёт. Не выгреби мы это - одной базовой единицы от постороннего
    // хватило бы, чтобы место не закрылось никогда, а ставка участника осталась
    // запертой. Лишнее идёт продавцу, как и в выплате.
    let refunded = if lot.top_bidder.is_some() { lot.top_bid } else { 0 };
    let extra = ctx.accounts.vault.amount.saturating_sub(refunded);
    if extra > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.seller_tokens.to_account_info(),
                    authority: ctx.accounts.lot.to_account_info(),
                },
                &[seeds],
            ),
            extra,
            ctx.accounts.mint.decimals,
        )?;
    }

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
