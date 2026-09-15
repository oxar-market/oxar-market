// Сделки за место, которые уже случились без нас.
//
// Каждая строка обязана открываться по ссылке. Цифра без источника на лендинге
// запрещена правилом проекта, и держится оно не на строгости, а на читателе:
// сайт смотрят люди из крипто-твиттера, они кликают и проверяют. Одна цифра,
// которая не подтвердилась, дороже трёх, которых нет.
//
// Порядок - от самого близкого к нашему товару к самому дальнему: зона на
// аватарке на неделю за USDC это буквально мы, плечо бегуна на сезон - уже
// метафора.

export type ProofRow = {
  /** Сумма как её называет источник. */
  amount: string;
  /** Что именно продали, одной строкой. */
  what: string;
  /** Когда и кто, мелким текстом. */
  who: string;
  /** Куда ведёт проверка. Без неё строка на сайт не попадает. */
  url: string;
};

export const PROOF: ProofRow[] = [
  {
    amount: "$50,000",
    what: "One zone on a profile picture, for one week",
    who: "Rollbit, for the centre spot on Solana's PFP, September 2026",
    url: "https://cryptobriefing.com/solana-auction-nepal-flood-relief/",
  },
  {
    amount: "$166,946",
    what: "Nine zones on the same picture, plus the pinned post",
    who: "Paid in USDC. Solana ran it as an auction for Nepal flood relief",
    url: "https://ourcryptotalk.com/news/solana-pfp-auction-nepal-flood-relief",
  },
  {
    amount: "$21,800",
    what: "A logo on a runner's shoulder, for a season",
    who: "Nick Symmonds, Olympic 800m runner, 2016",
    url: "https://www.espn.com/olympics/story/_/id/15474384/track-star-nick-symmonds-sell-advertising-space-right-shoulder-t-mobile",
  },
];
