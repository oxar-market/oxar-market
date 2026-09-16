# Idea Validation

_Fast reality check before build — evidence, assumptions, and the cheapest tests_

## Idea Brief

**One sentence.** OXAR is a marketplace where someone with an audience rents out a specific spot they control (X avatar, banner, pinned post, bio link) for a set date range, and the buyer pays into a USDC escrow on Solana that releases only for the days the placement was actually up.

**Wedge.** X profiles only, because avatar, banner, pinned post and bio link can be checked automatically against the public profile on a schedule. Everything else (other platforms, shirts, cars, event booths) is a later stage where proof costs more.

**ICP.** Buyer side: the growth or marketing lead at a small crypto team running a launch, listing or event, who needs visibility inside a fixed window. Seller side: an individual account or community admin on X with an audience and no standing rate card.

**Who pays.** The seller pays 10% of the booking; the buyer pays nothing. Typical booking value is Not found, since zero deals have closed.

**What they do today.** They arrange it by hand: a DM on X or Telegram, a price agreed in conversation, payment by direct transfer, and trust or a mutual contact standing in for enforcement. No named tool is evidenced as the incumbent here; share of this spend already running through existing creator-sponsorship marketplaces is Not found.

**Switching cost off that habit.** Low in tooling, high in habit. The seller gives up 10% and connects an account; the buyer gives up direct relationship control and funds an escrow before the placement runs. Neither side has to abandon software they already pay for, so the cost is behavioural, not technical.

### Load-bearing claims

| # | Claim | If false |
|---|---|---|
| 1 | Automated checking of an X profile is reliable enough that both sides accept the log as settlement | Escrow release becomes disputed and the product is a directory |
| 2 | Sellers will accept a 10% cut instead of keeping 100% of a DM deal | No supply |
| 3 | Buyers want bookable date ranges more than they want a negotiated relationship | No demand |
| 4 | Enough buyers and sellers want the same dates for search to beat asking around | Marketplace never clears |
| 5 | Paying in USDC on Solana is not a blocker for the buyer | Escrow is the reason the deal dies |

## Existing Solutions & Substitutes

| Solution | Kind | Cost | Does well | Gap it leaves |
|---|---|---|---|---|
| P2P KOLs (p2pkols.com) | direct | 20% commission on creator rate (p2pkols.com) | escrow, auto-verified like/RT/follow/comment, auto-refund | one-shot tasks, not date ranges |
| Coinbound, NinjaPromo | adjacent | ~$5K+/month (FORKOFF, 2026) | vetting, briefs, reporting | minimum excludes a $200 booking |
| Coinzilla KOL Spotlight | adjacent | EUR 1,999-9,999 packages (FORKOFF, 2026) | fixed price, no negotiation | posts only, no standing surface |
| DM plus direct transfer | manual | no fee | instant, relationship intact | no proof of duration, no recourse |
| KOL list in a spreadsheet | diy | Not found | full roster control | "creates work rather than removing it" (FORKOFF, 2026) |

**What they reach for today.** DMs first, an agency second. The DM costs nothing, settles in minutes, and leaves a named person to chase. It fails in three places: no price discovery, so every deal is renegotiated from zero; no proof of duration, so a banner removed on day two is an argument rather than a refund; and no recourse once a seller is paid and stalls. The norm is to accept this and split payment around the post. Honest read: it mostly works, badly.

**1. The gap.** Time-boxed rental of a standing surface, avatar, banner or bio link, priced per day and settled against an automated record of how long it stood. Everything above sells a post or a one-off action.

**2. Served?** Partly. Escrow plus automated verification already ships at P2P KOLs. Duration pricing for profile surfaces is Not found on any public page searched.

**3. Why the gap persists.** No licence, capital requirement or private dataset keeps suppliers out. P2P KOLs cleared the hard part, escrow and auto-verification, and did not extend into duration, which points at weak demand rather than a barrier. The other honest reading is that per-day profile rental is too new for anyone to have tried. OXAR has cleared no barrier an incumbent has not.

**4. The differentiator.** 10% from the seller against 20% (p2pkols.com), and a continuous check log instead of point-in-time review. The fee is copyable in an afternoon. Buyers pay nothing either way, so the switch has to be sold to sellers on price alone, which is cosmetic until claim 1 holds.

## Demand Evidence

### Search record

| Channel | Query run | On-topic hits | What was in them |
|---|---|---|---|
| web_forums | `bitcointalk signature campaign rates per week avatar rental paid advertising forum` | 2 | Bitcointalk thread 615953, updated 2026-09-15, lists live campaigns paying weekly for signature plus avatar space. No thread found asking for the same on X |
| job_boards | `crypto "KOL manager" job posting responsibilities "negotiate" influencer rates remote` | 6 | KOL Manager roles at Flight3, Seedify, Gamestarter, Tectum, Consensys; duties include contracts, budget, deliverable tracking |
| pricing_pages | `"pinned post" OR "bio link" OR "profile banner" crypto KOL price list per day rate card twitter placement` | 3 | Per-unit rate cards for tweets, threads, Telegram pins. No per-day or per-week pricing for any profile surface |
| regulatory | `FTC endorsement guides influencer disclosure requirement crypto advertising rules 2026` | 5 | 2023 Endorsement Guides update, disclosure of material connection. No deadline, register or filing that forces a purchase. No signal filed |
| funding_grants | `web3 influencer marketplace startup raises seed funding 2025 2026 KOL platform escrow` and `Colosseum Crypto World's Fair 2026 hackathon prize pool registration` | 2 | Colosseum hackathon prizes and earmarked seed. No raise found for any duration-priced placement marketplace |
| onchain | `Solana onchain advertising escrow protocol dune dashboard volume ad marketplace program` | 0 | Empty. Generic Solana escrow repos and DEX dashboards only. No advertising-escrow program, contract or dashboard with measurable volume |

### Signals

| Signal | Kind | Where | Strength | Proves / does not prove |
|---|---|---|---|---|
| Weekly rental of profile surface clears at scale: Shuffle $100/wk (Legendary), Rollbit $80/wk, Spinly.io $75/wk, Rainbet 174 filled slots (bitcointalk.org/index.php?topic=615953.0, updated 2026-09-15) | spend_on_substitute | https://bitcointalk.org/index.php?topic=615953.0 | strong | Duration-priced signature plus avatar space has a functioning market with posted rates. Does not prove it transfers to X, nor that anyone pays for escrow |
| P2P KOLs charges 20% on creator rate, holds escrow, auto-verifies via X API, lists 1,000+ verified KOLs | spend_on_substitute | https://p2pkols.com/ | moderate | A price point exists for escrowed X work. No named customer, volume or GMV published |
| "Handle all KOL operations including communications, contracts, and budget management", Flight3 KOL Lead/Manager | hiring_duty | https://cryptocurrencyjobs.co/marketing/flight3-kol-lead-manager/ | moderate | A salaried owner exists for deal-by-deal placement admin. Salary Not found; contract-or-FTE unstated |
| Published 2026 rate card: single sponsored tweet $200-$8,000, Telegram pinned announcement $300-$5,000; no per-day or banner pricing | spend_on_substitute | https://cryptokolz.com/crypto-influencer-pricing | moderate | Budget for X placements is real and per-unit. The format OXAR sells is absent from the card |
| Colosseum Crypto World's Fair: $840K prizes, $2.5M seed earmarked, registration 2026-09-14 to 2026-10-12 | funded_competitor | https://cryptobriefing.com/colosseum-crypto-worlds-fair-hackathon/ | weak | Capital is flowing to the category. Category evidence only, and OXAR's registration is entry, not selection |
| 3 waitlist signups since 2026-09-11; sellers onboarded by hand through calls; zero deals closed | direct_conversation | oxar.app | weak | Nothing yet. No pricing, no repeat, no buyer |

### Honest read

Someone is asking, but not in OXAR's words, and not on OXAR's platform. The strongest evidence is fifteen years old and lives on a different forum: Bitcointalk campaigns pay $65 to $100 per week for a signature and avatar slot, with 174 slots filled on one campaign alone. That settles the abstract question. People will rent a standing profile surface by the week, and buyers will pay posted weekly rates rather than negotiate each time. It settles nothing about X, where every rate card found prices a post, a thread or a pin, and none prices a day.

No public complaint was found. Across forum searches, nobody is writing that a banner came down on day two, that a bio link was swapped early, or that they want a calendar to book an avatar. The pain in claim 1, unverifiable duration, is not articulated anywhere searched. That is a finding, not a gap: a pain nobody complains about is usually a pain nobody is paying to remove.

The onchain channel is empty. No Solana program, contract or dashboard for advertising escrow surfaced with any volume, which means there is no measured flow to point at and no precedent that buyers will fund escrow before a placement runs.

What asking does exist is agency-shaped: salaried KOL managers handling contracts and budgets, and a 20% escrowed marketplace already operating on per-task work. Both spend money on the adjacent problem. Neither buys time.

Cheapest test on Monday: publish five X sellers with per-day prices and see whether one buyer books a date range without a call.

## Graveyard - Who Tried This and What Killed Them

| Attempt | What it built | What happened |
|---|---|---|
| IZEA SponsoredTweets, launched 2009 | self-serve marketplace for paid tweets, plus managed services | Q1 2023: Marketplace Spend Fees $36,474 against Managed Services revenue $8,502,754 [1]. FY2025 revenue mix 99.3% Managed Services, 0.7% SaaS [2] |
| Twittad, founded 2008 | "the first sponsored tweet network" | Twitter suspended its account and sued to cancel its trademark, 2011-09-10 [3] |
| AdEx, founded 2017 | on-chain ad exchange, 16,000+ registered advertisers and publishers | rebranded to Ambire, pivoted to a DeFi wallet, 2021-10-13 [4] |
| Tweetbot, Twitterrific and other API-built businesses | products dependent on Twitter's API | free API access ended 2023-02-09 on one week's notice [5] |

### Mechanics and verdicts

- IZEA: the fee base never carried the company. Self-serve booking fees ran three orders of magnitude below the agency line that humans closed by hand, and IZEA now states it focuses on managed services over stand-alone software. Same for OXAR. 10% of a $200 booking is $20, so covering one salary needs thousands of bookings a year
- Twittad: the host owns the inventory and the account. Twitter deleted custom profile backgrounds outright in July 2015 [6], erasing an ad surface that third parties had been reselling. Same, and unhedged. Avatar, banner, pinned post and bio link exist at X's discretion, and OXAR has no agreement with X
- AdEx: crypto rails did not create advertiser demand. 16,000 registrations did not convert into a business the team wanted to keep running. Partly different, OXAR settles deals two named humans already agreed, not programmatic impressions. Same in that the onchain search in this document found no advertising-escrow volume on Solana
- API clients: verification is rented. Claim 1 depends on an interface whose price and terms the counterparty sets and has changed with a week's notice. Same, and it is the load-bearing dependency, not a side risk

No dead company was found that rented a profile surface by the date range and settled against a duration log. Nobody tried the exact thing. The nearest neighbours died of demand and dependency, not technology.

## Assumption Ledger (Structured)

### Validation verdict: KILL · 21/100

Evidence contradicts a load-bearing assumption: "Buyers of X placements will book self-serve through a marketplace, so 0.10 booking fees rather than managed-service revenue carry the business". IZEA ran exactly this model, a self-serve marketplace for paid tweets alongside a managed arm, for over a decade. In Q1 2023 its Marketplace Spend Fees were $36,474 against Managed Services revenue of $8,502,754 (SEC exhibit 99.1, 2023-05). FY2025 revenue mix was 99.3% Managed Services and 0.7% SaaS (IZEA FY2025 10-K). Buyers of social placements in that market bought through humans, not a booking flow.

**Riskiest assumptions**

| Assumption | Kind | Impact | Confidence | Evidence | Risk |
| --- | --- | --- | --- | --- | --- |
| Buyers and sellers want overlapping dates densely enough that a listed seller receives an unsolicited booking, with at least 5 bookings in the first 30 days of the listings being public | demand | 5 | 1 | none | 25 |
| Buyers of X placements will book self-serve through a marketplace, so 0.10 booking fees rather than managed-service revenue carry the business | distribution | 4 | 1 | contradicted | 24 |
| Buyers currently lose money on placements that come down early or never go up, often enough that at least 3 in 10 can name an instance from the last 12 months | demand | 4 | 1 | none | 20 |
| Buyers will pay for a standing X surface priced per day over a date range, not only per post or per action | demand | 5 | 2 | mixed | 18 |
| Sellers with an existing audience will accept a 0.10 cut of a booking instead of keeping 100% of a DM deal they could have closed themselves | willingness to pay | 5 | 2 | mixed | 18 |

Cost to de-risk the top three: **58 days, $0**.

Demand posture: 6 signals, 5 checkable, 0 from public discussion, 6/6 channels searched.

Market gap: partially served; differentiator is cosmetic; adjacent proof from Bitcointalk signature and avatar rental campaigns at Posted weekly rates of $75-$100 per slot (Shuffle $100/wk at Legendary rank, Rollbit $80/wk, Spinly.io $75/wk) and 174 filled participant slots on the Rainbet campaign, thread updated 2026-09-15.

**Source audit**

10 cited sources were fetched. 2 did not come back clean.

| Source | Result | Detail |
| --- | --- | --- |
| https://www.sec.gov/Archives/edgar/data/1495231/000149523126000010/izea-20251231.htm | could not verify | HTTP 403, could not read |
| https://www.sec.gov/Archives/edgar/data/1495231/000149523123000089/exhibit991pressreleaseq120.htm | could not verify | HTTP 403, could not read |

These were left scored as written. A server that refuses an automated request is not evidence of a bad citation.



## Buyer Reaction

**The payer.** The budget line exists and is already staffed: six KOL Manager roles were found (Flight3, Seedify, Gamestarter, Tectum, Consensys), with duties covering "communications, contracts, and budget management" [7]. Spend per unit is posted, $200-$8,000 per sponsored tweet and $300-$5,000 per Telegram pinned announcement (cryptokolz.com, 2026), so a $200 date-range booking sits at the bottom of an existing line rather than needing a new one. The cost of doing nothing is unmeasured: no public complaint about a placement coming down early or a bio link swapped mid-campaign was found in six channels, so the loss OXAR refunds has no size attached to it. At a 10% seller fee and nothing from the buyer, the payer is not the one being asked to pay, which weakens the case for their attention rather than strengthening it.

**The user.** Today the growth lead DMs the account, agrees a price in conversation, and transfers directly, often split around the post. First contact with OXAR replaces a five-minute DM with a listing search, a date selection and a pre-funded USDC escrow on Solana, and no measured precedent for that pre-funding step exists: the onchain channel returned zero advertising-escrow programs or dashboards with volume. Whether the habit survives is unknown. Three waitlist signups and zero deals closed is not a test.

**The status quo.** The bar is a free, instant, relationship-preserving DM that settles in minutes. OXAR must beat it on three axes at once: (a) doing nothing, which costs $0 and works badly but works; (b) building in-house, which for a team already paying a KOL Manager salary means a spreadsheet and a manual screenshot check, described in the FORKOFF (2026) review as something that "creates work rather than removing it"; (c) paying an agency at ~$5K+/month (Coinbound, NinjaPromo per FORKOFF, 2026) or EUR 1,999-9,999 per Coinzilla package, which buys the human who does the arranging. Nothing here forces a switch.

**The skeptic.** IZEA ran self-serve and managed side by side for over a decade and ended at $36,474 of Marketplace Spend Fees against $8,502,754 of Managed Services in Q1 2023, then 99.3% managed by FY2025 (SEC filings, could not verify, HTTP 403). P2P KOLs already ships escrow plus automated X verification at 20%; a booking calendar is a product decision for them, not a capability gap. If they add dates, OXAR's differentiator is a lower fee, copyable in an afternoon.

## Verdict & What To Do Monday

**Validation verdict: KILL · 21/100.**

In practice: do not build the marketplace. The evidence contradicts a load-bearing assumption, that self-serve booking fees rather than managed-service revenue can carry the business. What was found is IZEA, which ran a self-serve sponsored-tweet marketplace alongside a managed arm for over a decade and reported Marketplace Spend Fees of $36,474 against Managed Services revenue of $8,502,754 in Q1 2023, and a FY2025 mix of 99.3% Managed Services to 0.7% SaaS (SEC filings, could not verify, HTTP 403). Buyers of social placements in that market bought through humans. Two secondary facts sit behind it: no public complaint about placement duration was found in six channels, and the onchain channel returned zero advertising-escrow programs with measurable volume.

**The one condition that changes the answer.** Buyers route themselves. If, offered the same five placements two ways in one message, at least 3 of 10 crypto growth leads take the self-serve calendar link instead of "reply and I will arrange it", the IZEA precedent does not bind and this becomes TEST FIRST. Below that, the fee arithmetic stands: 10% of a $200 booking is $20, so one salary needs thousands of bookings a year.

**Monday.** Do not write code. Publish the 5 seller listings with real per-day prices, and send the two-route message to 10 buyers before touching anything else. The two-route test is cheapest and decides the rest.

| Test | Days | Cost | Kill criterion |
|---|---|---|---|
| Self-serve versus arranged: same 5 placements offered 10 buyers both ways, count which route each takes | 14 | $0 | 8 or more of 10 ask for it to be arranged |
| Duration pain: 10 buyer interviews walking through their last three paid X placements | 14 | $0 | Fewer than 3 of 10 can name a placement that came down early or never went up |
| Clearing: listings public with prices and calendars, traffic only from founders' own X accounts | 30 | $0 | Fewer than 5 inbound booking requests in 30 days, or every close was founder-brokered |

Total to de-risk the top three: 58 days, $0.

The one thing that decides this: whether a buyer books a date range without a call.

## Conditions To Live

### The conditions

1. **At least 3 of 10 crypto growth leads take the self-serve calendar link over "reply and I will arrange it" when offered both in one message.** Does not currently hold on the only comparable evidence found: IZEA reported $36,474 of Marketplace Spend Fees against $8,502,754 of Managed Services in Q1 2023 and a 99.3% managed mix by FY2025 (SEC filings, could not verify, HTTP 403). Untested on OXAR.
2. **At least 3 of 10 buyers can name a placement in the last 12 months that came down early or never went up.** Unknown. Six channels produced no public complaint of any kind about placement duration, which is the pain the escrow refunds.
3. **Median booking clears well above $200, because 10% of $200 is $20.** Unknown. Posted per-unit prices run $200-$8,000 per sponsored tweet and $300-$5,000 per Telegram pinned announcement (cryptokolz.com, 2026), but no per-day price for a profile surface was found on any page searched.
4. **X keeps an API tier where polling 100 concurrent bookings costs under 10% of the fees those bookings generate, and its developer policy does not prohibit reselling profile surfaces.** Unknown, with three precedents running against: free API access ended on one week's notice 2023-02-09, Twitter sued Twittad 2011-09-10, custom profile backgrounds were deleted July 2015.
5. **10 or more of the 20-30 hand-onboarded sellers publish a per-day price at the 10% fee without counter-proposing an off-platform deal.** Unknown. P2P KOLs lists 1,000+ verified KOLs at 20%, so some sellers accept commission; zero OXAR sellers have paid a fee.
6. **A listed seller receives 5 inbound bookings in 30 days that no founder brokered.** Does not hold today: 3 waitlist signups since 2026-09-11, zero deals closed.

### The reshapes

| Shape | Objection it escapes | What it gives up |
|---|---|---|
| **Be the arranger.** Anna sources buyers, Daniil runs the escrow as back office, charge 15-20% on deals the founders close by hand | The IZEA mechanic, since revenue comes from the managed line that actually carried $8.5M a quarter, not the $36K self-serve line | Scales with headcount, not code. No marketplace multiple, and Anna's time is the product |
| **Sell the duration-proof rail.** Ship the poller and pro-rata escrow as a component to agencies, KOL managers and P2P KOLs, priced per monitored placement | Condition 6 entirely, since no two-sided liquidity is needed, and condition 3, since pricing is per placement rather than per booking | The buyer is now a handful of platforms, one of which can build it. X API dependency stays load-bearing |
| **Run single-buyer campaigns.** One advertiser books 50 X accounts for 4 weeks at a posted weekly rate, the Bitcointalk shape that filled 174 slots at $75-$100/wk (thread 615953, updated 2026-09-15) | Condition 6, since supply fills against one buyer rather than matching | Revenue concentrated in a few advertisers. This is campaign operations, not a marketplace |

### The ceiling

Not structural. The segment pays: six salaried KOL Manager roles found, agencies at ~$5K+/month (Coinbound, NinjaPromo per FORKOFF, 2026), packages at EUR 1,999-9,999 (Coinzilla). Money for X placement exists and is staffed. What fails is the packaging, a self-serve fee base on small bookings, sitting on a rented API. Change the shape, keep the instinct.

One caveat: if condition 2 is false, the duration guarantee is not a product in any shape, and only the arranger reshape survives, selling access rather than proof.

The one that matters: whether a buyer books a date range without a call.

## Sources

1. [SEC exhibit 99.1](https://www.sec.gov/Archives/edgar/data/1495231/000149523123000089/exhibit991pressreleaseq120.htm)
2. [FY2025 10-K](https://www.sec.gov/Archives/edgar/data/1495231/000149523126000010/izea-20251231.htm)
3. [TechCrunch](https://techcrunch.com/2011/09/10/in-battle-over-the-tweet-trademark-twitter-sues-twittad/)
4. [chainwire](https://chainwire.org/2021/10/13/adex-network-to-become-ambire-%D0%B0nd-pivot-to-a-defi-wallet/)
5. [TechCrunch](https://techcrunch.com/2023/02/01/twitter-to-end-free-access-to-its-api)
6. [TNW](http://thenextweb.com/news/twitter-doesnt-have-your-back-ground)
7. [cryptocurrencyjobs.co](https://cryptocurrencyjobs.co/marketing/flight3-kol-lead-manager/)

