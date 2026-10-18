use trident_fuzz::fuzzing::*;

/// Storage for all account addresses used in fuzz testing.
///
/// This struct serves as a centralized repository for account addresses,
/// enabling their reuse across different instruction flows and test scenarios.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct AccountAddresses {
    pub admin: AddressStorage,

    pub config: AddressStorage,

    pub platform: AddressStorage,

    pub mint: AddressStorage,

    pub program_data: AddressStorage,

    pub system_program: AddressStorage,

    pub arbiter: AddressStorage,

    pub sale: AddressStorage,

    pub lot: AddressStorage,

    pub vault: AddressStorage,

    pub seller: AddressStorage,

    pub seller_tokens: AddressStorage,

    pub platform_tokens: AddressStorage,

    pub winner: AddressStorage,

    pub winner_tokens: AddressStorage,

    pub token_program: AddressStorage,

    pub bidder: AddressStorage,

    pub bidder_tokens: AddressStorage,

    pub previous_bidder: AddressStorage,

    pub previous_bidder_tokens: AddressStorage,

    pub associated_token_program: AddressStorage,

    pub crank: AddressStorage,

    pub last_bidder: AddressStorage,

    pub last_bidder_tokens: AddressStorage,
}
