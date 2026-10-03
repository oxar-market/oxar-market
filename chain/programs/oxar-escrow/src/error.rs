use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Arithmetic overflowed")]
    MathOverflow,

    #[msg("A lot must ask for a positive amount")]
    AmountIsZero,

    #[msg("The fee cannot be more than the whole lot")]
    FeeTooHigh,

    #[msg("Only the admin can change the terms")]
    NotTheAdmin,

    #[msg("Lots are only opened in the coin the platform accepts")]
    WrongMint,

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

    #[msg("A sale cannot run longer than a month")]
    SaleTooLong,

    #[msg("Only the seller can pull a lot before the sale ends")]
    NotTheSeller,

    #[msg("The share cannot be more than the whole bid")]
    ShareTooHigh,

    #[msg("The proof deadline must come after the latest possible close of the sale")]
    ProofBeforeClose,

    #[msg("This sale does not take a proof now")]
    ProofNotTaken,

    #[msg("No proof yet, or the appeal window is still open")]
    NotPayableYet,

    #[msg("The proof can no longer be disputed")]
    AppealClosed,

    #[msg("Only the winner of this spot can do this")]
    NotTheWinner,

    #[msg("This spot is disputed and waits for the arbiter")]
    LotDisputed,

    #[msg("This spot is not disputed")]
    LotNotDisputed,

    #[msg("The proof deadline can only move later, before it passes and before the proof")]
    ProofDeadlineFixed,
}
