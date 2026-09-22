use anchor_lang::prelude::*;
use anchor_spl::token::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, Token,
    TransferChecked,
};

use crate::{
    error::EscrowError,
    state::{Lot, Sale},
};

/// Место ушло с торгов с победителем: деньги выходят из хранилища.
///
/// Победителю платить нечего - он заплатил, когда поставил, и его сумма всё это
/// время лежала в хранилище. Здесь она только делится: комиссия площадке,
/// остальное продавцу. Хранилище закрывается пустым, аренда за оба аккаунта
/// возвращается продавцу.
///
/// Зовёт кто угодно, и подписи ни от кого не требуется. Это не щедрость, а
/// единственный способ не поставить выплату в зависимость от того, откроет ли
/// победитель вкладку. Безопасно это ровно потому, что адреса получателей и
/// размер комиссии взяты из торга: тот, кто зовёт, не может увести деньги ни
/// себе, ни кому-то третьему, а вызвать дважды нельзя - лот закрывается в этой
/// же транзакции.
#[derive(Accounts)]
pub struct LotPaysSeller<'info> {
    /// Кто двигает торг дальше. Платит только за транзакцию.
    pub crank: Signer<'info>,

    /// Торг вещи: из него срок, комиссия, продавец и получатель комиссии.
    // Связь с местом даёт `has_one = sale` у лота: адрес торга обязан совпасть
    // с записанным в лоте при открытии. Сиды тут не нужны - они проверяли бы
    // то же самое второй раз, а вывести их из самого себя Anchor не может.
    #[account(
        has_one = seller,
        has_one = platform,
    )]
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

    /// CHECK: получает выручку и аренду за аккаунты торга. Сверяется с
    /// `sale.seller` через `has_one`.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_tokens: Account<'info, TokenAccount>,

    /// CHECK: получатель комиссии. Сверяется с `sale.platform` через `has_one`,
    /// а тот записан при открытии торга и с тех пор не менялся.
    pub platform: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = platform,
        associated_token::token_program = token_program,
    )]
    pub platform_tokens: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn pay_seller(ctx: Context<LotPaysSeller>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lot = &ctx.accounts.lot;

    // Пока принимают ставки, в хранилище лежит чужое: текущий лидер может быть
    // перебит, и его деньги должны вернуться ему, а не уйти продавцу. Срок
    // общий на вещь - значит и это правило одно на все её места.
    require!(!ctx.accounts.sale.is_open(now), EscrowError::LotStillOpen);
    require!(lot.has_winner(), EscrowError::NoWinner);

    // Делим ровно высшую ставку, а не то, что лежит в хранилище. Числа обязаны
    // совпадать, но истина здесь - запись торга: лишнее, если его кто-то
    // прислал на счёт хранилища подарком, не должно менять расчёт.
    let (fee, to_seller) = lot.split(lot.top_bid, ctx.accounts.sale.fee_bps)?;

    // Расчёт лишнее не меняет, а вот выгрести его обязано. Адрес хранилища
    // выводится из адреса лота и виден всем, прислать туда монеты может кто
    // угодно, а закрыть токен-счёт с ненулевым остатком SPL не даёт. Без этого
    // одной базовой единицы от постороннего хватило бы, чтобы выплата перестала
    // проходить, а ставка победителя осталась в хранилище навсегда. Лишнее
    // отдаём продавцу: комиссия считается со ставки, и доля площадки от подарка
    // не растёт.
    let extra = ctx.accounts.vault.amount.saturating_sub(lot.top_bid);
    let to_seller = to_seller
        .checked_add(extra)
        .ok_or(EscrowError::MathOverflow)?;

    let auction = lot.auction;
    let bump = [lot.bump];
    let seeds: &[&[u8]] = &[b"lot", auction.as_ref(), &bump];

    // Сначала продавцу, потом комиссия. Порядок ничего не решает - обе выплаты
    // в одной транзакции, и провал любой откатывает всё.
    if to_seller > 0 {
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
            to_seller,
            ctx.accounts.mint.decimals,
        )?;
    }

    if fee > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.platform_tokens.to_account_info(),
                    authority: ctx.accounts.lot.to_account_info(),
                },
                &[seeds],
            ),
            fee,
            ctx.accounts.mint.decimals,
        )?;
    }

    // Закрытие хранилища требует нулевого остатка, и это последняя проверка
    // расчёта: разойдись `split` с тем, что лежит внутри хоть на единицу,
    // транзакция не пройдёт целиком.
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
