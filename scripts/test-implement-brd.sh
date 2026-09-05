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

# Unquoted <<TASK prompt bodies must escape backticks. An unescaped
# `platform-configuration` is command-substituted away when the prompt
# is rendered, which is how the first driver run launched a corrupted
# FOUNDATION prompt.
python3 - "$DRIVER" <<'PY' || fail "unescaped backticks in unquoted <<TASK prompt bodies"
import sys
from pathlib import Path
src = Path(sys.argv[1]).read_text().splitlines()
in_unquoted = False
offenders = []
for i, line in enumerate(src, 1):
    stripped = line.lstrip()
    if not in_unquoted:
        if "<<" in stripped and stripped.rstrip().endswith("TASK") and "<<'TASK'" not in line and '<<"TASK"' not in line:
            opener = stripped.split("<<", 1)[1].strip()
            if opener == "TASK":
                in_unquoted = True
        continue
    if line == "TASK":
        in_unquoted = False
        continue
    j = 0
    while j < len(line):
        if line[j] == "`" and (j == 0 or line[j - 1] != "\\"):
            offenders.append(f"{i}:{line}")
            break
        j += 1
if in_unquoted:
    raise SystemExit("unclosed <<TASK heredoc")
if offenders:
    print("unescaped backticks:\n" + "\n".join(offenders[:20]), file=sys.stderr)
    raise SystemExit(1)
PY
pass "unquoted <<TASK prompt bodies escape backticks"

# Render the FOUNDATION prompt (no agent) and assert identifiers survive.
DUMP_DIR="$(mktemp -d)"
trap 'rm -rf "$DUMP_DIR"' EXIT
LOG_DIR="$DUMP_DIR" "$DRIVER" --dry-run --force --only FOUNDATION --resume-dirty >/dev/null
prompt="$(find "$DUMP_DIR" -name 'FOUNDATION-*.prompt.txt' -print | sort | tail -n1)"
[[ -n "$prompt" && -f "$prompt" ]] || fail "dry-run did not write a FOUNDATION prompt"
grep -Fq '`platform-configuration`' "$prompt" \
  || fail "FOUNDATION prompt lost \`platform-configuration\` (unquoted-heredoc expansion)"
grep -Fq '`src/hooks.server.ts`' "$prompt" \
  || fail "FOUNDATION prompt lost \`src/hooks.server.ts\`"
grep -Fq '`src/lib/server/modules/<module>/`' "$prompt" \
  || fail "FOUNDATION prompt lost module-layout path"
pass "dry-run FOUNDATION prompt preserves backtick-quoted identifiers"

# run_agent must not pass prompt-file contents as argv (Linux MAX_ARG_STRLEN
# is 128KiB; US-PONB-03's review prompt was 221KB and failed with exit 126).
if grep -A30 '^run_agent()' "$DRIVER" | grep -Fq 'prompt="$(<'; then
  fail "run_agent still loads the prompt file into argv"
fi
grep -A30 '^run_agent()' "$DRIVER" | grep -Fq 'prompt_file' \
  || fail "run_agent must point the agent at the prompt file"
pass "run_agent does not pass prompt contents as argv"

echo "all checks passed"
