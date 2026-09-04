---
title: Peach Finder — Business Requirements Document
updated: 2026-08-20
---

# Business Requirements Document (BRD)

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Business Requirements Document |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Status | Living document — updated in place as decisions evolve; see repo history for change record |

---

## 2. Executive Summary

Peach Finder is a people discovery platform. The product vision is **the best people discovery platform** — but V1 is deliberately narrow, not a scaled-down version of a broad marketplace.

**V1 launch vertical: massage therapists only.** No other service category launches alongside it, and V1 is not architected to generalize to future verticals — if Peach Finder expands into other categories later, the engineering team will extend or rebuild the platform for that need rather than the current design carrying that requirement now.

**V1's principal proposition has three parts:**
1. **Real-time availability** — the platform tells a seeker who is available *right now*, not just who exists in a directory.
2. **Strong profiles** — a provider profile is rich enough to build confidence without a prior phone call.
3. **Visible trust signals** — a small, credible set of trust badges rather than a sprawling verification system.

The homepage answers one question immediately: **"Who is available now?"** — showing therapists who have indicated their availability, most-recently-indicated first. The same availability-first ordering applies inside filtered search results, not just the homepage.

Providers pay to be listed and to be featured (highlighted placement). Payment for the massage session itself happens **outside** the platform — Peach Finder is a discovery and connection layer, not a payments processor for service fees. Providers are given a configurable free period during which they can be listed at no charge before the listing fee applies.

V1 is **incall only**: seekers visit the therapist's location. There is no outcall/mobile (in-home visit) model in V1, which keeps the safety and liability profile narrower than a platform that also arranges in-home visits.

---

## 3. Problem Statement

Finding an available, trustworthy massage therapist today is slow and low-confidence:

- Directory-style listings are dense, static, and rank by who paid rather than who's actually available or the best match.
- Users can't tell who is actually available *right now* — availability is the single biggest gap in existing directories. Seekers may *ask* in weekend/tonight language; V1 answers with present-tense "available now" only (see §13).
- There's no consistent, lightweight trust signal across providers — verification and recent activity are scattered or absent.
- Providers have limited visibility into how they're being found.

Peach Finder solves this by making real-time availability the primary signal, trust a small set of visible badges, and profiles rich enough to replace an initial phone call.

---

## 4. Business Objectives & Success Metrics

| Objective | Success Metric |
|---|---|
| Seekers find an available therapist fast | Median time from homepage/search to a contact action (Message or Call) |
| Availability drives engagement | % of contact actions initiated from a profile showing "available now" |
| Trust drives conversion | Contact rate for verified vs. unverified profiles |
| Providers see platform value and stay listed | Provider renewal rate past the free listing period; featured-placement upsell rate |
| Providers understand how they're found | % of providers who view their analytics monthly |
| Mobile experience is the primary surface | % of sessions on mobile; mobile search-to-contact conversion rate |

---

## 5. Target Users & Personas

### 5.1 Seekers (demand side)
People looking for a massage therapist who is available now or soon, and willing to travel to the therapist's location. Primarily mobile.

### 5.2 Providers (supply side)
Individual massage therapists. V1 targets independent practitioners, not spas or multi-therapist businesses listing several staff under one profile. Providers build a profile, indicate real-time availability, and pay to be listed/featured.

### 5.3 Platform Admin
Internal team responsible for manual identity-badge review, reactive content moderation, report handling, and platform configuration. Profiles are never pre-approved: providers publish instantly; the only admin-review workflow is identity-badge granting (BR-10), which gates the badge, never the listing.

---

## 6. Scope

### 6.1 In Scope — V1

- Single vertical: massage therapists, incall only (seeker travels to the therapist's location).
- Real-time "available now" signal, provider-set, surfacing on the homepage and within filtered search results with the most-recently-indicated availability first.
- Natural-language search translated into structured filters, plus manual filters (price, languages, rating, verified status).
- Provider profiles: photo gallery, short introduction, services offered, tags for services offered, languages spoken, reviews, response time ("usually replies within 30 minutes"), online status, and contact actions (Message and Call).
- Provider-configurable visibility of their contact phone number to seekers who don't have a platform account.
- Messaging (requires a seeker account) for arranging a booking time directly with a provider — no dedicated booking calendar or time-slot system.
- Trust badges: identity verified, active this week.
- Reporting and blocking between seekers and providers.
- Reviews and ratings.
- Provider analytics dashboard (profile views, search appearances, contact requests, most-searched services).
- Provider monetization: paid listing, paid featured placement, and a configurable free trial listing period.
- Mobile-first responsive web experience.

### 6.2 Explicitly Out of Scope — V1

- Outcall/mobile (in-home) visits — V1 is incall only.
- A booking calendar or any time-slot management/scheduling system — booking time is arranged via messaging.
- A personalized recommendations engine.
- Processing payment for the massage session itself.
- Third-party identity or background-check vendor integration.
- Any vertical other than massage therapists, and any generalized data model built to support future verticals.
- Native mobile apps (iOS/Android).
- Multi-language UI (localization).

---

## 7. Business Requirements

### 7.1 Availability & Discovery
- **BR-1:** Providers can indicate they are "available now" (a real-time status with a timestamp), and can clear that status.
- **BR-2:** The homepage's default view surfaces providers who have indicated availability, most-recently-indicated first.
- **BR-3:** Filtered search results support the same availability-recency ordering — availability is not homepage-only.
- **BR-4:** Users can search using natural free-text queries (e.g., "massage therapist available now," "deep tissue massage near me") that the system translates into structured filters.
- **BR-5:** Users can filter results by price, languages spoken, rating, and verified status.

### 7.2 Provider Profiles
- **BR-6:** Each provider profile includes: photo gallery, short introduction, services offered, tags for services offered, languages spoken, reviews, response time, online status, and contact actions (Message and Call).
- **BR-7:** Profiles function as a mini landing page sufficient for a seeker to decide to make contact without needing a prior phone call.
- **BR-8:** Each provider can configure whether their contact phone number is visible to seekers who do not have a platform account.

### 7.3 Trust & Safety
- **BR-9:** The platform displays exactly two trust badges: identity verified, and active this week.
- **BR-10:** Identity verification is provider-submitted (self-attested) with manual admin review and approval before the badge is granted. No third-party verification vendor in V1.
- **BR-11:** "Active this week" is computed from recent provider activity (e.g., login, availability updates) — no manual review required.
- **BR-12:** Seekers and providers can report or block one another; reports reach platform admin for review.

### 7.4 Messaging & Booking
- **BR-13:** Seekers with an account can message a provider and arrange a booking time within the conversation. There is no platform-managed booking calendar or slot system — the platform does not track or prevent scheduling conflicts.
- **BR-14:** Seekers without an account can view profiles and search results; whether they can contact a provider directly by phone depends on that provider's phone-visibility setting (BR-8). Messaging itself requires an account.
- **BR-15:** The system tracks and displays provider response time.

### 7.5 Reviews
- **BR-16:** Seekers can leave a rating and review after an engagement; reviews are visible on the provider profile and usable as a search filter.

### 7.6 Provider Analytics
- **BR-17:** Providers can view a dashboard covering: profile views, search appearances, contact requests, and most-searched services.

### 7.7 Monetization
- **BR-18:** Providers pay a listing fee to be discoverable in search and on the homepage.
- **BR-19:** New providers get a configurable free period (platform-wide default, admin-adjustable) during which they are listed without charge.
- **BR-20:** Providers can pay an additional fee for featured/highlighted placement in search results.
- **BR-21:** Payment for the massage session between seeker and provider happens outside the platform — Peach Finder does not process or take a cut of service fees.

### 7.8 Mobile Experience
- **BR-22:** The experience is designed mobile-first: large profile cards, a sticky search bar, fast filters, and quick contact/messaging actions.

### 7.9 Design & Performance
- **BR-23:** The visual design uses large photography, generous whitespace, consistent typography, clear visual hierarchy, and an accessible color palette.
- **BR-24:** The platform must feel fast: quick page loads, instant search suggestions, and effective caching.

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Fast page loads and instant search suggestions on mobile networks |
| Accessibility | Accessible color palette and interaction patterns (WCAG considerations to be detailed downstream) |
| Responsiveness | Fully responsive across phone, tablet, desktop, mobile-first |
| Trust & Safety | Manual admin review workflow must prevent an unreviewed identity badge from displaying; report/block actions must be reachable from any profile or conversation in one or two taps |
| Privacy | A provider's contact phone number must only be visible to account-less seekers when that provider has explicitly enabled it (BR-8) |

---

## 9. Assumptions

- V1 targets independent massage therapists, not spas or multi-therapist businesses listing several practitioners under one profile.
- A manually-reviewed "identity verified" badge plus an activity-based "active this week" badge are an acceptable trust signal set for launch.
- Anonymous browsing and search are allowed; messaging requires a seeker account.
- Providers manage their own real-world schedule outside the platform — "available now" is a status signal, not a scheduling system, so the platform is not responsible for preventing double-bookings.

## 10. Constraints

- No payment processing for the massage session itself is part of the system — this is a firm product decision, not a technical limitation to design around.
- Manual admin review is a real operational dependency — identity-badge turnaround time is bounded by admin team capacity, not automation.
- No third-party ID/background-check vendor in V1.
- Launch market is South Africa; POPIA is the governing privacy regime (owner-confirmed 2026-07-22; see SRS D-6).
- Moderation of profiles is a human function with no system gating: no pre-publication approval, no automated content filter that blocks publishing. The identity-badge workflow (BR-10) is the sole approval path and gates only the badge.

---

## 11. Risks & Open Questions

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Third-party ID verification vendor | Open — deferred past V1 | Revisit if provider or contact volume grows, or if incidents suggest self-attestation plus manual review is insufficient. |
| 2 | Manual review scaling | Open | Admin-reviewed verification may not scale past initial launch volume. FR-ADM-09 / US-ADMIN-08 give visibility only. |
| 3 | Regulatory/licensing capture | Open — deferred | Massage therapy is a licensed profession in many jurisdictions; V1's "identity verified" badge does not capture license number or jurisdiction. |
| 4 | Featured-placement fairness | **Resolved in FRS** (FR-SRCH-08, 2026-07-22) | Every featured card carries a clear, always-visible "Featured" label; featuring never outranks availability-first ordering. |
| 5 | Dispute handling | Open | No process defined for booking disagreements or no-shows, since both scheduling and payment happen outside the platform's control. |
| 6 | Free-listing-period abuse | **Resolved in FRS** (FR-MONET-03, 2026-07-22) | One free period per OTP-verified phone number; re-registration resumes billing state rather than granting a new trial. Not tied to the identity badge, so signup does not force the manual review queue. |
| 7 | No scheduling conflict prevention | Open — monitor post-launch | Because there is no booking calendar, a provider could double-book outside the platform; seeker frustration from this should be monitored post-launch. |

---

## 12. Glossary

| Term | Definition |
|---|---|
| Seeker | A user searching for and contacting a provider |
| Provider | A massage therapist listed on the platform |
| Available now | A real-time, provider-set status (with timestamp) that determines homepage and search ordering |
| Featured/Highlighted | Paid placement boosting a provider's visibility in search results |
| Verified | The "identity verified" badge, granted after admin review of a provider-submitted identity claim |

---

## 13. Appendix — Example Search Queries (V1)

- "Massage therapist available now"
- "Deep tissue massage near me"
- "Massage therapist available tonight" — V1 maps colloquial future phrasing to present-tense **available now** (FR-AVAIL-08); there is no tonight/weekend schedule
- "Highly rated massage therapist"
- "Massage therapist who speaks Zulu"
