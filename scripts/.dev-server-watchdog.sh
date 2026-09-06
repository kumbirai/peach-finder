#!/usr/bin/env bash
# Watchdog for implement-brd.sh: the cursor-agent occasionally chains a
# foreground `npm run dev` / `vite dev` with && inside one shell call, which
# never returns and hangs the driver for as long as it takes someone to
# notice. Playwright's own managed webServer never lives that long, so a
# long-lived vite/dev process while the driver log has gone quiet is the
# signature of the hang. When we see it, kill that process subtree so the
# agent's blocked tool call returns, and emit one line so the operator is
# notified.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STALE_SECS=${STALE_SECS:-1500}   # driver log quiet this long => suspect hang
MIN_PROC_AGE=${MIN_PROC_AGE:-900} # only kill a dev proc at least this old

while true; do
  drv="$(ls -t "$ROOT"/logs/implement-brd-driver-*.out 2>/dev/null | head -1)"
  if [[ -n "$drv" ]]; then
    log_age=$(( $(date +%s) - $(stat -c %Y "$drv") ))
    if (( log_age > STALE_SECS )); then
      # driver log quiet: look for an old vite/npm-run-dev process
      while read -r pid etimes cmd; do
        [[ -z "$pid" ]] && continue
        (( etimes < MIN_PROC_AGE )) && continue
        # kill the process and its group
        pgid=$(ps -o pgid= -p "$pid" | tr -d ' ')
        printf '[%s] WATCHDOG: killing stale dev process pid=%s age=%ss (driver log quiet %ss): %s\n' \
          "$(date '+%H:%M:%S')" "$pid" "$etimes" "$log_age" "$cmd"
        kill -TERM -- "-$pgid" 2>/dev/null
        sleep 5
        kill -KILL -- "-$pgid" 2>/dev/null
      done < <(ps -eo pid=,etimes=,args= | grep -E 'vite dev|npm run dev|npm exec vite|node .*/vite' | grep -v grep)
    fi
  fi
  sleep 120
done
