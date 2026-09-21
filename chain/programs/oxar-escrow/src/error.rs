use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Arithmetic overflowed")]
    MathOverflow,

    #[msg("A lot must ask for a positive amount")]
    AmountIsZero,

    #[msg("The fee cannot be more than the whole lot")]
    FeeTooHigh,

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
