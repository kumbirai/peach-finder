---
title: Peach Finder — Test Cases — Identity & Access
updated: 2026-09-04
---

# Test Cases — Identity & Access (ACC)

## Document Control

| Field | Value |
|---|---|
| Upstream | `user-stories.md` §6 (E3 ACC), `frs.md` §4, `srs.md` §11 SEC |
| Seed pack | `seed-core`; `seed-onboarding` for TC-ACC-05 |
| Status | Living document — updated in place |

## US-ACC-01 (M) — Browse everything without an account

| TC ID | Scenario | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| TC-ACC-01a | Anonymous browse hits no login wall | `seed-core`, no session cookie | Load homepage, run a search, apply a filter, open a full profile | No modal, redirect, or content truncation occurs at any step; profile renders all FR-PROF-01 fields |
| TC-ACC-01b | Account-gated actions are visible, not hidden | As above | Open a profile; locate Message, Review, Report actions | All three are visibly present and tappable; tapping any routes to sign-in (not silently disabled, not absent) |

**Traces:** FR-ACC-01, FR-ACC-05.

## US-ACC-02 (M) — Sign up mid-action and land back in it

| TC ID | Scenario | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| TC-ACC-02a | Message-tap interruption returns to exact context | Anonymous, on a provider profile, draft message text typed | Tap Message → complete sign-up (email+password) | Returned to the same thread with the draft text intact |
| TC-ACC-02b | One-tap Google OAuth completes the same continuity | As above | Tap Message → choose Google OAuth → complete provider consent | Returned to the same profile/thread; no second manual form step |
| TC-ACC-02c | Email verification gates first send, doesn't discard it | New email+password account, unverified | Compose and send a first message before verifying email | Send is held (not discarded, not silently failed); message delivers automatically once email is verified |
| TC-ACC-02d | Interruption is exactly one screen | Anonymous | Trigger sign-up from any account-gated action | Exactly one screen presented between the tap and being signed in (no multi-step wizard) |

**Traces:** FR-ACC-02, FR-ACC-05, FR-UX-06, SR-INT-04.

## US-ACC-03 (M) — Stay signed in, sign out anywhere

| TC ID | Scenario | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| TC-ACC-03a | Session persists across visits | Signed-in seeker, "keep me signed in" default | Close and reopen the browser within 90 days | Still signed in, no re-auth prompt |
| TC-ACC-03b | Explicit sign-out revokes immediately | Signed-in seeker on two devices/tabs | Sign out on device A | Device A's session is unusable immediately; device B's session is unaffected |
| TC-ACC-03c | Password reset via single-use link | Registered seeker | Request reset, use the emailed link once, then again | First use succeeds and resets the password; second use of the same link is rejected; link rejected outright after 1h |
| TC-ACC-03d | Credential change revokes other sessions | Signed in on two devices | Change password on device A | Device B's session is revoked; device A remains signed in after re-authentication |

**Traces:** FR-ACC-06, FR-ACC-09, SR-SEC-04.

## US-ACC-04 (S) — One person, both roles

| TC ID | Scenario | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| TC-ACC-04a | Explicit role switch, no data co-mingling | Account with both seeker and provider role data | Switch from seeker to provider view and back | Switch control is explicit (not implicit/inferred); seeker's messages/reviews never appear inside the provider role's UI and vice versa |

**Traces:** FR-ACC-08.

## US-ACC-05 (M) — Delete my account

| TC ID | Scenario | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| TC-ACC-05a | Self-serve deletion with confirmation | Signed-in seeker | Initiate delete account | A confirmation step (FR-UX-05 pattern) is required before deletion proceeds |
| TC-ACC-05b | Provider deletion unpublishes immediately | Signed-in provider with a live, published profile | Delete account | Profile is unpublished/removed from discovery within the same transaction — not a lagging batch job |
| TC-ACC-05c | Threads and reviews survive attribution-anonymized | Deleted seeker had an existing thread and a review | View that thread from the other party; view that review on the profile | Thread shows "Deleted account" for the counterpart; review remains, attributed to "Former user" |
| TC-ACC-05d | Personal data anonymized within 30 days | Account deleted at T0 | Query underlying PII fields at T0+30 days (via a data-layer check, not UI) | No directly-identifying personal data remains outside the explicitly retained categories (billing/tax, moderation records) stated at the deletion point |

**Traces:** FR-ACC-07, FR-PRIV-03, SR-DATA-04.

## Visual & interaction quality (Two-Hue Rule, pill controls, 44px touch targets)

| TC ID | Scenario | Expected result |
|---|---|---|
| TC-ACC-VIS-01 | Sign-up/sign-in screen conforms to `DESIGN.md` | Primary action is a full-pill (999px) Terracotta Deep button; no third hue introduced; all tap targets ≥44px; focus ring visible on keyboard tab through the form |
| TC-ACC-VIS-02 | Account-gated action affordances | Message/Review/Report/Block icons pair with a text label (never icon-only) per the Never-Color-Alone / always-icon-plus-label convention carried through the whole product |
