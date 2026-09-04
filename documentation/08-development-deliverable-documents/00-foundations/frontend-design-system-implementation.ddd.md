---
title: DDD — Frontend Design-System Implementation
updated: 2026-09-04
---

# Frontend Design-System Implementation

**Cross-cutting foundation document.** Not tied to a single user story — every UI-facing story DDD in `08-development-deliverable-documents/E*/` points back here for its "Visual & UX acceptance" section rather than restating these rules per file.

## 1. Why this document exists

This delivery is driven by a single mission: make Peach Finder a top-10 app in its category on visual look, premium feel, and flawless usability — not merely functionally correct (BRD scope; restated in `07-test-artifacts/05-playwright-spec-designs/e2e-visual-quality-design-system.spec-design.md` and `e2e-performance-and-perceived-quality.spec-design.md`, both added at the Test Artefacts stage specifically because of this mission). No application code exists yet. Before any story's UI is implemented, the component library, token pipeline, motion primitives, and performance budget enforcement this document specifies must exist — every story DDD assumes they do.

**Upstream sources (all pre-existing, none introduced here):** `/PRODUCT.md` (brand, personas, design principles, anti-references), `/DESIGN.md` (the living design system — colors, typography, elevation, components, do's/don'ts, YAML frontmatter token registry), `/.impeccable/design.json` (the machine-readable mirror of that frontmatter), `documentation/06-ui-ux-design/prototypes/seeker-and-provider-prototype.html` (the interactive reference implementation to match pixel-for-pixel on tokens, in spirit on interaction).

## 2. Token pipeline

`DESIGN.md`'s YAML frontmatter (mirrored in `.impeccable/design.json`) is the single source of truth for every token below. The frontend build must consume it programmatically (e.g. generate CSS custom properties / a Tailwind theme extension from the JSON at build time) rather than have engineers hand-copy hex values into components — a hand-copy drifts the instant `DESIGN.md` is next edited, and this is a living document.

| Token group | Values | Source |
|---|---|---|
| Color | `peach #E8794F` (decorative only, fails 3:1 for text/icons), `peach-deep #B34625` (working primary — buttons, availability dot, focus ring, links), `pine #2F5D50` (trust/verification), `pine-deep #1E3A32` (Pine hover/active), `blush #F6E4D8` (badge/hover surfaces, never load-bearing text), `ink #2B2622` (primary text), `stone #6E6459` (secondary text + functional borders), `divider #C9BDAE` (decorative only), `cream #FBF7F2` (page background), `paper #FFFCF9` (elevated surfaces) | `DESIGN.md` §2 |
| Typography | Display (Fraunces, clamp(2.25rem,5vw,3.5rem), 500, 1.05), Headline (Fraunces, 1.75rem, 500, 1.15), Title (Plus Jakarta Sans, 1.125rem, 600, 1.3), Body (Plus Jakarta Sans, 1rem, 400, 1.55, capped 65-75ch measure), Label (Plus Jakarta Sans, 0.8125rem, 600, 1.2, +0.02em) | `DESIGN.md` §3 |
| Radius | sm 8px, md 14px, lg 20px, pill 999px | `DESIGN.md` frontmatter |
| Spacing | xs 4px, sm 8px, md 16px, lg 24px, xl 32px, 2xl 48px | `DESIGN.md` frontmatter |
| Elevation | Ambient rest `0 1px 2px rgba(43,38,34,.06)`, Lift-hover `0 12px 24px rgba(179,70,37,.14)`, Sheet `0 -8px 32px rgba(43,38,34,.12)` | `DESIGN.md` §4 |

## 3. Component library (build once, consume everywhere)

Every story DDD's "frontend" build task assumes these primitives already exist rather than being built ad hoc per screen:

- **Button** (primary/secondary/ghost) — full pill, `DESIGN.md` §5 padding/state spec, 2px Terracotta Deep focus ring offset 2px on keyboard focus, never removed.
- **Chip** (filter, filter-selected) — pill, Warm Stone border at rest, inverts to Ink fill + Warm Paper text when selected (shape signal, not color alone).
- **Card / Container** — 20px radius for result/profile cards, 14px for nested elements (photo thumbnails, message bubbles), Ambient rest → Lift-hover on interaction, no border stroke.
- **Input field** — Warm Paper background, 1px Warm Stone border, 14px radius, 16px minimum vertical padding (prevents iOS zoom-on-focus), Terracotta Deep 2px focus border + soft focus ring, dedicated warm red-brown `#A5432B` error border always paired with inline error text.
- **Availability Pill** (Signature Component, `DESIGN.md` §5) — 6px Terracotta Deep dot with a 2s pulse animation, disabled under `prefers-reduced-motion`, paired with Label-weight "Available now" text — never a forward-looking prediction (FR-AVAIL-08 guard). This is the single most product-defining component; build and visually regression-test it before any screen that uses it.
- **Badge** (verified / available) — Blush background, Pine or Terracotta Deep text per `DESIGN.md` component tokens, always icon/checkmark + text, never a bare colored dot.
- **Navigation** — mobile bottom tab bar (3 destinations: Search, Messages, Profile; icon + label always together); desktop left-aligned top bar, no sidebar.
- **Admin Ink strip** — the one documented dark-surface exception (`peach·finder Admin` identity strip), scoped to the admin console only; the visual-quality Playwright design (§5 below) asserts this never leaks onto seeker/provider surfaces.

## 4. Motion & reduced-motion

Motion is a response to interaction, not a performance (`DESIGN.md` §1). The only two ambient (non-interaction-triggered) motions in the system are the Availability Pill's 2s pulse and any skeleton-loading shimmer; both must read `prefers-reduced-motion: reduce` and disable themselves. Every other motion (Lift-hover shadow transition, button press, sheet rise) is interaction-triggered and short (≤200ms suggested) so the interface stays calm at rest per the design system's own framing.

## 5. Performance budget — implementation, not just a gate

`07-test-artifacts/05-playwright-spec-designs/e2e-performance-and-perceived-quality.spec-design.md` turns the SRS's performance requirements into CI-enforced pass/fail gates. This document is where those budgets get *built to*, not just tested against:

| Surface | Budget | Implementation implication |
|---|---|---|
| Homepage / search results interactive | ≤3s (mid-range Android, throttled 4G) | Server-render the initial result set (FR-UX-08); defer non-critical JS; keep the homepage bundle on the critical path minimal |
| Profile page (subsequent nav) | ≤2.5s | Client-side route transition must not re-fetch data already known from the card the user tapped (optimistic shell) |
| Search suggestions | ≤200ms end-to-end, ≤100ms server | Debounce client-side, but the server-side lexicon lookup itself (see `discovery-search-lld.md` §5/§8) must independently clear 100ms |
| Filter application | ≤1s, no full reload | Client-side result re-fetch via the existing SPA route, never a full page navigation |
| Message delivery | ≤2s p95 to an online counterpart | WebSocket-first per `direct-messaging-lld.md` §4; polling is a degrade path, not the default |
| Initial core-page JS payload | ≤300KB compressed | Route-level code splitting; the admin console bundle must never ship to seeker/provider routes |
| Discovery cache freshness | never >60s stale | Per `discovery-search-lld.md`'s projection-maintenance event subscribers (§4A) |

Perceived-performance requirements that are implementation decisions, not just test assertions: reserved image aspect-ratio boxes (zero layout shift as photography loads), skeleton states (never a bare spinner) on the search→profile→contact path, and first-meaningful-paint prioritized ahead of full interactivity on throttled connections.

## 6. Definition of Done for this foundation

- [x] Token pipeline generates CSS/theme values from `DESIGN.md`'s frontmatter (or `.impeccable/design.json`) programmatically — no hand-copied hex values in component code.
- [x] Every component in §3 exists as a single reusable implementation before any story DDD's frontend task is started against it.
- [x] `e2e-visual-quality-design-system.spec-design.md`'s token-conformance and accessibility assertions pass against the component library in isolation (`e2e/components.e2e.ts` + `/dev/components`), before they're asked to pass per-screen.
- [x] Performance budgets in §5 are treated as build constraints (`npm run check:bundle` for SR-PERF-05, SSR homepage, reserved `aspect-ratio` on card photos, Skeleton primitive) — not discovered as test failures after the fact.

## Implementation Notes (Wave 0)

Conventions later waves must follow. Package manager is **npm**. Node **24** LTS.

### Commands

| Command | What it does |
|---|---|
| `docker compose up -d` | Local Postgres 17 + MinIO (`media` public, `identity-docs` deny-by-default) |
| `npm run db:migrate` | Applies `drizzle/migrations/*.sql` as the migrate role |
| `npm run db:seed` | Idempotent platform-configuration bootstrap (config defaults, small ZA gazetteer, intent/language lexicon) |
| `npm run dev` | SvelteKit / Vite on 5173 |
| `npm run worker` | pg-boss outbox fan-out + rate-limit cleanup + config TTL refresh |
| `npm run test` | Vitest unit tests |
| `npm run test:integration` | Testcontainers Postgres (skips/fails loudly if Docker is down — never stubs) |
| `npm run test:e2e` | Playwright against the live dev server (`stub_mode: forbidden`) |
| `npm run boundaries` | dependency-cruiser hexagonal import rules |
| `npm run check:bundle` | gzip JS under `build/client` ≤ 300KB |

Copy `.env.example` to `.env`. App role `peach_app`; migrate role `postgres`.

### Layout

- Shared kernel: `src/lib/server/shared/`
- Modules: `src/lib/server/modules/<kebab-name>/{domain,app,infra,index.ts}` — import another module **only** via `index.ts`
- Delivery: `src/routes/` (thin). Admin is `src/routes/admin/` (no domain logic)
- UI primitives: `src/lib/components/`
- Tokens: `scripts/generate-tokens.ts` → `src/lib/styles/tokens.css` (run on `predev`/`prebuild`/`pretest`)
- Worker: `src/worker/index.ts`
- Custom Node + WS: `server.js` attaches `/ws` (401 if no session)

### Adding a module

1. Folder under `src/lib/server/modules/<kebab>/` with `domain/`, `app/`, `infra/`, `index.ts`
2. Postgres schema = snake_case of the kebab name; add DDL as a new forward-only SQL file in `drizzle/migrations/`
3. Re-export tables from `src/lib/server/db/schema.ts`
4. Cross-schema FKs only onto `identity_and_access.user(id)` and `platform_configuration.area(id)`

### Adding a component

1. Put it in `src/lib/components/` using `var(--…)` tokens only — no raw hex (unit test enforces this)
2. Add a state gallery on `/dev/components`
3. Pill-shaped interactive controls; Fraunces only for Display/Headline

### RBAC

Every `+page.server.ts` / `+server.ts` (or a layout) exports `_requiredRole` (underscore prefix: SvelteKit only allows known universal exports plus `_`-prefixed names from `+page.server.ts` / `+layout.server.ts`). The hook in `src/hooks.server.ts` enforces it before application code. Default public floor is `anonymous`. Dual-role: `admin` from `is_admin`; `provider` is a lazy `ownsProfile` check (false until Wave 1).

### Config

Read runtime config only through `platform-configuration.getConfig(key)`. Unknown keys are a compile error. Startup crashes on missing/malformed stored values. Admin JSON APIs: `/admin/api/platform/{config,areas,lexicon}`. Full GeoNames ZA import and `service_term` lexicon rows wait on later waves.

### Tests

- Unit: `src/**/*.test.ts`
- Integration: `src/**/*.integration.test.ts`
- E2E: `e2e/*.e2e.ts` — live stack, no `page.route`
