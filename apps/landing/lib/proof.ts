// Сделки за место, которые уже случились без нас.
//
// Порядок - по убыванию суммы.
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
    amount: "$105,000",
    what: "Temporary tattoos on his body, for one race",
    who: "Marc Lou at HYROX, ten spots, bidding opened at $1,000 each",
    url: "https://hyrox.marclou.com/",
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
