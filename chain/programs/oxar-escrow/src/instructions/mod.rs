pub mod buyer_opens_deal;
pub mod party_closes_deal;
pub mod payout;
pub mod seller_takes_earned;

// Glob обязателен: `#[derive(Accounts)]` кладёт рядом со структурой служебные
// модули, которые Anchor ищет в корне крейта. Поэтому у обработчиков разные
// имена, а не общий `handler` - иначе glob делает имя неоднозначным.
pub use buyer_opens_deal::*;
pub use party_closes_deal::*;
pub use seller_takes_earned::*;
