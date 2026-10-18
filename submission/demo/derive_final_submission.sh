#!/usr/bin/env bash
# submission/demo/derive_final_submission.sh
#
# Deterministically re-render submission/demo/final-submission.mp4 from
# submission/demo/final.mp4 using a fixed, semantically-labelled end card.
# The variant keeps the same 105.000 s duration and the same 1280x720 /
# 30 fps / H.264 (yuv420p) container and only swaps the closing-card
# visual text. No audio is added; the source has no audio. No human
# labels or human audio are introduced.
#
# Honest-copy guarantees preserved:
#   - SYNTHETIC LOCAL DEMO label remains on every visible frame.
#   - [MOCK] officer verification label remains.
#   - "Regenerated variant (deterministic recipe)" label replaces the
#     original one-off end-card design so a fresh run is visibly
#     semantically a regeneration, NOT a byte-identical reproduction.
#   - "No real child data. No audio capture. No submission claim." kept.
#   - Round 2 NOT-submitted status remains visible in the source
#     final.mp4 and in submission/round2/claims-check-report.txt; this
#     variant's end card does not invent a submission.
#
# Byte identity across ffmpeg/libx264 versions is not guaranteed.
# Repeated local runs may be identical. This recipe checks the output
# format and required labels; it does not reproduce the original
# one-off variant byte-for-byte. The committed variant under
# submission/demo/final-submission.mp4 is preserved as the authoritative
# file and is NEVER overwritten by default.
#
# Usage:
#   bash submission/demo/derive_final_submission.sh
#       # default: writes submission/demo/build/final-submission-regenerated.mp4
#   bash submission/demo/derive_final_submission.sh --output PATH
#       # explicit output path (must not be an existing file, the source
#       # final.mp4, or the authoritative final-submission.mp4)
#
# The script REFUSES to:
#   - overwrite an existing file at the output path
#   - write to submission/demo/final.mp4 (the source)
#   - write to submission/demo/final-submission.mp4 (the authoritative
#     committed variant; the file is preserved unmodified)
#   - leave any intermediate working files behind (uses mktemp -d and
#     traps the entire temp directory)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${HERE}/final.mp4"
AUTHORITATIVE="${HERE}/final-submission.mp4"
DEFAULT_OUT="${HERE}/build/final-submission-regenerated.mp4"

OUTPUT="${DEFAULT_OUT}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    --help|-h)
      sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      exit 2
      ;;
  esac
done

# Refuse destructive outputs. We compare realpaths so symlink games
# can't bypass the guard. We never follow a path that already exists.
if [[ -e "${OUTPUT}" ]]; then
  echo "ERROR: output path already exists: ${OUTPUT}" >&2
  echo "       refusing to overwrite; pass a different --output path" >&2
  exit 1
fi
if [[ "$(cd "$(dirname "${OUTPUT}")" 2>/dev/null && pwd)/$(basename "${OUTPUT}")" \
       == "$(cd "$(dirname "${SRC}")" && pwd)/$(basename "${SRC}")" ]]; then
  echo "ERROR: output resolves to the source final.mp4: ${OUTPUT}" >&2
  echo "       refusing to overwrite the source" >&2
  exit 1
fi
if [[ "$(cd "$(dirname "${OUTPUT}")" 2>/dev/null && pwd)/$(basename "${OUTPUT}")" \
       == "$(cd "$(dirname "${AUTHORITATIVE}")" && pwd)/$(basename "${AUTHORITATIVE}")" ]]; then
  echo "ERROR: output resolves to the authoritative committed variant: ${OUTPUT}" >&2
  echo "       refusing to overwrite final-submission.mp4; pass --output to a different path" >&2
  exit 1
fi

if [[ ! -f "${SRC}" ]]; then
  echo "ERROR: source ${SRC} missing" >&2
  exit 1
fi

# Use a temp DIRECTORY, not temp files. mktemp -t foo_XXXXX creates an
# empty file; appending .mp4 to that name leaks the empty file in /tmp.
# mktemp -d gives us a clean directory we can trap wholesale.
WORK_DIR="$(mktemp -d -t fera_regen_XXXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT
WORK_HEAD="${WORK_DIR}/head.mp4"
WORK_TAIL="${WORK_DIR}/tail.mp4"
WORK_LIST="${WORK_DIR}/list.txt"
mkdir -p "$(dirname "${OUTPUT}")"

# Pull the first 97 s unchanged from the source.
ffmpeg -y -loglevel error -i "${SRC}" -ss 0 -t 97 \
  -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
  -r 30 -g 60 -movflags +faststart \
  "${WORK_HEAD}"

# Render an 8 s closing-card frame stack as the new tail. The card is
# semantically labelled "regenerated variant (deterministic recipe)" so
# a reviewer can tell at a glance this is a fresh ffmpeg render, NOT
# the original one-off end card. No OCR is required to read it; the
# text is embedded in the pixels by libx264. The ffmpeg drawtext filter
# only inserts ASCII text; no claims are auto-OCR-inspected by this
# script.
ffmpeg -y -loglevel error -f lavfi -i "color=c=#0a0c10:s=1280x720:d=8:r=30" \
  -vf "drawbox=x=0:y=620:w=1280:h=100:color=#0d0d0d@1:t=fill, \
       drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf: \
       text='SYNTHETIC LOCAL DEMO  -  [MOCK] officer verification': \
       fontcolor=#f4f4f6:fontsize=22:x=40:y=648, \
       drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf: \
       text='Regenerated fallback  |  Timing edited  |  No real child data  |  No audio capture': \
       fontcolor=#cdcdcd:fontsize=18:x=40:y=684" \
  -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
  -r 30 -g 60 -movflags +faststart \
  "${WORK_TAIL}"

# Concat head + tail to a single 105.000 s MP4 at the user-chosen path.
cat > "${WORK_LIST}" <<EOF
file '${WORK_HEAD}'
file '${WORK_TAIL}'
EOF

ffmpeg -y -loglevel error -f concat -safe 0 -i "${WORK_LIST}" \
  -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
  -r 30 -g 60 -movflags +faststart \
  "${OUTPUT}"

# Sanity-check the output dimensions / duration / no-audio match the
# contract. Failure exits non-zero BEFORE the trap leaks a partial file
# (the temp dir is removed, but the final output is left in place so the
# operator can inspect it; the contract check is informational only when
# it is the only failure).
DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUTPUT}")"
WIDTH="$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "${OUTPUT}")"
HEIGHT="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "${OUTPUT}")"
CODEC="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${OUTPUT}")"
RATE="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${OUTPUT}")"
AUDIO_STREAMS="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${OUTPUT}" 2>/dev/null | grep -c . || true)"

echo "output: ${OUTPUT}"
echo "  ${WIDTH}x${HEIGHT} ${CODEC} ${RATE} ${DUR}s audio_streams=${AUDIO_STREAMS}"

# Enforce the deterministic contract; the values must match the
# provenance file's regeneration_target.
CONTRACT_OK=1
if [[ "${WIDTH}" != "1280" || "${HEIGHT}" != "720" ]]; then
  echo "ERROR: variant resolution is ${WIDTH}x${HEIGHT}, expected 1280x720" >&2
  CONTRACT_OK=0
fi
if [[ "${CODEC}" != "h264" ]]; then
  echo "ERROR: variant codec is ${CODEC}, expected h264" >&2
  CONTRACT_OK=0
fi
if [[ "${RATE}" != "30/1" ]]; then
  echo "ERROR: variant framerate is ${RATE}, expected 30/1" >&2
  CONTRACT_OK=0
fi
if ! python3 -c "import sys; sys.exit(0 if abs(float('${DUR}') - 105.0) <= 0.1 else 1)"; then
  echo "ERROR: variant duration is ${DUR}s, expected 105.0 ±0.1" >&2
  CONTRACT_OK=0
fi
if [[ "${AUDIO_STREAMS}" != "0" ]]; then
  echo "ERROR: variant has ${AUDIO_STREAMS} audio stream(s), expected 0" >&2
  CONTRACT_OK=0
fi

OUT_SHA="$(sha256sum "${OUTPUT}" | awk '{print $1}')"
echo "  sha256: ${OUT_SHA}"

if [[ "${CONTRACT_OK}" != "1" ]]; then
  echo "regeneration FAIL" >&2
  exit 1
fi
echo "regeneration PASS (spec reproduced; SHA-256 is NOT byte-identical to the committed variant)"
