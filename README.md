# Peach Finder

> **Proprietary and confidential.** This repository and its contents are not open source. Access, use, copying, modification, and distribution are permitted only with the copyright holder's express authorization.

Peach Finder is a mobile-first people discovery platform designed to help seekers find trusted massage therapists who are available now. It combines real-time availability, rich provider profiles, deterministic search, direct messaging, and a deliberately small set of credible trust signals.

## Project status

Peach Finder is currently in the design phase. The business, functional, system, user-story, architecture, and low-level design documents are complete; a UI/UX design system plus interactive prototype exist under `documentation/06-ui-ux-design/`; and the test strategy, plan, story-level test cases, traceability matrix, and Playwright E2E designs are written under `documentation/07-test-artifacts/`. Per-story Development Deliverable Documents (implementation blueprints for all 76 user stories) are complete under `documentation/08-development-deliverable-documents/`. Application code, deployment assets, and executable test specs have not yet been created.

There is therefore no runnable development environment or build command at this stage. This README should be updated when implementation begins.

## V1 product scope

V1 is intentionally focused:

- Massage therapists are the only supported provider category.
- Services are incall only: the seeker travels to the provider.
- Provider-set, timestamped availability drives homepage and search ordering.
- Search supports natural-language queries and structured filters.
- Provider profiles include services, languages, pricing, media, reviews, contact options, and trust badges.
- Registered seekers can message providers to arrange appointments directly.
- Trust signals are limited to identity verification and recent activity.
- Providers can pay for listings and featured placement after a configurable free period.
- Platform staff handle verification, reports, and moderation manually.

V1 does not include appointment calendars, time-slot management, service-payment processing, automated moderation, personalized recommendations, native mobile applications, outcall services, or additional service verticals.

## Planned architecture

The approved design is a feature-oriented modular monolith built with TypeScript, SvelteKit 2, Svelte 5, and Node.js LTS.

- **Runtime:** one container image with separate `web` and `worker` entrypoints
- **Application structure:** domain-driven modules using hexagonal boundaries and lightweight CQRS
- **Data:** PostgreSQL as the system of record, search engine, transactional outbox, and job queue
- **Media:** MinIO storage with worker-based image processing through `sharp`
- **Realtime:** in-application WebSockets with polling fallback
- **Edge and origin:** Cloudflare in front of Caddy on a South African Ubuntu LTS host
- **Operations:** Docker, GitHub Actions, GHCR, off-host observability, and encrypted off-host backups

The design favors deterministic behavior, strong module boundaries, privacy by construction, and straightforward operation on a single host.

## Documentation map

The `documentation/` directory is the canonical source for product and technical decisions:

| Path | Contents | Status |
|---|---|---|
| `00-business-requirements/` | Product goals, V1 scope, constraints, and business requirements | Complete |
| `01-functional-requirements-specification/` | Actors, modules, functional behavior, and traceability | Complete |
| `02-system-requirements-specification/` | Platform, data, security, performance, and operational requirements | Complete |
| `03-user-stories/` | Epics, stories, acceptance criteria, and process flows | Complete |
| `04-solution-architecture/` | High-level architecture and module-level clean-code rules | Complete |
| `05-low-level-design/` | Shared contracts, schemas, APIs, state machines, algorithms, and module designs | Complete |
| `06-ui-ux-design/` | Design system, tokens, and interactive prototype | Living — prototype plus known-gaps list |
| `07-test-artifacts/` | Test strategy, plan, story-level test cases, traceability matrix, and Playwright E2E designs | Written — strategy, plan, cases, traceability, and 11 live-stack-seeded Playwright designs; executable specs come later at implementation time |
| `08-development-deliverable-documents/` | Per-story implementation blueprints (DDDs) bridging design to code, plus build-wave sequencing and the frontend design-system implementation guide | Written — 76 per-story DDDs across 14 epics, an index, and two foundation docs; documentation only, no application code |
| `09-deployment-operational-documents/` (not yet created) | Deployment assets, provisioning, and operational runbooks | Not started |

Start with these documents:

1. [`documentation/00-business-requirements/brd.md`](documentation/00-business-requirements/brd.md) for the product and V1 boundaries.
2. [`documentation/04-solution-architecture/hld.md`](documentation/04-solution-architecture/hld.md) for the approved technical approach.
3. [`documentation/04-solution-architecture/clean-code-guidelines-per-module.md`](documentation/04-solution-architecture/clean-code-guidelines-per-module.md) for implementation rules.
4. [`documentation/05-low-level-design/00-foundations/lld-index.md`](documentation/05-low-level-design/00-foundations/lld-index.md) for the buildable design and recommended reading order.
5. [`documentation/08-development-deliverable-documents/00-overview.md`](documentation/08-development-deliverable-documents/00-overview.md) for the per-story implementation blueprints and build-wave sequence.

## Working in this repository

Before making changes:

1. Read [`CLAUDE.md`](CLAUDE.md). It is the single source of truth for repository workflow and agent instructions.
2. Read the relevant upstream requirements before changing a downstream design or implementation.
3. Check the target LLD document's open questions and traceability references.
4. Preserve the project's binding V1 boundaries, particularly deterministic search, human-only moderation, and the absence of booking, recommendation, and service-payment subsystems.

When implementation starts, contributions must follow the module dependency rules, security controls, testing standards, and review gate defined in the architecture documents. New behavior should remain traceable to an approved requirement or an explicitly recorded decision.

## Security and confidentiality

- Do not share source code, documentation, screenshots, architecture details, data, or credentials outside authorized channels.
- Do not commit secrets, personal data, production exports, identity documents, or local environment files.
- Use synthetic or properly anonymized data for development and testing.
- Report suspected security or privacy issues privately to the repository owner. Do not open a public issue or disclose them externally.

## License

Copyright © 2026. All rights reserved.

No license is granted to use, reproduce, modify, publish, distribute, sublicense, sell, or create derivative works from this software or its documentation except under a separate written agreement with the copyright holder.
