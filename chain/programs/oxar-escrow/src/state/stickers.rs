use anchor_lang::prelude::*;

use crate::error::EscrowError;

/// Лист стикеров: сколько их всего, почём и кому деньги.
///
/// Стикер - не торг: цена одна, перебить нельзя, и деньги уходят продавцу той
/// же транзакцией, что и покупка. Хранилища нет. Лимит держит программа, а не
/// наша база: пятьдесят первый не купить, сколько бы запросов ни прислали.
///
/// Заводит лист админ, а условия площадки - комиссию, её получателя и монету -
/// лист берёт из настроек при открытии и дальше не меняет, как и торг.
#[account]
#[derive(InitSpace)]
pub struct StickerSheet {
    /// Идентификатор листа - шестнадцать байт uuid; из него адрес.
    pub id: [u8; 16],
    /// Кому идёт цена стикера за вычетом комиссии.
    pub seller: Pubkey,
    /// Кому идёт комиссия.
    pub platform: Pubkey,
    pub mint: Pubkey,
    /// Цена одного стикера в базовых единицах монеты.
    pub price: u64,
    pub fee_bps: u16,
    /// Сколько стикеров всего и сколько уже продано.
    pub cap: u16,
    pub sold: u16,
    pub bump: u8,
}

impl StickerSheet {
    /// Сколько стоят `count` стикеров и как это делится: (комиссия, продавцу).
    /// Комиссия считается вниз, остаток - продавцу; в сумме ровно цена.
    pub fn split(&self, count: u16) -> Result<(u64, u64)> {
        let total = self
            .price
            .checked_mul(count as u64)
            .ok_or(EscrowError::MathOverflow)?;
        let fee = (total as u128)
            .checked_mul(self.fee_bps as u128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(EscrowError::MathOverflow)? as u64;
        Ok((fee, total - fee))
    }

    /// Хватит ли листа на `count` стикеров.
    pub fn fits(&self, count: u16) -> bool {
        count > 0 && (self.sold as u32) + (count as u32) <= self.cap as u32
    }
}

/// Покупка: кто купил и какие номера. Адрес - из листа и первого номера,
/// поэтому две покупки одних номеров невозможны.
///
/// `tag` - id строки в нашей базе, где лежат логотип, название и размер. По
/// нему витрина находит, что печатать: строка без покупки с её тегом в цепочке
/// не показывается.
#[account]
#[derive(InitSpace)]
pub struct StickerOrder {
    pub sheet: Pubkey,
    pub buyer: Pubkey,
    pub first: u16,
    pub count: u16,
    pub tag: [u8; 16],
    pub bump: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sheet(sold: u16) -> StickerSheet {
        StickerSheet {
            id: [0; 16],
            seller: Pubkey::default(),
            platform: Pubkey::default(),
            mint: Pubkey::default(),
            price: 100_000_000,
            fee_bps: 1_000,
            cap: 50,
            sold,
            bump: 0,
        }
    }

    #[test]
    fn сто_долларов_делятся_девяносто_и_десять() {
        assert_eq!(sheet(0).split(1).unwrap(), (10_000_000, 90_000_000));
        assert_eq!(sheet(0).split(3).unwrap(), (30_000_000, 270_000_000));
    }

    #[test]
    fn лист_не_продаёт_больше_лимита_и_ноль() {
        assert!(sheet(0).fits(50));
        assert!(!sheet(0).fits(51));
        assert!(sheet(49).fits(1));
        assert!(!sheet(49).fits(2));
        assert!(!sheet(50).fits(1));
        assert!(!sheet(0).fits(0));
    }
}
