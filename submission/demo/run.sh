#!/usr/bin/env bash
# submission/demo/run.sh
#
# Phase 4 demo capture pipeline.
#  1. reset a fresh, dedicated loopback test DB
#  2. boot a production build of the Next.js app on FERA_E2E_PORT=3115
#  3. drive the parent-form + officer-review journeys in a real Chromium,
#     recording video + per-beat PNGs
#  4. transcode to a 105-second 1280x720 MP4 with English captions and the
#     persistent 'SYNTHETIC LOCAL DEMO | [MOCK] officer verification |
#     Timing edited' label burnt in
#
# Outputs:
#   submission/demo/raw/capture.webm   - raw browser recording
#   submission/demo/raw/proof/*.png    - per-beat screenshots
#   submission/demo/final.mp4          - 105s MP4 deliverable
#   submission/demo/captions.srt       - caption manifest
#   submission/demo/README.md          - provenance + how-to-replay
#
# Hard guardrails:
#   - loopback DB only (guarded inside scripts/db/guard.mjs)
#   - FERA_MODEL_CACHE pin → no paid provider calls
#   - no env files read; throwaway AUTH_SECRET / PARENT_COOKIE_KEY /
#     DRAFT_SIGNING_KEY generated per-run

set -euo pipefail
cd "$(dirname "$0")/../.."

export FERA_E2E_PORT=3115
export FERA_DEMO_CAPTURE_DIR="${PWD}/submission/demo/raw"
mkdir -p "${FERA_DEMO_CAPTURE_DIR}"

echo "[demo] orchestrate: reset DB + boot server + capture"
node submission/demo/orchestrate.mjs

echo "[demo] post-process to MP4 + captions"
node submission/demo/postprocess.mjs

echo "[demo] verify deliverable"
node submission/demo/verify.mjs
echo "[demo] DONE"
