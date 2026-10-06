#!/bin/sh
# 월페이퍼 동결본 재발급 (Linux/클라우드 세션용, 명시적 재동결 때만 실행)
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
mkdir -p wallpaper/vendor/assets/icons wallpaper/vendor/clouds
cp public/tsukuyomi.js wallpaper/vendor/tsukuyomi.js
cp public/tsukuyomi.css wallpaper/vendor/tsukuyomi.css
cp public/cloud-doc.js wallpaper/vendor/cloud-doc.js
cp public/cloud-live.js wallpaper/vendor/cloud-live.js
cp public/lantern-front.svg wallpaper/vendor/lantern-front.svg
cp public/assets/icons/icon.svg wallpaper/vendor/assets/icons/icon.svg
cp public/clouds/index.json wallpaper/vendor/clouds/index.json
python3 wallpaper/tools/generate-project-json.py
python3 wallpaper/tools/verify-wallpaper.py
