---
title: Peach Finder — Functional Requirements Specification
updated: 2026-08-20
---

# Functional Requirements Specification (FRS)

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Functional Requirements Specification |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `documentation/00-business-requirements/brd.md` (canonical BRD) |
| Status | Living document — updated in place as decisions evolve; see repo history for change record |

**Requirement ID convention:** `FR-<MODULE>-<NN>`. Priorities follow MoSCoW: **M** (Must have for V1 launch), **S** (Should have — launch-window, may slip days not weeks), **C** (Could have — first fast-follow), **W** (Won't have in V1 — recorded to prevent scope creep).

**Scope reminder (from BRD §6):** single vertical — independent massage therapists, incall only. No booking calendar, no recommendations engine, no service-fee payment processing, no third-party verification vendor, no native apps, no localization, no multi-vertical data model.

**Moderation stance (product decision, 2026-07-22):** moderation of profiles is a **human function with no system gating**. No requirement in this document may introduce a pre-publication approval step, an automated content filter that blocks publishing, or any system gate between a provider editing their profile and that profile being live. All moderation is reactive and human-performed (see §10). The only admin-review workflow in the product is identity-badge granting (BR-10), which gates the *badge*, never the *profile*.

---

## 2. Actors

| Actor | Description |
|---|---|
| Anonymous seeker | Not signed in. Can browse, search, and view profiles. Can phone a provider only where that provider has enabled phone visibility (BR-8). Cannot message, review, report, or block. |
| Seeker | Signed-in demand-side user. Everything the anonymous seeker can do, plus messaging, reviews, reporting, and blocking. |
| Provider | Signed-in independent massage therapist with a listing. Manages profile, availability, phone visibility, and billing; views analytics; can report and block seekers. |
| Admin | Internal platform team. Reviews identity submissions, handles reports, performs reactive moderation, configures the free listing period and platform settings. |
| System | Automated behavior: badge computation, search ranking, response-time calculation, notifications, billing lifecycle. |

---

## 3. Module Map

| Module | Prefix | Covers BRD |
|---|---|---|
| Accounts & Identity | ACC | §5, BR-14 |
| Availability | AVAIL | BR-1, BR-2, BR-3, BR-11 |
| Search & Discovery | SRCH | BR-2..BR-5, BR-20, BR-24 |
| Provider Profiles | PROF | BR-6, BR-7, BR-8 |
| Messaging | MSG | BR-13, BR-14, BR-15 |
| Reviews & Ratings | REV | BR-16 |
| Trust & Safety | TRUST | BR-9..BR-12 |
| Moderation & Admin | ADM | BR-10, BR-12, BR-19, §5.3 |
| Provider Analytics | ANLY | BR-17 |
| Monetization & Billing | MONET | BR-18..BR-21 |
| Notifications | NOTIF | supports BR-13, BR-15, BR-10 |
| UX, Performance & Accessibility | UX | BR-22, BR-23, BR-24 |
| Privacy & Data | PRIV | BR-8, NFR-Privacy |

---

## 4. Accounts & Identity (ACC)

- **FR-ACC-01 (M):** Anonymous users can browse the homepage, run searches, apply filters, and view full provider profiles without an account. No feature in this document may put search or profile viewing behind a login wall.
- **FR-ACC-02 (M):** A user can register a **seeker account** with email + password or a supported social/OAuth sign-in, with email verification before the account can send messages.
- **FR-ACC-03 (M):** A user can register a **provider account**. Provider registration captures, at minimum: display name, mobile phone number (verified via OTP), and general service location (see FR-PROF-04). Completing registration creates a draft profile the provider then fills in.
- **FR-ACC-04 (M):** A provider's profile is **published by the provider themself** the moment they choose to publish it and the minimum profile fields (FR-PROF-02) are complete. There is no admin approval step, review queue, or automated content check between "publish" and "live." *(Moderation stance, §1.)*
- **FR-ACC-05 (M):** When an anonymous seeker attempts an account-gated action (message, review, report, block), the system prompts sign-in/sign-up and, on success, returns them to complete the original action in place — the context (e.g., the profile they were on, the message they started composing) is not lost.
- **FR-ACC-06 (M):** Users can reset their password via a time-limited emailed link, and can change email, phone, and password from account settings (re-authentication required for each).
- **FR-ACC-07 (M):** A user can delete their own account. Provider deletion immediately unpublishes the profile. Message threads the user participated in remain visible to the other party with the deleted user shown as "Deleted account"; reviews left by a deleted seeker remain but are attributed to "Former user." Personal data handling on deletion follows FR-PRIV-03.
- **FR-ACC-08 (S):** A person can hold both roles (seek massages and provide them) under one login with an explicit role switch; the two roles' data (messages, reviews, analytics) are kept separate in the UI.
- **FR-ACC-09 (M):** Sessions persist across visits on the same device ("keep me signed in" by default on personal devices, with explicit sign-out available everywhere).

---

## 5. Availability (AVAIL)

The availability signal is the product's principal proposition (BRD §2). It is a provider-set status, not a calendar.

- **FR-AVAIL-01 (M):** A provider can set an **"Available now"** status with a single tap from their dashboard and from a persistent control on their own profile view (mobile-first: reachable within one screen of opening the app as a signed-in provider). The system records the timestamp each time the status is set or re-set.
- **FR-AVAIL-02 (M):** A provider can clear their "Available now" status with a single tap at any time.
- **FR-AVAIL-03 (M):** "Available now" **auto-expires** after a platform-configurable duration (default: 4 hours) so stale availability never misleads seekers. The provider is notified shortly before expiry (default: 15 minutes) with a one-tap "still available" renewal that refreshes the timestamp. *(FRS-level addition — the BRD defines the status and timestamp; auto-expiry protects the signal's credibility. Duration is admin-configurable, FR-ADM-06.)*
- **FR-AVAIL-04 (M):** Re-setting or renewing an already-active status updates its timestamp, which moves the provider up in availability-recency ordering (FR-SRCH-03).
- **FR-AVAIL-05 (M):** The profile card and profile page show the availability state with recency phrasing (e.g., "Available now — updated 12 min ago"). Providers not currently available show no negative marker — absence of the signal is neutral, not a demerit.
- **FR-AVAIL-06 (M):** The system computes the **"Active this week"** signal automatically from provider activity in the trailing 7 days — any of: sign-in, availability set/renewed, profile edit, or message sent. No manual review is involved (BR-11). The badge appears and disappears purely by computation (see FR-TRUST-06).
- **FR-AVAIL-07 (S):** A provider can see, on their own dashboard, exactly why they do or don't currently carry "Active this week" and when their "Available now" status will expire — the signals must never be a black box to the provider they describe.
- **FR-AVAIL-08 (W):** No weekly schedules, future time slots, "available from 6 pm," or any forward-looking availability in V1 — availability is strictly a present-tense status. *(Guards BRD out-of-scope: no booking calendar.)*

---

## 6. Search & Discovery (SRCH)

- **FR-SRCH-01 (M):** The **homepage default view** is the answer to "Who is available now?": a feed of published providers who currently hold "Available now," ordered most-recently-indicated first (BR-2). Below the available cohort, **remaining published providers always appear** (not only when the available cohort is empty), ordered by "Active this week" recency, so the page is never empty when nobody is available.
- **FR-SRCH-02 (M):** A **sticky search bar** (persistent while scrolling, BR-22) accepts free-text natural-language queries. The system translates the query into structured filters covering, at minimum, these recognizable intents: availability ("available now," "available tonight"), service/technique terms ("deep tissue," "sports massage"), rating ("highly rated"), language ("speaks Zulu"), verification ("verified"), and proximity ("near me"). The BRD §13 example queries are the acceptance set: each must resolve to a sensible filtered result. Colloquial future phrasing ("tonight", "this weekend") maps to present-tense **available now** — V1 has no forward-looking availability (FR-AVAIL-08; discovery LLD §5.5).
- **FR-SRCH-03 (M):** Within any search result set, providers holding "Available now" rank above those who don't, ordered by availability recency; the rest follow, ordered by relevance to the query. Availability-first ordering applies to filtered results, not just the homepage (BR-3).
- **FR-SRCH-04 (M):** Users can apply **manual filters**: price range, languages spoken, minimum rating, and verified status (BR-5). Filters combine with each other and with a natural-language query, are applied without a full page reload, and active filters are visible and individually removable.
- **FR-SRCH-05 (M):** The natural-language translation is **transparent**: the structured filters derived from a query are displayed as the same removable filter chips as manual filters, so the user can see and correct the system's interpretation.
- **FR-SRCH-06 (M):** Search supports proximity: "near me" uses device location (with permission prompt; graceful fallback to a manually-entered area when denied) and matches against providers' general service location (FR-PROF-04). Results can be ordered or filtered by distance to the provider's stated area — never to an exact address.
- **FR-SRCH-07 (M):** Search suggestions appear as the user types, feeling instant (BR-24; latency budget in FR-UX-02) — suggesting service terms, areas, and recognized filter intents. Suggestions never include individual provider names for anonymous users typing a person's name; discovery is by service, not people-lookup. *(Guards against the platform being used to locate a specific named individual.)*
- **FR-SRCH-08 (M):** **Featured placement** (BR-20): providers who have paid for featuring receive boosted placement within search results and the homepage, but (a) a featured result must still genuinely match the active query and filters — featuring boosts rank, it never bypasses relevance; (b) every featured card carries a clear, always-visible **"Featured"** label (BRD risk #4); (c) featuring never outranks the availability-first rule — a featured unavailable provider does not appear above non-featured available ones in an availability-ordered view.
- **FR-SRCH-09 (M):** Only **published, currently-listed** providers (in free period or paid up, FR-MONET-04) appear in search and on the homepage. Unpublished/lapsed profiles are excluded from all discovery surfaces but remain directly reachable by URL only to their owner and admins.
- **FR-SRCH-10 (M):** An empty result set is a designed state: it explains which filters constrained the result and offers one-tap relaxations (e.g., "remove 'available now'", "widen area") rather than a dead end.
- **FR-SRCH-11 (S):** Result cards are large, photo-forward profile cards (BR-22/BR-23) showing: primary photo, name, headline/intro extract, availability state with recency, badges, rating + review count, starting price, languages, distance to area, and a primary contact action.
- **FR-SRCH-12 (C):** Recent searches are remembered per device for one-tap re-run.
- **FR-SRCH-13 (W):** No personalized ranking or recommendations engine — identical query + filters + location yield the same ordering for every user (BRD out-of-scope).

---

## 7. Provider Profiles (PROF)

The profile is a mini landing page: rich enough that a seeker can decide to make contact without a prior phone call (BR-7).

- **FR-PROF-01 (M):** A provider profile contains exactly the BR-6 field set: **photo gallery** (1–12 photos, first is primary), **short introduction** (plain text, length-capped ~600 chars so it stays scannable), **services offered** (structured list, each with name, optional description, duration, and price), **service tags** (from a curated massage-domain tag vocabulary, FR-PROF-03), **languages spoken** (from a standard language list), **reviews** (FR-REV), **response time** (FR-MSG-08), **online status** (FR-PROF-06), and **contact actions** (FR-PROF-07).
- **FR-PROF-02 (M):** Minimum fields to publish: at least one photo, an introduction, at least one service with a price, at least one language, and a general service location. The edit screen shows publish-readiness as a simple checklist. This is a completeness check only — content is never reviewed or gated before going live (§1).
- **FR-PROF-03 (M):** Service tags come from a **curated, admin-maintained vocabulary** (e.g., deep tissue, Swedish, sports, prenatal, hot stone, reflexology, aromatherapy). Providers select tags rather than free-typing them, which is what makes tag-based filtering and "most-searched services" analytics (FR-ANLY-04) coherent. Providers can propose a missing tag; proposals go to admin as a suggestion, and the profile is never blocked on the outcome.
- **FR-PROF-04 (M):** Location model (incall-only): the profile carries a **general service location** — area/suburb/neighborhood granularity — shown publicly on the profile and used for proximity search. The platform never displays or stores-for-display an exact street address on the profile; sharing precise directions with a committed seeker happens in messaging at the provider's own discretion. *(FRS-level decision: protects provider safety and address privacy while supporting "near me.")*
- **FR-PROF-05 (M):** Profile edits are **live immediately** on save. No edit — including photo changes — triggers review, re-approval, or temporary unpublishing (§1). Exception affecting badges only: identity-relevant changes suppress the identity badge pending re-review (FR-TRUST-04) without touching profile visibility.
- **FR-PROF-06 (M):** **Online status** shows whether the provider is currently active on the platform ("online" for an active session/recent heartbeat, else "last seen" bucketed coarsely: "today," "this week," "a while ago" — never exact timestamps, to avoid enabling monitoring of an individual's routine). Visual treatment uses the Pine (trust/presence) hue plus icon + text — never a third status color (DESIGN.md Two-Hue Rule).
- **FR-PROF-07 (M):** Contact actions on the profile: **Message** (primary; account-gated per FR-MSG-01) and **Call** (visible per phone-visibility rules, FR-PROF-08). Both are presented as prominent mobile-first actions, sticky on the profile screen (BR-22).
- **FR-PROF-08 (M):** **Phone visibility** (BR-8): each provider has a setting — "Show my phone number to visitors without an account": ON shows a tap-to-call number to everyone; OFF hides the number from anonymous seekers (signed-in seekers see it either way, since messaging identity-gates them). **Default: OFF** (privacy-safe default; the provider opts in). The setting's effect is explained in plain language where it is set.
- **FR-PROF-09 (M):** A provider can **unpublish** (hide) their own profile at any time and republish it later without data loss and without any re-approval step.
- **FR-PROF-10 (M):** The profile displays trust badges (FR-TRUST) directly under the provider name, and the review summary (average + count) near the top — trust signals are above the fold on mobile.
- **FR-PROF-11 (S):** Profile view supports a lightweight share action (copy link / OS share sheet). Shared links open the public profile with correct link-preview metadata.
- **FR-PROF-12 (S):** The provider's own view of their profile includes a "preview as seeker" mode showing exactly what anonymous and signed-in seekers each see (differs by phone visibility).
- **FR-PROF-13 (W):** No multi-therapist/spa profiles: one provider account = one individual practitioner = one profile (BRD §9 assumption). No business accounts in V1.

---

## 8. Messaging (MSG)

Messaging is where booking happens: seekers and providers arrange a time inside the conversation, with no platform calendar (BR-13).

- **FR-MSG-01 (M):** A signed-in seeker can start a message thread with any published provider from the profile's Message action. One thread per seeker–provider pair, persistent across time. Anonymous users are routed through FR-ACC-05.
- **FR-MSG-02 (M):** Messaging is near-real-time text: messages appear to the counterpart without manual refresh, with sent/delivered/read states. Threads support text and, S-priority, photo attachments.
- **FR-MSG-03 (M):** The platform imposes **no structure on booking arrangements** inside the thread — no slot pickers, booking states, confirmations, or conflict checks. The system does not track whether a booking was made or kept (BR-13, BRD §9). *(Guards the no-calendar decision.)*
- **FR-MSG-04 (S):** To keep arranging a time low-friction without a calendar, the seeker's composer offers optional quick-start prompts (e.g., "Are you available today at …?") that insert editable text. These are plain text conveniences, not structured data. First-contact context ("Re: 60 min deep tissue") is prefilled when the thread starts from a specific service.
- **FR-MSG-05 (M):** In-thread safety actions: **report** and **block** are reachable from the thread header in at most two taps (NFR, BRD §8). Blocking (FR-TRUST-08) immediately prevents further messages in both directions.
- **FR-MSG-06 (M):** Thread list for both roles, ordered by latest activity, with unread indicators and unread counts surfaced in the app chrome.
- **FR-MSG-07 (M):** New-message notifications go out per FR-NOTIF-01. Providers are explicitly told (during onboarding and in the thread UI) that response speed is measured and displayed — the response-time metric must never be a surprise.
- **FR-MSG-08 (M):** **Response time** (BR-15): the system computes each provider's typical first-reply latency to *new* threads over a trailing window (default 30 days), displayed on the profile in honest buckets: "usually replies within 30 minutes / within a few hours / within a day." Providers with too little data show no response-time claim rather than a fabricated one. Only first replies to new inbound threads count — ongoing chatter does not, so the metric matches the seeker's actual question: "if I reach out, how fast will I hear back?"
- **FR-MSG-09 (M):** Message content is retained per FR-PRIV-04 and is visible to admins **only** in the context of a filed report (the reported thread), not as general browsing access (FR-ADM-04).
- **FR-MSG-10 (W):** No voice/video calls, no in-thread payments, no message-based booking confirmation flows in V1.

---

## 9. Reviews & Ratings (REV)

- **FR-REV-01 (M):** A signed-in seeker can leave one review (1–5 star rating + optional text, length-capped) per provider. Eligibility: the seeker must have an existing message thread with that provider that is at least 24 hours old. *(FRS-level decision: with no booking or payment records, a prior conversation is the only verifiable engagement proxy; the 24-hour minimum blocks drive-by review bombing without gating genuine clients. Flagged in §18 for validation.)*
- **FR-REV-02 (M):** Reviews publish immediately on submission — no pre-moderation (§1 stance applies to reviews as it does to profiles). A review can be reported (FR-TRUST-07) and human-removed by admin (FR-ADM-05).
- **FR-REV-03 (M):** The profile shows average rating, review count, and the review list newest-first. Each review shows rating, text, reviewer first name + initial, and month/year (not exact date — coarse dating makes reviewer identification by the provider harder).
- **FR-REV-04 (M):** A seeker can edit or delete their own review; edits update the aggregate and show an "edited" marker.
- **FR-REV-05 (M):** Rating is a search filter and card element (BR-5, BR-16): filterable by minimum average rating; providers with no reviews display "New" rather than a zero score, and a "highly rated" query intent (FR-SRCH-02) maps to a defined threshold (default ≥ 4.5 with ≥ 3 reviews).
- **FR-REV-06 (S):** The provider can post one public reply per review, shown beneath it, subject to the same report/remove path.
- **FR-REV-07 (M):** Blocking does not delete existing reviews in either direction; it only prevents new contact. Review removal is exclusively a human admin action on a report or on admin's own initiative (FR-ADM-05).
- **FR-REV-08 (W):** No review gating by "verified booking" (impossible without bookings), no incentivized-review mechanics, no seeker-side ratings of seekers.

---

## 10. Trust & Safety (TRUST)

Exactly two badges (BR-9). Badge workflows gate badges — never profiles (§1).

- **FR-TRUST-01 (M):** The platform displays **exactly two** trust badges on cards and profiles: **Identity verified** and **Active this week**. No other badge, checkmark, or trust-implying icon may be introduced without a BRD change.
- **FR-TRUST-02 (M):** **Identity verification flow:** a provider submits an identity claim (government-ID photo + selfie, per admin-published checklist) from their dashboard. Submission enters the admin review queue (FR-ADM-02). The badge appears **only after an admin approves** — an unreviewed or pending submission must never render the badge (NFR, BRD §8). Rejection returns a reason to the provider, who may resubmit. Throughout — pending, rejected, or never submitted — the profile's visibility is completely unaffected.
- **FR-TRUST-03 (M):** Identity documents are stored separately from profile media with admin-only access, are never displayed anywhere in the product, and are retained/purged per FR-PRIV-05.
- **FR-TRUST-04 (M):** If a verified provider changes identity-relevant account data (legal/display name, the phone number verified at registration), the identity badge is **suppressed** (hidden, not revoked) pending a lightweight admin re-review; the provider is told why and what to do. Profile visibility is unaffected. *(Carried forward from prior FRS decision; consistent with badge-gating-only.)*
- **FR-TRUST-05 (M):** Admins can revoke an identity badge at any time (e.g., a report reveals the submission was fraudulent), with an internal reason recorded (FR-ADM-08).
- **FR-TRUST-06 (M):** **Active this week** is granted and removed purely by the FR-AVAIL-06 computation, evaluated at least daily. No human can manually grant it; admins can only suspend a provider entirely, not edit this badge.
- **FR-TRUST-07 (M):** **Reporting** (BR-12): any signed-in user can report a profile, a review, a photo, or a message thread. The report flow is reachable from every profile and every conversation in one–two taps, offers a short reason taxonomy (safety concern, fake profile/photos, harassment, spam/scam, other + free text), and confirms receipt. Reports go to the admin queue (FR-ADM-03); reporting **triggers no automated action** against the reported party — consequences are exclusively human decisions (§1).
- **FR-TRUST-08 (M):** **Blocking** (BR-12): seekers and providers can block one another. Blocking prevents new messages in both directions, hides the blocker from the blocked party's future search/browse results, and is silent (the blocked party is not notified). Either party can view and undo their own blocks in settings.
- **FR-TRUST-09 (S):** A concise safety-information page (what the badges do and don't mean, meeting-safety basics for incall visits, how to report) linked from every profile's badge area and from the footer. Badge tap/hover reveals a one-line plain-language explanation of what that badge actually verifies.
- **FR-TRUST-10 (W):** No third-party ID/background-check vendor, no license/qualification badge (BRD risk #3 — deliberately deferred), no automated fraud/anomaly detection in V1.

---

## 11. Moderation & Admin (ADM)

All moderation is reactive and human. The admin console exists to make human review fast, not to automate judgment.

- **FR-ADM-01 (M):** An internal admin console, access-restricted to admin accounts, houses: the identity review queue, the reports queue, provider/seeker account lookup, moderation actions, platform configuration, and the free-period setting.
- **FR-ADM-02 (M):** **Identity review queue:** pending submissions ordered oldest-first, each showing the submitted documents alongside the provider's live profile. Admin approves (badge granted) or rejects with a reason (returned to provider). Queue age is visible so turnaround (a stated operational dependency, BRD §10) can be managed.
- **FR-ADM-03 (M):** **Reports queue:** each report shows reporter, reported party, reason, the reported content in context (for message reports: the reported thread, FR-MSG-09), the reported party's prior report/moderation history, and resolution actions. Every report reaches a human resolution — dismiss (with note) or act (FR-ADM-05); nothing auto-resolves or auto-expires.
- **FR-ADM-04 (M):** Admin access to message content is limited to threads attached to a filed report. There is no general message-browsing capability in the console. *(Least-privilege by design; also keeps the human-moderation stance honest — humans review what users flag, they don't surveil.)*
- **FR-ADM-05 (M):** **Human moderation actions**, each requiring an explicit admin decision and recorded reason: remove a specific photo; remove a review; unpublish a profile (provider notified with reason, may edit and republish themself — republish is not admin-gated); suspend an account (all access revoked, profile hidden, provider notified); reinstate; revoke identity badge (FR-TRUST-05). These actions are the **only** mechanisms in the product that can take content down — nothing is removed by automation (§1).
- **FR-ADM-06 (M):** **Platform configuration** editable in the console: free listing period length (BR-19), "Available now" auto-expiry duration and reminder lead time (FR-AVAIL-03), "highly rated" threshold (FR-REV-05), response-time window (FR-MSG-08), the service-tag vocabulary (FR-PROF-03), **listing and featuring prices** (FR-MONET-07), and the **search lexicon** (FR-SRCH-02 / SR-APP-02). Config changes take effect without a deployment.
- **FR-ADM-07 (M):** Admin account lookup: find any account by name/email/phone; view profile state, badge state, listing/billing state, report history, and moderation history. No impersonation ("log in as user") in V1.
- **FR-ADM-08 (M):** Every admin action (approvals, rejections, removals, suspensions, config changes) is written to an append-only audit log: who, what, whom, when, recorded reason.
- **FR-ADM-09 (S):** Lightweight ops dashboard: identity-queue depth and age, reports-queue depth and age, new registrations, active listings — the numbers the team needs to see the manual-review scaling risk (BRD risk #2) coming before it lands.

---

## 12. Provider Analytics (ANLY)

- **FR-ANLY-01 (M):** Every provider has an analytics dashboard covering exactly the BR-17 metric set: **profile views**, **search appearances**, **contact requests**, and **most-searched services** — each shown as a current-period total, a simple trend over time, and a comparison to the prior period. Selectable ranges: last 7 days, last 30 days (default), last 90 days.
- **FR-ANLY-02 (M):** Metric definitions (displayed in-product so providers trust the numbers): *profile view* = a profile-page load by anyone other than the provider, deduplicated per viewer per day; *search appearance* = the provider's card rendered within a viewed results set; *contact request* = a new message thread started with the provider, plus (where phone visibility is on) tap-to-call taps.
- **FR-ANLY-03 (M):** Analytics are aggregate-only: no provider can see *who* viewed or searched. Individual seekers are never identifiable from the dashboard. Counts below a small floor display as "< 5" to prevent single-visitor inference.
- **FR-ANLY-04 (M):** **Most-searched services** shows the platform-wide top service tags from recent search queries and applied filters, with the provider's own offered tags highlighted — actionable market signal ("sports massage is trending; you don't offer it").
- **FR-ANLY-05 (S):** The dashboard annotates trend charts with the provider's own relevant events (went available N times this week, became featured on date X) so cause and effect are legible.
- **FR-ANLY-06 (W):** No seeker-side analytics, no conversion funnels, no exportable reports in V1.

---

## 13. Monetization & Billing (MONET)

Providers pay to be listed and to be featured. The platform processes **only** these platform fees — never service-session payment (BR-21).

- **FR-MONET-01 (M):** **Listing** is a recurring paid subscription (monthly). Only providers with an active listing — in free period or paid — appear in search and on the homepage (FR-SRCH-09).
- **FR-MONET-02 (M):** **Free listing period** (BR-19): each new provider receives a free period of platform-configured length (FR-ADM-06) starting when they first publish (not when they register — the clock shouldn't run while they're still building a profile). Providers see clearly, at all times, when the free period ends and what happens then.
- **FR-MONET-03 (M):** Free-period **anti-abuse** (BRD risk #6): one free period per verified mobile phone number (the OTP-verified number from FR-ACC-03). Re-registering with a previously-used number resumes billing state rather than granting a new trial. *(FRS-level decision: phone is the cheapest durable identity anchor available at signup; tying the trial to the identity badge instead would push every provider through the manual review queue on day one, colliding with the manual-review scaling risk. Flagged in §18.)*
- **FR-MONET-04 (M):** **Listing lapse lifecycle:** when the free period ends without payment, or a renewal payment fails, the provider enters a grace period (default 7 days, dunning notifications) during which the listing stays live; if still unpaid at grace end, the profile is **auto-unpublished** with all data retained. Paying at any point republishes it immediately, with no review step (§1). *(Auto-unpublish here is billing state, not moderation — it is the definition of "pay to be listed," not a content judgment.)*
- **FR-MONET-05 (M):** **Featured placement** (BR-20): a provider with an active listing can buy featuring as a recurring add-on. Featuring's ranking effect and labeling behave per FR-SRCH-08. Featuring lapses independently of listing; a lapsed listing suspends featuring automatically (nothing hidden can be featured).
- **FR-MONET-06 (M):** Self-serve billing: providers add/update a payment method, see price before purchase, upgrade/downgrade (add or cancel featuring), cancel listing renewal (remains live until the period ends), and access billing history with itemized receipts. Payment card handling is delegated to a PCI-compliant payment provider; the platform never stores raw card numbers.
- **FR-MONET-07 (M):** Pricing amounts for listing and featuring are platform configuration (FR-ADM-06 console), applied to new billing periods — not hardcoded.
- **FR-MONET-08 (M):** The product contains **no flow for seeker-to-provider payment** — no session checkout, deposits, tips, or "pay through us" messaging affordances (BR-21; guards FR-MSG-10).
- **FR-MONET-09 (W):** No tiered listing plans, coupons/promo codes, auctions for placement, or commission models in V1.

---

## 14. Notifications (NOTIF)

- **FR-NOTIF-01 (M):** Notification events and default channels: new message (push*/email if unread after a delay), identity review outcome (email + in-app), "Available now" expiry warning (push*/in-app, FR-AVAIL-03), billing events — trial ending soon, payment failed, grace-period warnings, unpublished-for-non-payment (email + in-app), moderation outcomes affecting the recipient — content removed, profile unpublished, suspension (email + in-app, with reason), report receipt confirmation to the reporter (in-app). (*Push = web push, S-priority; email and in-app are the M-priority baseline.)
- **FR-NOTIF-02 (M):** Users control non-essential notifications per channel in settings. Billing, security, and moderation notices are always delivered (not opt-out-able).
- **FR-NOTIF-03 (M):** Message notifications respect blocks (a blocked party's activity never generates a notification) and batch bursts (several messages in quick succession collapse into one notification).
- **FR-NOTIF-04 (S):** Notification copy is plain-language and action-oriented, deep-linking to the exact screen where the user acts (the thread, the billing page, the resubmission form).

---

## 15. UX, Performance & Accessibility (UX)

- **FR-UX-01 (M):** **Mobile-first** responsive web experience (BR-22): all flows fully usable and designed-first at small-phone viewport; the layout adapts up to tablet/desktop. Core mobile patterns per the BRD: large profile cards, sticky search bar, fast filters, and quick contact actions (thumb-reachable primary buttons).
- **FR-UX-02 (M):** **Performance budgets** (BR-24, measured on a mid-range phone over 4G): homepage and search results interactive ≤ 3 s; profile pages ≤ 2.5 s on subsequent navigations; search suggestions render ≤ 200 ms after keystroke; filter application updates results ≤ 1 s. Images lazy-load and are served responsively sized; repeat visits benefit from caching.
- **FR-UX-03 (M):** **Accessibility: WCAG 2.2 AA** across the product — color contrast (the "accessible color palette" of BR-23 is a hard requirement, not a mood), full keyboard operability, screen-reader-correct semantics, visible focus, touch targets ≥ 44 px, and never conveying meaning by color alone (badges and availability states pair icon/text with color).
- **FR-UX-04 (M):** Visual design system per BR-23: large photography, generous whitespace, consistent typography, clear hierarchy. Photography-forward cards must keep text legible (e.g., no text over busy image regions without treatment).
- **FR-UX-05 (M):** **Friendly by default:** every error state says what happened and what to do next in plain language; every destructive action (delete account, delete review, remove photo) gets a confirmation; forms preserve input on validation errors; loading states use skeletons/optimistic UI rather than spinners on the critical search→profile→contact path.
- **FR-UX-06 (M):** Anonymous-to-signed-in continuity per FR-ACC-05 is a UX requirement as much as an accounts one: the sign-up interruption on the contact path must be a single screen, support one-tap OAuth, and return the user exactly where they left off.
- **FR-UX-07 (S):** Provider onboarding is a guided, resumable checklist (photos → intro → services → languages → location → publish) with progress indication and per-step guidance on what makes a profile convert (photo quality tips, intro examples).
- **FR-UX-08 (S):** Public pages (homepage, search, profiles) render meaningful content server-side — good link previews, crawlability, and fast first paint on slow devices.

---

## 16. Privacy & Data (PRIV)

- **FR-PRIV-01 (M):** Phone-number exposure follows FR-PROF-08 exactly, default OFF; the number is never included in page markup served to anonymous sessions when the setting is off (hiding must be server-side, not CSS).
- **FR-PRIV-02 (M):** No exact provider addresses are collected or displayed by the platform (FR-PROF-04); proximity features operate on area-level location only. Seeker device location is used transiently for search and never stored server-side beyond the request.
- **FR-PRIV-03 (M):** On account deletion: personal data is deleted or irreversibly anonymized within 30 days, except records the platform must retain (billing/tax records; moderation and audit records where a report or enforcement action exists, retained per FR-PRIV-05). What survives deletion and why is stated in the privacy policy in plain language.
- **FR-PRIV-04 (M):** Message threads are retained while both accounts exist (they are the booking record in a no-calendar product). When one party deletes their account, FR-ACC-07 applies; threads with no activity for 24 months are purged.
- **FR-PRIV-05 (M):** Identity-verification documents (FR-TRUST-03) are purged within 90 days of an approve/reject decision; the decision itself, its date, and the reviewing admin are retained. Moderation/audit records are retained for 24 months.
- **FR-PRIV-06 (M):** Analytics counting (FR-ANLY) uses aggregation with a small-count floor; no seeker-identifiable browsing data is ever exposed to providers.
- **FR-PRIV-07 (M):** A plain-language privacy policy and terms of service are linked from the footer, sign-up, and provider onboarding, and require affirmative acceptance at registration.

---

## 17. BR → FR Traceability

| BR | Requirement | Covered by |
|---|---|---|
| BR-1 | Provider-set "available now" with timestamp, clearable | FR-AVAIL-01, 02, 03, 04 |
| BR-2 | Homepage surfaces available providers, most recent first | FR-SRCH-01 |
| BR-3 | Availability-recency ordering in filtered search | FR-SRCH-03 |
| BR-4 | Natural-language search → structured filters | FR-SRCH-02, 05, 07 |
| BR-5 | Filters: price, languages, rating, verified | FR-SRCH-04, FR-REV-05 |
| BR-6 | Profile field set | FR-PROF-01, 02, 03, 06 |
| BR-7 | Profile as mini landing page | FR-PROF-01..12, FR-UX-04 |
| BR-8 | Provider-configurable phone visibility | FR-PROF-08, FR-PRIV-01 |
| BR-9 | Exactly two trust badges | FR-TRUST-01 |
| BR-10 | Self-attested identity + manual admin review before badge | FR-TRUST-02, 03, 04, 05; FR-ADM-02 |
| BR-11 | "Active this week" computed, no manual review | FR-AVAIL-06, FR-TRUST-06 |
| BR-12 | Report/block, reports reach admin | FR-TRUST-07, 08; FR-MSG-05; FR-ADM-03 |
| BR-13 | Messaging-arranged booking, no calendar, no conflict tracking | FR-MSG-01..04; FR-AVAIL-08 |
| BR-14 | Anonymous browse/search/view; phone per BR-8; messaging account-gated | FR-ACC-01, 05; FR-PROF-08 |
| BR-15 | Track and display response time | FR-MSG-07, 08 |
| BR-16 | Ratings & reviews, visible and filterable | FR-REV-01..07 |
| BR-17 | Provider analytics dashboard (4 metrics) | FR-ANLY-01..04 |
| BR-18 | Paid listing gates discoverability | FR-MONET-01, 04; FR-SRCH-09 |
| BR-19 | Configurable free listing period | FR-MONET-02, 03; FR-ADM-06 |
| BR-20 | Paid featured placement | FR-MONET-05; FR-SRCH-08 |
| BR-21 | No service-fee payment processing | FR-MONET-08; FR-MSG-10 |
| BR-22 | Mobile-first patterns | FR-UX-01, 06; FR-SRCH-02, 11; FR-PROF-07 |
| BR-23 | Visual design & accessible palette | FR-UX-03, 04 |
| BR-24 | Fast loads, instant suggestions, caching | FR-UX-02; FR-SRCH-07 |

Every FR also traces back: modules map to BRD sections in §3, and W-priority items pin the BRD's explicit out-of-scope list so it can't creep back in through implementation.

---

## 18. FRS-Level Decisions & Assumptions (flagged for review)

Decisions this document makes that the BRD left open — each is reversible at FRS level without BRD change, listed so sign-off is informed:

1. **No system gating anywhere in moderation** (§1, FR-ACC-04, FR-PROF-05, FR-REV-02, FR-ADM-05): direct product instruction this session. The identity badge admin-review (BR-10) is the sole approval workflow, and it gates only the badge.
2. **"Available now" auto-expiry, default 4 h with renewal prompt** (FR-AVAIL-03): protects the credibility of the core signal; configurable.
3. **Phone visibility defaults OFF** (FR-PROF-08): privacy-safe default; provider opt-in.
4. **Area-level location only, never exact addresses** (FR-PROF-04, FR-PRIV-02): provider safety + privacy while still supporting "near me."
5. **Review eligibility = message thread ≥ 24 h old** (FR-REV-01): the only engagement proxy available without bookings/payments. Known weakness: clients who only ever phoned (via BR-8 visibility) cannot review. Accepted for V1; revisit if phone-first contact dominates.
6. **Free-period anti-abuse tied to OTP-verified phone number** (FR-MONET-03): addresses BRD risk #6 without forcing identity verification through the manual queue at signup.
7. **Listing lapse auto-unpublish with 7-day grace** (FR-MONET-04): billing mechanics, not moderation; carried forward from prior FRS.
8. **WCAG 2.2 AA** (FR-UX-03): carried forward as the accessibility bar.
9. **No provider-name lookup in suggestions for anonymous users** (FR-SRCH-07): discovery by service, not person-finding; small but deliberate safety posture.
10. **Response time counts first replies to new threads only, trailing 30 days** (FR-MSG-08): matches what the seeker actually wants to know.

Open questions inherited from BRD §11 and **not** resolved here: third-party ID vendor timing (#1), manual-review scaling (#2 — FR-ADM-09 gives visibility only), license/qualification capture (#3), dispute handling (#5), double-booking frustration monitoring (#7). BRD §11 #4 (Featured label) and #6 (free-period anti-abuse) are resolved by FR-SRCH-08(b) and FR-MONET-03 respectively.
