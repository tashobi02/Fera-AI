#!/usr/bin/env bash
# One-time setup on each teammate's machine. Safe to re-run.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
need(){ command -v "$1" >/dev/null || { echo "Missing: $1 ($2)"; missing=1; }; }
missing=0
need git "https://git-scm.com"; need node "Node 20+"; need npm "comes with Node"
need uv "https://docs.astral.sh/uv/ (for spec-kit)"
command -v claude >/dev/null || echo "Note: Claude Code CLI not found (npm i -g @anthropic-ai/claude-code)"
command -v codex  >/dev/null || echo "Note: Codex CLI not found (npm i -g @openai/codex)"
[ "$missing" = 0 ] || exit 1

# 1. spec-kit CLI (templates + skills are already committed in .specify/, .claude/skills, .agents/skills)
# pinned to the commit the kit was generated with (THIRD_PARTY_NOTICES.md)
uv tool install --force "specify-cli @ git+https://github.com/github/spec-kit.git@0443760542e7e5269724744a2ac55c4bd386d095"
specify integration status || true

# 2. impeccable: replace the vendored copy with provider-native builds + edit hooks (optional but recommended)
if [ "${SKIP_IMPECCABLE:-0}" != 1 ]; then
  npx -y impeccable install --providers=claude,codex --scope=project || echo "impeccable install failed; the vendored skill still works."
fi

# 3. local env template
[ -f .env.local ] || { [ -f .env.example ] && cp .env.example .env.local && echo "Created .env.local from .env.example — fill in keys."; }

cat <<'MSG'

Done. Next:
  Claude Code: run `claude` here; check /agents lists fera-safeguarding-reviewer, and /skills lists speckit-*, impeccable, fera-review.
  Codex:       run `codex`, trust the project, approve hooks in /hooks if impeccable added any; skills appear as $speckit-*, $impeccable, $fera-review.
  Start a lane: scripts/agents/new-lane.sh 002-intake-ai obidit-normaliser
MSG
