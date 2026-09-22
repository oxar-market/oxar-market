use anchor_lang::prelude::*;

use crate::error::EscrowError;

/// Одно место на вещи: деньги участников лежат здесь, а не на честном слове.
///
/// Ставка обеспечена всегда. Пока ставка высшая, её сумма заперта в хранилище
/// лота; как только её перебили, деньги той же транзакцией возвращаются
/// прежнему участнику. Поэтому хранилище на лот одно, а не по одному на
/// каждого: в нём в любой момент лежит ровно текущая высшая ставка.
///
/// Срока у места нет намеренно. Торг идёт за вещь целиком, и закрываются все
/// места разом - время живёт в `Sale`, общее на всю футболку. Здесь только то,
/// что у каждого места своё: цена, лидер и его деньги.
#[account]
#[derive(InitSpace)]
pub struct Lot {
    /// Торг, которому принадлежит место. По нему берутся срок, комиссия,
    /// продавец и получатель комиссии - всё, что общее у вещи.
    pub sale: Pubkey,

    /// Монета торга. В хранилище может лежать только она.
    pub mint: Pubkey,

    /// Кто сейчас ведёт. Пусто, пока ставок нет.
    pub top_bidder: Option<Pubkey>,
    /// Сколько стоит высшая ставка. Ровно столько лежит в хранилище.
    pub top_bid: u64,

    /// Ниже этого ставки не принимаются вовсе.
    pub reserve: u64,
    /// Наименьшая прибавка к высшей ставке.
    ///
    /// Приходит снаружи, а не считается здесь, потому что «не меньше доллара»
    /// зависит от числа знаков у монеты, а программе про монеты знать нечего.
    pub min_step: u64,

    /// Идентификатор лота из нашей базы, шестнадцать байт uuid. Он же входит в
    /// сиды PDA, поэтому хранить его обязательно: без него лот не может
    /// подписать возврат из собственного хранилища.
    pub auction: [u8; 16],

    pub bump: u8,
    pub vault_bump: u8,

    /// Запас под поля, которых ещё нет. Без него добавить поле означает сломать
    /// чтение уже открытых лотов.
    pub reserved: [u8; 32],
}

impl Lot {
    /// Наименьшая сумма, с которой примут следующую ставку.
    ///
    /// Первая равна резерву. Дальше шаг: пять процентов от текущей высшей, но
    /// не мельче `min_step`. Те же числа лежат в `packages/core` для интерфейса,
    /// и разойтись они не должны: иначе человек увидит один минимум, а контракт
    /// отвергнет ставку по другому.
    pub fn min_next_bid(&self) -> Result<u64> {
        if self.top_bidder.is_none() {
            return Ok(self.reserve);
        }

        let five_percent = self
            .top_bid
            .checked_mul(5)
            .ok_or(EscrowError::MathOverflow)?
            / 100;
        let step = five_percent.max(self.min_step);

        self.top_bid
            .checked_add(step)
            .ok_or(EscrowError::MathOverflow.into())
    }

    /// Состоялся ли торг за это место: есть ставка, и она не ниже резерва.
    ///
    /// Резерв проверяется и здесь, хотя ставку ниже него не принимают на входе.
    /// Это не лишняя проверка, а страховка на случай, если правило приёма
    /// когда-нибудь изменят: победитель ниже резерва не должен появиться ни при
    /// каких правках.
    pub fn has_winner(&self) -> bool {
        self.top_bidder.is_some() && self.top_bid >= self.reserve
    }

    /// Как делится выигравшая ставка: комиссия площадке, остальное продавцу.
    ///
    /// Комиссия приходит из торга, а не из лота: она общая на всю вещь.
    /// Считается вниз, остаток от деления достаётся продавцу. Сумма двух частей
    /// равна исходной всегда - в хранилище не должно оставаться ни одной
    /// базовой единицы, иначе его не закрыть.
    pub fn split(&self, payout: u64, fee_bps: u16) -> Result<(u64, u64)> {
        let fee = (payout as u128)
            .checked_mul(fee_bps as u128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(EscrowError::MathOverflow)? as u64;

        let to_seller = payout.checked_sub(fee).ok_or(EscrowError::MathOverflow)?;

        Ok((fee, to_seller))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Место с высшей ставкой, которую и делим.
    fn lot(top_bid: u64) -> Lot {
        Lot {
            sale: Pubkey::default(),
            mint: Pubkey::default(),
            top_bidder: Some(Pubkey::default()),
            top_bid,
            reserve: 50,
            min_step: 1,
            auction: [0u8; 16],
            bump: 0,
            vault_bump: 0,
            reserved: [0u8; 32],
        }
    }

    #[test]
    fn комиссия_десять_процентов_и_ничего_не_теряется() {
        let one = lot(1_000);
        let (fee, to_seller) = one.split(1_000, 1000).unwrap();
        assert_eq!(fee, 100);
        assert_eq!(to_seller, 900);
        assert_eq!(fee + to_seller, 1_000, "в хранилище не должно остаться ни единицы");
    }

    #[test]
    fn остаток_от_деления_достаётся_продавцу_а_не_виснет() {
        let one = lot(999);
        // 999 * 10% = 99.9, комиссия считается вниз.
        let (fee, to_seller) = one.split(999, 1000).unwrap();
        assert_eq!(fee, 99);
        assert_eq!(to_seller, 900);
        assert_eq!(fee + to_seller, 999);
    }

    #[test]
    fn нулевая_комиссия_отдаёт_всё_продавцу() {
        let one = lot(1_000);
        let (fee, to_seller) = one.split(1_000, 0).unwrap();
        assert_eq!(fee, 0);
        assert_eq!(to_seller, 1_000);
    }

    #[test]
    fn комиссия_во_все_сто_процентов_не_уводит_продавца_в_минус() {
        let one = lot(1_000);
        let (fee, to_seller) = one.split(1_000, 10_000).unwrap();
        assert_eq!(fee, 1_000);
        assert_eq!(to_seller, 0);
    }

    #[test]
    fn большая_ставка_не_переполняет_счёт() {
        let one = lot(u64::MAX);
        let (fee, to_seller) = one.split(u64::MAX, 1000).unwrap();
        assert_eq!(fee + to_seller, u64::MAX, "ни единицы мимо");
    }

    #[test]
    fn торг_состоялся_только_если_ставка_не_ниже_резерва() {
        let mut one = lot(49);
        assert!(!one.has_winner(), "ставка ниже резерва - место не продано");

        one.top_bid = 50;
        assert!(one.has_winner(), "ровно резерв уже победа");

        one.top_bidder = None;
        assert!(!one.has_winner(), "без ставок победителя нет");
    }

    #[test]
    fn первая_ставка_равна_резерву_а_дальше_идёт_шагом() {
        let mut one = lot(0);
        one.top_bidder = None;
        assert_eq!(one.min_next_bid().unwrap(), 50, "первая ставка - резерв");

        one.top_bidder = Some(Pubkey::default());
        one.top_bid = 100;
        // 5% от 100 это 5, и это больше min_step.
        assert_eq!(one.min_next_bid().unwrap(), 105, "шаг - пять процентов");

        one.top_bid = 10;
        one.min_step = 3;
        // 5% от 10 это 0 после деления целых, поэтому берётся min_step.
        assert_eq!(one.min_next_bid().unwrap(), 13, "на мелких суммах шаг держит min_step");
    }
}
