# yachifish 관리 노트

사용자용 문서는 [yachifish/README.md](yachifish/README.md). 이 파일은 유지보수용.

## 구성

| 경로 | 내용 |
| --- | --- |
| `yachifish/src/yachifish.js` | 원본 소스 (ESM). 수정은 여기서만. |
| `yachifish/build.mjs` | 의존성 없는 빌드. ESM 복사 + UMD 래핑(`window.yachifish`). |
| `yachifish/dist/` | 빌드 결과. jsDelivr가 태그 기준으로 이 파일을 서빙하므로 커밋 대상. |
| `yachifish/demo.html` | 로컬 dist 확인용 페이지. |

원본: `examples/물고기 이펙트 초안 Argon.html`의 `<script>`.

## 원본 대비 변경점

- **seq 모드 제외.** 모드는 `sphere`(기본), `burst`, `spiral`, `rise`, `bokeh`. `seqClock`과 seq 분기는 모두 삭제함.
- **DOM 컨트롤러 결합 제거.** 슬라이더 id를 옵션 키로 그대로 씀(`patA`, `winD` 등). 색 `c0`~`c5`는 `palette` 배열로 합침. 길이는 자유이며 `ci % palette.length`로 배정. `ci`는 계속 `floor(r()*6)`로 뽑아서, 같은 시드면 원본과 같은 배치가 나옴.
- **모드 프리셋.** `MODE_PRESETS` 그대로. 생성 시에는 `DEFAULTS ← PRESETS[mode] ← 사용자 옵션` 순서로 합치고, `set({mode})`는 프리셋으로 덮은 뒤 같은 호출의 값을 적용함(원본 `setMode`와 같음).
- **가변 폭.** 논리 높이 `H = 450`은 고정이고, 폭 `S.W`는 `450 × 컨테이너 비율`(0.25 ~ 5로 제한). 원본은 800 고정. 폭이 바뀌면 개체의 x를 비례 이동하고 잔상 히스토리를 비움.
- **렌더 배율.** 비트맵 크기는 `표시 높이 × min(dpr, maxPixelRatio) / 450`. 원본은 `min(2, dpr)` 고정.
- **blur 보정.** 캔버스 `filter: blur()`의 반경은 변환 행렬의 영향을 받지 않는 비트맵 픽셀 단위임(Chrome에서 확인함). 그래서 `farBlur`, `glowR`, 반사 블러 4.5에 렌더 배율을 곱함(`blurPx`). 원본은 dpr 2 화면에서 블러가 절반으로 보였음.
- **`background: false`.** 하늘·바닥 그라디언트, 데크 결, 오로라를 생략하고 `sceneG`는 `clearRect`. 오로라를 남기면 밝은 페이지에서 수평선 아래에 반사된 헤이즈 띠가 보여서 같이 끔. `refl`은 사용자가 조절함.
- **`interactive: false`** → 캔버스 `pointer-events: none`(오버레이 용도).
- **`fire(x, y)`.** 원본의 버튼(`triggerBurst`만)과 캔버스 클릭(밀어내기 + 파문)을 하나로 합침. 인자가 없으면 버튼 동작, 0~1 좌표를 넘기면 클릭 동작.
- **화면 밖 정지.** IntersectionObserver로 보이지 않을 때 rAF를 멈춤.
- **입력 정리(`sanitize`).** 개체 수와 `trail`은 정수, `spark`는 0~90(빛방울 풀이 90개라서), `motif`는 0~5, `hz`는 0.05~1, `spd`는 0 이상. 모르는 `mode`나 잘못된 `palette`는 에러.
- URL 파라미터 `?mode=`, `?t=`(예열 시간) 지원은 제거함. 예열은 원본 기본값(0.03 × 15)으로 고정.

## 빌드

```sh
node packages/yachifish/build.mjs
```

`umd.min.js`는 아직 `umd.js` 복사본임(jsDelivr가 `.min.js` 요청을 자동 압축해 줌). esbuild를 도입하면 교체.

## 릴리스

1. `src` 수정 → 빌드 → `demo.html`로 확인.
2. SRI 해시 계산:
   ```sh
   cd packages/yachifish
   for f in dist/yachifish.umd.js dist/yachifish.esm.js; do echo "$f sha384-$(openssl dgst -sha384 -binary $f | openssl base64 -A)"; done
   ```
3. README의 태그명(`yachifish-vX.Y.Z`)과 해시(설치, 빠른 시작, 해시 표)를 모두 교체.
4. 커밋 → `git tag yachifish-vX.Y.Z` → `git push origin main yachifish-vX.Y.Z`.
5. 확인: `curl -s https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@yachifish-vX.Y.Z/packages/yachifish/dist/yachifish.umd.js | openssl dgst -sha384 -binary | openssl base64 -A`가 README 해시와 같아야 함.

`.gitattributes`가 `eol=lf`이므로 Windows에서도 커밋되는 바이트는 LF임. 해시는 LF 파일로 계산할 것.

태그는 한 번 푸시하면 다시 쓰지 않음(jsDelivr 캐시와 사용자 측 SRI가 깨짐). 수정이 있으면 버전을 올림.

## 릴리스 이력

| 태그 | 내용 |
| --- | --- |
| `yachifish-v0.1.0` | 첫 릴리스. |
