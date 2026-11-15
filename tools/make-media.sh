#!/usr/bin/env bash
# Encode the clips in media/: greyscale, toned to the page's paper, H.264, with a poster each.
#
#   tools/make-media.sh <drone-search-rescue checkout> <drone-sar-demo.mp4> <poker-rl checkout>
#
# drone-sar-demo.mp4 is the demo video on the drone-search-rescue release page.
set -euo pipefail

drone=$1
demo=$2
poker=$3
out="$(cd "$(dirname "$0")/.." && pwd)/media"
mkdir -p "$out"

tone="format=gray,format=gbrp,colorchannelmixer=rr=0.914:gg=0.906:bb=0.886,format=yuv420p"
h264=(-an -c:v libx264 -preset veryslow -profile:v high -pix_fmt yuv420p -movflags +faststart -loglevel error -y)

# 1120 x 630 is the reel's screen at its largest, from 1920 px up
ffmpeg -ss 10 -t 9 -i "$demo" \
  -vf "crop=1200:676:0:0,scale=1120:630:flags=lanczos,hqdn3d=1:1:3:3,fps=20,$tone" \
  -crf 33 "${h264[@]}" "$out/drone-search.mp4"
ffmpeg -i "$drone/docs/media/detection.gif" \
  -vf "crop=640:506:1:1,hqdn3d=3:3:8:8,$tone" \
  -crf 33 "${h264[@]}" "$out/drone-detect.mp4"
ffmpeg -i "$drone/docs/media/hero.gif" \
  -vf "crop=1386:1300:0:0,hqdn3d=1.5:1.5:5:5,$tone" \
  -crf 30 "${h264[@]}" "$out/drone-map.mp4"
ffmpeg -i "$drone/docs/media/finale.gif" \
  -vf "hqdn3d=1.5:1.5:5:5,scale=884:496:flags=lanczos,$tone" \
  -crf 30 "${h264[@]}" "$out/drone-rescue.mp4"
ffmpeg -i "$poker/docs/demo.gif" \
  -vf "scale=880:618:flags=lanczos,$tone" \
  -crf 28 "${h264[@]}" "$out/poker-table.mp4"

# poster <clip> <fraction of the clip's length>
poster() {
  local length
  length=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/$1.mp4")
  ffmpeg -loglevel error -y -ss "$(echo "$length * $2" | bc -l)" -i "$out/$1.mp4" \
    -frames:v 1 -q:v 6 "$out/$1.jpg"
}
poster drone-search 0.5
poster drone-detect 0.55
poster drone-map 0.93
poster drone-rescue 0.86
poster poker-table 0.55
