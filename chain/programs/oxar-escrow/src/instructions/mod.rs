pub mod admin_sets_terms;
pub mod arbiter_decides;
pub mod arbiter_moves_proof;
pub mod bidder_places_bid;
pub mod lot_pays_seller;
pub mod seller_closes_lot;
pub mod seller_opens_lot;
pub mod seller_opens_sale;
pub mod seller_submits_proof;
pub mod winner_disputes;

// Glob обязателен: `#[derive(Accounts)]` кладёт рядом со структурой служебные
// модули, которые Anchor ищет в корне крейта. Поэтому у обработчиков разные
// имена, а не общий `handler` - иначе glob делает имя неоднозначным.
pub use admin_sets_terms::*;
pub use arbiter_decides::*;
pub use arbiter_moves_proof::*;
pub use bidder_places_bid::*;
pub use lot_pays_seller::*;
pub use seller_closes_lot::*;
pub use seller_opens_lot::*;
pub use seller_opens_sale::*;
pub use seller_submits_proof::*;
pub use winner_disputes::*;
