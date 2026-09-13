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
    title: "If people look at it, it's ad space.",
    x: 5,
    y: 8,
    body: [
      "OXAR is a marketplace for ad space on anything people look at. List a surface you control with a price and a date range, and buyers book it in USDC escrow that pays out only for the time it is actually up.",
      // Узкий старт назван выбором, а не потолком: иначе категория читается как
      // «сервис для твиттера», и всё, что мы будем делать дальше, выглядит
      // прыжком в сторону.
      "Any surface someone owns can be rented for a stretch of time. We start with the ones that prove themselves - a profile can be checked automatically, a wall cannot. Profiles first, then every other digital surface, then the physical world.",
      "Today that means one spot on an X profile - avatar, banner, bio link, pinned post - for a set number of days.",
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
      "2. List your spots. Pick what you are willing to sell, set a price for a whole term or a day rate, and put a spot up for bids if you would rather run an auction.",
      "3. Approve and get paid. Every request arrives with the exact creative attached. Reject anything you do not want on your profile.",
      "If you need attention:",
      "1. Pick a spot. Browse by placement type, audience size and price, or bid on a lot with a deadline.",
      // Право продавца отказать стояло только в его половине, и покупатель
      // узнавал о нём уже после оплаты.
      "2. Pay into escrow. Funds are locked, not sent. The seller approves the request or turns it down, and a rejected request comes straight back to you.",
      "3. Get proof. We check the profile on a schedule and keep the log. Escrow pays out for the time the placement was up, so if it comes down early the unused days come back.",
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
      // Про логотип Solana здесь стояло «for a charity campaign» - размыто, и
      // расходилось с формулировкой в приложении Йосипа. Это был аукцион девяти
      // зон на аватарке в пользу пострадавших от паводка в Непале, $166 946 в
      // USDC за сутки, ставки возвращались проигравшим. Проверяемо по посту
      // @solana от 1 сентября.
      "This already happens in DMs. Solana auctioned nine zones on its own logo for Nepal flood relief and took $167k in USDC in a day. Creators rent out their banners one conversation at a time. Communities get paid to run a project's avatar for a week. TikTokers rent out their foreheads.",
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
