---
title: Development Deliverable Documents — Overview & Index
updated: 2026-09-04
---

# Development Deliverable Documents — Overview & Index

## 1. What this stage is

Per-story implementation blueprint documents (DDDs) — the bridge between the finished BRD -> FRS -> SRS -> User Stories -> HLD -> LLD/TDD -> UI/UX design -> Test Artefacts chain and actual code. **This stage is documentation only** — it never contains or triggers application code. No application code exists yet anywhere in this repository; that is a separate, later, scripted process (an `implement-stories.sh`-style driver iterating `00-foundations/implementation-sequence.md`), outside this stage's scope.

This delivery's driving mission — a top-10-app bar on visual look, premium feel, and flawless usability — is why every UI-facing story DDD below carries a mandatory "Visual & UX acceptance" section pointing back to `00-foundations/frontend-design-system-implementation.ddd.md`, and why that foundation document exists at all alongside the more conventional per-story blueprints.

## 2. Foundations (read first)

| Document | Covers |
|---|---|
| [`frontend-design-system-implementation.ddd.md`](00-foundations/frontend-design-system-implementation.ddd.md) | Token pipeline, component library, motion primitives, performance budget — the build-blocking dependency for every UI-facing story below |
| [`implementation-sequence.md`](00-foundations/implementation-sequence.md) | Dependency-ordered build waves (0-6) across all 76 stories |

## 3. Story DDD index

Every row traces BR (via the epic's upstream BRD section) -> the FR/SR IDs on the story (see the DDD file's own §3) -> the US-ID -> the owning LLD module(s). Full BR/FR/SR traceability already lives in `07-test-artifacts/04-traceability-matrix.md`; this table adds the DDD and LLD-module columns that matrix doesn't carry.

### DISC — Discover who's available (`user-stories.md` §4)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-DISC-01 | M | The homepage answers "who is available now?" | `discovery-search` | [US-DISC-01](E1-DISC/US-DISC-01-homepage-answers-who-is-available-now.ddd.md) |
| US-DISC-02 | M | Search the way I'd say it | `discovery-search` | [US-DISC-02](E1-DISC/US-DISC-02-search-the-way-id-say-it.ddd.md) |
| US-DISC-03 | M | Suggestions as I type | `discovery-search` | [US-DISC-03](E1-DISC/US-DISC-03-suggestions-as-i-type.ddd.md) |
| US-DISC-04 | M | Filter and refine without losing my place | `discovery-search` | [US-DISC-04](E1-DISC/US-DISC-04-filter-and-refine-without-losing-my-place.ddd.md) |
| US-DISC-05 | M | "Near me" without giving up my privacy | `discovery-search` | [US-DISC-05](E1-DISC/US-DISC-05-near-me-without-giving-up-my-privacy.ddd.md) |
| US-DISC-06 | M | Availability outranks everything, honestly | `discovery-search` | [US-DISC-06](E1-DISC/US-DISC-06-availability-outranks-everything-honestly.ddd.md) |
| US-DISC-07 | M | Empty results that help instead of a dead end | `discovery-search` | [US-DISC-07](E1-DISC/US-DISC-07-empty-results-that-help-instead-of-a-dead-end.ddd.md) |
| US-DISC-08 | S | Cards I can shortlist from | `discovery-search` | [US-DISC-08](E1-DISC/US-DISC-08-cards-i-can-shortlist-from.ddd.md) |
| US-DISC-09 | C | Re-run my recent searches | `discovery-search` | [US-DISC-09](E1-DISC/US-DISC-09-re-run-my-recent-searches.ddd.md) |

### VIEW — Judge a provider from their profile (`user-stories.md` §5)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-VIEW-01 | M | Everything I need to decide, on one screen | `provider-profile` | [US-VIEW-01](E2-VIEW/US-VIEW-01-everything-i-need-to-decide-on-one-screen.ddd.md) |
| US-VIEW-02 | M | Honest presence, not surveillance | `provider-profile` | [US-VIEW-02](E2-VIEW/US-VIEW-02-honest-presence-not-surveillance.ddd.md) |
| US-VIEW-03 | M | Contact actions where my thumb is | `provider-profile` | [US-VIEW-03](E2-VIEW/US-VIEW-03-contact-actions-where-my-thumb-is.ddd.md) |
| US-VIEW-04 | M | Badges that explain themselves | `trust-and-safety` | [US-VIEW-04](E2-VIEW/US-VIEW-04-badges-that-explain-themselves.ddd.md) |
| US-VIEW-05 | M | Reviews I can weigh | `provider-reviews` | [US-VIEW-05](E2-VIEW/US-VIEW-05-reviews-i-can-weigh.ddd.md) |
| US-VIEW-06 | S | Share a profile | `provider-profile` | [US-VIEW-06](E2-VIEW/US-VIEW-06-share-a-profile.ddd.md) |

### ACC — Get an account without losing my place (`user-stories.md` §6)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-ACC-01 | M | Browse everything without an account | `identity-and-access` | [US-ACC-01](E3-ACC/US-ACC-01-browse-everything-without-an-account.ddd.md) |
| US-ACC-02 | M | Sign up mid-action and land back in it | `identity-and-access` | [US-ACC-02](E3-ACC/US-ACC-02-sign-up-mid-action-and-land-back-in-it.ddd.md) |
| US-ACC-03 | M | Stay signed in, sign out anywhere | `identity-and-access` | [US-ACC-03](E3-ACC/US-ACC-03-stay-signed-in-sign-out-anywhere.ddd.md) |
| US-ACC-04 | S | One person, both roles | `identity-and-access` | [US-ACC-04](E3-ACC/US-ACC-04-one-person-both-roles.ddd.md) |
| US-ACC-05 | M | Delete my account | `identity-and-access` | [US-ACC-05](E3-ACC/US-ACC-05-delete-my-account.ddd.md) |

### MSG — Contact & arrange by message (`user-stories.md` §7)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-MSG-01 | M | Start the conversation from the profile | `direct-messaging` | [US-MSG-01](E4-MSG/US-MSG-01-start-the-conversation-from-the-profile.ddd.md) |
| US-MSG-02 | M | A conversation that keeps up | `direct-messaging` | [US-MSG-02](E4-MSG/US-MSG-02-a-conversation-that-keeps-up.ddd.md) |
| US-MSG-03 | M | Arrange the time in words, not widgets | `direct-messaging` | [US-MSG-03](E4-MSG/US-MSG-03-arrange-the-time-in-words-not-widgets.ddd.md) |
| US-MSG-04 | M | My inbox, at a glance | `direct-messaging` | [US-MSG-04](E4-MSG/US-MSG-04-my-inbox-at-a-glance.ddd.md) |
| US-MSG-05 | M | I know I'm on the clock (provider) | `direct-messaging` | [US-MSG-05](E4-MSG/US-MSG-05-i-know-im-on-the-clock-provider.ddd.md) |
| US-MSG-06 | M | Safety is two taps away, mid-conversation | `direct-messaging` | [US-MSG-06](E4-MSG/US-MSG-06-safety-is-two-taps-away-mid-conversation.ddd.md) |

### REV — Reviews & ratings (`user-stories.md` §8)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-REV-01 | M | Leave a review that counts | `provider-reviews` | [US-REV-01](E5-REV/US-REV-01-leave-a-review-that-counts.ddd.md) |
| US-REV-02 | M | Live immediately, human-removable only | `provider-reviews` | [US-REV-02](E5-REV/US-REV-02-live-immediately-human-removable-only.ddd.md) |
| US-REV-03 | M | Change my mind | `provider-reviews` | [US-REV-03](E5-REV/US-REV-03-change-my-mind.ddd.md) |
| US-REV-04 | M | Ratings I can search by, fairly | `provider-reviews` | [US-REV-04](E5-REV/US-REV-04-ratings-i-can-search-by-fairly.ddd.md) |
| US-REV-05 | S | The provider's right of reply | `provider-reviews` | [US-REV-05](E5-REV/US-REV-05-the-providers-right-of-reply.ddd.md) |
| US-REV-06 | M | Blocking doesn't rewrite history | `provider-reviews` | [US-REV-06](E5-REV/US-REV-06-blocking-doesnt-rewrite-history.ddd.md) |

### SAFE — Stay safe: report & block (`user-stories.md` §9)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-SAFE-01 | M | Report anything, from anywhere, in two taps | `trust-and-safety` | [US-SAFE-01](E6-SAFE/US-SAFE-01-report-anything-from-anywhere-in-two-taps.ddd.md) |
| US-SAFE-02 | M | Block: instant, silent, messages both ways | `trust-and-safety` | [US-SAFE-02](E6-SAFE/US-SAFE-02-block-instant-silent-messages-both-ways.ddd.md) |
| US-SAFE-03 | S | Know what the badges actually mean | `trust-and-safety` | [US-SAFE-03](E6-SAFE/US-SAFE-03-know-what-the-badges-actually-mean.ddd.md) |

### PONB — Become a provider & build my profile (`user-stories.md` §10)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-PONB-01 | M | Register as a provider | `identity-and-access` | [US-PONB-01](E7-PONB/US-PONB-01-register-as-a-provider.ddd.md) |
| US-PONB-02 | S | Guided onboarding that converts | `provider-profile` | [US-PONB-02](E7-PONB/US-PONB-02-guided-onboarding-that-converts.ddd.md) |
| US-PONB-03 | M | Build the profile itself | `provider-profile` | [US-PONB-03](E7-PONB/US-PONB-03-build-the-profile-itself.ddd.md) |
| US-PONB-04 | M | I publish it. Nobody else. | `provider-profile` | [US-PONB-04](E7-PONB/US-PONB-04-i-publish-it-nobody-else.ddd.md) |
| US-PONB-05 | M | Edit live, always | `provider-profile` | [US-PONB-05](E7-PONB/US-PONB-05-edit-live-always.ddd.md) |
| US-PONB-06 | M | Unpublish and come back freely | `provider-profile` | [US-PONB-06](E7-PONB/US-PONB-06-unpublish-and-come-back-freely.ddd.md) |
| US-PONB-07 | M | Control my phone number's exposure | `provider-profile` | [US-PONB-07](E7-PONB/US-PONB-07-control-my-phone-numbers-exposure.ddd.md) |
| US-PONB-08 | S | See myself as seekers see me | `provider-profile` | [US-PONB-08](E7-PONB/US-PONB-08-see-myself-as-seekers-see-me.ddd.md) |

### AVAIL — Run my availability (`user-stories.md` §11)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-AVAIL-01 | M | One tap: I'm available | `provider-availability` | [US-AVAIL-01](E8-AVAIL/US-AVAIL-01-one-tap-im-available.ddd.md) |
| US-AVAIL-02 | M | One tap: I'm done | `provider-availability` | [US-AVAIL-02](E8-AVAIL/US-AVAIL-02-one-tap-im-done.ddd.md) |
| US-AVAIL-03 | M | The signal can't go stale | `provider-availability` | [US-AVAIL-03](E8-AVAIL/US-AVAIL-03-the-signal-cant-go-stale.ddd.md) |
| US-AVAIL-04 | M | "Active this week", earned automatically | `trust-and-safety` | [US-AVAIL-04](E8-AVAIL/US-AVAIL-04-active-this-week-earned-automatically.ddd.md) |
| US-AVAIL-05 | S | No black boxes about my own signals | `provider-availability` | [US-AVAIL-05](E8-AVAIL/US-AVAIL-05-no-black-boxes-about-my-own-signals.ddd.md) |

### VERIF — Earn the identity badge (`user-stories.md` §12)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-VERIF-01 | M | Submit my identity claim | `trust-and-safety` | [US-VERIF-01](E9-VERIF/US-VERIF-01-submit-my-identity-claim.ddd.md) |
| US-VERIF-02 | M | A human decides; the badge follows | `trust-and-safety` | [US-VERIF-02](E9-VERIF/US-VERIF-02-a-human-decides-the-badge-follows.ddd.md) |
| US-VERIF-03 | M | Badge suppression on identity-relevant changes | `trust-and-safety` | [US-VERIF-03](E9-VERIF/US-VERIF-03-badge-suppression-on-identity-relevant-changes.ddd.md) |

### ANLY — Understand how I'm found (`user-stories.md` §13)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-ANLY-01 | M | My four numbers | `provider-analytics` | [US-ANLY-01](E10-ANLY/US-ANLY-01-my-four-numbers.ddd.md) |
| US-ANLY-02 | M | Aggregate always, identifiable never | `provider-analytics` | [US-ANLY-02](E10-ANLY/US-ANLY-02-aggregate-always-identifiable-never.ddd.md) |
| US-ANLY-03 | M | Demand signal I can act on | `provider-analytics` | [US-ANLY-03](E10-ANLY/US-ANLY-03-demand-signal-i-can-act-on.ddd.md) |
| US-ANLY-04 | S | Cause and effect on the chart | `provider-analytics` | [US-ANLY-04](E10-ANLY/US-ANLY-04-cause-and-effect-on-the-chart.ddd.md) |

### BILL — Pay to be listed & featured (`user-stories.md` §14)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-BILL-01 | M | A free period I can trust | `listing-billing` | [US-BILL-01](E11-BILL/US-BILL-01-a-free-period-i-can-trust.ddd.md) |
| US-BILL-02 | M | One free period per person, enforced quietly | `listing-billing` | [US-BILL-02](E11-BILL/US-BILL-02-one-free-period-per-person-enforced-quietly.ddd.md) |
| US-BILL-03 | M | Painless self-serve billing | `listing-billing` | [US-BILL-03](E11-BILL/US-BILL-03-painless-self-serve-billing.ddd.md) |
| US-BILL-04 | M | Lapse with grace, return instantly | `listing-billing` | [US-BILL-04](E11-BILL/US-BILL-04-lapse-with-grace-return-instantly.ddd.md) |
| US-BILL-05 | M | Buy fair featuring | `listing-billing` | [US-BILL-05](E11-BILL/US-BILL-05-buy-fair-featuring.ddd.md) |

### NOTIF — The right nudge at the right time (`user-stories.md` §15)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-NOTIF-01 | M | The baseline event set | `user-notifications` | [US-NOTIF-01](E12-NOTIF/US-NOTIF-01-the-baseline-event-set.ddd.md) |
| US-NOTIF-02 | M | My channels, my choice — except what protects me | `user-notifications` | [US-NOTIF-02](E12-NOTIF/US-NOTIF-02-my-channels-my-choice-except-what-protects-me.ddd.md) |
| US-NOTIF-03 | M | Never a spam cannon | `user-notifications` | [US-NOTIF-03](E12-NOTIF/US-NOTIF-03-never-a-spam-cannon.ddd.md) |
| US-NOTIF-04 | S | Every notification lands me where I act | `user-notifications` | [US-NOTIF-04](E12-NOTIF/US-NOTIF-04-every-notification-lands-me-where-i-act.ddd.md) |

### ADMIN — Keep the platform honest (admin) (`user-stories.md` §16)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-ADMIN-01 | M | A hardened console for a powerful job | `moderation-admin` | [US-ADMIN-01](E13-ADMIN/US-ADMIN-01-a-hardened-console-for-a-powerful-job.ddd.md) |
| US-ADMIN-02 | M | Work the identity queue | `moderation-admin` | [US-ADMIN-02](E13-ADMIN/US-ADMIN-02-work-the-identity-queue.ddd.md) |
| US-ADMIN-03 | M | Work the reports queue to human resolution | `moderation-admin` | [US-ADMIN-03](E13-ADMIN/US-ADMIN-03-work-the-reports-queue-to-human-resolution.ddd.md) |
| US-ADMIN-04 | M | The only hands that take content down | `moderation-admin` | [US-ADMIN-04](E13-ADMIN/US-ADMIN-04-the-only-hands-that-take-content-down.ddd.md) |
| US-ADMIN-05 | M | Look up anyone, impersonate no one | `moderation-admin` | [US-ADMIN-05](E13-ADMIN/US-ADMIN-05-look-up-anyone-impersonate-no-one.ddd.md) |
| US-ADMIN-06 | M | Tune the platform without a deploy | `platform-configuration` | [US-ADMIN-06](E13-ADMIN/US-ADMIN-06-tune-the-platform-without-a-deploy.ddd.md) |
| US-ADMIN-07 | M | Everything I do is on the record | `moderation-admin` | [US-ADMIN-07](E13-ADMIN/US-ADMIN-07-everything-i-do-is-on-the-record.ddd.md) |
| US-ADMIN-08 | S | See the scaling wall coming | `moderation-admin` | [US-ADMIN-08](E13-ADMIN/US-ADMIN-08-see-the-scaling-wall-coming.ddd.md) |

### PRIV — My data, my contact details (`user-stories.md` §17)

| Story | Priority | Title | Primary module | DDD |
|---|---|---|---|---|
| US-PRIV-01 | M | My number leaks nowhere I didn't allow | `provider-profile` | [US-PRIV-01](E14-PRIV/US-PRIV-01-my-number-leaks-nowhere-i-didnt-allow.ddd.md) |
| US-PRIV-02 | M | My address isn't in the system at all | `provider-profile` | [US-PRIV-02](E14-PRIV/US-PRIV-02-my-address-isnt-in-the-system-at-all.ddd.md) |
| US-PRIV-03 | M | Data that expires on schedule | `identity-and-access` | [US-PRIV-03](E14-PRIV/US-PRIV-03-data-that-expires-on-schedule.ddd.md) |
| US-PRIV-04 | M | Terms I actually agreed to | `identity-and-access` | [US-PRIV-04](E14-PRIV/US-PRIV-04-terms-i-actually-agreed-to.ddd.md) |

## 4. Status

All 76 story DDDs and both foundation documents were generated in this pass (stage 9 of the SDLC ladder, 2026-09-04). None has been reviewed against an actual implementation yet, since none exists. Traceability-matrix cross-references were added in the same pass (see `07-test-artifacts/04-traceability-matrix.md`).

