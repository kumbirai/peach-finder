#!/usr/bin/env bash
# Regression checks for scripts/implement-brd.sh invariants and the
# wave-table / DDD ownership of US-AVAIL-04 (active-this-week badge).
#
# The parser here is a byte-for-byte copy of collect_stories() in
# implement-brd.sh -- if that awk changes, this test must change with it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEQUENCE_DOC="$ROOT/documentation/08-development-deliverable-documents/00-foundations/implementation-sequence.md"
AVAIL04_DDD="$ROOT/documentation/08-development-deliverable-documents/E8-AVAIL/US-AVAIL-04-active-this-week-earned-automatically.ddd.md"
AVAIL05_DDD="$ROOT/documentation/08-development-deliverable-documents/E8-AVAIL/US-AVAIL-05-no-black-boxes-about-my-own-signals.ddd.md"
DRIVER="$ROOT/scripts/implement-brd.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

[[ -f "$SEQUENCE_DOC" ]] || fail "missing sequence doc: $SEQUENCE_DOC"
[[ -f "$AVAIL04_DDD"  ]] || fail "missing US-AVAIL-04 DDD: $AVAIL04_DDD"
[[ -f "$AVAIL05_DDD"  ]] || fail "missing US-AVAIL-05 DDD: $AVAIL05_DDD"
[[ -f "$DRIVER"       ]] || fail "missing driver: $DRIVER"

# Same awk as collect_stories() in implement-brd.sh.
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

mapfile -t STORIES < <(collect_stories)

[[ ${#STORIES[@]} -eq 76 ]] || fail "wave table parsed ${#STORIES[@]} stories, expected 76"
pass "wave table has 76 stories"

declare -A WAVE_OF=()
for entry in "${STORIES[@]}"; do
  sid="${entry%%|*}"
  wave="${entry##*|}"
  if [[ -n "${WAVE_OF[$sid]+x}" ]]; then
    fail "duplicate wave-table row for $sid"
  fi
  WAVE_OF["$sid"]="$wave"
done
pass "wave table story ids are unique"

[[ "${WAVE_OF[US-AVAIL-01]:-}" == "W2" ]] || fail "US-AVAIL-01 expected W2, got ${WAVE_OF[US-AVAIL-01]:-missing}"
[[ "${WAVE_OF[US-AVAIL-02]:-}" == "W2" ]] || fail "US-AVAIL-02 expected W2, got ${WAVE_OF[US-AVAIL-02]:-missing}"
[[ "${WAVE_OF[US-AVAIL-03]:-}" == "W2" ]] || fail "US-AVAIL-03 expected W2, got ${WAVE_OF[US-AVAIL-03]:-missing}"
[[ "${WAVE_OF[US-AVAIL-04]:-}" == "W4" ]] || fail "US-AVAIL-04 expected W4 (trust-and-safety job depends on W3 messaging), got ${WAVE_OF[US-AVAIL-04]:-missing}"
[[ "${WAVE_OF[US-AVAIL-05]:-}" == "W4" ]] || fail "US-AVAIL-05 expected W4 (explains the W4 badge job), got ${WAVE_OF[US-AVAIL-05]:-missing}"
pass "US-AVAIL-01..03 stay W2; US-AVAIL-04/05 land in W4"

grep -Fq 'Primary LLD module:** `trust-and-safety`' "$AVAIL04_DDD" \
  || fail "US-AVAIL-04 DDD primary module must be trust-and-safety"
grep -Fq '`provider-availability`' "$AVAIL04_DDD" \
  || fail "US-AVAIL-04 DDD must list provider-availability as a supporting (signal) module"
grep -Fq '`direct-messaging`' "$AVAIL04_DDD" \
  || fail "US-AVAIL-04 DDD must list direct-messaging as a supporting (hasSentSince) module"
pass "US-AVAIL-04 DDD primary is trust-and-safety with four-signal supporting modules"

grep -Fq 'Primary LLD module:** `provider-availability`' "$AVAIL05_DDD" \
  || fail "US-AVAIL-05 DDD primary module must stay provider-availability (FR-AVAIL-07)"
grep -Fq '`trust-and-safety`' "$AVAIL05_DDD" \
  || fail "US-AVAIL-05 DDD must list trust-and-safety as supporting (badge_state read)"
pass "US-AVAIL-05 DDD primary stays provider-availability with trust-and-safety supporting"

# Driver comments and W2 prompt must not still tell the agent to land
# US-AVAIL-01..05 in Wave 2.
if grep -n 'US-AVAIL-01\.\.05' "$DRIVER" >/dev/null; then
  fail "implement-brd.sh still mentions US-AVAIL-01..05 (would schedule the badge job in W2)"
fi
pass "implement-brd.sh no longer schedules US-AVAIL-01..05 as a W2 block"

# Driver's collect_stories awk must still match this test's copy.
driver_awk="$(sed -n '/^collect_stories() {/,/^}$/p' "$DRIVER")"
test_awk="$(sed -n '/^collect_stories() {/,/^}$/p' "$0")"
# Compare only the awk body (the function wrappers differ by file).
driver_body="$(printf '%s\n' "$driver_awk" | sed -n '/awk /,/'\'' "\$SEQUENCE_DOC"/p')"
test_body="$(printf '%s\n' "$test_awk" | sed -n '/awk /,/'\'' "\$SEQUENCE_DOC"/p')"
[[ "$driver_body" == "$test_body" ]] || fail "collect_stories awk in implement-brd.sh drifted from this test's copy"
pass "collect_stories awk in implement-brd.sh matches this test"

echo "all checks passed"
