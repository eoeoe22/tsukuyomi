#!/bin/sh
# 월페이퍼 동결본 재발급 (Linux/클라우드 세션용, 명시적 재동결 때만 실행)
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
mkdir -p wallpaper/vendor/assets/icons
mkdir -p wallpaper/vendor/clouds
cp public/tsukuyomi.js wallpaper/vendor/tsukuyomi.js
cp public/tsukuyomi.css wallpaper/vendor/tsukuyomi.css
cp public/cloud-live.js wallpaper/vendor/cloud-live.js
cp public/cloud-overlay.js wallpaper/vendor/cloud-overlay.js
cp public/clouds/day-overlay.json wallpaper/vendor/clouds/day-overlay.json
cp public/lantern-front.svg wallpaper/vendor/lantern-front.svg
cp public/assets/icons/icon.svg wallpaper/vendor/assets/icons/icon.svg
cp public/tsukuyomi.mount.js wallpaper/vendor/tsukuyomi.mount.js
cp public/tsukuyomi.earth.js wallpaper/vendor/tsukuyomi.earth.js
cp public/tsukuyomi.room.js wallpaper/vendor/tsukuyomi.room.js
cp public/tsukuyomi.news.js wallpaper/vendor/tsukuyomi.news.js
mkdir -p wallpaper/components
cp public/components/lantern-frustum.html wallpaper/components/lantern-frustum.html
cp public/components/lantern-cylinder.html wallpaper/components/lantern-cylinder.html
cp public/components/yachiroom.umd.js wallpaper/components/yachiroom.umd.js
python3 wallpaper/tools/generate-project-json.py
python3 wallpaper/tools/verify-wallpaper.py
