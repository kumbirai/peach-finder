---
title: Peach Finder — UI/UX Design & Prototypes
updated: 2026-09-04
---

# UI/UX Design & Prototypes

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | UI/UX Design System & Interactive Prototype |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | BRD §6.1, §7.8–7.9 (BR-22, BR-23, BR-24); FRS §4 (ACC), §6 (SRCH), §7 (PROF), §8 (MSG), §10 (TRUST), §11 (ADM), §12 (ANLY), §15 (UX); LLD `01-identity-and-access`, `07-trust-and-safety`, `08-moderation-admin` |
| Design system source | `/PRODUCT.md`, `/DESIGN.md`, `/.impeccable/design.json` (repo root) |
| Prototype | `prototypes/seeker-and-provider-prototype.html` |
| Status | Living document — updated in place |

**What this document is:** the design system (visual language, tokens, component rules) and an interactive, self-contained HTML prototype covering the primary seeker journey (discover → profile → message), a provider dashboard, a provider onboarding wizard, an identity-verification submission flow, and an admin console (identity queue, reports queue, account lookup). It is the first visual pass following the completed BRD → FRS → SRS → user stories → HLD → LLD chain; no application code exists yet, so this prototype is the reference the eventual frontend implementation should match pixel-for-pixel on tokens and match in spirit on interaction.

---

## 2. Where things live

| What | Where |
|---|---|
| Strategic brand/product brief (users, purpose, anti-references, principles) | `/PRODUCT.md` |
| Visual design system (colors, type, elevation, components, do's/don'ts) | `/DESIGN.md` |
| Machine-readable tokens + component HTML/CSS snippets | `/.impeccable/design.json` |
| Interactive prototype (open directly in any browser, no build step) | `documentation/06-ui-ux-design/prototypes/seeker-and-provider-prototype.html` |

The prototype is a single self-contained HTML file (fonts embedded as base64, no external requests, no build tooling) — open it directly in a browser. It uses a demo-only "Prototype: Seeker / Provider / Admin" switch in the top bar (wraps to its own row below 480px rather than disappearing, since Admin has no other entry point in the demo) to jump between the three personas; that switch is not part of the real product chrome. Within the Provider persona, the dashboard's "Continue setup" button opens the onboarding wizard (resuming at the first incomplete step, not always step 1) and "Get verified" opens the identity-verification sub-flow.

## 3. Design direction

**North star: "The Trusted Concierge."** Full rationale is in `/PRODUCT.md` and `/DESIGN.md`; summary:

- **Palette:** warm cream/paper neutrals (never stark white), one confident Terracotta accent for action and availability, a deep Pine green for trust and verification. A fourth neutral tint (Blush Sand) carries badge and hover surfaces. This was chosen over the cold navy-and-gray or clinical white-and-teal defaults common to both enterprise SaaS and medical-portal products — competitive research (Apollo, Clay, Linear, Airbnb-adjacent consumer-wellness apps) consistently pointed at warm neutrals plus a single deliberate accent as the antidote to both.
- **Typography:** Fraunces (warm editorial serif) for display/headline text only; Plus Jakarta Sans (geometric-humanist) for everything else. Confined per the "One-Serif Rule" in `DESIGN.md` so the interface stays fast to scan.
- **Accessibility:** every color pair in the palette was checked against WCAG AA (4.5:1 text, 3:1 UI) before being committed to `DESIGN.md`; see that file's Colors section for the actual ratios. Availability and verification are never color-only — always icon + text label.
- **The Two-Hue Rule:** only Terracotta (action/availability) and Pine (trust/verification) carry meaning. "Featured" placement (FR-SRCH-08) deliberately does **not** get a third hue — it renders as a neutral ink-on-paper label so it can never be confused with a trust or availability signal.

## 4. What the prototype demonstrates, and why it looks the way it does

- **Discover screen** (FR-SRCH-01–11): functional free-text search, fast filters for price, language, rating, verification, and service type, plus availability-first ordering. Results are explicitly split into an "N available now" group and a "More therapists nearby" group below a divider, matching FR-SRCH-01. Cards show starting price (FR-SRCH-11), unclipped trust badges, rating, distance, and response time. A demo control exercises the designed empty state.
- **Trust badges** (FR-TRUST-01): exactly two, independently earned — **Identity verified** and **Active this week** — never combined into one signal and never implied by each other. The mock data deliberately includes providers with only one badge, or neither, to avoid implying badges are universal. Cards and profiles use the exact FRS strings.
- **Therapist profile** (FR-PROF-01–12): photo gallery, availability with recency phrasing, independently rendered trust badges, online status, services with per-service pricing, languages, reviews, share, one-tap profile safety actions, phone reveal, and sticky Call plus Message actions. Every result card now opens the matching provider content instead of a single fixed profile.
- **Messaging** (FR-MSG-01–09): thread view with quick-reply prompts that insert editable plain text (never structured booking data, per the no-calendar constraint; incall-only copy). Report and confirmed-block actions are reachable from the thread header in one tap.
- **Provider dashboard**: one-tap availability toggle (FR-AVAIL-01/02), expiry and active-badge transparency (FR-AVAIL-07), a guided profile-completeness checklist that opens the relevant editor step (FR-UX-07), and the exact FR-ANLY-01 metric set with 7/30-day ranges.
- **Provider onboarding wizard** (FR-UX-07): a six-step stepper — photos → intro → services → languages → area → publish — matching the exact order in the FRS. Resumable: the dashboard's "Continue setup" jumps to the first step not yet marked done, not back to step 1. The publish step is a read-only review, and its tip states plainly that publishing is immediate with no review step (FR-PROF-02/FR-ACC-04).
- **Identity verification sub-flow** (FR-TRUST-02): a separate, optional entry point from the dashboard (not part of the onboarding checklist, since verification gates the badge, never the profile).
- **Admin console** (partial FR-ADM): denser treatment of the same tokens — a dark `peach·finder Admin` strip (DESIGN.md admin-console exception: Ink neutral, not a third hue). Built: identity queue, reports queue, account lookup, KPI row (FR-ADM-01..04, 07, 09). Not built: config editor (FR-ADM-06), moderation-action picker (FR-ADM-05), audit-log viewer (FR-ADM-08).

## 5. Known gaps / next steps

Scoped out of this pass, flagged here rather than silently omitted:

- "Preview as seeker" mode on the provider's own profile (FR-PROF-12).
- Platform configuration editor (FR-ADM-06: free-period length, availability auto-expiry, highly-rated threshold, response-time window, service-tag vocabulary, pricing, search lexicon) — the admin console's identity queue, reports queue, and account lookup are built; the config editor and the tag-vocabulary-proposal review surface are not.
- The moderation-action picker itself (remove photo / remove review / unpublish / suspend / revoke badge) — the reports queue's "Take action" button surfaces what it will do but doesn't yet present the actual picker (FR-ADM-05).
- Audit-log viewer (FR-ADM-08).
- Natural-language search parsing (FR-SRCH-02/05) is represented as a plain text input with static filter chips; the transparent NL-to-filter-chip translation behavior isn't wired up.
- Full value-picker sheets for price range, all configured languages, and arbitrary minimum rating (FR-SRCH-04); the prototype currently demonstrates the behavior with fast preset chips. Empty-state one-tap per-filter relaxation (FR-SRCH-10) remains represented by the all-filter reset.
- Anonymous-to-signed-in continuity screen (FR-UX-06 / FR-ACC-05) — the single-screen sign-up interruption on the contact path.
- Report/block entry points on individual reviews and photos (FR-TRUST-07/08); profile and message-thread entry points are built.
- Provider phone-visibility *setting* (FR-PROF-08) and unpublish control (FR-PROF-09); seeker-facing phone reveal, Sticky Call, share/copy link, and online status are built.
- Error and skeleton states (FR-UX-05); destructive blocking now includes an inline confirmation step.
- Safety-information page and badge tap explanation (FR-TRUST-09).
- Real photography is obviously absent; all photo surfaces use a clearly labeled placeholder treatment rather than fabricated or stock images of people.
- No consumer dark theme: `DESIGN.md` commits to a single warm-light visual world; the admin Ink strip is a documented internal-surface exception, not a product dark mode.
