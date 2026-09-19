use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};

use crate::state::Deal;

/// Отдать накопившееся: продавцу его часть, площадке комиссию.
///
/// Живёт отдельной функцией, а не двумя копиями внутри инструкций. Расчёт
/// комиссии и перевод из хранилища - ровно то место, где копипаста однажды
/// разойдётся на цент, и разойдётся молча.
///
/// Подписывает сама сделка: хранилищем владеет PDA, и ключа от него нет ни у
/// одной из сторон.
pub fn release<'info>(
    deal: &Account<'info, Deal>,
    vault: &AccountInfo<'info>,
    seller_tokens: &AccountInfo<'info>,
    platform_tokens: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    decimals: u8,
    payout: u64,
) -> Result<()> {
    if payout == 0 {
        return Ok(());
    }

    let (fee, to_seller) = deal.split(payout)?;

    let booking = deal.booking;
    let bump = [deal.bump];
    let seeds: &[&[u8]] = &[b"deal", booking.as_ref(), &bump];
    let signer: &[&[&[u8]]] = &[seeds];

    if to_seller > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                token_program.clone(),
                TransferChecked {
                    from: vault.clone(),
                    mint: mint.clone(),
                    to: seller_tokens.clone(),
                    authority: deal.to_account_info(),
                },
                signer,
            ),
            to_seller,
            decimals,
        )?;
    }

    if fee > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                token_program.clone(),
                TransferChecked {
                    from: vault.clone(),
                    mint: mint.clone(),
                    to: platform_tokens.clone(),
                    authority: deal.to_account_info(),
                },
                signer,
            ),
            fee,
            decimals,
        )?;
    }

    Ok(())
}
