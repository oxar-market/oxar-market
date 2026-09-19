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

    #[msg("The refund window has closed and the deal has not ended")]
    NotRefundable,

    #[msg("The refund window cannot outlast the deal")]
    RefundWindowTooLong,

    #[msg("This lot is not taking bids")]
    LotClosed,

    #[msg("The bid is below the minimum for this lot")]
    BidTooLow,

    #[msg("The lot is still taking bids")]
    LotStillOpen,

    #[msg("This is not the bidder who is currently leading")]
    WrongPreviousBidder,

    #[msg("Nobody met the reserve on this lot")]
    NoWinner,

    #[msg("A lot with a winner cannot simply be closed")]
    LotHasWinner,

    #[msg("A lot cannot close in the past")]
    ClosesInThePast,

    #[msg("The extension window is too long")]
    ExtensionTooLong,
}
