#!/bin/bash
# Reset between demo scenarios. Run BEFORE each `git checkout <branch>`.
#
#   scripts/reset-scenario.sh && git checkout s3-malicious
#
# - wipes ~/plugin-demo (collected data, logs, reports)
# - drops post-checkout reports from the repo root
# - restores the watched file if missing (labeled lab content, never real data)
# - keeps the tracked hook (.githooks/post-checkout) as the only active hook
set -u

REPO_DIR=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not a git repo"; exit 1; }
cd "$REPO_DIR"

# 1. wipe plugin artifacts
rm -rf "$HOME/plugin-demo"

# 2. retire any hand-installed hook so .githooks is the single source of truth
rm -f .git/hooks/post-checkout .git/hooks/post-checkout.bak
git config core.hooksPath .githooks

# 3. drop scenario reports from the repo root
rm -f post-checkout-report-*.txt

# 4. restore the watched file if missing (content is labeled lab data)
WATCHED="$HOME/lab-files/dummy.txt"
if [ ! -f "$WATCHED" ]; then
    mkdir -p "$(dirname "$WATCHED")"
    printf '{"note":"lab dummy data, not real"}\n' > "$WATCHED"
    echo "created missing watched file: $WATCHED"
fi

echo "Reset done. Branch: $(git branch --show-current)"
echo "Watched file: $WATCHED ($(wc -c < "$WATCHED" | tr -d ' ') bytes)"
echo "Hook: $(git config core.hooksPath) (post-checkout)"
echo "Next: git checkout <main|s2-narrative|s3-malicious|s4-malicious>"
