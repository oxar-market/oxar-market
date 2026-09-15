// Сделки за место, которые уже случились без нас.
//
// Порядок - от самого близкого к нашему товару к самому дальнему: зона на
// аватарке на неделю за USDC это буквально мы, чемодан и платье - категория
// целиком.
//
// Ссылка у строки необязательна, но желательна: сайт читают люди из
// крипто-твиттера, и цифру, которую можно проверить, они проверяют.

export type ProofRow = {
  /** Сумма как её называет источник. */
  amount: string;
  /** Что именно продали, одной строкой. */
  what: string;
  /** Когда и кто, мелким текстом. */
  who?: string;
  /** Куда ведёт проверка. */
  url?: string;
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
    amount: "$105,000",
    what: "Temporary tattoos on his body, for one race",
    who: "Marc Lou at HYROX, ten spots, bidding opened at $1,000 each",
    url: "https://hyrox.marclou.com/",
  },
  {
    amount: "$21,800",
    what: "A logo on a runner's shoulder, for a season",
    who: "Nick Symmonds, Olympic 800m runner, 2016",
    url: "https://www.espn.com/olympics/story/_/id/15474384/track-star-nick-symmonds-sell-advertising-space-right-shoulder-t-mobile",
  },
  {
    amount: "$10,000",
    what: "Spots on a dress, worn through a conference",
    who: "TOKEN2049 Singapore, thirteen numbered spots",
    url: "https://token2049.vanshu.fun/",
  },
  {
    amount: "$7,000",
    what: "Spots on a suitcase, carried through an airport",
  },
];
