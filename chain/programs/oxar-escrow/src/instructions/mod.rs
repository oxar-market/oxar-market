pub mod bidder_places_bid;
pub mod lot_pays_seller;
pub mod seller_closes_lot;
pub mod seller_opens_lot;
pub mod seller_opens_sale;

// Glob обязателен: `#[derive(Accounts)]` кладёт рядом со структурой служебные
// модули, которые Anchor ищет в корне крейта. Поэтому у обработчиков разные
// имена, а не общий `handler` - иначе glob делает имя неоднозначным.
pub use bidder_places_bid::*;
pub use lot_pays_seller::*;
pub use seller_closes_lot::*;
pub use seller_opens_lot::*;
pub use seller_opens_sale::*;
