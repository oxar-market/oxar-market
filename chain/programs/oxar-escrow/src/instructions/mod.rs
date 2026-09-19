pub mod bidder_places_bid;
pub mod buyer_opens_deal;
pub mod lot_becomes_deal;
pub mod party_closes_deal;
pub mod payout;
pub mod seller_closes_lot;
pub mod seller_opens_lot;
pub mod seller_takes_earned;

// Glob обязателен: `#[derive(Accounts)]` кладёт рядом со структурой служебные
// модули, которые Anchor ищет в корне крейта. Поэтому у обработчиков разные
// имена, а не общий `handler` - иначе glob делает имя неоднозначным.
pub use bidder_places_bid::*;
pub use buyer_opens_deal::*;
pub use lot_becomes_deal::*;
pub use party_closes_deal::*;
pub use seller_closes_lot::*;
pub use seller_opens_lot::*;
pub use seller_takes_earned::*;
