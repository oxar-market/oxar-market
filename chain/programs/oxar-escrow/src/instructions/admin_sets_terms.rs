use anchor_lang::prelude::*;

use crate::{error::EscrowError, state::Config};

/// Завести настройки площадки или поменять их.
///
/// Одна инструкция на оба случая, а не две почти одинаковых: `init_if_needed`
/// заводит аккаунт при первом вызове и открывает уже заведённый при следующих.
/// Разница между «первый раз» и «поменяли» здесь только в том, был ли админ
/// раньше, и её достаточно проверить одной строкой.
///
/// Первый вызов делается один раз после выката программы и назначает админом
/// того, кто подписал. Все следующие требуют подписи именно его: чужая
/// транзакция сюда не проходит, и комиссию себе никто не перепишет.
///
/// **Первый вызов надо послать сразу за выкатом.** Адрес программы известен
/// заранее - он вшит в неё, - поэтому между выкатом и первым вызовом есть щель:
/// успевший позвать первым станет админом. Щель узкая и не смертельная (права
/// на обновление у нас, и новый код перепишет настройки), но чинить это потом
/// дороже, чем не открывать вовсе.
#[derive(Accounts)]
pub struct AdminSetsTerms<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Настройки площадки. Сиды постоянные, поэтому адрес единственный: чужой
    /// счёт на это место не встанет.
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: владелец счёта, на который пойдёт комиссия. Подписи от него не
    /// требуется - это адрес получателя, а не сторона сделки.
    pub platform: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn set_terms(ctx: Context<AdminSetsTerms>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= 10_000, EscrowError::FeeTooHigh);

    let config = &mut ctx.accounts.config;

    // Пустой админ бывает ровно в одном случае: аккаунт только что заведён
    // этим же вызовом. Тогда админом становится подписавший. Во всех
    // остальных случаях подписать обязан тот, кто уже записан.
    if config.admin == Pubkey::default() {
        config.admin = ctx.accounts.admin.key();
        config.bump = ctx.bumps.config;
        config.reserved = [0u8; 32];
    } else {
        require_keys_eq!(
            config.admin,
            ctx.accounts.admin.key(),
            EscrowError::NotTheAdmin
        );
    }

    config.platform = ctx.accounts.platform.key();
    config.fee_bps = fee_bps;

    Ok(())
}
