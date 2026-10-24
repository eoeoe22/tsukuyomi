# 월페이퍼 동결본 재발급 (명시적 재동결 때만 실행)
# public 현행본 -> wallpaper/vendor 복사 + project.json 재생성
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root
New-Item -ItemType Directory -Force wallpaper/vendor/assets/icons | Out-Null
New-Item -ItemType Directory -Force wallpaper/vendor/clouds | Out-Null
Copy-Item public/tsukuyomi.js wallpaper/vendor/tsukuyomi.js -Force
Copy-Item public/tsukuyomi.css wallpaper/vendor/tsukuyomi.css -Force
Copy-Item public/cloud-live.js wallpaper/vendor/cloud-live.js -Force
Copy-Item public/cloud-overlay.js wallpaper/vendor/cloud-overlay.js -Force
Copy-Item public/clouds/day-overlay.json wallpaper/vendor/clouds/day-overlay.json -Force
Copy-Item public/lantern-front.svg wallpaper/vendor/lantern-front.svg -Force
Copy-Item public/assets/icons/icon.svg wallpaper/vendor/assets/icons/icon.svg -Force
Copy-Item public/tsukuyomi.mount.js wallpaper/vendor/tsukuyomi.mount.js -Force
Copy-Item public/tsukuyomi.earth.js wallpaper/vendor/tsukuyomi.earth.js -Force
Copy-Item public/tsukuyomi.room.js wallpaper/vendor/tsukuyomi.room.js -Force
Copy-Item public/tsukuyomi.news.js wallpaper/vendor/tsukuyomi.news.js -Force
New-Item -ItemType Directory -Force wallpaper/components | Out-Null
Copy-Item public/components/lantern-frustum.html wallpaper/components/lantern-frustum.html -Force
Copy-Item public/components/lantern-cylinder.html wallpaper/components/lantern-cylinder.html -Force
Copy-Item public/components/yachiroom.umd.js wallpaper/components/yachiroom.umd.js -Force
Copy-Item public/components/newstile.umd.js wallpaper/components/newstile.umd.js -Force
python wallpaper/tools/generate-project-json.py
python wallpaper/tools/verify-wallpaper.py
