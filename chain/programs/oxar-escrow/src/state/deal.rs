use anchor_lang::prelude::*;

/// Одна сделка: покупатель отдал деньги, продавец получает их за время, которое
/// размещение реально простояло.
///
/// Здесь нет ни аукциона, ни типа места, ни способа оплаты - и это осознанно.
/// Аукцион решает, кто покупатель и почём; к моменту, когда появляются деньги,
/// он уже кончился, и блокчейну про него знать нечего. Разовый платёж - это та
/// же сделка с нулевым сроком: `ends_at == starts_at`, и вся сумма доступна
/// продавцу сразу. Поток - та же сделка со сроком. Одна структура на три
/// случая вместо трёх похожих, которые разъедутся.
#[account]
#[derive(InitSpace)]
pub struct Deal {
    /// Кто заплатил. Только он и продавец могут закрыть сделку досрочно.
    pub buyer: Pubkey,
    /// Кому идут деньги за отстоявшее время.
    pub seller: Pubkey,
    /// Владелец счёта, на который уходит комиссия площадки.
    pub platform: Pubkey,
    /// Монета сделки. В хранилище может лежать только она.
    pub mint: Pubkey,

    /// Вся сумма сделки в базовых единицах монеты.
    pub amount: u64,
    /// Сколько уже ушло из хранилища: продавцу плюс комиссия.
    pub released: u64,

    /// Секунда, с которой начинает капать.
    pub starts_at: i64,
    /// Секунда, на которой сумма дотекает целиком. Равна началу у разового
    /// платежа.
    pub ends_at: i64,

    /// Идентификатор брони из нашей базы, шестнадцать байт uuid. Он же входит в
    /// сиды PDA, поэтому хранить его обязательно: без него сделка не может
    /// подписать выплату из собственного хранилища.
    pub booking: [u8; 16],

    /// Комиссия площадки в сотых долях процента. 1000 - это 10%.
    pub fee_bps: u16,

    pub bump: u8,
    pub vault_bump: u8,

    /// Запас под поля, которых ещё нет. Без него добавить поле означает сломать
    /// раскладку уже существующих сделок.
    pub reserved: [u8; 64],
}

impl Deal {
    /// Сколько всего причитается продавцу и площадке к этой секунде.
    ///
    /// Линейно от начала к концу, целочисленно вниз. Остаток от деления
    /// остаётся в хранилище и доходит на последней секунде: в конце срока
    /// формула даёт ровно `amount`, без всякого остатка.
    ///
    /// Разовый платёж (`ends_at == starts_at`) - это не особый случай в
    /// вычислении, а его край: с началом срока доступна вся сумма.
    pub fn earned_at(&self, now: i64) -> Result<u64> {
        if now < self.starts_at {
            return Ok(0);
        }
        if now >= self.ends_at {
            return Ok(self.amount);
        }

        // Сюда попадаем только когда ends_at > starts_at, значит знаменатель
        // положительный, а числитель меньше него.
        let elapsed = now.saturating_sub(self.starts_at) as u128;
        let term = self.ends_at.saturating_sub(self.starts_at) as u128;

        let earned = (self.amount as u128)
            .checked_mul(elapsed)
            .and_then(|v| v.checked_div(term))
            .ok_or(crate::error::EscrowError::MathOverflow)?;

        Ok(earned as u64)
    }

    /// Как делится выплата: сколько площадке, сколько продавцу.
    ///
    /// Комиссия берётся только с заработанного. Платить нам за сделку, которую
    /// сорвали на середине, продавец не должен.
    pub fn split(&self, payout: u64) -> Result<(u64, u64)> {
        let fee = (payout as u128)
            .checked_mul(self.fee_bps as u128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(crate::error::EscrowError::MathOverflow)? as u64;

        let to_seller = payout
            .checked_sub(fee)
            .ok_or(crate::error::EscrowError::MathOverflow)?;

        Ok((fee, to_seller))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Сделка на сто единиц с часовым сроком и комиссией в 10%.
    fn deal(starts_at: i64, ends_at: i64, amount: u64) -> Deal {
        Deal {
            buyer: Pubkey::default(),
            seller: Pubkey::default(),
            platform: Pubkey::default(),
            mint: Pubkey::default(),
            amount,
            released: 0,
            starts_at,
            ends_at,
            booking: [0u8; 16],
            fee_bps: 1_000,
            bump: 255,
            vault_bump: 255,
            reserved: [0u8; 64],
        }
    }

    #[test]
    fn до_начала_не_натекает_ничего() {
        let d = deal(1_000, 4_600, 100);
        assert_eq!(d.earned_at(0).unwrap(), 0);
        assert_eq!(d.earned_at(999).unwrap(), 0);
    }

    #[test]
    fn в_момент_старта_ноль_а_не_весь_срок() {
        let d = deal(1_000, 4_600, 100);
        assert_eq!(d.earned_at(1_000).unwrap(), 0);
    }

    #[test]
    fn на_середине_срока_половина() {
        let d = deal(1_000, 4_600, 100);
        assert_eq!(d.earned_at(2_800).unwrap(), 50);
    }

    #[test]
    fn в_конце_срока_вся_сумма_без_остатка() {
        // Сумма не делится на срок нацело: 100 на 3600 секунд. Если бы остаток
        // терялся, здесь было бы меньше ста.
        let d = deal(1_000, 4_600, 100);
        assert_eq!(d.earned_at(4_600).unwrap(), 100);
    }

    #[test]
    fn после_конца_больше_суммы_не_бывает() {
        let d = deal(1_000, 4_600, 100);
        assert_eq!(d.earned_at(999_999).unwrap(), 100);
    }

    #[test]
    fn разовый_платёж_это_нулевой_срок() {
        let d = deal(1_000, 1_000, 100);
        assert_eq!(d.earned_at(999).unwrap(), 0);
        assert_eq!(d.earned_at(1_000).unwrap(), 100);
        assert_eq!(d.earned_at(1_001).unwrap(), 100);
    }

    #[test]
    fn начисление_не_убывает_со_временем() {
        let d = deal(1_000, 4_600, 15_000_000);
        let mut previous = 0;
        for t in (900..5_000).step_by(7) {
            let now = d.earned_at(t).unwrap();
            assert!(now >= previous, "начисление убыло на секунде {t}");
            assert!(now <= d.amount, "начислено больше сделки на секунде {t}");
            previous = now;
        }
    }

    #[test]
    fn комиссия_десять_процентов_и_ничего_не_теряется() {
        let d = deal(0, 100, 1_000);
        for payout in [0u64, 1, 7, 99, 333, 1_000, 999_999] {
            let (fee, to_seller) = d.split(payout).unwrap();
            assert_eq!(fee + to_seller, payout, "сумма разошлась на {payout}");
            assert_eq!(fee, payout / 10);
        }
    }

    #[test]
    fn нулевая_комиссия_отдаёт_всё_продавцу() {
        let mut d = deal(0, 100, 1_000);
        d.fee_bps = 0;
        let (fee, to_seller) = d.split(500).unwrap();
        assert_eq!(fee, 0);
        assert_eq!(to_seller, 500);
    }

    #[test]
    fn большая_сумма_не_переполняет_расчёт() {
        // Вся сумма сделки в u64 и почти весь срок: произведение не влезает в
        // u64, и если бы считалось в нём, тест поймал бы переполнение.
        let d = deal(0, i64::MAX / 2, u64::MAX);
        let earned = d.earned_at(i64::MAX / 4).unwrap();
        assert!(earned > 0 && earned <= u64::MAX);
    }
}
