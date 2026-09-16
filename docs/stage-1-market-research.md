# Market Research & Gap Analysis

_Stage 1-2 | Market state, sizing, gaps, and opportunity assessment_

## Executive Summary

**Recommendation: pursue with changes.**

OXAR sells spot-time on the four profile surfaces an owner controls, avatar, banner, pinned post and bio link, with USDC escrow on Solana that releases only for the days the placement actually stood. The defensible part is the release condition: a public profile state a script reads, rather than a buyer's approval of submitted work, which is what Collabstr conditions release on inside a 48-hour review window (CreatorStackClub, verified 2026-06-11). No incumbent can adopt that condition without narrowing its own inventory. The wedge is not empty. Headr.io is live on the identical surfaces and already funds escrow in SOL, USDC or USDT ([1], retrieved 2026-09-16), and RentMyHeader sells the same headers priced on delivered views.

| Layer | Figure (computed sizing block, as of 2026-09) |
|---|---|
| TAM | $1.15B, range $1.15B to $27.54B, 23.9x spread, anchored on MarketsandMarkets (2026) |
| SAM | $23.00M, 2.00% of TAM, after a 0.10 X-channel filter and a 0.20 spot-time filter |
| SOM | $1.15M ARR at year 3, 5.01% of SAM: 2,000 sellers x 1.2 spot-months x $40 x 12 |

The sizing rests on two invented fractions, the 0.20 spot-time share and the 0.05 three-year seller capture, and moving either to its low case takes SOM to $575K or $460K. The TAM sources disagree by 23.9x because Fortune Business Insights counts campaign value moving through platforms while MarketsandMarkets counts what platforms bill, so the low anchor is the honest one. Position today: pre-launch, zero deals closed, 3 people on the waitlist, unfunded.

| Top gaps found | Evidence |
|---|---|
| Release depends on a buyer's opinion, not on whether the spot stood | Collabstr releases on brand approval in 48 hours; DM deals have no escrow; ~160 of 200+ solicited crypto influencers took paid promo, fewer than 5 labeled it (The Block, 2025-09-01) |
| No posted price for one banner for one week | Headr.io publishes no fee ([2], 404 on 2026-09-16); RentMyHeader prices in views only |
| A fixed launch window cannot be bought as inventory | X Ads sells feed impressions at $2.09 CPM (Hootsuite, 2025) and cannot broker a user's avatar |

Gap 1 is the wedge. Gaps 2 and 3 are contested by OXAR's own economics: the $400 gross spot-month is inferred from Headr.io's self-reported creator earnings rather than read off any posted rate card, and 10% of a $100 deal is $10 against a 30-minute onboarding call.

| Scorecard (1-10) | Market size | Competition intensity | Technical feasibility | Business model clarity | Regulatory risk | Timing |
|---|---|---|---|---|---|---|
| Score | 4 | 3 | 9 | 5 | 4 | 5 |

The two weakest scores are the two that decide the outcome. Technical feasibility is the only strong one, and the gate there is X API policy, not build time.

| Kill risk | Why it kills |
|---|---|
| Custody status of the escrow under FinCEN: Not found | Decides whether the 10% take is a marketplace fee or a regulated payments business; MiCA transitional regimes ended 2026-07-01 with no grandfathering (ESMA, 2026-04-17) |
| X withdraws or restricts API access | It did exactly that on 2026-01-15 for apps rewarding posting, and Kaito shut Yaps; a written X policy on paid profile placements is Not found |
| Both sides move to DMs after the first deal | Removes the take rate without removing the need; only external benchmark is a 43% sponsor repeat rate on YouTube data (Influencer Advisory, 2026) |

Three changes, all testable within 90 days and without capital: deploy escrow with no OXAR-held key and buy one custody opinion before the first buyer dollar enters it; publish a per-spot, per-week rate card, which neither direct competitor has done; move onboarding to self-serve or hold median booking above $500. What flips this to drop: the first 30 hand-onboarded sellers produce a median booking under $500 with no self-serve path, repeat bookings land well under the 43% benchmark, or X closes paid profile placements the way it closed paid posting.

## Problem & Current State

Two sides pay for the same missing primitive. A person with an audience on X controls four sellable surfaces (avatar, banner, pinned post, bio link) and has no way to price or sell them without negotiating each deal by DM. A team launching a token or a product needs to be visible during a fixed window and has no way to buy that window, verify it stood, or get money back if it came down on day two. Both sides route around this through direct messages, which is where the documented failures cluster.

### Cost of the status quo

| Cost | Figure | Who bears it | Source (date) |
|---|---|---|---|
| Paid placements that cannot be proven or audited | 200+ crypto influencers solicited, ~160 accepted paid promo deals, fewer than 5 labeled posts as ads; payment in Solana wallets with onchain receipts | Buyer (no proof of what was bought), seller (FTC exposure) | The Block, 2025-09-01 [3] |
| Buyers cannot see what the creator was actually paid | 51% of marketers have full visibility into payment given to creators; 27% dissatisfied or strongly dissatisfied with compensation agreements | Buyer | ANA survey, fielded 2025-10-01 to 2025-12-01, n=84 screened, via Marketing Dive [4] |
| Marketplace fee stack on content deals | Collabstr: 10% marketplace fee on free plan; $299/mo (Pro) or $399/mo (Premium) to cut it to 5%; funds release on brand approval inside a 48-hour review window | Both | CreatorStackClub, pricing verified 2026-06-11 [5] |
| Booking-tool fee stack | Passionfroot: 5% on self-sourced deals, 15% on network deals, plus 2% transaction fee paid by the brand | Seller | CreatorStackClub, verified 2026-06-13 [6] |
| Payment delay as a creator pain point | 41% of creators name payment delays their top pain point. Figure reported via search result only; the Campaign US source page returned HTTP 403 on 2026-09-16, so treat as unverified | Seller | Influencer.com / Crowd DNA creator survey, March 2025 |
| Category spend and growth | $24B influencer marketing spend in 2025, up from $21.1B in 2024 (+13.7% YoY); creator economy $250B now, near $500B by 2027 (Goldman Sachs) | Context | HypeAuditor, 2025 [7] |
| X is a thin channel for this spend | Fewer than 10% of brands use X for influencer marketing; nano rates on X start as low as $2 per post | Risk to the X-first wedge | Influencer Marketing Hub, 2026 [8] |
| Are campaigns repeatable | 43% sponsor repeat rate (15,113 of 35,183 distinct sponsors across 281,264 paid YouTube integrations) | Answers founder open question, partially | Influencer Advisory first-party data, 2026 [9] |
| Typical deal size at the tier OXAR onboards | Median negotiated rate $500 at 10K-50K followers, $1,450 at 50K-250K. Sample is 14 creators on YouTube, not X; directionally useful only | Both | Influencer Advisory, 2026 (same URL) |

### Named workarounds today

| Workaround | What it does | What it does not do |
|---|---|---|
| Direct DM or Telegram deal | Price and dates agreed in chat, paid by transfer | No escrow, no record that the placement stood for the booked window |
| Collabstr | Escrow, released when the brand approves submitted content inside 48 hours | Sells content deliverables, not spot-time; release depends on buyer judgment |
| Passionfroot | Booking page and invoicing for newsletter/podcast/social slots | Invoice-based; no automated check that an on-profile placement stayed up |
| X native ads | Buys feed impressions | Cannot buy an individual's avatar, banner, pinned post or bio link |
| Marketplace for profile spot-time with automated proof | Not found | Not found |

### What the complaints pattern says

Collabstr's public rating is 4.5/5 across 465 reviews with 5% one-star (Trustpilot, retrieved 2026-09-16, [10]). The incumbent is not widely hated, so the opening is a missing category rather than a rescue mission. The recurring negative theme is process opacity: "If there are expectations that creators need to meet before being accepted, why isn't this made clear BEFORE asking people to spend hours completing the onboarding process" (Trustpilot, 2026-09-15). The structural complaint underneath is that money moves on a buyer's subjective approval of work. OXAR inverts that: the condition for release is whether a specific spot stood for booked dates, which a machine can check against a public profile. That is the defensible part of the thesis.

The counter-evidence is on channel size and deal size. Under 10% of brands use X for influencer marketing, and 10% of a $500 placement is $50 against a hand-onboarding call per seller. At a $100 deal the take is $10, which does not cover a human call. [ASSUMPTION: manual onboarding at 30 minutes per seller, per the founder's stated first 20-30 sellers process; break-even needs either self-serve onboarding or a median booking above roughly $500.]

Not found: total dollar volume of X profile placement deals; number of such deals per month; average duration of a banner or pinned-post booking; dispute rate on manually arranged placements.

## Market Landscape Map

| Product | Category | Chain / rails | Published price or take rate | Traction (dated) | Funding raised | Status read |
|---|---|---|---|---|---|---|
| Headr.io | Direct: banner, bio and pinned-post placements on X | Solana and others: escrow funded in SOL, USDC or USDT, described as multi-sig ([1], retrieved 2026-09-16) | Not published. Only creator-side earnings quoted, "$50 and $500 weekly" ([1], retrieved 2026-09-16). No fee page; https://headr.io/pricing returned 404 on 2026-09-16 | Self-reported on homepage: "10,000 X Profiles", "500+ brands already scaling" (retrieved 2026-09-16). Independently verified figures: Not found | Not found | Live and selling the exact OXAR wedge, including crypto escrow |
| RentMyHeader | Direct: X header rental via agency and AI agents | Fiat escrow, global payouts, EUR conversion shown ([11], retrieved 2026-09-16) | Not published. Packages quoted by views only: Launch Sprint 150k+, Launch Guarantee 400k+, Category Push 1M+ (retrieved 2026-09-16) | Not found. Founder claim of a prior product at 250k users (site, retrieved 2026-09-16) | Not found | Live, priced on delivered views rather than spot-time |
| Collabstr | Content-deliverables marketplace | Fiat | 10% brand fee on free plan, 5% on $299/mo Pro or $399/mo Premium (CreatorStackClub, verified 2026-06-11, [5]), plus 15% of creator earnings (Early Stage Journal, 2026-03-12, [12]) | 900,000+ registered users, 120+ countries, 14 staff (Early Stage Journal, 2026-03-12) | Bootstrapped, no VC (Early Stage Journal, 2026-03-12); a $1M seed appears on the Crunchbase profile, 2026, unreconciled | Growing on eight-figure revenue, self-reported |
| Passionfroot | Booking and invoicing for creator slots | Fiat | 5% self-sourced, 15% network deals, 2% buyer transaction fee (CreatorStackClub, verified 2026-06-13, [6]) | $10M+ paid to creators in the 18 months to 2026-07; revenue 13x YoY; 15 staff (TechCrunch, 2026-07-22, [13]) | $21M total, incl. $15M Series A led by Insight Partners, 2026-07-22 (TechCrunch) | Growing, best-funded booking layer |
| Kaito Studio | Creator-brand marketplace, InfoFi | Base (KAITO token) | Not published (CoinGecko, 2026, [14]) | Beta 2026-02 with 16 brand partners; Kaito Pro used by 500+ teams (CoinGecko, 2026) | $10.8M+ from Dragonfly, Sequoia China, Jane Street and others (CoinGecko, 2026) | Pivoted: Yaps shut 2026-01-15 after X revoked API access for apps rewarding posting |
| IZEA | Public influencer marketplace and managed services | Fiat | Marketer Pro $99/mo annual for self-serve marketplace access (Storika, 2026, [15]) | Q2 2026 revenue $5.8M, down 36% YoY (Storika, 2026); self-serve Shake retired 2025 | Public company | Declining in the SMB self-serve layer |
| Insense | Creator marketplace | Fiat | Marketplace fee 20% trial, 10% Brand, 7% Agency, on $400-$800/mo plans (Storika, 2026) | Not found | Not found | Reference point for the top of the take-rate band |
| X Ads | Platform-owned inventory | n/a | $2.09 CPM, $0.74 CPC, Hootsuite first-party spend (Hootsuite, 2025, [16]) | n/a | n/a | The substitute a buyer compares against |
| HypeLab | Web3 programmatic network | Multichain | $3-$15 CPM standard, $20-$40 CPM wallet-targeted premium (HypeLab, 2026-03-03, [17]) | 200+ publishers analysed (HypeLab, 2026-03-03) | Not found | Growing, sells only inventory it controls |
| Blockchain-Ads | Web3 programmatic network | Multichain | CPM or CPA, $1,000/mo minimum budget (ChainAware, 2026, [18]) | 23M wallet profiles claimed (ChainAware, 2026) | Not found | Growing |
| Coinzilla | Crypto ad network | Fiat and crypto | Not published ([19], retrieved 2026-09-16) | "50,000+ campaigns" self-reported (retrieved 2026-09-16) | Not found | Stable, opaque |
| twitterapi.io | Verification dependency | n/a | $0.18 per 1,000 profile lookups, $0.15 per 1,000 tweets, 1 USD = 100,000 credits ([20], retrieved 2026-09-16) | n/a | Not found | Live, cheap |
| X API (official) | Verification dependency | n/a | Pay-per-usage credits, no per-call price published on the docs page ([21], retrieved 2026-09-16); legacy Basic $200/mo and Pro $5,000/mo reported closed to new signups (Postproxy, 2026, [22]) | n/a | n/a | Policy risk, not cost risk |

Money concentrates in fiat booking rails. Passionfroot raised $15M on 13x revenue growth, Collabstr reached 900,000 users with no venture funding, and IZEA shrank 36% YoY after retiring self-serve. The layer being funded is booking with payments attached, which is the shape OXAR is closest to. The layer dying is SMB self-serve tooling.

The under-built slot is per-profile spot-time, and it is no longer empty. Headr.io sells banners, bios and pinned posts on X and already funds escrow in SOL, USDC or USDT. RentMyHeader sells the same surfaces through an agency with view guarantees. Neither publishes a fee, neither shows audited traction, and both are unverifiable beyond their own homepages, but OXAR is not opening a category. Its edge has to be proof quality and a published rate, not the existence of the marketplace. The dependency to watch is access: Kaito shut Yaps on 2026-01-15 after X revoked API access for apps that reward posting. OXAR pays for a placement rather than a post, which is a different policy surface, but the same gatekeeper. Cost is not the constraint. At $0.00018 per profile lookup, one check a day across a 30-day booking costs $0.0054.

The pricing column says this category charges a percentage of deal value, roughly 5% to 20%, and quotes CPM only where the seller owns the inventory. OXAR's 10% from the seller sits above Passionfroot's 5% self-sourced rate and level with Collabstr's free-tier brand fee, though Collabstr also takes 15% from the creator. No one publishes a rate card for one person's banner for one week, the two direct competitors included, so the sizing below has to run on deal value times take rate rather than impressions. Not found: any published spot-time price, any disclosed GMV for profile placements, any take rate for Headr.io or RentMyHeader.

> **Source audit.** 1 of 16 cited sources did not resolve when this section was generated, so anything resting on them is unverified:
>
> - https://headr.io/pricing

## Market Sizing (TAM / SAM / SOM)

### Market sizing, computed · as of 2026-09

**Market sized:** Annual fee revenue available to platforms that broker, escrow and verify paid placements on creator-owned profile surfaces (avatar, banner, pinned post, bio link), worldwide. This is the take-rate pool a marketplace can charge against, not the advertiser spend that passes through it.

| Layer | Figure | How it was reached |
| --- | --- | --- |
| TAM | $1.15B (range $1.15B to $27.54B, 23.9x spread) | 3 published sources, anchored on MarketsandMarkets |
| SAM | $23.00M (2.00% of TAM) | 2 narrowing filters applied to the anchor |
| SOM | $1.15M ARR at year 3 (5.01% of SAM) | 2,000 orgs x 1 units x $40/mo x 12 |

**TAM sources**

| Source | Year | Figure | What it measures |
| --- | --- | --- | --- |
| [23] | 2026 | $1.15B | Vendor revenue in 2026 from influencer marketing platform software (web, mobile, cloud, on-premises) plus professional and managed services, forecast to $2.03B by 2031 at 12.0% CAGR. Counts what platform providers bill, not what advertisers pay creators. Retrieved 2026-09-16. |
| [24] | 2026 | $27.54B | Influencer marketing platform market at $27.54B in 2026 ($23.59B in 2025, $89.90B by 2034 at 15.90% CAGR), segmented by component (software 75.72% share in 2026, services the remainder), application and end user. Stated components are the same as MarketsandMarkets but the base is 24x larger. [ASSUMPTION: the gap means this figure tracks campaign value transacted through platforms rather than fees the platforms charge; Fortune does not publish a reconciliation to vendor revenue.] Retrieved 2026-09-16. |
| [7] | 2025 | $24.00B | Total influencer marketing spend in 2025, up from $21.1B in 2024 (+13.7% YoY). This is advertiser outlay to creators and agencies across all channels, not platform revenue. Included as the denominator check: $1.15B of vendor revenue against $24B of spend implies a blended platform take of roughly 4.8%, which is inside the 5% to 20% take-rate band in the market map. |

**The chain from TAM to SOM**

| Step | Value | Basis | Why |
| --- | --- | --- | --- |
| X as the channel, rather than Instagram, TikTok or YouTube | keeps 10.00% | sourced | Fewer than 10% of brands use X for influencer marketing (Influencer Marketing Hub, 2026, [8]), cited in the problem section. Taken as the ceiling, not the midpoint: the share of brand count is used as a proxy for share of platform fees, which overstates X if X deals are smaller than Instagram deals, and X nano rates start at $2 per post per the same source. |
| Spot-time on the four fixed profile surfaces, rather than content deliverables | keeps 20.00% | assumption | No source publishes a split between profile-surface rentals and content deliverables on any platform. The whole SAM rests on this fraction. Set at 0.20 because the four surfaces (avatar, banner, pinned post, bio link) are a fixed and small inventory against unlimited post inventory, but they are the surfaces two live competitors already sell (Headr.io, RentMyHeader, market map, retrieved 2026-09-16). What would measure it: the booked-versus-open days on Headr.io's self-reported 10,000 listed X profiles, or a sampled count of paid profile placements against paid posts over a fixed week. |
| X accounts that list at least one sellable profile surface and can be verified automatically | 40,000 sellers | derived | SAM of $23.0M divided by annual fee revenue per active seller of $576 (1.2 spot-months x $40 x 12) gives 39,931, rounded to 40,000. Cross-check: Headr.io self-reports 10,000 X profiles on its homepage (retrieved 2026-09-16, unverified), so this treats the reachable universe as roughly 4x the largest observed listing base on one platform. |
| Share of reachable sellers transacting on OXAR by year three | 0.05 fraction | assumption | No comparable publishes a three-year seller capture figure for profile placements, and OXAR is pre-launch with zero deals closed and 3 people on the waitlist as of 2026-09-16. Set at 0.05 against a live incumbent already funding escrow in USDC on Solana (Headr.io) and against DM leakage after the first deal, which the founder lists as an open question. This and the 0.20 spot-time fraction above are the two inputs the whole SOM rests on; a move to 0.02 or 0.10 moves SOM to $460K or $2.30M with nothing else changed. |
| Booked spot-months per active seller per month | 1.2 spot-months per seller per month | assumption | Four sellable surfaces per profile (product definition) at roughly 30% occupancy. Occupancy is invented: no listing calendar, booking duration or dispute rate for profile placements is published anywhere, including by the two direct competitors. Consistency check against Headr.io's self-reported creator earnings of $50 to $500 weekly (homepage, retrieved 2026-09-16): at the $400 per-spot-month price below, that range implies 0.5 to 5.4 booked spot-months per seller per month, and 1.2 sits in the lower half of it. |
| OXAR fee per booked spot-month | 40 USD per spot-month | derived | 10% seller take (product definition, buyer pays nothing) on a $400 gross spot-month. The $400 is read off the Headr.io row of the market map: creator earnings of $50 to $500 weekly, midpoint $275 per week, is $1,191 per profile-month, divided across three of the four surfaces gives $397. Cross-check against the Influencer Advisory row: median negotiated rate $500 per deal at 10K-50K followers (2026, [9], sample of 14 YouTube creators) would put the fee at $50. No comparable publishes a per-spot, per-week rate card, Headr.io and RentMyHeader included, so this price is inferred from creator-side earnings rather than from a posted rate. |

Inputs marked `assumption`: **50.00%**. Every figure above is computed from the JSON below, not asserted.

**Searched for and not found**
- No published market sizing for profile spot-time placements as a category, on X or anywhere else: total dollar volume, deals per month and GMV are all absent
- No published take rate, fee page or GMV for Headr.io or RentMyHeader, the two direct competitors ([2] returned 404 on 2026-09-16)
- No X-specific revenue breakout inside any of the three platform market reports used above, so the 10% channel filter comes from a brand-count statistic rather than a spend split
- No published occupancy rate, average booking duration or dispute rate for banner, avatar, pinned-post or bio-link placements
- No independent verification of Headr.io's self-reported 10,000 X profiles and 500+ brands, which the reachable-seller cross-check leans on
- No reconciliation between the $1.15B vendor-revenue and $27.54B platform-market figures, so the 24x spread is carried as a definitional range and not resolved

**Sizing plausibility: unresolved**
- TAM sources disagree by 23.9x ($1,150,000,000 to $27,540,000,000). Carry the range rather than a point estimate, and say in the read what each firm is actually counting, because a spread that wide usually means two different market definitions rather than two different measurements.

These are advisory. The numbers above are arithmetically correct and these are the places where the inputs, rather than the arithmetic, are worth arguing with.



## What The Sizing Means

The 23.9x spread between MarketsandMarkets ($1.15B) and Fortune Business Insights ($27.54B) is not a measurement disagreement, so the plausibility advisory resolves this way: carry the range, anchor on the low end. Both firms name the same components, software plus services, but $27.54B sits inside a $24B total advertiser spend number (HypeAuditor, 2025), which a vendor-revenue pool cannot do. Fortune is counting campaign value moving through platforms. MarketsandMarkets is counting what platforms bill. OXAR's 10% competes for the second pool only. A category where two research firms differ by 24x on the same label is a market nobody has defined yet, which cuts both ways: no incumbent has a defended number either.

$1.15M ARR at year three is a beachhead, not a business. It implies $11.5M of GMV across 2,000 active sellers, which is seed-stage scale against Passionfroot's $21M raised on 13x revenue growth. It is defensible as a wedge and it is not defensible as a venture outcome on its own.

The two inputs the whole number is most sensitive to are the spot-time fraction (0.20) and the three-year seller capture rate (0.05). Both are assumptions with no published support, and together they set half the chain.

| Input | Value | Swing tested | SOM at year 3 | How to measure it for real |
|---|---|---|---|---|
| Spot-time share of platform fees | 0.20 | 0.10 / 0.20 / 0.40 | $575K / $1.15M / $2.30M | Sample Headr.io's 10,000 self-reported X profiles for booked-versus-open calendar days over one fixed week, and count paid profile placements against paid posts in the same sample |
| Three-year seller capture | 0.05 | 0.02 / 0.05 / 0.10 | $460K / $1.15M / $2.30M | Run the first 30 hand-onboarded sellers to a second booking and measure repeat rate and DM leakage; Influencer Advisory's 43% sponsor repeat rate is the only external benchmark and it is YouTube, not X |

For this to be worth building, the sizing has to reach roughly $10M ARR by year five. Three routes get there and each is measurable now: median booking above $500 rather than $400, so a 10% take clears the cost of acquiring a seller; occupancy above 30%, which turns one surface into recurring inventory; and expansion past X into the platforms and physical surfaces already named in the product definition, which lifts the 0.10 channel filter. None of the three is proven. The first two can be tested with 30 sellers and no capital.

## Funding Landscape

| Project | Round | Amount | Lead investors | Date | What it signals |
|---|---|---|---|---|---|
| Passionfroot | Series A | $15M (total raised $21M) | Insight Partners | 2026-07-22 [13] | Booking plus payments for creator slots is the funded shape, and it is fiat |
| Agentio | Series B | $40M (total $56M, $340M valuation) | Forerunner, with Benchmark, Craft Ventures, AlleyCorp | 2025-11-18 [25] | Creator ad inventory bought programmatically, priced on measured performance |
| Nectar Social | Series A | $30M | Menlo Ventures, Anthology Fund | 2026-05-13 [26] | Social measurement and commerce still clears a Series A |
| Levanta | Series B | $22M | Volition Capital | 2026-08-27 [26] | Affiliate attribution: pay on a tracked outcome, not on a slot |
| Phyllo | Series A | $15M | RTP Global | 2026-08-06 [26] | Creator profile data as infrastructure, the same input OXAR's checker reads |
| ShopMy | Growth | $70M at $1.5B valuation | Avenir, with Bain Capital Ventures, Bessemer | 2025-10 [27] | Creator commerce, again outcome-linked |
| Noise | Seed | $7.1M | Paradigm, with Figment Capital, Anagram, GSR, Kaito AI | 2026-01-14 [28] | Crypto capital in attention went to trading it on Base, not to selling it |
| Kaito | Disclosed total | $10.8M+ | Dragonfly, Sequoia China, Jane Street | 2026 [14] | The funded crypto-attention play, and the one X cut off on 2026-01-15 |
| Devotion | Seed | $4M | Basecase, Will Ventures | 2026-03-02 [26] | Discovery and payment of influencer partners at brand scale |
| Headr.io / RentMyHeader | Not found | Not found | Not found | Not found | The two direct competitors have no disclosed round |

Twelve disclosed creator-economy rounds in the year to 2026-09 total more than $1.39B, with Whatnot's $545M Series G and ElevenLabs' $500M Series D at roughly 75% of that ([26], retrieved 2026-09-16). Crypto venture is narrowing at the same time: $6.81B across 222 rounds in Q1 2026, with deal count down 45.9% against Q1 2025 ([29], 2026-08-20). Fewer, larger cheques, and the small ones go to identity and attribution.

OXAR rides one current and fights another. It rides payment and booking rails for creator inventory, which is where Passionfroot, Devotion and Phyllo sit. It fights the outcome-pricing current: Agentio, Levanta and ShopMy all got funded for paying against a tracked result, and OXAR sells time on a surface with no impression count, which is the founder's own open question. Crypto capital in attention backed markets for betting on it, not escrow for buying it, so there is no funded comparable to price against and no proof investors want this shape. The position today is unfunded, zero deals closed, 3 people on the waitlist, a 10% seller take against Passionfroot's 5% self-sourced rate and $21M of balance sheet.

## Regulatory Snapshot

This is desk research, not legal advice. Nothing below substitutes for a written opinion, and the money-movement rows have to be cleared before OXAR holds a buyer's first dollar.

### Classification by jurisdiction

| Jurisdiction / regime | How this product is classified | What it forces on OXAR | Source (date) |
|---|---|---|---|
| US, FTC Endorsement Guides (16 CFR 255) | A paid avatar, banner, pinned post or bio link is an endorsement with a material connection. The Guides were revised in 2023 and "don't have the force of law", but inconsistent practice supports a Section 5 action | Buyer and seller both carry disclosure duty, and an intermediary "could be liable if you play a role in creating or disseminating endorsements" | [30], retrieved 2026-09-16 |
| US, FTC disclosure placement | Disclosures "are likely to be missed if they appear only on an ABOUT ME or profile page" | OXAR's entire inventory is profile surfaces, so the compliant label has no obvious home on an avatar or bio link | [31], published 2019-11, retrieved 2026-09-16 |
| US, FinCEN | Accepting and transmitting value that substitutes for currency is money transmission; treatment turns on whether the operator controls the funds | Custodial escrow implies MSB registration; non-custodial program escrow is the opposite reading. Which applies to OXAR: Not found | [32], 2019-05-09 |
| US, state money transmitter law | Per-state licensing, no federal preemption | Cost and timeline of a 50-state programme: Not found | Follows from FinCEN row, no single published source |
| US, GENIUS Act | OXAR issues no stablecoin, so it is a taker of rails, not a licensee | Effective the earlier of 2027-01-18 or 120 days after final rules; from 2028-07-18 digital asset service providers may not offer stablecoins to US persons unless the issuer is licensed | [33], 2026-08-17, comments due 2026-10-19 |
| US, market structure | No statute classifies a crypto escrow marketplace | Cloture on the CLARITY Act failed 49-50 on 2026-09-15, leaving agency guidance and state law | [34], 2026-09-15 |
| EU, MiCA (Reg. 2023/1114) | "Custody and administration of crypto-assets on behalf of clients" and "transfer services for crypto-assets on behalf of clients" are crypto-asset services requiring CASP authorisation | Custodial USDC escrow for EU users needs authorisation. Non-custodial release may fall outside, which is exactly the question below | [35], 2023-05-31 |
| EU, MiCA marketing rules | A placement bought by a token offeror is a marketing communication: fair, clear, not misleading, consistent with the white paper | Buyer-side obligation OXAR inherits by hosting the listing | Same EUR-Lex text, Article 7 |
| EU, consumer law (planned) | Digital Fairness Act, expected Q3 2026, targets influencer disclosure | Draft text published as of 2026-09-16: Not found | [36], 2026-07-06 |
| UK, s.21 FSMA | A UK-facing placement promoting a token is a financial promotion, in scope since 2023-10-08 | Needs an authorised communicator or approver; breach is criminal, "up to 2 years imprisonment, an unlimited fine, or both" | [37], page updated 2026-02-06 |
| X platform rules (contract, not law) | Paid placement policy sits with the gatekeeper, not a regulator | Kaito shut Yaps on 2026-01-15 after X revoked API access for apps rewarding posting (market map) | Carried from Market Landscape Map |

### What changed

MiCA's national transitional regimes ended on 2026-07-01, with 2026-04-17 confirmation from [38]. An EU-facing custodial escrow now needs authorisation from day one, with no grandfathering to lean on. The CLARITY Act died procedurally on 2026-09-15, so classification stays with agencies and state regulators for the rest of 2026. Treasury opened GENIUS Act rulemaking on 2026-08-17; OXAR issues nothing, so the near-term effect is only on which stablecoin it may accept.

### The question to answer before launch

Does OXAR ever control the escrowed USDC? If a key held by OXAR releases funds, the FinCEN test for accepting and transmitting value on behalf of others is in play, and federal MSB registration plus state licensing follow. If release runs on program logic against a verification both parties agreed to, with no OXAR key, the opposite reading is available and the EU CASP analysis changes with it. That single fact decides whether a 10% seller take on a $400 spot-month is a marketplace fee or a regulated payments business. It cannot be resolved by reading; it needs an opinion on the actual key layout in the deployed program.

Needs a professional legal opinion, in this order: custody status of the escrow program under FinCEN and state law; whether the same design triggers CASP authorisation in the EU; who carries the FTC disclosure duty when the ad is an avatar with no caption; whether OXAR can accept UK-facing token placements without an authorised approver.

## Gap Analysis

### Gap 1: Release depends on a buyer's opinion, not on whether the spot stood

| Dimension | Detail |
|---|---|
| Evidence | Collabstr releases funds on brand approval inside a 48-hour review window (CreatorStackClub, verified 2026-06-11); Passionfroot is invoice-based at 5% self-sourced, 15% network, plus a 2% buyer fee (CreatorStackClub, 2026-06-13); DM deals have no escrow at all. ZachXBT found ~160 of 200+ solicited crypto influencers accepted paid promo, fewer than 5 labeled the post (The Block, 2025-09-01) |
| Who suffers | Buyers, who cannot prove what they bought; sellers, whose payment waits on a subjective approval (41% of creators name payment delays their top pain point, Influencer.com/Crowd DNA, March 2025, source page returned HTTP 403 on 2026-09-16, unverified) |
| Why incumbents haven't | They sell content deliverables. Whether a video meets a brief needs a human; there is no machine-checkable object to condition release on. Rebuilding around spot-time would narrow their own inventory |
| Fit | Direct. The release condition is a public profile state, which a script reads |

Collabstr's 4.5/5 across 465 reviews (Trustpilot, retrieved 2026-09-16) says the incumbent is not failing at its own job, just a different one. Cost never kept anyone out: one lookup a day across a 30-day booking costs $0.0054 (twitterapi.io, $0.18 per 1,000 lookups, retrieved 2026-09-16). The object being sold did.

### Gap 2: No posted price for one banner for one week

| Dimension | Detail |
|---|---|
| Evidence | Headr.io publishes no fee ([2] returned 404, 2026-09-16) and quotes only creator earnings of "$50 and $500 weekly". RentMyHeader prices in views: 150k+, 400k+, 1M+ (retrieved 2026-09-16). Coinzilla publishes no rate (retrieved 2026-09-16) |
| Who suffers | Sellers renegotiating every deal; buyers who cannot compare two headers |
| Why incumbents haven't | Opacity is the agency spread. A posted rate card commoditises the brokerage RentMyHeader charges for, and Headr.io has not been forced to publish |
| Fit | Partial. OXAR's 10% seller / 0% buyer split is published, but the price level it charges against is not posted anywhere, including by the two direct competitors |

The $400 gross spot-month in the sizing is inferred from Headr.io's self-reported creator earnings, not read off a rate card. Publishing a real one is the cheapest asset OXAR can build and the first thing a competitor can copy.

### Gap 3: Sellers below every incumbent's minimum ticket

| Dimension | Detail |
|---|---|
| Evidence | Blockchain-Ads requires a $1,000/mo minimum budget (ChainAware, 2026); Insense plans run $400-$800/mo; Collabstr charges $299-$399/mo to cut its fee to 5% (CreatorStackClub, 2026-06-11); IZEA retired self-serve Shake in 2025 and posted Q2 2026 revenue of $5.8M, down 36% YoY (Storika, 2026) |
| Who suffers | Accounts with one sellable surface and a $100-$500 price |
| Why incumbents haven't | The segment does not pay at their cost base. IZEA's 36% decline after retiring self-serve is the evidence, not a hypothesis |
| Fit | Contested by OXAR's own economics. 10% of $100 is $10 against a 30-minute onboarding call |

This gap is open partly because it is close to worthless. It clears only with self-serve onboarding or a median booking above roughly $500 [ASSUMPTION: manual onboarding at 30 minutes per seller, per the founder's stated first 20-30 sellers process].

### Gap 4: A fixed launch window cannot be bought as inventory

| Dimension | Detail |
|---|---|
| Evidence | X Ads sells feed impressions at $2.09 CPM and $0.74 CPC (Hootsuite first-party spend, 2025); HypeLab sells $3-$15 CPM standard and $20-$40 wallet-targeted (2026-03-03). Neither sells an individual's avatar, banner, pinned post or bio link for named dates |
| Who suffers | Teams that need visibility during a dated launch or event and arrange it by hand, one conversation at a time |
| Why incumbents haven't | Networks can only sell inventory they control. X does not own a user's avatar and cannot broker it; HypeLab and Blockchain-Ads sell publisher slots, not personal profile surfaces |
| Fit | Direct, and the date range is the product. Headr.io and RentMyHeader already sell here, so this is a contested gap, not an empty one |

### Gap 5: No dated record of who paid for which placement

| Dimension | Detail |
|---|---|
| Evidence | FTC: disclosures "are likely to be missed if they appear only on an ABOUT ME or profile page" and an intermediary "could be liable if you play a role in creating or disseminating endorsements" (FTC, retrieved 2026-09-16). Fewer than 5 of ~160 paid influencers disclosed (The Block, 2025-09-01). 51% of marketers have full visibility into creator payment (ANA, fielded 2025-10-01 to 2025-12-01, n=84) |
| Who suffers | Buyers carrying Section 5 exposure with no record; sellers with no defence |
| Why incumbents haven't | Logging is a cost with no revenue, and building it documents the intermediary role that creates the liability |
| Fit | Partial. OXAR's readable log is the record. Where a compliant label lives on an avatar with no caption is unresolved |

### Future gap 1: EU-facing escrow with no grandfathering

| Dimension | Detail |
|---|---|
| Trigger | MiCA national transitional regimes ended 2026-07-01 |
| Evidence trigger is real | ESMA statement confirming the end of transitional periods, 2026-04-17 [38], against Reg. 2023/1114, which lists custody and transfer of crypto-assets on behalf of clients as authorised services |
| Who gets hurt | Any operator holding keys over EU users' escrow. Headr.io describes its escrow as multi-sig (retrieved 2026-09-16), which reads as operator control |
| Start now | Deploy with no OXAR key, and get a written opinion on the actual key layout before holding the first buyer dollar. That one fact also decides the FinCEN MSB question |

### Future gap 2: Stablecoin choice becomes a licensing question

| Dimension | Detail |
|---|---|
| Trigger | GENIUS Act: effective the earlier of 2027-01-18 or 120 days after final rules; from 2028-07-18 digital asset service providers may not offer stablecoins to US persons unless the issuer is licensed |
| Evidence trigger is real | Treasury NPRM opened 2026-08-17, comments due 2026-10-19 [33] |
| Who gets hurt | Platforms quoting SOL or USDT to US buyers. Headr.io funds escrow in SOL, USDC or USDT (retrieved 2026-09-16) and would have to re-plumb |
| Start now | USDC-only settlement, already the product definition, plus a documented issuer-licence check per accepted asset |

The wedge is Gap 1, a present gap: release conditioned on standing time rather than buyer approval. That is a distribution and speed bet, not a capital one, and it is contested by a live competitor already escrowing USDC on Solana. The two future gaps are defensive positioning that costs a legal opinion, not a round. The number that decides whether the wedge is a business is median booking value, testable with the first 30 hand-onboarded sellers and no capital.

## Timing - Why Now

Nothing in the stack had to ship for this to be buildable. A profile read costs $0.00018 (twitterapi.io, $0.18 per 1,000 lookups, [20], retrieved 2026-09-16), so one check a day across a 30-day booking costs $0.0054. What moved in the last twelve months is who is funding this shape, who is already selling it, and what the gatekeeper will allow.

| Date | Event | What it changes | Source |
|---|---|---|---|
| 2025-09-01 | ~160 of 200+ solicited crypto influencers accepted paid promo, fewer than 5 labeled posts, paid into Solana wallets | Demand for profile placements is already settling in crypto rails, unpriced and unlogged | [3] |
| 2026-01-15 | X revoked API access for apps rewarding posting; Kaito shut Yaps | Paying for a post is closed; paying for a surface is a different policy surface, same gatekeeper | Market map, [14], 2026 |
| 2026-07-01 | MiCA national transitional regimes ended, no grandfathering | EU-facing custodial escrow needs CASP authorisation from day one; a no-key design is the cheaper entry | [38], 2026-04-17 |
| 2026-07-22 | Passionfroot raised $15M Series A (Insight Partners), $10M+ paid to creators in 18 months, revenue 13x YoY | Booking plus payments for creator slots is a funded category, in fiat | [13] |
| 2026-08-06 / 2026-08-27 | Phyllo $15M (RTP Global), Levanta $22M (Volition) | Capital for creator profile data and tracked-outcome attribution, the inputs and the rival pricing model | [26] |
| 2026-08-17 | Treasury opened GENIUS Act rulemaking, comments due 2026-10-19 | Fixes USDC-only settlement as the low-friction choice before the 2028-07-18 issuer-licence cutoff | [33] |
| 2026-09-16 | Headr.io and RentMyHeader both live, selling X profile surfaces; Headr.io escrows in SOL, USDC or USDT | The wedge is validated and contested at once. Launch dates for either: Not found | https://headr.io/, https://rentmyheader.com/, retrieved 2026-09-16 |

### The too-early read

| Reading | Evidence | What would flip it |
|---|---|---|
| Access, not cost, is the gate | Kaito lost X API access 2026-01-15 | A written X policy position on paid profile placements. Not found |
| Capital prices outcomes, not time | Agentio $40M at $340M valuation, 2025-11-18 [25] | An impression proxy on profile surfaces, which no competitor publishes |
| Regulation did not clarify | CLARITY cloture failed 49-50, 2026-09-15 [34] | A custody opinion on the deployed program |
| Crypto funding is narrowing | Q1 2026 deal count down 45.9% YoY, $6.81B across 222 rounds ([29], 2026-08-20) | Revenue, not a round |
| Own position | Zero deals closed, 3 on the waitlist, marketplace skeleton since 2026-09-12 | Median booking above $500 across the first 30 sellers |

The timing argument is distribution, not infrastructure. That is a weaker why-now than a cost curve, because a competitor with the same rails can act on it in the same quarter.

## Opportunity Scorecard

Scored 1-10, where 10 is most favourable to OXAR. Evidence is carried from the sections above.

| Criterion | Score | Justification |
|---|---|---|
| Market size | 4 | SOM $1.15M ARR at year three on $11.5M GMV, against a SAM of $23.0M whose two largest inputs (0.20 spot-time share, 0.05 capture) have no published support; TAM anchor $1.15B (MarketsandMarkets, 2026) but sources disagree 23.9x, so the category has no defended number |
| Competition intensity | 3 | Headr.io sells the identical wedge and already escrows in SOL, USDC or USDT (retrieved 2026-09-16); RentMyHeader sells the same surfaces on view guarantees; Passionfroot holds $21M and 13x YoY revenue (TechCrunch, 2026-07-22) against OXAR's zero deals and 3 waitlist signups |
| Technical feasibility (MVP under 3 months) | 9 | Marketplace skeleton has run since 2026-09-12; verification costs $0.0054 per 30-day booking at $0.18 per 1,000 lookups (twitterapi.io, retrieved 2026-09-16). Gate is X API policy, not build time (Kaito lost access 2026-01-15) |
| Business model clarity (no token) | 5 | 10% seller take, 0% buyer, no token. At the $400 inferred spot-month that is $40; at a $100 deal it is $10 against a 30-minute onboarding call, and it sits above Passionfroot's 5% self-sourced rate |
| Regulatory risk | 4 | Custody status of the escrow under FinCEN is Not found and decides MSB plus state licensing; MiCA transitional regimes ended 2026-07-01 with no grandfathering (ESMA, 2026-04-17); FTC says profile-page disclosure is "likely to be missed" |
| Timing | 5 | Funded shape confirmed (Passionfroot, Phyllo, Levanta, 2026) but capital prices tracked outcomes, crypto deal count fell 45.9% YoY in Q1 2026 (FinanceFeeds, 2026-08-20), and the why-now is distribution, copyable within a quarter |

**Verdict: pursue with changes.** The release condition, standing time checked against a public profile rather than buyer approval, is real and defensible, and it is the only part no incumbent can adopt without narrowing its own inventory. Everything else is weak. The wedge is already occupied, the sizing rests on two invented fractions, and a 10% take on a $100 deal does not pay for the hand-onboarding the founder is doing. Three changes make it worth continuing: deploy escrow with no OXAR key and get a custody opinion before holding a buyer dollar; publish a per-spot, per-week rate card, which no competitor including Headr.io has done; and move onboarding to self-serve or hold median booking above $500.

What flips this to drop: the first 30 hand-onboarded sellers produce a median booking under $500 with no self-serve path, or repeat bookings land well under the 43% sponsor repeat benchmark (Influencer Advisory, 2026), or X issues a policy position closing paid profile placements the way it closed paid posting on 2026-01-15. What flips it to pursue: median booking above $500 with occupancy above 30%, both measurable within 90 days and without capital.

## Risks & Open Questions

The table carries three things the founder should not confuse: risks that need a decision, risks that need a test, and claims this research could not verify. Every sizing input marked `assumption` above appears here as an open question, not a fact.

| Item | Kind | Severity | Cheapest way to retire it |
|---|---|---|---|
| Does OXAR ever hold a key that can move escrowed USDC | Legal | High: decides whether the 10% take is a marketplace fee or a regulated payments business under FinCEN FIN-2019-G001 (2019-05-09) | Deploy the program with no OXAR-held key, then buy one written custody opinion on the deployed key layout before the first buyer dollar enters escrow |
| MiCA CASP authorisation for EU buyers and sellers | Legal | High: national transitional regimes ended 2026-07-01 with no grandfathering (ESMA, 2026-04-17) | Country check at signup that blocks EU users until the same custody opinion covers custody and transfer services under Reg. 2023/1114 |
| FTC disclosure has no obvious home on an avatar or a bio link | Legal | High: profile-page-only disclosure is "likely to be missed" and an intermediary "could be liable if you play a role in creating or disseminating endorsements" (FTC, retrieved 2026-09-16) | Make a disclosure string a required listing field, render it in the seller's bio or pinned text for the booked window, and verify it in the same automated read as the placement |
| UK s.21 FSMA financial promotion exposure on token placements | Legal | Medium: breach carries "up to 2 years imprisonment, an unlimited fine, or both" (FCA, page updated 2026-02-06) | Flag token-issuer buyers at checkout and block UK-facing listings from them until an authorised s.21 approver is retained |
| State money transmitter licensing cost and timeline: Not found | Legal | Medium, unquantified | Ask the same counsel for a one-page applicability read conditional on the custody answer; do not start a 50-state programme before it |
| GENIUS Act issuer-licence cutoff 2028-07-18 (Treasury NPRM, 2026-08-17, comments due 2026-10-19) | Legal | Low today: OXAR issues no stablecoin | Settle USDC-only, already the product definition, and record an issuer-licence check per accepted asset |
| EU Digital Fairness Act influencer disclosure text: Not found as of 2026-09-16 | Legal / open question | Low now, Medium if it lands as expected in Q3 2026 | Watch the Commission consultation page, no build work until draft text exists |
| X could withdraw API access, as it did for Kaito on 2026-01-15; a written X policy on paid profile placements is Not found | Technical | High: the entire release condition depends on one gatekeeper | Send X a written policy question and keep the reply; read in parallel via twitterapi.io ($0.18 per 1,000 lookups, retrieved 2026-09-16) and the official API so one revocation is not fatal |
| Placement spoofing: avatar swapped between checks, image cropped or altered, banner restored near a predictable check time | Technical | High: the checked state is the product | Randomise check times, store a perceptual hash plus the raw image per check, and publish the cadence in the booking terms so a gap is a breach both sides can read |
| Escrow program has no third-party audit and the venture is unfunded | Technical | High | Cap per-booking value for the first cohort, keep the program minimal (deposit, time-based release, refund), and take a free or community review before exceeding the cap |
| Who signs the verification result the program acts on | Technical | Medium: if OXAR signs, it is a trusted oracle, which pulls back to the custody question in row 1 | Publish checker output and inputs to a log both sides can read from day one, and state in the terms that a disputed check resolves against the stored images |
| Partial standing arithmetic, for example a placement up 11 of 30 booked days | Technical / operational | Medium | Write the pro-rata rule into the listing terms in days before launch, then reconcile it by hand against the first 10 bookings |
| Both sides move to DMs after the first deal (founder's open question) | Operational | High: removes the take rate without removing the need | Track second bookings across the first 30 hand-onboarded sellers; the 43% sponsor repeat rate (Influencer Advisory, 2026) is the only external benchmark and it is YouTube data |
| 10% of a $100 deal is $10 against a 30-minute onboarding call [ASSUMPTION: 30 minutes per seller, per the founder's stated first 20-30 sellers process] | Operational | High: decides whether this is a business at the tier being onboarded | Set a minimum booking value, ship self-serve onboarding from seller 31 onward, and compare median booking value across the two cohorts |
| Cold start: zero deals closed, 3 people on the waitlist as of 2026-09-16 | Operational | High | Source buyers through the Colosseum Crypto World's Fair the venture is registered for, and pre-commit 5 buyers before onboarding seller 31 |
| Headr.io is live on the identical wedge and already escrows in SOL, USDC or USDT (retrieved 2026-09-16) | Operational | High: OXAR is not opening a category | Publish a per-spot, per-week rate card, which Headr.io has not ([2] returned 404 on 2026-09-16), and measure whether a posted price converts bookings |
| Are campaigns repeatable or one-off stunts (founder's open question) | Open question | High | Same cohort test, split by buyer: count buyers who book a second window within 90 days |
| Is a placement a signal or a performance channel when impressions cannot be measured (founder's open question) | Open question | High: decides whether the comparison is X Ads at $2.09 CPM (Hootsuite, 2025) or sponsorship budget | Ask the first 10 buyers what they would have spent the money on instead, and offer an optional impression proxy from the seller's own analytics on 5 bookings |
| Spot-time share of platform fees, set at 0.20, no published support | Assumption | High: swinging it to 0.10 or 0.40 moves SOM to $575K or $2.30M | Sample Headr.io's 10,000 self-reported listings for booked-versus-open calendar days across one fixed week, and count paid profile placements against paid posts in the same sample |
| Three-year seller capture, set at 0.05, no published comparable | Assumption | High: 0.02 or 0.10 moves SOM to $460K or $2.30M | Repeat-booking rate and DM leakage on the first 30 sellers |
| Occupancy behind 1.2 booked spot-months per seller per month: the 30% figure is invented | Assumption | High | Publish availability calendars and read own booked-versus-open days after 60 days live |
| $400 gross spot-month, inferred from Headr.io's self-reported "$50 and $500 weekly" creator earnings rather than a posted rate | Derived from an unverified input | High: the $40 fee and all revenue arithmetic move with it | Post per-spot, per-week prices with the first 30 sellers and read the median off cleared bookings |
| TAM range $1.15B (MarketsandMarkets, 2026) to $27.54B (Fortune Business Insights, 2026), 23.9x, unreconciled | Open question | Medium: it does not change the SOM, but the category has no defended number | Read both methodology pages; if neither reconciles, keep quoting the range and the low anchor rather than a point |
| X share of platform fees taken as 10% from a brand-count statistic (Influencer Marketing Hub, 2026); no X revenue breakout exists in any of the three reports | Open question | Medium | Not retirable from desk research, substitute own booking data once 30 sellers are live |
| Take rate, GMV, funding and launch dates for Headr.io and RentMyHeader: all Not found | Open question | Medium: the only two direct competitors | Book one placement on each as a buyer and read the fee off checkout |
| Headr.io's self-reported 10,000 X profiles and 500+ brands: no independent verification | Open question | Medium: the 40,000 reachable-seller cross-check leans on it | Scrape the public listing pages and count distinct profiles and booked days |
| Total dollar volume, deals per month, average banner or pinned-post booking duration, and dispute rate for X profile placements: all Not found | Open question | Medium | Nothing is published anywhere, so this becomes own data after 30 sellers |
| 41% of creators name payment delays their top pain point (Influencer.com / Crowd DNA, March 2025): source page returned HTTP 403 on 2026-09-16 | Open question | Low | Request the report from Influencer.com, or drop the figure from investor-facing material |
| Collabstr funding: bootstrapped with no VC (Early Stage Journal, 2026-03-12) against a $1M seed on the Crunchbase profile, 2026 | Open question | Low: changes no decision | Cite both readings or drop the row |
| Median negotiated rate of $500 at 10K-50K followers rests on 14 YouTube creators, not X (Influencer Advisory, 2026) | Open question | Medium: it is the only external cross-check on the $400 spot-month | Replace with own median once the first 10 bookings clear |
| Funding and traction for Insense, HypeLab, Blockchain-Ads and Coinzilla: Not found | Open question | Low: none is a direct competitor | Leave as Not found |

## Sources

1. [headr.io](https://headr.io/)
2. [headr.io](https://headr.io/pricing)
3. [theblock.co](https://www.theblock.co/post/368956/zachxbt-says-over-100-crypto-influencers-accepted-promo-deals-without-disclosing-paid-ads)
4. [marketingdive.com](https://www.marketingdive.com/news/influencer-pay-lacks-transparency-heres-what-the-numbers-say/813822/)
5. [creatorstackclub.com](https://www.creatorstackclub.com/software/collabstr)
6. [creatorstackclub.com](https://www.creatorstackclub.com/software/passionfroot)
7. [hypeauditor.com](https://hypeauditor.com/state-of-influencer-marketing-2025/)
8. [influencermarketinghub.com](https://influencermarketinghub.com/influencer-rates/)
9. [influenceradvisory.com](https://influenceradvisory.com/blog/brand-deals/)
10. [trustpilot.com](https://www.trustpilot.com/review/collabstr.com)
11. [rentmyheader.com](https://rentmyheader.com/)
12. [earlystagejournal.com](https://www.earlystagejournal.com/p/vancouver-collabstr-largest-influencer-marketplace)
13. [techcrunch.com](https://techcrunch.com/2026/07/22/passionfroot-raises-15m-to-expand-its-b2b-creator-marketplace-to-the-us/)
14. [coingecko.com](https://www.coingecko.com/learn/what-is-kaito-earn-yap-points)
15. [storika.ai](https://www.storika.ai/guides/influencer-marketing-platform-pricing-2026)
16. [blog.hootsuite.com](https://blog.hootsuite.com/twitter-ads/)
17. [hypelab.com](https://www.hypelab.com/blog/crypto-advertising-benchmarks-2026)
18. [chainaware.ai](https://chainaware.ai/blog/best-crypto-advertising-networks/)
19. [coinzilla.com](https://coinzilla.com/)
20. [twitterapi.io](https://twitterapi.io/pricing)
21. [docs.x.com](https://docs.x.com/x-api/introduction)
22. [postproxy.dev](https://postproxy.dev/blog/x-api-pricing-2026/)
23. [MarketsandMarkets](https://www.marketsandmarkets.com/Market-Reports/influencer-marketing-platform-market-294138.html)
24. [Fortune Business Insights](https://www.fortunebusinessinsights.com/influencer-marketing-platform-market-108880)
25. [TechCrunch](https://techcrunch.com/2025/11/18/agentio-secures-40m-from-forerunner-as-it-scales-its-creator-marketplace-beyond-youtube/)
26. [New Market Pitch](https://newmarketpitch.com/blogs/news/creator-economy-funding-news)
27. [ContentGrip](https://www.contentgrip.com/notable-influencer-marketing-funding-rounds-and-acquisitions/)
28. [The Block](https://www.theblock.co/post/385454/paradigm-leads-7-1-million-seed-round-for-attention-market-noise-ahead-of-base-mainnet-launch)
29. [FinanceFeeds](https://financefeeds.com/crypto-funding-and-fundraising/)
30. [FTC](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking)
31. [FTC Disclosures 101](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers)
32. [FIN-2019-G001](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models)
33. [Treasury NPRM](https://home.treasury.gov/news/press-releases/sb0605)
34. [CoinDesk](https://www.coindesk.com/policy/2026/09/15/crypto-clarity-act-flames-out-in-failed-u-s-senate-vote)
35. [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2023/1114/oj)
36. [EU Perspectives](https://euperspectives.eu/2026/07/civil-society-urge-commission-to-expand-influencer-maketing-rules/)
37. [FCA](https://www.fca.org.uk/firms/cryptoassets/marketing-uk-consumers)
38. [ESMA](https://www.esma.europa.eu/sites/default/files/2026-04/ESMA75-113276571-1679_Statement_on_the_end_of_transitional_periods_under_MiCA.pdf)

