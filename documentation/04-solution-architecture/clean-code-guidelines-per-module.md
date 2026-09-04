---
title: Peach Finder — Clean Code Guidelines per Module
updated: 2026-07-22
---

# Clean Code Guidelines per Module

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Clean Code Guidelines per Module (companion to `hld.md`) |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `hld.md` (same folder) — module map §6.1, dependency rules §6.2/6.3 |
| Audience | Every developer and coding agent writing application code |
| Status | Living document — updated in place as conventions evolve |

**What this document is:** the concrete coding rules that make the HLD's architecture hold in practice. The HLD says *what the boundaries are*; this document says *what code inside them looks like*. Rules here are normative: "must" is CI-enforced or review-blocking, "should" is the default you deviate from only with a comment explaining why.

---

## 2. Repository layout

```
src/
  lib/
    server/
      modules/
        identity-and-access/  provider-profile/  provider-availability/  discovery-search/
        direct-messaging/     provider-reviews/  trust-and-safety/       listing-billing/
        provider-analytics/   user-notifications/ media-processing/     platform-configuration/
      shared/            # shared-kernel: ids, result, clock, event bus, audit, zod helpers
    components/          # shared UI components (design system)
  routes/                # SvelteKit delivery layer — pages, form actions, API, WS
  worker/                # worker entrypoint: schedules + queue consumer registration
```

Every module under `modules/<name>/` has the same anatomy:

```
modules/listing-billing/
  domain/          # entities, value objects, domain events, pure logic
  app/             # command/query handlers, port interfaces
  infra/           # Drizzle repositories, provider adapters, event subscriptions
  index.ts         # THE public API — facade + exported event types
```

**Must:** nothing outside a module imports anything from it except `index.ts`. Enforced by dependency-cruiser in CI (see §11).

---

## 3. The dependency rules (non-negotiable)

Legal import directions, identical in every module:

| From | May import | Must never import |
|---|---|---|
| `domain/` | itself, `shared/` types | `app/`, `infra/`, SvelteKit, Drizzle, `fetch`, `process.env`, any other module |
| `app/` | own `domain/`, own port interfaces, `shared/` | `infra/` (it defines ports; infra implements them), other modules' internals |
| `infra/` | own `app/` (ports), own `domain/` (types), `shared/`, third-party drivers | other modules' internals |
| `index.ts` | own `app/` handlers, own `domain/` event types | — |
| `src/routes/`, `src/worker/` | any module's `index.ts`, `shared/`, UI components | any module's `domain/`, `app/`, `infra/` directly |

Cross-module calls go through the target's facade; cross-module *reactions* go through domain events (HLD §6.3). A command handler must never invoke another module's command synchronously — publish an event instead. (Sole exception: same-transaction audit-log writes via the shared-kernel writer, per SR-APP-12.)

---

## 4. Domain layer

- **Model the language of the FRS.** Types are named from the ubiquitous language: `ProviderProfile`, `AvailabilityStatus`, `VerificationCase`, `ListingSubscription` — not `ProfileDTO`, `StatusRecord`.
- **No primitive obsession.** IDs are branded types (`UserId`, `ThreadId` — see `shared/ids.ts`), never raw `string`. Money is an integer-cents value object with currency; durations/instants use the shared `Clock` types, always UTC.
- **Invariants live in constructors/factories.** An object that exists is valid: `Review.create(...)` refuses a rating outside 1–5; `AvailabilityStatus` cannot be constructed already-expired. No `validate()` methods called by discipline.
- **Pure and I/O-free.** Domain functions take values, return values (or domain errors). Anything needing the clock takes an `Instant` parameter — never calls `Date.now()`. This is what makes the layer unit-testable in milliseconds.
- **State machines are explicit.** Billing lifecycle, verification cases, availability, report resolution: model states as a discriminated union and transitions as functions that either return the new state or a typed error. Illegal transitions must be unrepresentable or rejected — never silently coerced.
- **Domain events are past-tense facts** (`PaymentSucceeded`, `AvailabilityExpired`), defined in `domain/`, carrying IDs + immutable facts only — never entity snapshots.

## 5. Application layer

- **One use case, one file, one exported handler.** Named for intent: `commands/publish-profile.ts`, `queries/get-provider-dashboard.ts`. A handler does: authorize → load → decide (domain) → persist → publish events. If it does more, split it.
- **Ports are interfaces defined here** (`app/ports.ts`): `ProfileRepository`, `PaymentGateway`, `OtpSender`. Handlers receive ports via a module-local factory (plain constructor injection — no DI framework).
- **Transaction boundary = the command handler.** Exactly one transaction per command, owning: the aggregate write, the audit-log entry where required, and the outbox insert. Queries never open write transactions.
- **Authorization is application-layer.** The route hands in an `AuthContext` (from the server hook); the handler enforces role + ownership (`ctx.requireProvider(profile.ownerId)`). UI hiding is never the control (SR-SEC-05).
- **Errors are typed results, not thrown strings.** Handlers return `Result<T, UseCaseError>` (shared-kernel type); expected failures (not-found, forbidden, conflict, validation, rate-limited) are enumerated variants the route maps to status codes. `throw` is reserved for bugs and infrastructure failures — those propagate to the top-level handler, get logged with correlation ID, and render the friendly FR-UX-05 error.
- **Idempotency on money and state-transition paths** (SR-APP-12): webhook handlers check the processed-events ledger first; admin actions take an idempotency key derived from (actor, action, target, nonce); event subscribers use natural keys or a processed-ledger. "Retried safely" is a test case, not a hope.

## 6. Infrastructure layer

- **Adapters are thin and dumb.** A repository maps rows ↔ domain objects and nothing else; a provider adapter maps port calls ↔ HTTP and nothing else. Business decisions found in `infra/` are defects.
- **Every port has exactly two implementations:** the real one and a fake (in-memory or recording) used by tests and, where useful, staging. The fake lives next to the real one (`infra/paystack-gateway.ts`, `infra/fake-payment-gateway.ts`).
- **SQL stays legible.** Drizzle query builder for CRUD; hand-written SQL (via `sql` templates) is expected and preferred for the discovery ranking query, projections, and rollups — with the SRS rule it implements cited in a comment. No string-concatenated SQL, ever (SR-SEC-06).
- **Migrations:** generated per schema change, forward-only, reviewed as code (SR-DATA-06). A migration never contains data backfill logic that can't run online; long backfills are worker jobs.
- **Outbound HTTP** goes through the shared-kernel fetch wrapper (timeouts, SSRF guard, retry policy) — never raw `fetch` in adapters.

## 7. Delivery layer (routes, actions, WS)

- **Thin by decree:** parse → validate (Zod) → call one facade method → shape response. A route file containing an `if` about business state is a smell; a route file containing SQL is a defect.
- **Validation at the boundary, once.** Every route/action/WS message has a Zod schema; inside the boundary, data is typed and trusted. Schemas live beside the route; domain re-validates its own invariants regardless (belt and braces at two different layers, not duplication).
- **Progressive enhancement first** (SR-COMPAT-03): forms are real `<form>` + SvelteKit actions and work pre-hydration; JS enhances, never gates, the public/critical path.
- **Server-side privacy filtering** (SR-SEC-09): response shaping uses per-role serializers from the owning module; a field the role shouldn't see is never put on the wire. No client-side hiding of sensitive data, ever.
- **Accessibility is a code concern:** semantic elements, labeled controls, focus management on navigation, visible focus states. WCAG 2.2 AA checks run in CI (SR-COMPAT-04); "will fix in polish" is not a state.
- **Performance budget is a gate:** the 300 KB compressed-JS budget (SR-PERF-05) is asserted in CI. Adding a dependency that busts it means finding another way, not raising the budget.

## 8. Events & the bus

- **Naming:** `<Aggregate><PastTenseVerb>` — `ProviderPublished`, `ReportResolved`. Payload: IDs, the facts that changed, `occurredAt`. Version field from day one (`v: 1`); additive evolution only, new major version = new event name.
- **Publishing:** only via `publish()` inside the command's transaction (outbox). Publishing outside a transaction is a defect — the event could exist without its state change.
- **Subscribing:** handlers registered in `infra/subscriptions.ts` per module; each handler idempotent, small, and failure-isolated. A handler that needs current state fetches it through a facade — never trusts payload staleness.
- **No event chains for workflows.** If B must happen when A happened, one subscriber does B. Cascades of events triggering events are a design review, not a pattern.

## 9. Error handling, logging, observability

- **Structured logs only** (shared logger): JSON, request/correlation ID, module, event name. The correlation ID propagates web → outbox → worker.
- **Never log** (SR-OBS-05): passwords, tokens, OTPs, full emails/phones (use the shared maskers), message bodies, identity-document anything. The log serializer allowlist is the mechanism — new fields are excluded by default.
- **Every scheduled job**: idempotent, logs a completion summary (rows affected, duration), pings its healthchecks.io check on success. A job that can't say what it did didn't do it.
- **Metrics** are emitted at chokepoints (HTTP hook, bus dispatcher, job runner) — individual features get metrics for free and must not hand-roll counters.

## 10. Testing standards

| Layer | Kind | Rules |
|---|---|---|
| `domain/` | Pure unit tests (Vitest) | No DB, no mocks of your own code, milliseconds fast. Every invariant and state transition — legal and illegal — has a test. This is where TDD pays; write these first |
| `app/` | Handler tests with **fake ports** | Exercise the use case including authorization refusals, typed error paths, and idempotent-retry behavior. No DB required |
| `infra/` | Integration tests against **real PostgreSQL/MinIO** (Testcontainers) | Repositories, projections, migrations, outbox semantics. Contract tests assert fakes and real adapters honor the same port behavior |
| Delivery | Route tests (validation, status mapping, privacy serialization) + **Playwright E2E** on the critical path | E2E covers: search → profile → contact, provider onboarding → publish, availability set/expire, report → resolution, billing happy path (fake PSP). Runs in CI against the composed stack |
| Cross-cutting | CI gates | dependency-cruiser boundaries; bundle-size budget; WCAG automated checks; Trivy scan. All blocking |

- **Tests state behavior, not implementation:** `refuses review when thread younger than 24h`, not `calls repository.save`.
- **A bug fix ships with the test that would have caught it** — no exceptions.
- Coverage is a signal, not a goal; untested *domain logic* is review-blocking regardless of the percentage.

## 11. TypeScript & style

- `strict: true`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. **`any` is banned** (lint error); `unknown` + narrowing at boundaries.
- Model alternatives as **discriminated unions**, not boolean flags or optional-field soup. `readonly` by default on domain types.
- Naming: `camelCase` values, `PascalCase` types, `kebab-case` filenames. No abbreviations that aren't FRS vocabulary (ACC, OTP, PSP are fine; `usrPrfMgr` is not).
- Formatting is Prettier's problem; imports ordered by ESLint. Neither is ever discussed in review.
- **Comments state constraints, not narration.** The SRS/FRS rule a non-obvious piece of code implements is cited (`// SR-PERF-06: 60s freshness bound`); what the next line does is not.
- Dead code, commented-out code, and TODO-without-issue are deleted on sight.

## 12. Module-specific rules

Rules that exist because of what each module *is* (all trace to binding stances or SRS requirements):

| Module | Non-negotiable rules |
|---|---|
| `identity-and-access` | Uniform responses on register/reset (no enumeration, SR-SEC-04). Session checks only via the shared auth hook. Anonymization (FR-ACC-07) is a domain operation with tests proving irreversibility |
| `provider-profile` | Publish state changes always emit events (discovery depends on it). Tag vocabulary is data (platform config), never an enum in code |
| `provider-availability` | All comparisons in UTC against injected clock. Expiry logic exists exactly once (domain), used by both the sweep and reads |
| `discovery-search` | **Determinism is law** (FR-SRCH-13/D-5): same query + filters + location ⇒ same results; no per-user state, no randomness, no external calls on the search path. Ranking rules live in one SQL query, each `ORDER BY` term commented with its FRS rule. Lexicon reads from config cache, never hardcoded |
| `direct-messaging` | Message bodies never appear in logs or events (IDs only). Presence coarsening in the facade — raw timestamps never leave the module. Block checks in queries, not post-filtering |
| `provider-reviews` | Eligibility (≥ 24 h thread) asked of `direct-messaging`'s facade — never reimplemented. Ineligible submitters get the *explains* response (accepted user-story decision), not a hidden control |
| `trust-and-safety` | **Human-only moderation:** no code path takes automated action on content or reports — automation here computes badges and routes queues only. Every moderation action writes the audit log in-transaction. Identity-doc access only via short-TTL presigned URLs issued to admin sessions, issuance audit-logged |
| `listing-billing` | Money is integer cents. Every state transition idempotent + audit-logged in-transaction (SR-APP-12). Webhook handlers verify signatures before parsing. Lifecycle re-derivable from stored facts (missed webhook heals). A PSP outage must never unpublish anyone |
| `provider-analytics` | **Fire-and-forget capture:** the event endpoint never blocks or breaks a page (failures swallowed + counted). < 5 floor applied at read, raw events destroyed on schedule |
| `user-notifications` | Preference, block-silence, and batching checks centralized here — sender modules never pre-filter. Channel adapter failure degrades that channel only |
| `media-processing` | **Technical validation only** — decodability, size, count; never content judgment. EXIF/GPS strip is unconditional and tested with a geotagged fixture |
| `platform-configuration` | Config values always typed + schema-validated on read; a bad stored value fails loudly at startup, not silently at use |

## 13. Review checklist (PR gate)

1. Does every changed file respect the §3 import rules? (CI enforces; reviewer sanity-checks intent)
2. Is new business logic in `domain/`/`app/` — not in a route, adapter, or subscriber?
3. Are money/state-transition paths idempotent, transactional, and audit-logged where SR-APP-12 applies?
4. Do events follow §8 (past tense, IDs + facts, in-transaction publish)?
5. Is anything sensitive loggable through this change? (Check serializers, not intentions)
6. Do tests state behavior, cover the failure/illegal paths, and include the regression test if fixing a bug?
7. Does the change respect the binding stances — human-only moderation, no calendar/recommendations/service-payments, deterministic search?
8. Public-surface change: SSR-safe, pre-hydration functional, accessible, inside the JS budget?
