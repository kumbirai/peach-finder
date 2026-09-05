---
title: DDD — US-MSG-02 — A conversation that keeps up
updated: 2026-09-04
---

# US-MSG-02 — A conversation that keeps up

**Epic:** Contact & arrange by message (MSG) — `user-stories.md` §7
**Priority:** M

## 1. Story

As either party, I want messages to arrive without refreshing, with sent/delivered/read states, so that arranging a time feels like texting, not email.

## 2. Acceptance criteria

- Messages appear to an online counterpart ≤ 2 s p95 over a persistent channel; polling fallback degrades latency, never functionality (SR-APP-05, SR-COMPAT-03).
- Sent/delivered/read states are visible and update live; photo attachments supported (S).

## 3. Traces

FR-MSG-02, SR-APP-05, SR-PERF-04.

## 4. Build blueprint

**Primary LLD module:** `direct-messaging` (`../../05-low-level-design/05-direct-messaging/direct-messaging-lld.md`)

Implement against that module's data model (§3 of its LLD doc), API contract, and domain-events sections; do not re-derive data shapes here — the LLD is the single source of truth for schema and contracts. Build tasks:

- [x] Backend: implement/extend the endpoint(s) and event publishers/subscribers this story requires, per the primary module's API-contract and domain-events sections.
- [x] Frontend: implement the surface(s) this story is user-visible on on the SvelteKit client, matching the interactive prototype (`06-ui-ux-design/prototypes/seeker-and-provider-prototype.html`) pixel-for-pixel on tokens and in spirit on interaction.
- [x] Tests: runnable Playwright spec(s) authored from the relevant `07-test-artifacts/05-playwright-spec-designs/*.spec-design.md` file(s) and the story-level test cases in `07-test-artifacts/03-test-cases/`; unit/integration coverage per `05-low-level-design/14-test-strategy/test-strategy.md`'s module-by-module matrix.

## 5. Visual & UX acceptance (mission-driven)

This delivery's driving mission is a top-10-app bar on visual look, premium feel, and flawless usability (see `00-foundations/frontend-design-system-implementation.ddd.md`). Every surface this story touches must satisfy, at minimum:

- **Token conformance** — only Terracotta Deep (`#B34625`, action/availability) and Verified Pine (`#2F5D50`, trust/verification) carry meaning (Two-Hue Rule, `DESIGN.md` §2); no status is color-only (Never-Color-Alone Rule); shadows tint toward Terracotta/Ink, never neutral gray (Warm Shadow Rule, `DESIGN.md` §4); Fraunces appears only at Display/Headline scale (One-Serif Rule, `DESIGN.md` §3); interactive controls are full-pill (999px) per `DESIGN.md` §5, with the documented exceptions (inputs 14px, cards 20px/14px nested).
- **Accessibility** — WCAG 2.2 AA (4.5:1 text / 3:1 UI), ≥44px touch targets at 360px, a visible Terracotta focus ring on every focusable element (never a bare browser outline, never `outline: none` with nothing replacing it), and `prefers-reduced-motion` respected wherever this story's surface animates (`PRODUCT.md` Accessibility & Inclusion; `DESIGN.md` §5 Signature Component).
- **Perceived performance** — skeleton/optimistic states on the loading path, never a bare spinner (FR-UX-05); no visible layout shift as photography/content resolves; server-rendered meaningful content pre-hydration where this surface is a first-load entry point (FR-UX-08).
- **Release gate** — enforced by `07-test-artifacts/05-playwright-spec-designs/e2e-visual-quality-design-system.spec-design.md` and, where this story affects a measured budget, `e2e-performance-and-perceived-quality.spec-design.md`. Both are live-stack-seeded designs (`stub_mode: forbidden`); the runnable `.spec.ts` is written at implementation time against this DDD.

## 6. Definition of Done

- All acceptance criteria in section 2 verified against the live-seeded stack (`seed-core` or the relevant seed pack) — no stubbed HTTP, no `page.route` interception, per this project's live-stack-seeded testing convention.
- Visual regression baseline captured/approved for every surface this story adds or changes; token-conformance and accessibility assertions above pass.
- `07-test-artifacts/04-traceability-matrix.md` row for US-MSG-02 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**2026-09-05 — US-MSG-02 implemented**

- **Backend (`direct-messaging`):** Thread participant access (`thread-access.ts`), message serializers with outbound delivery state, `sendMessageInThread`, `listThreadMessages`, `pollThreadMessages` (sets `delivered_at` on inbound fetch), `markThreadReadUpTo`. API routes: `GET/POST /api/messaging/threads/:threadId/messages`, `POST …/read`, `GET …/poll`. WS hub (`src/lib/server/ws/hub.ts`) registers connections, pushes `message.sent` / `message.delivered` / `message.read`, handles `presence.heartbeat`, `message.received` (delivery ack), `thread.typing`. `notifyMessageSent` wired from thread create/send paths. Vite dev WS upgrade plugin (`vite.ws-plugin.ts`) + `globalThis` connection map so dev/E2E share one hub instance.
- **Frontend:** `/messages/[threadId]` thread view with `ThreadConversation` + `MessageBubble` (prototype-aligned bubbles, Sent/Delivered/Read labels per Never-Color-Alone). Client `MessagingTransport` — WS with exponential backoff, polling fallback at 4s after 3 failed reconnects (`?forcePolling=1` for tests). Compose redirects to thread when one exists; messages list and provider inbox link to thread routes.
- **Tests:** `conversation-delivery.integration.test.ts` (TC-MSG-02b/c, block 404, delivery idempotency); domain/unit tests for delivery state and serializers; Playwright `testing/playwright/messaging-live.e2e.ts` (TC-MSG-02a–c + axe). Updated TC-MSG-01a in `search-to-contact.e2e.ts` for thread redirect flow.
- **Assumption:** Client→server delivery ack uses `message.received` WS type (payload `{ threadId, messageId }`) — completes LLD §4.2 ack path not named in `event-catalog.md` §6; catalog lists only server→client delivery types.
