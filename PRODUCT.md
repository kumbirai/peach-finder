# Product

## Register

product

## Users

- **Seekers** — people looking for a massage therapist near them, right now or soon. Mobile-first, often searching in-the-moment (post-workout, travel, stress, pain). Want speed, clear trust signals, and zero friction between "search" and "message."
- **Providers** — independent, licensed massage therapists (not spas, not multi-therapist studios). Managing their own profile, availability toggle, and inbound messages, usually from a phone between clients. Want to look credible and get discovered without administrative overhead.
- **Platform Admin** — verifies identities, moderates reports, low-frequency use. Functional, not a design priority for this pass.

## Product Purpose

peach-finder helps someone find and message a trustworthy, currently-available independent massage therapist near them, fast. V1 is deliberately narrow — one vertical (massage therapists), incall only, no calendar booking, messaging-based scheduling, two trust badges only — to prove speed and trust before expanding scope. Success is a seeker going from open-app to sent-message in under two minutes, and a provider getting discovered and booked with minimal admin burden.

## Brand Personality

**Warm. Trustworthy. Effortless.**

Reference lane: consumer wellness/hospitality (Airbnb's photo-forward trust, Calm/Headspace's non-clinical calm), not enterprise SaaS. Should feel like a caring concierge who already checked this person out for you, not a directory of contractors and not a clinical booking portal.

## Anti-references

- Cold enterprise SaaS defaults: navy + gray dashboards, hero-metric tiles, identical icon-cards (Linear/Salesforce register bleeding into a consumer product).
- Clinical "medical portal" white + teal — reads sterile, not caring.
- Dense spreadsheet/directory listings (SeekOut-style) that bury people in data rows instead of presenting them as people.
- Craigslist/classifieds visual clutter.
- Anything moody, dim, or overly intimate in photography or copy tone — this product must read unambiguously as licensed wellness services. Photography, copy, and layout should actively signal professional/wellness context, never anything adjacent to adult services. This is a trust-and-safety requirement, not just an aesthetic one.

## Design Principles

1. **Trust is the product.** Every screen reinforces verification, real-time availability, and safety before anything else competes for attention.
2. **Fast over feature-rich.** Search to message happens in seconds — no calendar, no unnecessary steps or fields, matching the no-booking-calendar constraint.
3. **Photo-forward, human-first.** Real people, real rooms, generous whitespace. Never reduce a therapist to a data row.
4. **Calm confidence, not corporate coldness.** Warm cream/paper neutrals with two meaningful hues only: Terracotta (action/availability) and Pine (trust/verification/presence). Explicitly not navy-and-gray SaaS, not white-and-teal clinical.
5. **Show, don't gate.** Availability and trust badges are visible at a glance in results, never hidden behind an extra click.

## Accessibility & Inclusion

- WCAG AA minimum: 4.5:1 text contrast, 3:1 UI component contrast.
- Never convey status (available now, verified) by color alone — always pair color with an icon and a text label.
- Respect `prefers-reduced-motion`.
- Mobile-first, one-handed use: primary actions thumb-reachable, key CTAs bottom-anchored on small screens.
