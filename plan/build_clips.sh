#!/usr/bin/env bash
# Assemble public/report/walk/<slug>/NN.webp frames into looping animated WebPs (15 fps).
set -euo pipefail
cd "$(dirname "$0")/../public/report/walk"
n=0
for d in */; do
  slug="${d%/}"
  [ -f "$slug/00.webp" ] || continue
  frames=( "$slug"/*.webp )
  img2webp -loop 0 -lossy -q 72 -d 66 "${frames[@]}" -o "$slug.webp" >/dev/null 2>&1 \
    || ffmpeg -y -loglevel error -framerate 15 -i "$slug/%02d.webp" -loop 0 -c:v libwebp_anim -q:v 72 "$slug.webp"
  n=$((n+1))
done
echo "clips built: $n"
