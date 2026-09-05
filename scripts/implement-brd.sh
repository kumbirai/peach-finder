#!/usr/bin/env bash
# Drive end-to-end implementation of the Peach Finder V1 BRD --
#   documentation/00-business-requirements/brd.md
# via its 76-story Development Deliverable Document set at
#   documentation/08-development-deliverable-documents/
# with cursor-agent.
#
# Modeled directly on ~/code/checkin-prep/scripts/implement-str-direct-booking.sh
# (BRD-scoped prompt shape, sequence-doc-driven collect_stories() with no
# hardcoded story array, a second cursor-agent review-and-fix pass on each
# story's own diff before commit, and commit that is never optional -- there
# is no --skip-commit / --auto-commit flag). It differs from that precedent
# in the one respect this repo's own situation demands: Peach Finder has
# ZERO application code as of this driver's first run (stage 9's DDDs are
# documentation-only, per the sdlc-next skill's own guardrail), not an
# additive epic onto an existing monorepo -- so this script prepends a
# one-time Wave 0 FOUNDATION bootstrap step (not a story) that stands up the
# whole SvelteKit app, the LLD foundation modules, and the frontend
# design-system implementation before any of the 76 stories can build on it.
# The stack is TypeScript/SvelteKit/Drizzle/Postgres (HLD SS6.2-4), not Java/
# Hexagonal -- every constraint below was rewritten for that stack, not
# copied from the Java precedent.
#
# Waves (documentation/08-development-deliverable-documents/00-foundations/
# implementation-sequence.md's own "## Wave table" section is this script's
# source of truth for story-to-wave assignment -- this list is a summary,
# not the authority):
#   W0  Foundation bootstrap (not a story) -- SvelteKit app scaffold, LLD
#       foundation modules (shared-kernel, api-conventions, event-catalog,
#       security-implementation), platform-configuration bootstrap, and the
#       frontend design-system implementation (token pipeline, component
#       library, motion primitives, performance-budget scaffolding). Every
#       later wave depends on this landing first.
#   W1  Accounts & profiles (13) -- E3 ACC + E7 PONB.
#   W2  Availability & discovery (14) -- E8 AVAIL (US-AVAIL-01..03) +
#       E1 DISC + US-PRIV-01/02 (phone-visibility serializer, EXIF/GPS
#       stripping -- no dependency beyond provider-profile/media-processing,
#       both built in W1). US-AVAIL-04/05 wait until W4.
#   W3  Profile view & messaging (13) -- E2 VIEW + E4 MSG + US-NOTIF-01
#       (baseline notification event set, since nearly every notification
#       category originates from a messaging event).
#   W4  Safety & admin, before public launch (16) -- E6 SAFE + E13 ADMIN +
#       E9 VERIF (identity-verification review is one of the admin
#       console's two queues) + US-AVAIL-04/05 (Active-this-week badge
#       job owned by trust-and-safety, plus the dashboard that explains
#       it -- the job calls direct-messaging.hasSentSince from W3).
#   W5  Billing, before free periods start expiring (5) -- E11 BILL.
#   W6  Remaining threads (15) -- E5 REV, E10 ANLY, E12 NOTIF remainder,
#       E14 PRIV remainder (US-PRIV-03/04).
#
# Every stage-8 Playwright spec-design marks `execution: live-stack-seeded` /
# `stub_mode: forbidden` -- this script's prompts carry that constraint
# forward verbatim. There is no fixture/stub escape hatch for this build.
# This delivery's driving mission -- a top-10-app bar on visual look,
# premium feel, and flawless usability -- means every UI-facing story's
# prompt also carries the DDD's own "Visual & UX acceptance" rules and the
# two mission-driven Playwright designs (e2e-visual-quality-design-system,
# e2e-performance-and-perceived-quality) as hard release gates, not optional
# polish.
#
# commit_story() below does an unqualified `git add -A` + commit, on the
# same working-tree-starts-clean assumption as the checkin-prep precedent.
# Unlike that precedent's monorepo, this repo can plausibly have unrelated
# uncommitted work sitting around between runs (e.g. a freshly-generated,
# not-yet-committed SDLC stage) -- so this script refuses to start against a
# dirty working tree unless you pass --resume-dirty (for the one legitimate
# case: resuming after a prior run was interrupted mid-story, where the
# dirty tree IS that story's own in-progress changes).
#
# Usage:
#   scripts/implement-brd.sh [--start-from STORY|FOUNDATION]
#       [--only STORY|FOUNDATION] [--dry-run] [--force] [--resume-dirty]
#       [--help]
#
# Environment overrides:
#   MODEL          cursor-agent model slug          (default: composer-2.5)
#   AGENT_BIN      cursor-agent executable          (default: cursor-agent)
#   PROMPT_DIR     dir holding agent role prompts   (default: /home/coach/code/claude-code-prompts/complete-prompts/agent-prompts)
#   LOG_DIR        per-story json log directory     (default: <repo>/logs/implementation-brd)
#   OUTPUT_FORMAT  cursor-agent --output-format     (default: json)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOC_ROOT="$ROOT/documentation"
DDD_ROOT="$DOC_ROOT/08-development-deliverable-documents"
DDD_OVERVIEW="$DDD_ROOT/00-overview.md"
FOUNDATION_DIR="$DDD_ROOT/00-foundations"
FOUNDATION_DDD="$FOUNDATION_DIR/frontend-design-system-implementation.ddd.md"
SEQUENCE_DOC="$FOUNDATION_DIR/implementation-sequence.md"
BRD_DOC="$DOC_ROOT/00-business-requirements/brd.md"
FRS_DOC="$DOC_ROOT/01-functional-requirements-specification/frs.md"
SRS_DOC="$DOC_ROOT/02-system-requirements-specification/srs.md"
USER_STORIES_DOC="$DOC_ROOT/03-user-stories/user-stories.md"
HLD_DOC="$DOC_ROOT/04-solution-architecture/hld.md"
CLEAN_CODE_DOC="$DOC_ROOT/04-solution-architecture/clean-code-guidelines-per-module.md"
LLD_INDEX="$DOC_ROOT/05-low-level-design/00-foundations/lld-index.md"
UIUX_README="$DOC_ROOT/06-ui-ux-design/README.md"
PROTOTYPE_HTML="$DOC_ROOT/06-ui-ux-design/prototypes/seeker-and-provider-prototype.html"
TEST_OVERVIEW="$DOC_ROOT/07-test-artifacts/00-overview.md"
TEST_STRATEGY="$DOC_ROOT/07-test-artifacts/01-test-strategy.md"
TEST_PLAN="$DOC_ROOT/07-test-artifacts/02-test-plan.md"
TRACEABILITY_MATRIX="$DOC_ROOT/07-test-artifacts/04-traceability-matrix.md"
VISUAL_SPEC_DESIGN="$DOC_ROOT/07-test-artifacts/05-playwright-spec-designs/e2e-visual-quality-design-system.spec-design.md"
PERF_SPEC_DESIGN="$DOC_ROOT/07-test-artifacts/05-playwright-spec-designs/e2e-performance-and-perceived-quality.spec-design.md"
DESIGN_MD="$ROOT/DESIGN.md"
PRODUCT_MD="$ROOT/PRODUCT.md"

MODEL="${MODEL:-composer-2.5}"
AGENT_BIN="${AGENT_BIN:-cursor-agent}"
PROMPT_DIR="${PROMPT_DIR:-/home/coach/code/claude-code-prompts/complete-prompts/agent-prompts}"
LOG_DIR="${LOG_DIR:-$ROOT/logs/implementation-brd}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-json}"

FOUNDATION_ID="FOUNDATION"

START_FROM=""
ONLY=""
DRY_RUN=0
FORCE=0
ALLOW_DIRTY=0

usage() {
  awk 'NR == 1 { next } /^[^#]/ { exit } { sub(/^# ?/, ""); print }' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --start-from)
      [[ $# -ge 2 ]] || { echo "missing value for --start-from" >&2; exit 2; }
      START_FROM="$2"; shift 2 ;;
    --only)
      [[ $# -ge 2 ]] || { echo "missing value for --only" >&2; exit 2; }
      ONLY="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=1; shift ;;
    --force)        FORCE=1; shift ;;
    --resume-dirty) ALLOW_DIRTY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)         echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

for f in "$SEQUENCE_DOC" "$FOUNDATION_DDD" "$DDD_OVERVIEW" "$BRD_DOC" "$FRS_DOC" "$SRS_DOC" \
         "$USER_STORIES_DOC" "$HLD_DOC" "$CLEAN_CODE_DOC" "$LLD_INDEX" "$UIUX_README" \
         "$PROTOTYPE_HTML" "$TEST_OVERVIEW" "$TEST_STRATEGY" "$TEST_PLAN" "$TRACEABILITY_MATRIX" \
         "$VISUAL_SPEC_DESIGN" "$PERF_SPEC_DESIGN" "$DESIGN_MD" "$PRODUCT_MD"; do
  [[ -f "$f" ]] || { echo "required document not found: $f" >&2; exit 1; }
done
[[ -d "$DDD_ROOT"   ]] || { echo "DDD root not found: $DDD_ROOT"   >&2; exit 1; }
[[ -d "$PROMPT_DIR" ]] || { echo "prompt dir not found: $PROMPT_DIR" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "git not found on PATH" >&2; exit 1; }

if [[ $DRY_RUN -eq 0 ]]; then
  command -v "$AGENT_BIN" >/dev/null 2>&1 || {
    echo "missing executable: $AGENT_BIN (install cursor-agent)" >&2; exit 1; }
fi

# commit_story() commits everything dirty, not just this story's slice --
# refuse to start (or resume from a fresh --start-from/--only point) against
# a dirty tree so unrelated pre-existing changes never get swept into a
# story's commit under a misleading message. --resume-dirty opts out for
# the one legitimate case: continuing after a prior run stopped mid-story.
if [[ -n "$(git status --porcelain)" && $ALLOW_DIRTY -eq 0 ]]; then
  echo "error: working tree is not clean." >&2
  echo "  commit_story() commits the ENTIRE working tree (git add -A), not just" >&2
  echo "  the current story's changes -- running against a dirty tree risks" >&2
  echo "  absorbing unrelated uncommitted work into a misleadingly-labeled commit." >&2
  echo "  Commit or stash existing changes first, or pass --resume-dirty if the" >&2
  echo "  dirty tree is a prior run's own in-progress story." >&2
  git status --short >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

log()  { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(date '+%H:%M:%S')" "$*" >&2; }

# Emit unique story/foundation ids that already have an "Implemented <id> --"
# commit (FOUNDATION included -- its commit subject is
# "Implemented FOUNDATION -- ...").
collect_implemented_ids() {
  git log --format=%s | sed -En 's/^Implemented (US-[A-Z]+-[0-9]+|FOUNDATION) —.*/\1/p' | sort -u
}

# Emit "STORY_ID|WAVE" tuples in source order from
# 00-foundations/implementation-sequence.md's own "## Wave table" section.
# Deliberately dynamic (not a hardcoded array): 76 stories transcribed by
# hand is exactly the kind of drift this driver must not depend on staying
# in sync with the sequence doc by memory.
collect_stories() {
  awk '
    /^### Wave [0-9]+/ {
      match($0, /Wave [0-9]+/)
      wave = "W" substr($0, RSTART + 5, RLENGTH - 5)
      next
    }
    /^\| `US-[A-Z]+-[0-9]+`/ {
      if (match($0, /US-[A-Z]+-[0-9]+/) != 0) {
        sid = substr($0, RSTART, RLENGTH)
        print sid "|" wave
      }
    }
  ' "$SEQUENCE_DOC"
}

# Resolve the single DDD file for a story id anywhere under DDD_ROOT's epic
# folders (E1-DISC .. E14-PRIV). Filenames are globally unique by story id,
# so a recursive search is sufficient -- no per-epic folder resolution
# needed, unlike the checkin-prep precedent's single-epic EPIC_DIR.
resolve_ddd_path() {
  local sid="$1"
  local hits=()
  while IFS= read -r -d '' f; do hits+=("$f"); done < <(
    find "$DDD_ROOT" -mindepth 2 -maxdepth 2 -type f -name "${sid}-*.ddd.md" -print0 | sort -z
  )
  if [[ ${#hits[@]} -ne 1 ]]; then
    echo ""; return 1
  fi
  printf '%s\n' "${hits[0]}"
}

# Read first markdown H1 from a DDD file as a human-readable title.
read_ddd_title() {
  local f="$1" sid="$2"
  local h1
  h1="$(awk '/^# /{sub(/^# */, ""); print; exit}' "$f")"
  if [[ -n "$h1" ]]; then
    h1="${h1#DDD — }"
    h1="${h1#${sid} — }"
    h1="${h1#${sid}: }"
    h1="${h1#${sid} }"
    echo "$h1"
  else
    basename "$f" .ddd.md
  fi
}

# Wave-specific constraint block, appended into "# Constraints" below. Keep
# in sync with implementation-sequence.md's wave prose -- this is a
# compression of it for the prompt, not a replacement for reading it.
wave_constraints() {
  case "$1" in
    W1)
      cat <<'EOF'
- This is W1, accounts & profiles. `identity-and-access` (module 01) before
  `provider-profile` (module 02) -- every profile FKs onto identity's
  `user` aggregate (LLD index SS3, row 1). Build US-ACC-01..03/05 and
  US-PONB-01 (registration) before US-PONB-02..08 (profile-building,
  publish, edit-live, phone visibility), which also need
  `media-processing` (module 12) for US-PONB-03's photo upload.
- US-PONB-04's "publish is instant, no approval step" and US-PONB-05's
  "every edit is live on save, badge suppression is the sole exception"
  are hard product constraints (BRD SS6.1, SS7.2) -- do not add a review
  queue, draft-approval state, or moderation gate anywhere in this wave
  even if it looks like good practice; that is explicitly not this
  product's model (BRD SS10 constraints).
- This wave starts the free-listing-period clock at first publish
  (US-PONB-04) -- W5 (billing) depends on that event existing.
EOF
      ;;
    W2)
      cat <<'EOF'
- This is W2, availability & discovery -- the platform's principal
  proposition (BRD SS2). `provider-availability` (module 03) before
  `discovery-search` (module 04): availability is discovery's primary
  event source (LLD index SS4). Build the "available now" state machine
  and its expiry sweep (US-AVAIL-01..03) before the search projection
  that consumes its domain events (US-DISC-01..09). Do not implement
  the "Active this week" badge in this wave -- US-AVAIL-04/05 land in
  W4 because trust-and-safety is the only writer of active_this_week
  and its daily job calls direct-messaging.hasSentSince (W3).
- Availability is present-tense only -- FR-AVAIL-08 forbids any
  schedule, future slot, or "available from 18:00" concept anywhere.
  US-DISC-02's natural-language parser maps colloquial future phrasing
  ("available tonight") to present-tense "available now" (BRD SS13) --
  do not build an actual future-availability feature to satisfy that
  query shape.
- US-PRIV-01/02 land in this wave (phone-visibility server-side
  serializer, EXIF/GPS stripping on upload) -- both depend only on
  modules already built by end of W1/W2, not on any later wave.
- No personalized ranking (FR-SRCH-13): given the same query, filters,
  and location, any two users must get identical results. Do not add a
  ranking signal derived from a specific user's history.
EOF
      ;;
    W3)
      cat <<'EOF'
- This is W3, profile view & messaging. `provider-profile` read side
  (built in W1) feeds US-VIEW-01..06 directly. `direct-messaging`
  (module 05) is this wave's main build (US-MSG-01..06), which unblocks
  US-ACC-02's continuity flow (message-draft preservation across the
  sign-up interruption) and US-VIEW-03's contact actions.
- No booking calendar or time-slot system anywhere in this wave or any
  other (BRD SS6.2, FR-MSG-04/FR-AVAIL-08 guard) -- quick-start prompts
  (US-MSG-03) insert plain editable text only; the platform stores no
  structured booking data and never reports whether a booking occurred.
- `user-notifications`' baseline event set (US-NOTIF-01) lands alongside
  messaging in this wave, since nearly every notification category
  originates from a messaging event (LLD index SS4) -- the remaining
  NOTIF stories (channel preferences, deep-linking) are W6.
EOF
      ;;
    W4)
      cat <<'EOF'
- This is W4, safety & admin, before public launch. `trust-and-safety`
  (module 07, report/block domain logic) before `moderation-admin`
  (module 08, the console delivery surface) -- the admin module
  contains NO new domain logic; every admin route delegates to the
  owning module's facade (identity-and-access, provider-profile,
  trust-and-safety, listing-billing, platform-configuration). Build
  US-SAFE-01..03 before US-ADMIN-01..08.
- US-AVAIL-04 (the daily four-signal OR that is the only writer of
  active_this_week -- trust-and-safety-lld.md SS5) and US-AVAIL-05
  (dashboard transparency over that badge) land in this wave after
  US-SAFE-01..03, once identity-and-access, provider-availability,
  provider-profile, and direct-messaging facades all exist. Do not
  put a second writer of active_this_week on provider-availability.
- Filing a report or being blocked triggers NO automated consequence
  against the reported/blocked party anywhere in this wave -- every
  content-takedown/suspension action is an explicit, reasoned, audit-
  logged admin decision (US-ADMIN-04, US-SAFE-01). Do not wire report
  volume or any heuristic to an automatic suspension, unpublish, or
  visibility penalty.
- US-VERIF-01..03 (identity badge) also completes in this wave --
  identity-verification review is one of the admin console's two queues
  (US-ADMIN-02), and US-PONB-05's badge-suppression-on-edit exception
  depends on this state machine existing. The badge NEVER gates profile
  visibility at any stage (pending, rejected, or never-submitted all
  look identical to a visitor) -- this is a BRD SS8 hard NFR, verify it
  with a test, not just by inspection.
EOF
      ;;
    W5)
      cat <<'EOF'
- This is W5, billing, before free periods start expiring. Must land
  before any W1 provider's free period (started at first publish)
  actually expires -- the LLD index flags this as a genuine sequencing
  constraint, not just a suggestion. Build all of US-BILL-01..05
  (`listing-billing`, module 09) together; it reads pricing/free-period
  numbers from `platform-configuration` (module 13, bootstrapped in W0).
- Payment for the massage session itself is explicitly out of scope
  everywhere in this product (BRD SS6.2, FR-MONET-08 guard) -- no
  checkout, deposit, tip, or "pay through us" affordance of any kind.
  This wave's payment integration is listing/featuring fees ONLY.
- Card data never touches Peach Finder servers (SAQ-A, US-BILL-03) --
  the PSP integration must be hosted/tokenized checkout, not a form that
  collects card details into this codebase.
- Lapse (grace period, then auto-unpublish) is billing state, never
  moderation -- all UI copy in this wave must read as billing status,
  never as a penalty or judgment (US-BILL-04).
EOF
      ;;
    W6)
      cat <<'EOF'
- This is W6, the remaining threads: `provider-reviews` (module 06,
  US-REV-01..06) depends on `direct-messaging`'s 24h-thread-age
  eligibility facade (W3). `provider-analytics` (module 10,
  US-ANLY-01..04) depends on discovery/profile-view/messaging events
  already existing to capture (W2/W3). `user-notifications` remainder
  (US-NOTIF-02..04, channel preferences and deep-linking) layers onto
  the W3 baseline. `US-PRIV-03/04` (cross-module retention jobs,
  ToS-acceptance capture) are genuinely last -- they depend on every
  module whose data they purge already existing.
- Analytics must never let a provider identify who viewed or searched
  (US-ANLY-02, FR-PRIV-06) -- counts below the configured floor display
  as "< 5"; this is a hard privacy floor, not a rounding nicety, and
  needs its own test.
- No verified-booking review gating or incentivized reviews (FR-REV-08
  guard) -- review eligibility is thread-age only (>=24h), nothing else.
EOF
      ;;
    *)
      warn "no wave_constraints block for '$1' — add one before relying on it"
      ;;
  esac
}

# Build the one-time Wave 0 FOUNDATION bootstrap prompt: not a story, but the
# from-scratch scaffold every wave above depends on. Shaped per the same
# prompt-architect skeleton (Role/Goal/Inputs/Constraints/Process/Output/
# Verification/Fallback) as build_prompt_file() below, so the two prompts
# stay structurally comparable even though this one's Output is a scaffold,
# not a feature slice.
build_foundation_prompt_file() {
  local out="$1"
  local rel_foundation_ddd="${FOUNDATION_DDD#$ROOT/}"

  {
    cat <<TASK
# Role

You are an autonomous coding agent embedded in the Peach Finder repository
at:
  $ROOT

TASK
    cat "$PROMPT_DIR/general-purpose.md"
    cat <<TASK

# Goal

Bootstrap the Peach Finder V1 application from scratch: a working
SvelteKit 2 (Svelte 5) monolith on Node LTS, the shared-kernel and API/
event/security foundation modules the LLD already specifies, a
\`platform-configuration\` bootstrap, and this delivery's frontend
design-system implementation -- token pipeline, component library, motion
primitives, and performance-budget scaffolding -- so that every one of the
76 story DDDs under documentation/08-development-deliverable-documents/
(Waves 1-6) has something real to build on. This repository has ZERO
application code as of this run -- no package.json, no src/ -- this is a
from-scratch scaffold, not a delta. Success is one measurable condition:
every task in $rel_foundation_ddd's own build sections is done, the app
boots and serves a page, and every layer in "# Verification" below passes
with observed output.

# Inputs

- The frontend design-system foundation DDD (self-sufficient per its own
  structure) at $rel_foundation_ddd.
- The DDD index: ${DDD_OVERVIEW#$ROOT/}
- The originating BRD, read in full, not just citations:
    ${BRD_DOC#$ROOT/}
- ${FRS_DOC#$ROOT/}
- ${SRS_DOC#$ROOT/}
- The HLD, read in full -- it is the architectural contract this scaffold
  must match exactly (module layout, hexagonal boundaries, deploy shape):
    ${HLD_DOC#$ROOT/}
- ${CLEAN_CODE_DOC#$ROOT/}
- LLD foundations, in this order (each is a binding convention, not a
  suggestion):
    documentation/05-low-level-design/00-foundations/shared-kernel.md
    documentation/05-low-level-design/00-foundations/api-conventions.md
    documentation/05-low-level-design/00-foundations/event-catalog.md
    documentation/05-low-level-design/00-foundations/security-implementation.md
- ${LLD_INDEX#$ROOT/}
- documentation/05-low-level-design/13-platform-configuration/platform-configuration-lld.md
  (this wave bootstraps it -- everything else reads config from it)
- The design system, all four -- this scaffold's frontend must be built
  FROM these, not approximated:
    ${DESIGN_MD#$ROOT/}
    ${PRODUCT_MD#$ROOT/}
    ${UIUX_README#$ROOT/}
    ${PROTOTYPE_HTML#$ROOT/}
- ${TEST_STRATEGY#$ROOT/}
- ${VISUAL_SPEC_DESIGN#$ROOT/}
- ${PERF_SPEC_DESIGN#$ROOT/}
- The wave table and every wave's entry/exit prose (your work is Wave 0,
  everything else depends on it landing first):
    ${SEQUENCE_DOC#$ROOT/}

# Constraints

- Stack is RATIFIED, not a choice you make: full-TypeScript monolith,
  SvelteKit 2 (Svelte 5) on the current Node.js LTS, deployed via
  adapter-node (a custom Node server attaches the WebSocket upgrade
  handler -- do not use a serverless/edge adapter). PostgreSQL (current
  stable major) is the ONLY stateful service besides MinIO -- no Redis at
  launch. Drizzle ORM (schema-as-code, generates versioned forward-only
  SQL migrations). pg-boss for the in-Postgres job queue/event-bus
  transport (no Kafka/RabbitMQ). sharp for image processing. ws for the
  WebSocket upgrade. MinIO for media (two buckets: public \`media\`,
  deny-by-default \`identity-docs\`).
- Module layout per HLD SS6.1's naming registry: one
  \`src/lib/server/modules/<module>/\` directory per bounded context
  (identity-and-access, provider-profile, provider-availability,
  discovery-search, direct-messaging, provider-reviews, trust-and-safety,
  listing-billing, provider-analytics, user-notifications,
  media-processing, platform-configuration), each with its own Postgres
  schema (snake_case of the kebab context name); \`src/lib/server/shared/\`
  for the shared kernel; \`src/routes/admin/\` for moderation-admin (a
  delivery surface, not an extracted module -- no domain logic there).
  Bootstrap the directory skeleton and the shared-kernel module for real
  in this wave; you do not need every business module's domain logic yet
  (that is Waves 1-6), but the module folders, schema-per-module DB
  convention, and the event-bus/outbox mechanism must be real and working.
- Hexagonal layering inside every module: \`domain/\` imports nothing but
  shared-kernel types (no framework, no Drizzle, no fetch); \`infra/\` is
  the only layer that knows Drizzle/MinIO/Paystack/etc.; the delivery
  layer (\`src/routes\`) stays thin -- Zod-validate input, call a handler,
  shape the response, no business logic, no SQL in routes.
- RBAC: \`src/hooks.server.ts\` resolves the auth context once per request
  and attaches it to \`event.locals.auth\`; every route under \`src/routes/\`
  declares its minimum role via a co-located \`+page.server.ts\`/
  \`+server.ts\` export (\`export const requiredRole = 'seeker'\`), checked
  BEFORE any application code runs, per security-implementation.md SS2.
- Establish the test toolchain now, for every later wave to reuse without
  re-deciding it: Vitest for unit tests (the natural pairing with
  SvelteKit's Vite build), an integration-test mechanism against a real
  Postgres instance (the \`testcontainers\` npm package, or an equivalent
  Docker-Compose-based test service -- self-skipping if Docker is
  unavailable), and a Playwright config at the repo root targeting the
  live dev/compose stack -- \`execution: live-stack-seeded\`,
  \`stub_mode: forbidden\` (every stage-8 spec-design's own Document
  Control table says so; no \`page.route\`, no fixture JSON standing in for
  HTTP, no \`E2E_LIVE=0\`-style skip-by-stub path -- \`test.skip\` if the
  live stack is down, never mock). Document the exact commands and
  directory conventions you establish in this DDD's own Implementation
  Notes -- every subsequent wave's prompt tells the agent to follow what
  you set up here, not re-derive it.
- The frontend design-system implementation itself (this DDD's core
  scope) must consume $DESIGN_MD's YAML frontmatter programmatically
  (generate CSS custom properties / a Tailwind-equivalent theme from it
  at build time) -- no hand-copied hex values in component code. Build
  every component in the DDD's SS3 (Button, Chip, Card/Container, Input,
  the Availability Pill signature component, Badge, Navigation, the
  admin Ink strip) as a single reusable implementation. \`Two-Hue\`,
  \`Never-Color-Alone\`, \`Warm-Shadow\`, \`One-Serif\`, and pill-shape rules
  are enforced by construction in these primitives, not left to each
  future story to remember.
- A Docker Compose file for local Postgres/MinIO (dev-and-test topology)
  belongs in this wave so the integration/Playwright toolchain above has
  something real to run against -- keep it minimal (no host-exposed ports
  beyond what local dev needs); the production compose topology is HLD
  SS8 scope for a later deployment-docs stage, not this wave.
- Do NOT commit. Leave all changes in the working tree -- committing is
  this script's job, after its own review-and-fix pass, never the agent's.
- Update $rel_foundation_ddd's own build-task checklist as work completes;
  append an "Implementation Notes" section at the end of the file (create
  one if it has none) documenting the toolchain/directory conventions you
  established, rather than inventing a new document for it.
- Stop only on unrecoverable errors, or per "# Fallback" below.

# Process

1. Read $rel_foundation_ddd in full, then the BRD, FRS, SRS, and HLD in
   full, then every LLD foundation document listed above, then the design
   system (DESIGN.md, PRODUCT.md, the UI/UX README, and the interactive
   prototype) and the two mission-driven Playwright spec-designs.
2. Plan the scaffold using the solution-architect mindset below: package
   manager and workspace layout, SvelteKit project init, Drizzle setup and
   first migration (module schemas, even if mostly empty until Waves 1-6
   populate them), the event-bus/outbox mechanism, the RBAC hook, the
   token pipeline, and the component library.
3. Implement the scaffold. Use the code-exploration mindset for navigating
   whatever partial state already exists in the repo (documentation only,
   as of this run) so you don't duplicate anything already decided.
4. Verify using the verification-specialist mindset below -- the app must
   actually boot and serve a page, migrations must actually run against a
   real Postgres, and the test toolchain must actually execute.
5. Document per the documentation-guide mindset where the DDD calls for it.
6. Tick off every task in the DDD's build-task checklist, and append an
   Implementation Notes entry with the toolchain/convention decisions made
   and why.

## Code-exploration mindset (for navigating and reading the codebase)

TASK
    cat "$PROMPT_DIR/code-explorer.md"
    cat <<'SEP'

## Solution-architect mindset (when choosing how to implement a change)

SEP
    cat "$PROMPT_DIR/solution-architect.md"
    cat <<'SEP'

## Verification-specialist mindset (when validating a change)

SEP
    cat "$PROMPT_DIR/verification-specialist.md"
    cat <<'SEP'

## Documentation-guide mindset (when writing or editing docs)

SEP
    cat "$PROMPT_DIR/documentation-guide.md"
    cat <<TASK

# Output

By the time you declare this bootstrap done, the working tree must contain:
- A working SvelteKit 2/Svelte 5 app (package.json, tsconfig, vite config,
  adapter-node) that boots with a dev command and serves at least a
  placeholder homepage using the real design-system tokens (not
  Skeleton/Tailwind defaults).
- The \`src/lib/server/modules/<module>/\` skeleton for all twelve business
  modules plus \`src/lib/server/shared/\` (shared kernel: branded ID types,
  Result/UseCaseError, Clock port, Money, the outbox event mechanism,
  append-only audit log, AuthContext, Zod conventions).
- Drizzle configured with the schema-per-module convention and an initial
  forward-only migration; \`platform-configuration\`'s schema populated with
  the LLD's documented bootstrap/seed defaults.
- \`src/hooks.server.ts\` implementing the RBAC resolution sequence from
  security-implementation.md SS2.
- The frontend component library (SS3 of the DDD) with tokens generated
  programmatically from DESIGN.md/\`.impeccable/design.json\`, plus a
  Storybook-equivalent or a simple \`/dev/components\` preview route so
  later waves can see each component in isolation.
- A Docker Compose file for local Postgres + MinIO.
- The test toolchain: Vitest configured and running (even a trivial
  passing test proves it), an integration-test harness against real
  Postgres, and a Playwright config pointed at the live dev/compose stack
  with one smoke spec proving the homepage renders.
- $rel_foundation_ddd itself updated: every build-task item ticked or
  accounted for, and an Implementation Notes entry documenting every
  convention later waves must follow (directory layout, test commands,
  how to add a new module, how to add a new component).

# Verification

Run and observe real output for each layer -- do not declare a layer green
without it:
- The dev server actually starts and serves a response (curl or
  equivalent) on the homepage route.
- Drizzle migration actually applies against a real Postgres instance
  (via the Docker Compose file you created).
- \`npm run check\` (svelte-check + tsc), \`npm run lint\`, and
  \`npm run test\` (Vitest) all green.
- The Playwright smoke spec passes against the live dev server -- no
  \`page.route\`, no fixture JSON, no stub.
- Zero Critical/Serious axe accessibility violations on the placeholder
  homepage.

# Fallback

- Do not ask questions. Where the DDD, HLD, or LLD foundations leave a
  genuine gap (an exact library minor version, a specific lint ruleset),
  make a reasonable, well-reasoned choice consistent with the ratified
  stack (SvelteKit 2/Svelte 5, Drizzle, pg-boss, sharp, ws, PostgreSQL,
  MinIO -- HLD SS6.2/6.4/"Resolved 2026-08-20" note) and record it inline
  in the DDD's Implementation Notes -- never silently, and never by
  substituting a different framework/ORM/queue than the ratified ones.
- If a build, migration, or test command is red and you cannot fix it
  after a good-faith attempt, stop and surface the failing command, its
  full output, and your best assessment of root cause and next step. Do
  not declare the bootstrap done with a red build.

# Begin

Begin now. Bootstrap the application end-to-end.
TASK
  } > "$out"
}

# Build the prompt for one story, shaped per the prompt-architect skill's
# skeleton: Role / Goal / Inputs / Constraints / Process / Output /
# Verification / Fallback. Each section header below maps 1:1 onto that
# skeleton so future edits to this function keep the shape intentional
# rather than drifting back into an undifferentiated wall of instructions.
build_prompt_file() {
  local sid="$1" title="$2" wave="$3" rel_ddd="$4" out="$5"

  {
    cat <<TASK
# Role

You are an autonomous coding agent embedded in the Peach Finder repository
at:
  $ROOT

TASK
    cat "$PROMPT_DIR/general-purpose.md"
    cat <<TASK

# Goal

Implement story $sid — $title ($wave), end-to-end, exactly as scoped by
the Development Deliverable Document (DDD) at:
  $rel_ddd

Deliver production-grade code only: no TODOs, no stubs, no placeholders,
no "left as exercise". Success is one measurable condition: every task in
the DDD's "## 4. Build blueprint" checklist is done, every layer in
"# Verification" below passes with observed output, and the DDD's own
"## 6. Definition of Done" is met -- including its "## 5. Visual & UX
acceptance" section for any surface this story touches.

# Inputs

- This story's DDD at $rel_ddd -- its "## 4. Build blueprint" section
  names the primary and supporting LLD module(s) to build against; read
  those module LLD documents' own data-model, API-contract, and
  domain-events sections directly rather than re-deriving shapes here.
- The DDD index (cross-references every story to its module):
    ${DDD_OVERVIEW#$ROOT/}
- The frontend design-system foundation (mandatory reference for any
  UI-facing work this story touches -- confirm its own build-task
  checklist is ticked in git history before assuming its component
  library exists; if it is not, stop per "# Fallback"):
    ${FOUNDATION_DDD#$ROOT/}
- The originating BRD, read in full, not just this story's own citations
  inside the DDD -- several decisions only make sense with the rejected
  alternatives attached (why V1 is incall-only massage therapists alone;
  why there is no booking calendar; why payment for the service itself
  stays outside the platform):
    ${BRD_DOC#$ROOT/}
- ${FRS_DOC#$ROOT/}
- ${SRS_DOC#$ROOT/}
- The full user-stories document, for this story's epic-level context:
    ${USER_STORIES_DOC#$ROOT/}
- ${HLD_DOC#$ROOT/}
- ${CLEAN_CODE_DOC#$ROOT/}
- LLD foundations (binding conventions every module builds against):
    documentation/05-low-level-design/00-foundations/shared-kernel.md
    documentation/05-low-level-design/00-foundations/api-conventions.md
    documentation/05-low-level-design/00-foundations/event-catalog.md
    documentation/05-low-level-design/00-foundations/security-implementation.md
    ${LLD_INDEX#$ROOT/}
- The design system -- match it exactly, not approximately:
    ${DESIGN_MD#$ROOT/}
    ${PRODUCT_MD#$ROOT/}
    ${UIUX_README#$ROOT/}
    ${PROTOTYPE_HTML#$ROOT/}
  The prototype is the literal visual reference for any screen this story
  touches -- match it pixel-for-pixel on tokens, in spirit on interaction.
- Test artefacts: ${TEST_OVERVIEW#$ROOT/}, ${TEST_STRATEGY#$ROOT/},
  ${TEST_PLAN#$ROOT/}, the relevant story-level test-case cluster file
  under documentation/07-test-artifacts/03-test-cases/ (identify it via
  $sid's row in ${TRACEABILITY_MATRIX#$ROOT/}), and any Playwright
  spec-design under documentation/07-test-artifacts/05-playwright-spec-designs/
  this story's DDD or the traceability matrix names -- PLUS, for any
  UI-facing surface, always also:
    ${VISUAL_SPEC_DESIGN#$ROOT/}
    ${PERF_SPEC_DESIGN#$ROOT/}
  These two apply to every UI-facing story regardless of epic; they are
  not optional just because this story's own epic isn't "about" design.
- The sequence doc's wave table and entry/exit prose for $wave:
    ${SEQUENCE_DOC#$ROOT/}

# Constraints

- Stack is RATIFIED: full-TypeScript, SvelteKit 2 (Svelte 5) on Node LTS
  via adapter-node, PostgreSQL as the only stateful service besides MinIO
  (no Redis), Drizzle ORM with versioned forward-only migrations, pg-boss
  for the event-bus/job queue, sharp for image processing, ws for the
  WebSocket upgrade. Do not introduce a different framework, ORM, or
  queue technology, even locally "just for this story".
- Module layout per HLD SS6.1: build inside
  \`src/lib/server/modules/<module>/\` for the module(s) this story's DDD
  names; \`domain/\` imports nothing but shared-kernel types (no
  framework, no Drizzle, no fetch); \`infra/\` is the only layer that
  knows Drizzle/MinIO/Paystack/etc.; \`src/routes\` stays thin (Zod
  validate, call a handler, shape the response -- no business logic, no
  SQL in routes).
- RBAC: every route under \`src/routes/\` this story adds or touches
  declares its minimum role via a co-located \`+page.server.ts\`/
  \`+server.ts\` export, resolved by the existing \`src/hooks.server.ts\`
  hook -- do not add a second, parallel auth check.
- Only touch the module(s)/route(s) this story's own DDD's SS4 "Primary
  LLD module" / "Supporting modules" name -- do not reach into a sibling
  module to "get ahead" of the sequence, even within the same wave.
TASK
    wave_constraints "$wave"
    cat <<TASK
- Visual/UX is a hard release gate, not a nice-to-have (DDD SS5): the
  Two-Hue Rule (Terracotta Deep \`#B34625\` for action/availability,
  Verified Pine \`#2F5D50\` for trust/verification -- no third meaningful
  hue), the Never-Color-Alone Rule, the Warm Shadow Rule (shadows tinted
  Terracotta/Ink, never neutral gray), the One-Serif Rule (Fraunces only
  at Display/Headline scale), full-pill (999px) interactive controls
  except the documented exceptions (inputs 14px, cards 20px/14px
  nested), WCAG 2.2 AA, >=44px touch targets at 360px, a visible
  Terracotta focus ring on every focusable element, and
  \`prefers-reduced-motion\` respected wherever this story's surface
  animates. Use the frontend design-system foundation's component
  library (Button, Chip, Card, Input, Availability Pill, Badge,
  Navigation) -- do not hand-roll a parallel one-off component that
  approximates the same look.
- Playwright is \`execution: live-stack-seeded\`, \`stub_mode: forbidden\`
  per every stage-8 spec-design's own Document Control table. Forbidden:
  \`page.route\` stubs, fixture JSON standing in for real HTTP, any
  \`E2E_LIVE=0\`-style skip-by-stub path. If the live stack is down,
  \`test.skip\` -- never mock.
- Playwright specs live under \`testing/playwright/\` (\`*.e2e.ts\`),
  matched by the repo-root \`playwright.config.ts\`'s
  \`testDir: 'testing/playwright'\`. This superseded the Wave 0-era
  \`e2e/\` location -- do not recreate an \`e2e/\` directory or add a new
  spec anywhere else.
- Follow the test-toolchain and directory conventions the Wave 0
  foundation established (Vitest, the Postgres integration-test
  mechanism, the Playwright spec-file layout under \`testing/playwright/\`)
  -- check its own Implementation Notes for what it set up rather than
  re-deciding it.
- Do NOT commit. Leave all changes in the working tree -- committing is
  this script's job, after its own review-and-fix pass, never the agent's.
- Update this DDD's own "## 4. Build blueprint" checklist as work
  completes; do not silently skip a task. Append your work to a new
  "## 7. Implementation Notes" section at the end of the DDD (create one
  if it has none) rather than inventing a new document.
- Stop only on unrecoverable errors, or per "# Fallback" below. When you
  stop, surface the failing command, its output, and your best next step.
- NEVER start a long-running process (\`npm run dev\`, \`npm start\`, Vite,
  file watchers, \`docker compose up\` without \`-d\`) in the foreground --
  that hangs this driver until killed. Background it, use Playwright's
  webServer, or curl a server that is already listening, then continue.

# Process

1. Read $rel_ddd in full, then its primary/supporting LLD module
   document(s), then the BRD in full, then the FRS/SRS sections its
   traces cite, then the design system documents (see "# Inputs" above).
2. Confirm this story's wave ($wave) entry criteria are actually met in
   the working tree/git history -- check \`git log\` for
   "Implemented FOUNDATION —" and "Implemented US-* —" commits for this
   wave's predecessor stories/foundation, and independently confirm by
   inspecting the codebase for the concrete artefact each predecessor was
   responsible for (its own DDD's Build blueprint names it -- e.g. a
   migration, a new endpoint, a new event, a new component). If a genuine
   predecessor is missing, stop per "# Fallback" rather than guessing its
   shape.
3. Plan the change using the solution-architect mindset below.
4. Implement the change. Use the code-exploration mindset for navigation.
5. Verify the change using the verification-specialist mindset below;
   never declare a layer PASS without an executed command and observed
   output.
6. Update documentation per the documentation-guide mindset where the DDD
   or BRD calls for it.
7. Tick off every task in the DDD's Build blueprint checklist, and append
   an Implementation Notes entry with the approach taken, any deviation
   and why, and follow-ups discovered.

## Code-exploration mindset (for navigating and reading the codebase)

TASK
    cat "$PROMPT_DIR/code-explorer.md"
    cat <<'SEP'

## Solution-architect mindset (when choosing how to implement a change)

SEP
    cat "$PROMPT_DIR/solution-architect.md"
    cat <<'SEP'

## Verification-specialist mindset (when validating a change)

SEP
    cat "$PROMPT_DIR/verification-specialist.md"
    cat <<'SEP'

## Documentation-guide mindset (when writing or editing docs)

SEP
    cat "$PROMPT_DIR/documentation-guide.md"
    cat <<TASK

# Output

By the time you declare this story done, the working tree must contain:
- Domain, application, infra, and route-layer code for every task in the
  DDD's Build blueprint, across the correct hexagonal layers.
- Frontend code (Svelte components/routes) for every screen or component
  the DDD's Build blueprint scopes, built from the Wave 0 component
  library and matching the interactive prototype's tokens exactly and its
  interaction patterns in spirit.
- Any new Drizzle migration this story's Build blueprint calls for,
  forward-only, matching the schema-per-module convention.
- Unit tests beside the production code they cover (Vitest; a
  component-testing library for any Svelte component with real logic,
  not just markup).
- Integration tests exercising this story's infra layer against a real
  Postgres instance, using whichever mechanism Wave 0 established,
  self-skipping if Docker is unavailable.
- An implemented Playwright spec covering this story, matching its
  coverage source artefact under
  documentation/07-test-artifacts/05-playwright-spec-designs/, executed
  live-stack-seeded, placed per the directory convention Wave 0
  established (extend an existing spec file rather than duplicating
  coverage in a new one if this story's flow is already partially
  covered by one).
- The DDD file itself updated: every Build blueprint task ticked or
  otherwise accounted for, and an Implementation Notes entry appended.

# Verification

Run and observe real output for each layer you touched -- do not declare a
layer green without it:
- \`npm run check\` (svelte-check + tsc) and \`npm run lint\` clean.
- \`npm run test\` (Vitest unit + integration) green for every module
  touched, including any new Postgres-backed integration test.
- If this story touches a UI screen: its build, then the Playwright spec
  for $sid run against the live stack. Zero Critical/Serious axe
  accessibility violations on any new/changed screen.
- If this story is UI-facing: confirm the relevant token-conformance
  assertions in \`e2e-visual-quality-design-system.spec-design.md\` and
  any Core-Web-Vitals budget row in
  \`e2e-performance-and-perceived-quality.spec-design.md\` that applies to
  this surface still pass for it.
- Self-review every file you touched against
  ${CLEAN_CODE_DOC#$ROOT/}'s review checklist before declaring done. Fix
  what you find -- do not leave it for a reviewer.

# Fallback

- Do not ask questions. Where the DDD, BRD, FRS, or SRS leave a genuine
  gap, make a reasonable, well-reasoned assumption consistent with this
  product's documented V1 boundaries (BRD SS6.2 explicitly out of scope:
  no booking calendar/time-slot system, no personalized recommendations,
  no in-platform payment for the massage session itself, no third-party
  ID vendor, no vertical other than massage therapists, no native apps,
  no localization) and record it inline in the DDD's Implementation Notes
  as you proceed -- never silently, and never by inventing scope from
  that explicitly-excluded list to "complete" the picture.
- If step 2 of "# Process" finds a genuinely missing wave predecessor or
  the Wave 0 foundation not yet landed, stop immediately. Do not
  reimplement, stub, or guess its shape. Report exactly what is missing
  and which story (or FOUNDATION) must run first.
- If a build, test, or lint command is red and you cannot fix it after a
  good-faith attempt, stop and surface the failing command, its full
  output, and your best assessment of the root cause and next step. Do
  not declare the story done with a red build.

# Begin

Begin now. Implement $sid end-to-end.
TASK
  } > "$out"
}

# Second pass: an adversarial review of this story's own diff, using the
# verification-specialist mindset, that fixes real defects with tests
# before the commit happens. Same mechanism as the checkin-prep precedent's
# review_and_fix(), reframed for this repo's TypeScript stack.
build_review_prompt_file() {
  local sid="$1" title="$2" rel_ddd="$3" wave="$4" out="$5" slice_paths="$6"
  {
    cat <<TASK
# Role

You are an adversarial review-and-fix agent embedded in the Peach Finder
repository at:
  $ROOT

TASK
    cat "$PROMPT_DIR/verification-specialist.md"
    cat <<TASK

# Goal

Review the uncommitted implementation of $wave $sid — $title
($rel_ddd) for real defects, and fix every one you confirm, with tests.
Success is this slice with no remaining confirmed defect and a still-green
build. This is a quality gate before commit, not a second implementation
pass -- do not add new story scope.

# Inputs

- This story's DDD: $rel_ddd
- The design system (for visual/token-conformance review):
    ${DESIGN_MD#$ROOT/}
    ${VISUAL_SPEC_DESIGN#$ROOT/}
- Slice paths -- the dirty delta since this story's implementation agent
  started. Review ONLY these paths; every other uncommitted path in the
  working tree belongs to a different story/foundation and is out of
  scope:
$slice_paths

# Constraints

- The diff under review is uncommitted working-tree changes, never a
  branch diff -- the working tree may hold prior uncommitted slices from
  earlier stories; ignore every path not listed under Slice paths above.
- MUST NOT commit, amend, push, or skip git hooks. Committing remains
  this script's job, after this pass succeeds.
- MUST NOT invent schema, endpoints, events, or screens absent from this
  story's DDD and its named LLD module document(s).
- Tests MUST accompany every fix at the applicable layer. MUST NOT
  delete, skip, or mock the unit under test, and MUST NOT stub or mock a
  Playwright spec against the live stack to force green -- this build is
  \`stub_mode: forbidden\`.
- Do not expand into unrelated dirty files outside Slice paths unless a
  confirmed defect in this slice cannot be fixed without touching them.
- The verification-specialist "DO NOT MODIFY THE PROJECT" rule above is
  superseded for this pass: you MUST fix confirmed defects. You still
  MUST NOT commit.
- NEVER start a long-running process (\`npm run dev\`, \`npm start\`, Vite,
  file watchers, \`docker compose up\` without \`-d\`) in the foreground --
  that hangs this driver until killed. Background it, use Playwright's
  webServer, or curl a server that is already listening, then continue.

# Process

1. If Slice paths above is empty, stop -- there is nothing to review.
2. Read $rel_ddd's Story (SS1), Acceptance criteria (SS2), Build blueprint
   (SS4), and Visual & UX acceptance (SS5) so you know what this slice is
   supposed to do.
3. Review every file in Slice paths for real defects: correctness bugs,
   security issues (RBAC/role checks, PII/privacy floors like the "< 5"
   analytics floor or server-side phone-number hiding), silently-skipped
   or mocked tests, Playwright specs that stub instead of hitting the
   live stack, and visual/token-conformance regressions against
   DESIGN.md (a third meaningful hue, a neutral gray shadow, Fraunces
   outside Display/Headline, a non-pill interactive control).
4. For each confirmed defect: fix it; add or update a test that fails
   without the fix; re-run the commands that cover the changed modules.
5. Note and dismiss anything that is a style nit, a speculative concern,
   or contradicts the DDD/LLD as written -- do not "fix" those. Record
   each dismissal and why.
6. At most one re-review after fixes, and only if a fix could plausibly
   have introduced a new defect in the same files. Do not loop further.

# Output

- Fixes and their tests in the working tree, left uncommitted.
- Final message: a markdown table of findings (Severity, Location as
  file:line, Finding) sorted by severity descending; what was fixed; what
  was dismissed and why; commands run with pass/fail.

# Verification

- Re-run the relevant unit/integration tests for every file you changed
  in this pass. Paste the summary -- do not assert a fix without it.
- If Slice paths includes a Playwright spec: confirm it still targets the
  live stack (no \`page.route\`, no \`E2E_LIVE=0\`, no fixture JSON).
- Confirm \`git status\` shows no commit created by you.

# Fallback

- If a fix you attempt cannot be made green after a good-faith attempt,
  stop and report the failing command, its output, and your best
  assessment of root cause and next step. Do not commit a red build, and
  do not silently revert your own fix without saying so.
TASK
  } > "$out"
}

run_agent() {
  local prompt_file="$1" log_file="$2"
  # Linux MAX_ARG_STRLEN is 128KiB. Passing the prompt as argv fails with
  # "Argument list too long" (exit 126) once review prompts include a long
  # slice-path list — US-PONB-03's review prompt was 221KB. Point the agent
  # at the already-written file instead.
  local pointer
  pointer="The complete task prompt is the file below. Read it in full with your file tool, then follow it exactly. Do not ask questions. Begin immediately.
${prompt_file}"

  "$AGENT_BIN" \
    --model "$MODEL" \
    --print \
    --force \
    --workspace "$ROOT" \
    --trust \
    --output-format "$OUTPUT_FORMAT" \
    "$pointer" \
    >"$log_file" 2>&1
}

# path<TAB>hash (or MISSING) for every currently dirty path, sorted by path.
snapshot_dirty_hashes() {
  local dest="$1"
  local f hash
  {
    while IFS= read -r -d '' f; do
      [[ -z "$f" ]] && continue
      if [[ -f "$f" ]]; then
        hash="$(git hash-object -- "$f")"
        printf '%s\t%s\n' "$hash" "$f"
      else
        printf 'MISSING\t%s\n' "$f"
      fi
    done < <(
      git diff -z --name-only HEAD
      git ls-files -z --others --exclude-standard
    )
  } | sort -t $'\t' -k2,2 > "$dest"
}

# Paths whose dirty hash changed, appeared, or disappeared between two
# snapshots -- i.e. exactly what one story's implementation pass touched.
slice_paths_from_manifests() {
  awk -F '\t' '
    NR == FNR { before[$2] = $1; next }
    { after[$2] = $1 }
    END {
      for (p in after) if (!(p in before) || before[p] != after[p]) print p
      for (p in before) if (!(p in after)) print p
    }
  ' "$1" "$2" | sort -u
}

review_and_fix() {
  local sid="$1" title="$2" rel_ddd="$3" wave="$4" before_manifest="$5"
  local ts prompt_file log_file rc after_manifest slice_paths
  ts="$(date '+%Y%m%d-%H%M%S')"
  after_manifest="$LOG_DIR/${sid}-${ts}.after.dirty.txt"
  snapshot_dirty_hashes "$after_manifest"
  slice_paths="$(slice_paths_from_manifests "$before_manifest" "$after_manifest")"
  if [[ -z "$slice_paths" ]]; then
    log "  review: no slice delta — skipped"
    return 0
  fi

  prompt_file="$LOG_DIR/${sid}-${ts}.review.prompt.txt"
  log_file="$LOG_DIR/${sid}-${ts}.review.${OUTPUT_FORMAT}.log"

  build_review_prompt_file "$sid" "$title" "$rel_ddd" "$wave" "$prompt_file" "$slice_paths"
  log "  review+fix prompt: ${prompt_file#$ROOT/}"
  log "  review+fix log:    ${log_file#$ROOT/}"

  if run_agent "$prompt_file" "$log_file"; then
    log "  review+fix complete for $sid"
    return 0
  else
    rc=$?
    warn "  review+fix failed for $sid (exit $rc) — inspect ${log_file#$ROOT/}"
    return "$rc"
  fi
}

commit_story() {
  local sid="$1" title="$2"
  if [[ -z "$(git status --porcelain)" ]]; then
    log "  no changes to commit for $sid"
    return 0
  fi
  git add -A
  git commit -m "Implemented $sid — $title" >/dev/null
  log "  committed: Implemented $sid — $title"
}

run_one() {
  local sid="$1" wave="$2" title="$3" rel_ddd="$4" prompt_builder="$5"
  local ts prompt_file log_file before_manifest rc

  log "[RUN] $wave $sid — $title"
  log "      plan: $rel_ddd"

  ts="$(date '+%Y%m%d-%H%M%S')"
  prompt_file="$LOG_DIR/${sid}-${ts}.prompt.txt"
  log_file="$LOG_DIR/${sid}-${ts}.${OUTPUT_FORMAT}.log"
  before_manifest="$LOG_DIR/${sid}-${ts}.before.dirty.txt"

  # Always render the prompt, including --dry-run, so we catch unquoted-
  # heredoc backtick expansion (which silently strips identifiers like
  # `platform-configuration`) before any agent is launched.
  "$prompt_builder" "$prompt_file"
  log "      prompt: ${prompt_file#$ROOT/}"
  log "      log:    ${log_file#$ROOT/}"
  log "      model:  $MODEL"

  if [[ $DRY_RUN -eq 1 ]]; then
    log "      (dry-run) would run implementation, then review-and-fix, then commit unconditionally"
    return 0
  fi

  snapshot_dirty_hashes "$before_manifest"

  if run_agent "$prompt_file" "$log_file"; then
    log "[OK]  $sid implementation pass complete"
  else
    rc=$?
    warn "[FAIL] $sid exited with code $rc — inspect ${log_file#$ROOT/}"
    exit "$rc"
  fi

  if ! review_and_fix "$sid" "$title" "$rel_ddd" "$wave" "$before_manifest"; then
    warn "[FAIL] $sid review-and-fix gate failed — stopping before commit"
    exit 1
  fi

  # Auto-commit is not optional: a story/foundation that reaches this point
  # has passed implementation and review-and-fix, and is committed
  # unconditionally. There is no --skip-commit escape hatch.
  commit_story "$sid" "$title"
}

# ---------- Main ----------

mapfile -t STORIES < <(collect_stories)

if [[ ${#STORIES[@]} -eq 0 ]]; then
  echo "no stories parsed from $SEQUENCE_DOC's wave table" >&2
  exit 1
fi

# The DDD set is 76 stories. A wave-table edit that drops or duplicates a
# row would otherwise silently skip or double-run work.
if [[ ${#STORIES[@]} -ne 76 ]]; then
  echo "error: wave table parsed ${#STORIES[@]} stories, expected 76" >&2
  exit 1
fi

log "Peach Finder BRD: FOUNDATION + ${#STORIES[@]} stories, in wave-table rollout order: $(printf '%s ' "${STORIES[@]%%|*}")"

started=0
[[ -z "$START_FROM" ]] && started=1

declare -A IMPLEMENTED=()
while IFS= read -r impl_id; do
  [[ -n "$impl_id" ]] || continue
  IMPLEMENTED["$impl_id"]=1
done < <(collect_implemented_ids)

processed=0
skipped=0

# --- FOUNDATION (Wave 0) — always considered first unless --only/--start-from
#     names a specific story past it. ---
run_foundation=1
if [[ -n "$ONLY" && "$ONLY" != "$FOUNDATION_ID" ]]; then
  run_foundation=0
fi
if [[ -n "$START_FROM" && "$START_FROM" != "$FOUNDATION_ID" ]]; then
  run_foundation=0
  started=0
fi

if [[ $run_foundation -eq 1 ]]; then
  if [[ $FORCE -eq 0 && -n "${IMPLEMENTED[$FOUNDATION_ID]+x}" ]]; then
    log "[SKIP] W0 $FOUNDATION_ID — already implemented (found in git log; pass --force to re-run)"
    skipped=$((skipped + 1))
  else
    rel_foundation_ddd="${FOUNDATION_DDD#$ROOT/}"
    run_one "$FOUNDATION_ID" "W0" "Frontend & Platform Bootstrap" "$rel_foundation_ddd" \
      build_foundation_prompt_file
    processed=$((processed + 1))
  fi
  [[ -n "$ONLY" && "$ONLY" == "$FOUNDATION_ID" ]] && { log "done. processed: $processed, skipped: $skipped"; exit 0; }
fi

for entry in "${STORIES[@]}"; do
  sid="${entry%%|*}"
  wave="${entry##*|}"

  if [[ -n "$ONLY" && "$sid" != "$ONLY" ]]; then
    continue
  fi

  if [[ $started -eq 0 ]]; then
    if [[ "$sid" == "$START_FROM" ]]; then started=1; else continue; fi
  fi

  if [[ $FORCE -eq 0 && -n "${IMPLEMENTED[$sid]+x}" ]]; then
    log "[SKIP] $wave $sid — already implemented (found in git log; pass --force to re-run)"
    skipped=$((skipped + 1))
    continue
  fi

  ddd_path="$(resolve_ddd_path "$sid" || true)"
  if [[ -z "$ddd_path" ]]; then
    warn "skipping $sid ($wave): could not resolve its DDD path under $DDD_ROOT"
    continue
  fi

  rel_ddd="${ddd_path#$ROOT/}"
  title="$(read_ddd_title "$ddd_path" "$sid")"

  # shellcheck disable=SC2317  # invoked indirectly via run_one's $prompt_builder
  build_this_story_prompt() { build_prompt_file "$sid" "$title" "$wave" "$rel_ddd" "$1"; }

  run_one "$sid" "$wave" "$title" "$rel_ddd" build_this_story_prompt

  processed=$((processed + 1))
  [[ -n "$ONLY" ]] && break
done

log "done. Peach Finder BRD stories processed: $processed, skipped (already implemented): $skipped"
