// Что лежит на рабочем столе. Позиции в процентах от размера стола, чтобы
// композиция не разъезжалась на других экранах. На мобильных они игнорируются:
// там иконки идут сеткой.

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
    icon: "/icons/blue.svg",
    title: "Who we are",
    x: 5,
    y: 8,
    body: [
      "OXAR is a marketplace for ad space on personal profiles.",
      "A creator sells one specific spot - avatar, banner, bio link, pinned post - for a specific number of days. An advertiser buys that spot for that time. Payment is USDC on Solana, held in escrow.",
      "We sell space and time, not the creator's work. That is the whole difference between us and every influencer platform out there.",
    ],
  },
  {
    slug: "how-it-works",
    name: "How it works",
    icon: "/icons/breeze.svg",
    title: "How it works",
    x: 5,
    y: 44,
    body: [
      "If you have an audience:",
      "1. Get verified. We check the account is yours. One time, by hand.",
      "2. List your spots. Pick what you are willing to sell, set your price and your calendar.",
      "3. Approve and get paid. Every request arrives with the exact creative attached. Reject anything you do not want on your profile.",
      "If you need attention:",
      "1. Pick a spot. Browse by placement type, audience size and price.",
      "2. Pay into escrow. Funds are locked, not sent.",
      "3. Get proof. We check the profile on a schedule and keep the log. If the placement comes down early, you get the unused days back.",
    ],
  },
  {
    slug: "why-us",
    name: "Why rent your profile",
    icon: "/icons/black-green.svg",
    title: "Why us",
    x: 84,
    y: 8,
    body: [
      "This already happens in DMs. Solana sold ad space on its own logo for a charity campaign. Creators rent out their banners one conversation at a time. Communities get paid to run a project's avatar for a week. TikTokers rent out their foreheads.",
      "The behaviour exists. The infrastructure does not.",
      "What we add is the boring part nobody wants to do by hand: a price, a calendar, escrow that releases money only for time the placement actually ran, and a log that proves it stood there.",
    ],
  },
  {
    slug: "pricing",
    name: "What it costs",
    icon: "/icons/green-icon.png",
    title: "Pricing",
    x: 84,
    y: 44,
    body: [
      "10% from the seller. Buyers pay nothing.",
      "The fee comes out of the payout, so a $500 placement pays the creator $450.",
      "If a placement is removed early, the buyer gets the unused days back and we take the fee only from what was earned. Nobody pays us for a deal that fell apart.",
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
