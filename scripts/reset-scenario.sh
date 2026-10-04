#!/bin/bash
# Reset between demo scenarios. Run BEFORE each npm install scenario.
#
#   scripts/reset-scenario.sh
#
# - wipes ~/plugin-demo (collected data, logs, reports)
# - restores the watched file if missing (labeled lab content, never real data)
set -u

REPO_DIR=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not a git repo"; exit 1; }
cd "$REPO_DIR"

# 1. wipe plugin artifacts
rm -rf "$HOME/plugin-demo"

# 2. drop scenario reports from the repo root
rm -f post-checkout-report-*.txt

# 3. restore the watched file if missing (content is labeled lab data)
WATCHED="$HOME/alibi-lab-files/config.txt"
if [ ! -f "$WATCHED" ]; then
    mkdir -p "$(dirname "$WATCHED")"
    printf 'Plugin configuration - synthetic data for npm postinstall test\n' > "$WATCHED"
    echo "created missing watched file: $WATCHED"
fi

echo "Reset done."
echo "Watched file: $WATCHED ($(wc -c < "$WATCHED" | tr -d ' ') bytes)"
echo "Next: npm install git+https://github.com/vradja/claude-plugin-example.git#plugin-vX"
