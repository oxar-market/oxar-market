// Что лежит на рабочем столе. Позиции в процентах от размера стола, чтобы
// композиция не разъезжалась на других экранах. На мобильных они игнорируются:
// там иконки идут сеткой.
//
// Файлов три, и они пронумерованы: человек читает их по порядку, а не выбирает
// из четырёх названий, где одно про цены, а другое про то же самое словами.

export type DesktopFile = {
  slug: string;
  /** Подпись под иконкой. Без .txt: расширение ничего не добавляет. */
  name: string;
  /** Своя иконка на каждый файл, чтобы стол читался с первого взгляда. */
  icon: string;
  title: string;
  body: string[];
  x: number;
  y: number;
};

export const FILES: DesktopFile[] = [
  {
    slug: "who-we-are",
    name: "What OXAR is",
    icon: "/icons/step-1.webp",
    title: "If people look at it, it's ad space.",
    x: 5,
    y: 8,
    // Три абзаца, а не пять: над ними теперь стоят сделки, и до кнопки человеку
    // надо доскроллить. Что escrow возвращает неотстоявшее, сказано внутри
    // второго абзаца, а не отдельной строкой - факт остался, стена ушла.
    body: [
      "A marketplace for ad space on anything people look at.",
      "You name a price and the dates your surface is free. A buyer books those dates and pays into escrow, in USDC on Solana, and the money is released only for the time the placement was actually up.",
      "Profiles first, because a profile can be checked automatically. Then every other digital surface, then the physical world.",
    ],
  },
  {
    slug: "how-it-works",
    name: "How it works",
    icon: "/icons/step-2.webp",
    title: "How it works",
    x: 5,
    y: 44,
    body: [
      "If you have an audience:",
      "1. Book a call. We check the account is yours and switch you on. One time, by hand.",
      "2. List a spot. Price for a whole term or per day, and the dates you are free.",
      "3. Approve or turn down. Every request arrives with the creative attached.",
      "4. Get paid. The fee is 10% out of your payout, so a $500 placement pays you $450.",
      "If you need attention:",
      "1. Pick a spot on a profile - avatar, banner, bio link, pinned post.",
      "2. Pick the dates, or bid if that spot is on auction.",
      "3. Pay into escrow. Funds are locked, not sent. A request the seller turns down comes straight back.",
      "4. Get proof. We check the profile on a schedule and keep the log. Unused days come back if the placement ends early.",
      "Buyers pay no fee. We take nothing from a deal that fell apart.",
    ],
  },
  {
    slug: "why-us",
    name: "Why us",
    icon: "/icons/step-3.webp",
    title: "Why us",
    x: 84,
    y: 8,
    body: [
      "Nobody sells space by the day. Collabstr and every influencer platform sells the creator's work - a post, a video, a mention. We sell the surface and the dates.",
      "It already happens by hand. Projects pay communities to run their avatar for a week, creators rent out banners in DMs, and each deal is a separate conversation with no price list, no calendar and no escrow.",
      "Why now: in crypto everyone already has a wallet, and USDC escrow makes a $50 deal worth doing. At that size nobody signs a contract.",
      "What we add is the boring part: a price, a calendar, escrow that releases money only for time the placement ran, and a log that proves it stood there.",
    ],
  },
];

export type DesktopApp = {
  slug: string;
  name: string;
  /** Картинка иконки. Без неё рисуется чёрный значок X. */
  icon?: string;
  x: number;
  y: number;
};

export const APPS: DesktopApp[] = [
  {
    slug: "x",
    name: "X placements",
    x: 16,
    y: 70,
  },
  // Йосип предложил этот маркетплейс публично ещё до того, как мы его начали.
  // Иконка с его лицом - отсылка для тех, кто это помнит.
  {
    slug: "josip",
    name: "Josip called it",
    icon: "/icons/josip.png",
    x: 44,
    y: 70,
  },
];
