#!/bin/bash
# Arm the tracked hook and check a scenario branch out.
#
#   scripts/setup.sh <branch>       (default: main)
#
# A fresh clone fires nothing (git clones carry no hooks); this arms
# core.hooksPath and then checks the branch out, which runs the scenario.
set -u

REPO_DIR=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not a git repo"; exit 1; }
cd "$REPO_DIR"

BRANCH="${1:-main}"
git config core.hooksPath .githooks
echo "hooks armed: $(git config core.hooksPath) -> checking out $BRANCH"
exec git checkout "$BRANCH"
