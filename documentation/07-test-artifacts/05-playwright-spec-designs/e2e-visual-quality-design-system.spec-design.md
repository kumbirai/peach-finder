---
title: E2E Spec Design — Visual Quality & Design-System Conformance
updated: 2026-09-04
---

# Visual quality & design-system conformance

**Why this design exists.** This delivery's mission is for Peach Finder to be a top-10 app in its category on visual look and premium feel, not merely functionally correct. Functional test cases (`03-test-cases/`) each carry a "Visual & interaction quality" row that names a specific `DESIGN.md` rule, but a row in a table is a manual/spot-check unless something actually diffs pixels and audits tokens on every change. This design is that something — the release-gating proof that the product still looks like the product `DESIGN.md` and the interactive prototype (`06-ui-ux-design/prototypes/seeker-and-provider-prototype.html`) describe, on every build, not just at design-review time.

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-core` |
| Traces | `DESIGN.md` (all sections), `PRODUCT.md` (Design Principles, Anti-references), FR-UX-03/04, BR-23 |

## Surfaces covered

Homepage, search results, provider profile, message thread, provider dashboard, provider onboarding wizard, admin console (identity queue + reports queue) — the same surface set the interactive prototype demonstrates, at three breakpoints (360px, 768px, 1280px) and, where the design system defines persona-specific chrome, across the seeker/provider/admin personas.

## Assertions this design must make concrete

### Token conformance (automatable, not just visual diff)
- **Two-Hue Rule:** scan rendered computed styles for any color outside the defined token set (`colors.*` in `DESIGN.md`'s frontmatter) being used to convey meaning (not decorative/photography) on any of the covered surfaces. Fail on any third meaningful hue.
- **Never-Color-Alone Rule:** for every availability-pill and badge instance in the seeded data, assert the DOM contains both the color-bearing element and an accompanying icon/text node — not just a colored dot/background with no textual sibling.
- **Warm Shadow Rule:** for every card/button hover/focus/press state, assert the computed `box-shadow` color channel is tinted toward Terracotta (`#B34625`-family) or Ink (`#2B2622`-family), never a neutral gray (`rgba(0,0,0,…)` or similar achromatic value).
- **One-Serif Rule:** assert Fraunces (`font-family` containing "Fraunces") appears only on elements matching the Display/Headline typography scale; assert it never appears in computed styles for body copy, buttons, or chrome elements.
- **Pill-shape rule:** assert every interactive button/chip has `border-radius` at or above the `rounded.pill` token (999px), except where `DESIGN.md` explicitly carves out an exception (input fields at 14px, nested elements at 14px, cards at 20px).
- **Admin Ink exception stays admin-only:** assert the dark Ink-strip treatment appears only within the admin console surface, never on any seeker/provider-facing screen.

### Visual regression (screenshot diffing)
- Each covered surface × breakpoint combination is screenshotted and diffed against an explicitly-approved baseline (owned by the design-system owner per `02-test-plan.md` §7 risk register — never silently auto-updated by a passing run).
- A diff beyond the agreed pixel/perceptual-difference threshold fails the check and requires explicit re-approval, not an automatic pass.

### Accessibility as a visual-quality gate
- WCAG 2.2 AA automated pass (axe-core or equivalent) on every covered surface — this is FR-UX-03/SR-COMPAT-04 already, restated here because a design that fails contrast is also a design that fails the "premium feel" mission; the two are not separable checks in practice.
- Every interactive element ≥44px touch target at 360px viewport.
- Keyboard-only pass: tab through each surface, assert a visible focus ring on every focusable element (the Terracotta focus ring `DESIGN.md` §5 specifies, never a browser-default outline with no custom treatment, never `outline: none` with nothing replacing it).

### Motion & reduced-motion
- Availability-pill pulse animation present under default settings; assert it is absent/disabled when `prefers-reduced-motion: reduce` is set (per `DESIGN.md` §5 Signature Component and `PRODUCT.md` Accessibility & Inclusion).

## Explicit non-goals

This design does not re-derive the design system's rules — it enforces the ones `DESIGN.md` already states. A rule this design fails to enforce that later causes a regression is a gap in this design, not license to add a new undocumented rule here; new visual rules belong in `DESIGN.md` first.
