export {
  HANDLE_PATTERN,
  isValidHandle,
  normalizeHandle,
} from "./handle.ts";

export {
  PLACEMENTS,
  placementSpec,
  type PlacementKind,
  type PlacementSpec,
  type ProofKind,
} from "./placements.ts";

export {
  FEE_RATE,
  STREAM_PERIOD_SECONDS,
  USDC_DECIMALS,
  formatUsd,
  fromUsdcBaseUnits,
  settle,
  splitPayout,
  streamPlan,
  toUsdcBaseUnits,
  type Settlement,
  type Split,
  type StreamPlan,
} from "./money.ts";

export {
  BID_STEP_RATE,
  EXTEND_MS,
  MIN_STEP_CENTS,
  closesAfterBid,
  isOpen,
  minBidCents,
  winner,
  type Bid,
} from "./auction.ts";

export {
  calendarDays,
  endDate,
  isWithin,
  type CalendarDay,
  type DayRange,
} from "./calendar.ts";

export {
  minDaysFor,
  orderTotalCents,
  type Listing,
  type Pricing,
} from "./pricing.ts";

export {
  contactKind,
  isValidContact,
  normalizeContact,
  type ContactKind,
} from "./contact.ts";

export { MAX_FOLLOWERS, parseFollowers } from "./followers.ts";

export { AVATAR_TONES, avatarLetter, avatarTone } from "./avatar.ts";

export {
  estimate,
  type Estimate,
  type PlacementEstimate,
} from "./estimate.ts";
