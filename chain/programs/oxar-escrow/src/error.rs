use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Arithmetic overflowed")]
    MathOverflow,

    #[msg("A deal must move a positive amount")]
    AmountIsZero,

    #[msg("A deal cannot end before it starts")]
    EndsBeforeStart,

    #[msg("A deal cannot start in the past")]
    StartsInThePast,

    #[msg("The fee cannot be more than the whole deal")]
    FeeTooHigh,

    #[msg("Only the buyer or the seller can close this deal")]
    NotAParty,

    #[msg("Nothing has accrued yet")]
    NothingToWithdraw,
}
