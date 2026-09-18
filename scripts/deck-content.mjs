// Текст питч-дека. Единственный источник: из него собираются и слайды, и
// заметки докладчика. Править здесь, потом `node scripts/slides-build.mjs`.
//
// big     - крупная строка, главная мысль слайда
// accent  - слово внутри big, которое красится синим (ровно одно на слайд)
// steps   - строки среднего кегля, когда мысль разбита на шаги
// small   - подпись приглушённым серым
// notes   - речь докладчика, уходит в заметки слайда

export const title = "OXAR - pitch";

export const slides = [
  {
    big: "You already own a billboard.\nYou're just not charging rent.",
    accent: "billboard",
    small: "OXAR - if people look at it, it's ad space.",
    notes:
      "Every profile people look at is ad space. Nobody sells it, because selling it takes a conversation. We turn that surface into something with a price and a calendar.",
  },
  {
    big: "Today this is a DM,\na haggle, and a promise.",
    accent: "promise",
    small:
      "The owner has an audience and no way to sell it without negotiating. Too much work for two hundred dollars, so most people sell nothing.\n\nThe buyer does not need one integration for two thousand dollars. They need fifty avatars for one week, and no way to tell who took theirs down on day two.",
    notes:
      "Both sides want the same trade and neither has a way to make it. The seller loses the money. The buyer loses the week.",
  },
  {
    big: "We sell the space and the time.\nNot the work.",
    accent: "time",
    small: "A surface you control. A date range. A price you set.",
    notes:
      "This is closer to renting a billboard than to hiring a creator. The seller does not write anything, does not film anything, does not post on demand. They rent out a spot for a stretch of days. That is the whole product, and it is what makes it repeatable.",
  },
  {
    big: "How a deal works",
    steps: [
      "List a spot. Set a price and the dates.",
      "A buyer books it. The money goes into escrow.",
      "The spot stands for the term.",
      "Escrow pays out for the time it actually stood.",
    ],
    small:
      "If the spot never goes up, the buyer gets all of it back. We never hold the money.",
    notes:
      "The money never sits with us and never sits with the seller until the placement has done its job. If the spot goes up and stays up, the seller gets paid. If it never goes up, the buyer gets all of it back.",
  },
  {
    big: "A placement either stood,\nor it did not. We check.",
    accent: "check",
    small:
      "Automatic checks of the public profile. A public log both sides can read. If the spot comes down early, the refund follows what actually stood.",
    notes:
      "This is the part that makes the trade safe for a buyer who has never met the seller. Without it we are a calendar with a payment button, and nobody needs that.",
  },
  {
    big: "USDC. No invoices, no borders,\nnobody holding the money.",
    accent: "USDC",
    notes:
      "A seller in Kyiv and a buyer in Singapore settle in an afternoon, for a hundred dollar deal, with the money locked until the work is done. That is not something an invoice and a bank transfer can do at this size.",
  },
  {
    big: "Nobody prices a surface\nby the day.",
    accent: "day",
    steps: [
      "Teams shipping right now, who need to be seen this month.",
      "Small projects before a launch or an event.",
      "Communities and agencies that already sell sponsorship by hand.",
    ],
    notes:
      "The demand exists and is served manually today, one conversation at a time. What is missing is not the appetite. It is the rate card and the calendar.",
  },
  {
    big: "10% from the seller.\nNothing from the buyer.",
    accent: "10%",
    small:
      "The unit is a campaign, not a single slot. One buyer, many surfaces, one date range, one budget.",
    notes:
      "A single avatar for a week is a small deal. Fifty of them booked in one go is a real one, and that is how this already happens in the wild - one buyer paying a whole community to wear the same picture for a week.",
  },
  {
    big: "One number we care about:\nplacements that stood their full term.",
    accent: "full term",
    small:
      "Waitlist live at oxar.app. First sellers coming from a crypto community that already sells sponsorship. Not signups, not listings, not volume.",
    notes:
      "Anyone can show signups. The only number that proves this works is a placement that was paid for, stood the whole term, and was accepted by both sides. That is what we are optimising for.",
  },
  {
    // TODO: заменить на реальные имена, роли и просьбу к залу
    big: "Who we are",
    steps: [
      "Daniil - product and engineering",
      "Anna - demand side, marketing agency in the US",
      "Serhii - TODO",
    ],
    small:
      "What we need - sellers with an audience, buyers with a launch, and the people who can introduce us to both.",
    notes:
      "We are building this in the open during the hackathon. If you own a surface people look at, or you are launching something and need to be seen, talk to us after this.",
  },
];
