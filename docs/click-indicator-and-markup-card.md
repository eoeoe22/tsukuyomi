# 클릭 인디케이터 · 마크업 설명카드 구현 정리

예전 tsukuyomi 장면에서 쓰던 랜드마크 포커스 UI를 정리한 문서다.
장면 위 랜드마크(토리이, 달, 미러볼) 옆에 **클릭 인디케이터**가 떠 있고, 누르면 카메라가 그쪽으로 확대된다.
확대된 랜드마크 옆에는 **설명카드**가 붙는다. 카드 본문은 위키 문법(`cards/*.wiki`)으로 쓰고, 경량 마크업 엔진이 렌더한다.

> **현재 상태:** `6cb343a 새 장면 통합` · `62f1e68 mount 새 장면 통합`(2026-10-17)에서 `tsukuyomi.html`에서 빠졌다
> (앞 커밋: focus.js·카드 원문 삭제, 마크업 이동 / 뒤 커밋: CSS·HTML·디버그 미리보기·감상 모드 토글 삭제).
> 2~6장은 그 직전 커밋(`6cb343a^` = `f713cb7`)을 기준으로 정리했다.
> **허브 페이지 `/hub`(`public/hub.html`)로 다시 살렸다.** 바뀐 점은 7장을 본다.

---

## 1. 파일 구성과 이력

### 1.1 관련 파일 (`6cb343a^` 기준)

| 파일 | 역할 |
| --- | --- |
| `public/tsukuyomi.focus.js` (673줄) | 핀 배치, 카메라 확대/복귀, 카드 배치·렌더, 키보드/포커스 처리, 디버그용 API |
| `public/tsukuyomi.css` | `.focus-ui` `.focus-pin` `.click-indicator` `.pin-label` `#focusBack` `#focusCard` 스타일 |
| `public/tsukuyomi.html` | 핀 3개, 뒤로가기 버튼, 카드 마크업과 스크립트 로드 순서 |
| `public/tsukuyomi.js` | 인-캔버스 카메라(`setCamView` / `clearCam` / `getCamView`), 랜드마크 좌표 getter, 줌 프로파일러 |
| `public/tsukuyomi.markup.js` / `.css` | 카드 본문 렌더러 (지금은 `markup/`에 보관) |
| `public/cards/{torii,moon,mirror}.wiki` | 카드 원문 |
| `public/cards/README.md` | 카드 문법 설명 (지금은 `markup/README.md`로 옮겨짐) |
| `public/tsukuyomi.debug.js` | 디버그 패널의 "카드 미리보기" 섹션 |
| `public/examples/done/회색 클릭 인디케이터.html` | 인디케이터 단독 초안 (임시 폴더, 장면에서 불러오지 않음) |

### 1.2 커밋 이력

| 커밋 | 날짜 | 내용 |
| --- | --- | --- |
| `bb9a458` | 10-08 | 링크 허브 페이지엔진 초안 (focus.js 최초 추가) |
| `aaad5fc` | 10-08 | 인디케이터 표시 타이밍 수정 |
| `c51d64c` / `2295927` | 10-08~09 | 확대 시 렌더링 해상도 최적화, 줌 캐시 재굽기 제거 |
| `542b44e` | 10-08 | 인디케이터 옆 제목 표시기 추가, 세부 카드 예시 내용 |
| `3ea69e0` | 10-09 | 인디케이터 포커스 링 |
| `52e1b06` | 10-09 | 카드를 랜드마크 가까이 붙임 |
| `ac31e17` | 10-09 | 달·미러볼 확대 축소 최적화 |
| `0a8d665` | 10-11 | 인디케이터 카드 텍스트에 마크업 적용 |
| `6cb343a` | 10-17 | 새 장면 통합 (focus UI 제거) |

옛 코드를 직접 보려면:

```sh
git show 6cb343a^:public/tsukuyomi.focus.js
git show 6cb343a^:public/tsukuyomi.css | sed -n '520,850p'
git show 6cb343a^:public/tsukuyomi.html | sed -n '55,90p'
git show 6cb343a^:public/cards/torii.wiki
```

---

## 2. 클릭 인디케이터

### 2.1 모양

회색 점(`core`) 위로 같은 크기의 반투명 점(`pulse`)이 1초 주기로 3.2배까지 커지며 사라진다.
크기 0인 기준점(`.click-indicator`)을 두고 두 점을 그 중심에 겹친다.

```html
<span class="click-indicator" aria-hidden="true">
  <span class="pulse"></span>
  <span class="core"></span>
</span>
```

```css
.click-indicator {
  position: absolute; left: 50%; top: 50%;
  width: 0; height: 0;          /* 크기 0 기준점 → 자식이 정확히 중심에 놓인다 */
  pointer-events: none;
}
.click-indicator .core,
.click-indicator .pulse {
  position: absolute; left: 0; top: 0;
  width: 14px; height: 14px;
  margin: -7px 0 0 -7px;        /* 지름의 절반만큼 당겨 중심 정렬 */
  border-radius: 50%;
  background: #8a8a8a;
}
.click-indicator .core  { opacity: 1; }
.click-indicator .pulse {
  opacity: 0;
  animation: ci-pulse 1s cubic-bezier(.2, .6, .3, 1) infinite;
}
@keyframes ci-pulse {
  from { transform: scale(1);   opacity: .45; }
  to   { transform: scale(3.2); opacity: 0;   }
}
@media (prefers-reduced-motion: reduce) {
  .click-indicator .pulse { animation: none; opacity: 0; }
}
```

- `pulse`가 `core`보다 먼저 나와야 `core`가 위에 그려진다.
- 동작 줄이기 설정에서는 퍼짐을 끄고 회색 점만 남긴다.
- 단독 초안(`examples/done/회색 클릭 인디케이터.html`)은 `--dot` 변수로 라이트 `#8a8a8a`, 다크 `#9c9c9c`를 쓴다. 장면에서는 `#8a8a8a`로 고정했다.

### 2.2 핀 버튼 (`.focus-pin`)

인디케이터는 44×44px 투명 원형 `<button>` 안에 들어간다. 터치 대상 크기를 확보하기 위해서다.
버튼의 `left/top`이 곧 인디케이터 중심이 되도록 `margin: -22px 0 0 -22px`로 당긴다.

```html
<div class="focus-ui" id="focusUi">
  <button type="button" class="focus-pin" id="pinTorii" style="display:none"
          aria-label="토리이 확대 보기" aria-expanded="false">
    <span class="click-indicator" aria-hidden="true"><span class="pulse"></span><span class="core"></span></span>
    <span class="pin-label" aria-hidden="true"><span class="pin-diag"></span><span class="pin-title">토리이</span></span>
  </button>
  <!-- pinMoon, pinMirror 도 같은 구조 -->
  <button type="button" id="focusBack" hidden aria-label="처음 화면으로 돌아가기">
    <i class="bi bi-chevron-left" aria-hidden="true"></i>
  </button>
  <aside id="focusCard" hidden aria-live="polite" aria-label="랜드마크 정보">
    <h2 id="focusTitle">플레이스홀더</h2>
    <p class="focus-lead" id="focusDesc">내용 준비 중입니다.</p>
    <div class="focus-body" id="focusBody" aria-live="off"></div>
  </aside>
</div>
```

```css
.focus-ui {               /* 화면 전체를 덮지만 클릭은 통과 */
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 10;
}
.focus-pin {
  position: fixed;
  width: 44px; height: 44px;
  margin: -22px 0 0 -22px;
  padding: 0; border: 0; border-radius: 50%;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;   /* 핀만 클릭을 받는다 */
  display: flex; align-items: center; justify-content: center;
}
```

### 2.3 제목 표시기 (`.pin-label`)

핀 중심에서 45° 왼쪽 위로 짧은 사선을 긋고, 그 끝에서 수평 밑줄 위에 제목을 쓴다.
라벨이 버튼의 자식이라 제목 글자를 눌러도 핀 클릭으로 처리된다.

```css
.focus-pin .pin-label {
  position: absolute; left: 50%; top: 50%;
  width: 0; height: 0;
  animation: pin-label-in .5s ease-out both;   /* opacity 0 → 1 */
}
.focus-pin .pin-diag {
  position: absolute; left: -26px; top: -26px;
  width: 25px;            /* (26 - 8)·√2 ≈ 25 : 코어 가장자리(8px)부터 시작 */
  height: 1px;
  background: rgba(240, 238, 232, .8);
  transform-origin: 0 0;
  transform: rotate(45deg);
  box-shadow: 0 0 3px rgba(0, 0, 0, .35);
}
.focus-pin .pin-title {
  position: absolute; right: 26px; bottom: 26px;
  padding: 0 4px 3px;
  border-bottom: 1px solid rgba(240, 238, 232, .8);   /* 수평선 = 제목 밑줄 */
  font: 600 13px/1.2 'Noto Sans KR', sans-serif;
  letter-spacing: .02em;
  color: #f4f2ee;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, .55);
  transition: color .2s ease, border-color .2s ease;
}
/* 왼쪽 공간이 모자라면 오른쪽 위로 뒤집는다 */
.focus-pin.label-right .pin-diag  { left: 26px; transform: rotate(135deg); }
.focus-pin.label-right .pin-title { right: auto; left: 26px; }
/* 호버·키보드 포커스 시 금색 */
.focus-pin:hover .pin-title,
.focus-pin:focus-visible .pin-title { color: #ffd99a; border-bottom-color: #ffd99a; }
```

좌우 뒤집기는 JS가 정한다. 핀 x에서 `LABEL_REACH(26px) + 라벨 폭`을 뺀 값이 8px보다 작으면 `label-right`를 붙인다.
라벨 폭은 `el._lw`에 캐시하고, 제목이 바뀌면 0으로 지워 다음 프레임에 다시 잰다.

### 2.4 포커스 링

- 키보드 포커스(`:focus-visible`)에는 `outline: 2px solid #8a8a8a; outline-offset: 2px`를 보인다. 핀, 뒤로가기, 카드에 모두 적용한다.
- 마우스로 닫은 뒤 핀에 포커스를 되돌릴 때는 링을 띄우지 않는다. 이때 `no-focus-ring` 클래스를 붙여 outline을 없앤다.
- `blur`될 때 `no-focus-ring`을 지워, 다음 Tab 탐색부터는 링이 정상으로 보이게 한다.
- 마우스와 키보드는 `click` 이벤트의 `e.detail === 0` 여부로 구분한다. Enter/Space로 누르면 0이다.

### 2.5 위치 계산 (매 프레임 `tick`)

`requestAnimationFrame` 루프에서 엔진의 랜드마크 좌표(`window.__TSUKUYOMI__`)를 읽어 핀을 옮긴다.

| 핀 | 좌표 | 표시 조건 |
| --- | --- | --- |
| 토리이 | `x = torii.x - 22`, `y = torii.cy` (랜드마크 왼쪽) | `torii.visible` (`structW > 0.01`) |
| 달 | `x = pm.x - pm.r - 22`, `y = pm.y` | `plainMoon.visible` 이고 달이 다 떠오름 |
| 미러볼 | `x = mb.x - mb.r - 22`, `y = mb.y` | `moon.visible` 이고 달이 다 떠오름 |

- 좌표는 화면 안쪽 28px 여백으로 자른다(`clamp(28, W - 28)`).
- **달이 다 떠오른 뒤에만 표시한다.** `moonMT`(0: 수평선 아래 → 1: 완전히 떠오름)가 `0.999` 이상이어야 한다.
- **달과 미러볼은 같은 중심을 쓰므로 둘 중 하나만 보인다.** 화면 불투명도 `v`가 큰 쪽을 고르고, 같으면 일반 달을 고른다.
- 같은 값을 매번 다시 대입하지 않도록 반올림한 좌표를 `el._pk`에 캐시한다.
- 확대 중(`body[data-focus]`)에는 핀을 CSS로 숨긴다.
- 복귀 애니메이션이 끝날 때까지(`EXIT_COOL_MS = 1600 + 100ms`) 핀 세 개를 모두 숨긴다.
- 배경화면 감상 모드(`body[data-wallpaper]`)에서는 `.focus-pin`을 `display: none !important`로 숨긴다.

### 2.6 장면 입력과 분리

- 엔진의 포인터 핸들러는 `overUI()`로 `.focus-ui` 위의 이벤트를 무시한다. 이렇게 해서 핀 위에서는 물결이 생기지 않는다.
- focus.js도 핀, 뒤로가기, 카드에서 `pointerdown`/`pointermove`를 캡처 단계에서 `stopPropagation()` 한다.

---

## 3. 카메라 확대 (인-캔버스 카메라)

예전에는 `#scene/#fg/#ripple` 캔버스에 CSS `transform`을 걸어 비트맵을 확대했다. 이 방식은 확대하면 흐려진다.
그래서 엔진이 카메라 파라미터로 장면을 직접 다시 그리도록 바꿨다. 모든 프레임이 네이티브 해상도다.

### 3.1 엔진 쪽 (`tsukuyomi.js`)

```
screen = m + s · (world − f)
  f: 월드 초점(랜드마크 중심)   m: 그 초점이 놓일 화면 위치   s: 배율(≥ 1)
```

| API (`window.__TSUKUYOMI__`) | 설명 |
| --- | --- |
| `setCamView(f, m, s, res, path)` | 카메라를 켠다. `res`는 캐시 해상도 힌트(구간 최대 배율), `path = {m0, s0, m1, s1}`는 애니메이션 경로 |
| `clearCam()` | 카메라를 끄고 idle 렌더로 돌아간다 |
| `getCamView()` | 현재 `{f, m, s}` 또는 `null` |
| `worldToScreen` / `screenToWorld` | 좌표 변환 |
| `torii` / `moon` / `plainMoon` | 랜드마크 화면 좌표(css px). `moon`은 미러볼, `plainMoon`은 일반 달 |
| `moonMT` | 달 상승 진행도 0..1 |
| `zoomProf` | 줌 프로파일러 (`begin/end/sample`, `?zprof`로 콘솔 출력) |

엔진 내부의 최적화 요점:
- 캔버스 변환은 `setTransform(dpr·s, 0, 0, dpr·s, dpr·(mx − s·fx), dpr·(my − s·fy))` 하나로 처리한다.
- 토리이·달 같은 캐시는 배율을 0.5 단위로 올림한 `camResK`(최대 3)로 **한 번만** 굽는다. 카메라가 켜져 있는 동안은 커지기만 한다. 복귀 중에는 고해상도 캐시를 줄여 그린다.
- 하늘·구름 버퍼는 물결에 비칠 화면 밖 윗하늘만큼(`camExtra`) 위로 더 크게 잡는다. H/4 단위로 양자화해 재할당 횟수를 줄인다.
- 수평선이 화면 밖으로 나가면(달 확대 등) 수면·반사·물결 패스를 건너뛴다.

### 3.2 focus.js 쪽 (`computeZoom` → `animCam`)

1. **목표 화면 위치 `t`**
   - 넓은 화면에서는 `(W·0.72, H·0.45)`에 둔다. 랜드마크는 오른쪽, 카드는 왼쪽이다.
   - 좁은 화면(`W ≤ 460` 또는 `pointer: coarse` + `max-height: 500px`)에서는 `(W·0.5, H·0.32)`에 둔다. 랜드마크는 위쪽 가운데, 카드는 하단 시트다.
2. **배율 `s`**
   - 기본값은 토리이 1.8, 달 2.4, 미러볼 2.4다.
   - 하한은 `coverScale(f, t) × 1.04 + 0.01`이다. 화면 네 모서리를 역변환한 좌표가 모두 장면 안에 있어야 빈 공간이 보이지 않는다.
   ```js
   function coverScale(fx, fy, tx, ty) {
     let s = 1;
     if (fx > 1)     s = Math.max(s, tx / fx);
     if (W - fx > 1) s = Math.max(s, (W - tx) / (W - fx));
     if (fy > 1)     s = Math.max(s, ty / fy);
     if (H - fy > 1) s = Math.max(s, (H - ty) / (H - fy));
     return s;
   }
   ```
3. **카드 자리 확보 (넓은 화면)**
   - `16 + 카드폭 + 12 + 랜드마크 왼쪽 반폭 × s`가 `t.x`보다 크면 랜드마크를 오른쪽으로 민다. 최대 `W·0.86`까지다.
   - `t.x`가 바뀌면 커버 하한도 바뀐다. 그래서 최대 4번 반복해 수렴시킨다.
4. **애니메이션**
   - 1600ms 동안 `cubic-bezier(0.22, 0.8, 0.24, 1)`(JS 뉴턴법 구현)로 `m`과 `s`를 함께 보간한다.
   - 시작점은 항등(`m0 = f, s0 = 1`)이다. 그래서 초점이 클릭 즉시 목표로 움직이면서 동시에 커진다.
   - `s`와 커버 하한 모두 진행도에 단조이므로, 양 끝만 커버되면 중간 프레임도 커버된다.
   - 같은 랜드마크로 다시 들어오면 진행 중이던 카메라 상태에서 이어받아 점프가 없다.
5. **복귀**
   - 현재 상태에서 `(f, s = 1)`로 같은 곡선을 역재생한다. 끝나면 `clearCam()`.
6. **기타**
   - 동작 줄이기 설정이면 애니메이션 없이 최종값으로 바로 간다.
   - 리사이즈 시 120ms 디바운스 후 줌을 다시 계산하고 최종값으로 즉시 맞춘다.
   - 확대 중에는 `body { background: #04060d }`로 두고, 하단 조절 패널(`.dock`)은 페이드아웃한다.

---

## 4. 설명카드

### 4.1 레이아웃과 배치

```css
#focusCard {
  position: fixed; left: 24px; top: 50%;
  transform: translateY(-50%);
  width: min(340px, calc(100vw - 32px));
  min-height: 220px;
  max-height: calc(100dvh - 32px);          /* 길면 카드 안에서 스크롤 */
  overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent;
  padding: 20px; border-radius: 16px;
  background: rgba(18, 20, 26, .72);        /* 어두운 유리 */
  color: #eceae6;
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, .35);
  pointer-events: auto;
}
#focusCard h2 { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
#focusCard .focus-lead { margin: 0 0 14px; font-size: 14px; line-height: 1.55; color: #b9b7b3; }
#focusCard .focus-body.wiki-content:not(:empty) {
  padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, .14);
}
@media (max-width: 460px), (pointer: coarse) and (max-height: 500px) {
  #focusCard {                              /* 하단 시트 */
    left: 16px; right: 16px; top: auto;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    transform: none; width: auto;
    min-height: 160px; max-height: 52vh;
  }
}
```

`placeCard(z)`는 카드를 확대된 랜드마크 바로 옆에 붙인다.
- **넓은 화면:**
  - `left = max(16, t.x − 랜드마크 왼쪽 반폭 × s − 12 − 카드폭)`
  - 세로 중심은 `t.y`이고, 뷰포트 안 16px 여백으로 자른다.
- **좁은 화면:**
  - 하단 시트를 유지하되, 위쪽 끝을 `t.y + 랜드마크 아래 반폭 × s + 12`로 끌어올린다.
  - 남는 높이가 160px 이상일 때만 이렇게 한다.

랜드마크 반폭(`landmarkExtent`)은 토리이면 사각형 기준(`f.x − x`, `y + h − f.y`)으로, 달·미러볼이면 반지름으로 구한다.

### 4.2 뒤로가기 버튼 (`#focusBack`)

왼쪽 위(`top: 16px + safe-area`, `left: 16px`)에 놓인 44px 원형 버튼이다.
반투명 배경(`rgba(20,22,28,.55)`)에 `blur(6px)`를 걸고, Bootstrap Icons `bi-chevron-left`를 쓴다.
Escape 키로도 닫힌다. 다만 입력 필드(`input`, `textarea`, `select`, `contenteditable`) 안에서 누른 Escape는 무시한다.

### 4.3 열기/닫기 흐름

**`enter(kind, showRing)`**
1. `computeZoom`을 계산한다. 랜드마크가 화면에 없거나 카메라 API가 없으면 중단한다.
2. `body.dataset.focus = kind`를 설정하고 `renderBody(kind)`를 호출한다.
3. 카드와 뒤로가기 버튼을 보이고, `placeCard`로 카드를 배치한다.
4. 각 핀의 `aria-expanded`를 갱신한다.
5. `animCam`으로 확대하고, 뒤로가기 버튼에 포커스를 준다.

**`exit(restoreFocus, showRing)`**
1. 카드 렌더를 정리한다(`teardown`).
2. 카드와 뒤로가기 버튼을 숨기고 쿨다운을 시작한다.
3. 역재생 애니메이션 후 `clearCam()`을 호출한다.
4. 쿨다운이 끝나면 마지막으로 누른 핀에 포커스를 되돌린다.

### 4.4 카드 내용 로드

- 카드 원문은 `cards/{kind}.wiki` 파일이다. `fetch(..., { cache: 'no-cache' })`로 읽는다.
- 성공한 응답만 캐시하고, 실패하면 다음에 열 때 다시 시도한다.
- 첫 클릭이 바로 그려지도록 `requestIdleCallback`(없으면 1.5초 후)으로 세 파일을 미리 받아 둔다.
- 받는 사이에 카드를 닫거나 다른 랜드마크로 바꾸면 늦게 온 응답은 버린다. `bodySeq` 순번으로 판단한다.

원문을 고르는 우선순위:
1. 디버그 패널 미리보기 원문
2. 파일 원문
3. 폴백

폴백은 내장 표(`NAMES` / `DESCS` / `BODIES`)를 `<dl>` 2열 그리드로 보여 준다.
`dt`는 금색 `#e6c48a` 12px 굵게, `dd`는 13px이다.
파일이나 렌더러를 쓸 수 없을 때만 폴백을 쓴다.

`:::meta`의 값은 이렇게 쓰인다:
- `title` → 카드 `<h2>`
- `lead` → 리드 문단. 없으면 숨긴다.

`title`은 **핀 옆 제목 표시기와 `aria-label`("○○ 확대 보기")에도 반영된다.**
렌더러가 없을 때는 정규식으로 `:::meta` 블록에서 `title`만 뽑는다. 블록이 여러 개면 마지막 `title`을 쓴다.

예시 (`cards/torii.wiki`):

```
:::meta
title = 토리이
lead = 수면 위에 선 붉은 토리이. 실물과 물에 비친 상을 서로 다른 레이어로 그린다.
:::

:::infobox
| 스프라이트 | 색(p)·DPR이 바뀔 때만 torC/torR 캔버스를 다시 래스터하고, 평소엔 캐시를 blit한다. |
| 반사 | 뒤집고 어둡게 만든 사본을 ripple 레이어에 그려, 물결 굴절은 반사상에만 적용된다. |
| 레이어 | 실물 토리이와 비네트는 fg 캔버스에 따로 올려 물결 왜곡을 받지 않는다. |
:::
```

### 4.5 디버그 패널 연동 (`window.__TSUKUYOMI_CARD__`)

| 메서드 | 설명 |
| --- | --- |
| `kinds()` | `['torii', 'moon', 'mirror']` |
| `current()` | 열려 있는 카드 종류 또는 `null` |
| `source(kind)` | 파일 원문 Promise |
| `preview(kind, src)` | 미리보기 원문을 지정하고, 열려 있으면 즉시 다시 그린다. 핀 제목에도 반영한다. |
| `reset(kind)` | 미리보기를 지우고 파일 내용으로 되돌린다 |
| `open(kind)` | 카드를 연다. 랜드마크가 화면에 없으면 `false` |

디버그 패널(`` ` `` 키)의 "카드 미리보기" 섹션 동작:
- 종류 버튼과 textarea가 있다. 입력하면 150ms 디바운스 후 카드에 바로 반영된다.
- `카드 열기` / `복사` / `되돌리기` 버튼이 있다.
- 미리보기는 메모리에만 반영된다. 확정하려면 복사해서 `cards/{kind}.wiki`에 붙여넣는다.

---

## 5. 마크업 엔진 (`tsukuyomi.markup.js`)

자세한 문법은 `markup/README.md`, 구현은 `markup/tsukuyomi.markup.js` 머리 주석을 본다. 여기서는 구조만 요약한다.

### 5.1 정체와 의존성

- Cloudwiki 렌더러(`eoeoe22/cloudwiki @ 368dd33`, `packages/wiki-shared/src/render/render.ts`)에서 백엔드에 의존하지 않는 부분만 떼어 낸 포크다. 역으로 동기화하지는 않는다.
- 먼저 로드해야 하는 전역 의존: `marked@18.0.3` UMD, `dompurify@3.4.2`. 둘 중 하나라도 없으면 원문을 평문으로 표시한다.
- 필요할 때만 CDN에서 지연 로드:
  - Prism 1.29.0 — 코드 블록이 있을 때
  - Chart.js 4.5.1 — ```` ```chart ```` 블록이 있을 때
- 아이콘은 Bootstrap Icons 1.13.1 CSS를 페이지에서 로드한다.
- 로드 순서(`tsukuyomi.html`, 모두 `defer`): `marked` → `purify` → `tsukuyomi.markup.js` → `tsukuyomi.focus.js`

### 5.2 API

```js
window.TsukuyomiMarkup.render(src, el, { dark: true }) // → { meta }  el 내용 교체
window.TsukuyomiMarkup.teardown(el)                    // 타이머·차트·툴팁 정리
window.TsukuyomiMarkup.extractMeta(src)                // 렌더 없이 :::meta 만
```

### 5.3 렌더 파이프라인 (Cloudwiki `renderWikiContent` 순서에서 위키 전용 단계만 뺌)

**1. 텍스트 전처리**
- 코드 펜스와 인라인 코드를 placeholder로 보호한다.
- 줄 시작 제로폭 문자를 지운다.
- `:::meta` 변수를 치환한다(`{{{@키|기본}}}`).
- `{br}`을 placeholder로 바꾼다.
- 체크박스 `[~]`, `[/]`를 정규화한다.
- 줄 시작 공백을 NBSP로 보존한다.

**2. 블록 처리**
- 펼치기 `[+ … ] … [-]`를 처리한다.
- `:::` 블록 디렉티브를 처리한다: 콜아웃, card, grid, row, canvas, infobox, float, gallery, tabs, accordion, steps, after, until, embed.
- 표 옵션 토큰을 처리한다.

**3. 변환과 정화**
- marked(별도 인스턴스) 확장으로 변환한다: 하이라이트, 밑줄, 이미지, 각주, 버튼, 임베드.
- DOMPurify로 정화한다.

**4. DOM 후처리**
- 아이콘, 각주(자체 툴팁), 타임스탬프와 타이머, 표 셀 색·병합·정렬을 처리한다.
- 임베드, 이미지 figure, 외부 링크 새 탭, 탭·아코디언 동작을 붙인다.
- 코드 복사 버튼과 차트를 붙인다.
- 헤딩 `{collapse}`가 있으면 섹션 접기를 켠다.

### 5.4 카드 맞춤 변경점

- **Bootstrap 대체:**
  - 탭은 자체 스크립트로 바꿨다.
  - 아코디언과 펼치기는 `<details>`로 바꿨다.
  - 각주 팝오버는 body 직속 `.wiki-fn-tip` 툴팁으로 바꿨다.
  - 콜아웃·체크박스 아이콘은 MDI 대신 Bootstrap Icons를 쓴다.
- **스타일:**
  - 카드가 항상 어두운 유리라 CSS는 다크 값만 둔다.
  - `--wiki-primary`는 카드 금색 `#e6c48a`이다.
  - 340px 폭에 맞게 글자와 여백을 줄였다.
- **좁은 폭 레이아웃:**
  - `grid`는 `{cols:2}`와 `{template:1-1}`만 2열로 두고, 나머지는 1열로 쌓는다. `canvas`도 1열이다.
  - `float`와 `infobox`는 띄우지 않고 본문 흐름에 놓는다.
  - `gallery`는 최대 3열이다.
- **제외한 기능:**
  - `[[링크]]`, 틀·파서 함수·확장, 멘션, 분류
  - 커스텀 팔레트, `{mdi:}`, 헤딩 번호와 목차, Mermaid
  - 외부 링크 확인 팝업(Swal)
  - 제외한 문법은 글자로 남는다.

---

## 6. 다시 붙일 때 체크리스트

1. **파일 위치**
   - 마크업 엔진을 장면에서 다시 쓰려면 `markup/`의 JS/CSS를 `public/` 아래 실제 경로에 복사한다.
   - `public/examples/` 같은 임시 폴더는 참조하지 않는다(AGENTS.md 폴더 규칙).
   - 경로를 바꿨으면 `node scripts/check-public-paths.mjs`로 점검한다.
2. **엔진 API**
   - `__TSUKUYOMI__`에 아래가 있어야 한다:
     - 카메라 API: `setCamView`, `clearCam`, `getCamView`
     - 랜드마크 getter: `torii`, `moon`, `plainMoon`, `moonMT`
   - 지금 엔진에서 빠졌으면 `6cb343a^:public/tsukuyomi.js`의 해당 부분을 참고해 되살린다.
3. **엔진 입력 제외**
   - 엔진 포인터 핸들러의 `overUI` 선택자에 `.focus-ui`를 넣는다.
4. **모드별 숨김**
   - 배경화면 모드와 확대 모드에서 핀을 숨기는 CSS를 함께 옮긴다.
5. **카드 원문**
   - `git show 6cb343a^:public/cards/{kind}.wiki`로 꺼낼 수 있다.
6. **회피 영역**
   - 랜턴 회피 영역(`LANTERN_CARD_AVOID`, `measureCardZone`)은 하단 조절 패널용이다. 이 설명카드와는 관계없다.

---

## 7. 허브 페이지 (`/hub`)

`tsukuyomi.html`과 같은 세계들(月·海·山·地·八·犬, `tsukuyomi.worlds.js`)을 그대로 띄우고, 그 위에 인디케이터·확대·설명카드를 얹은 별도 페이지다.

### 7.1 파일

| 파일 | 역할 |
| --- | --- |
| `public/hub.html` | `tsukuyomi.html` + `#focusUi`(뒤로가기·카드). 핀은 JS가 만든다 |
| `public/tsukuyomi.hub.js` | 예전 `tsukuyomi.focus.js`를 세계별 등록 방식으로 바꾼 것 |
| `public/tsukuyomi.hub.css` | 예전 `tsukuyomi.css`의 포커스 UI 블록 |
| `public/components/tsukuyomi.markup.js` / `.css` | `markup/`의 복사본 |
| `public/cards/{torii,moon,mirror,takenoko}.wiki` | 카드 원문 (지금은 임시 문구) |
| `preview-worker.js` | `/hub` → `hub.html`, `/hub/` → `/hub` 리디렉션 |

### 7.2 세계별 등록

```js
TsukuyomiHub.register(worldId, {
  camera: () => 어댑터 | null,   // { get(), set(f, m, s, info), clear(), cover, prof? }
  landmarks: [{ id, name, scale, follow, get() }],   // get() → { x, y, ext: {l, r, t, b}, visible } (css px, 카메라 적용 전)
});
```

- 핀은 지금 세계(`__TSUKUYOMI_WORLDS__.world`)의 랜드마크만 보인다. 세계 전환 중에도 숨긴다.
- 확대 중에 해시 변경·뒤로 가기로 세계가 바뀌면 애니메이션 없이 바로 카메라를 걷는다.
- 핀 위치는 랜드마크 왼쪽 가장자리(`x − ext.l − 22`), 세로 중심. 예전과 같은 식이다.
- `cover: true`인 카메라만 화면 밖이 보이지 않게 배율 하한(`coverScale`)을 둔다.
- `follow: true`인 랜드마크는 카메라가 매 프레임 랜드마크를 따라간다. 복귀할 때는 따라가기를 멈춘다.

| 세계 | 랜드마크 | 카메라 |
| --- | --- | --- |
| 月 `moon` | `torii`(1.8) · `moon`(2.4) · `mirror`(2.4) | 엔진 인-캔버스 카메라 (예전과 같음) |
| 地 `earth` | `takenoko`(5, follow) | 지구 셰이더 카메라 (`TsukuyomiEarth.setCamView`) |
| 海 `sea` | 없음 | 엔진 카메라 |
| 山 `mount` · 八 `room` · 犬 `news` | 없음 | `cssCamera`: `.world-view`에 CSS 변환 (비트맵 확대) |

새 랜드마크를 붙이려면 `tsukuyomi.hub.js` 맨 아래 등록부의 `landmarks` 배열에 항목을 넣고 `cards/{id}.wiki`를 만든다.

### 7.3 예전과 달라진 점

- **엔진**: 카메라 API와 랜드마크 getter는 그대로 남아 있었다. `overUI` 선택자에 `.focus-ui`만 다시 넣었다.
- **배경화면 감상 모드 토글**(`btnWallpaper`, `data-wallpaper`)은 없어졌다. 허브에서는 핀이 항상 보인다.
- **지구 셰이더 카메라**:
  - 화면 좌표를 `ps = F + (ps0 − M) / S`로 되돌린다.
  - 픽셀 크기에 기대는 값(구름 AA `fp`, 태양 테두리 `aa`, 죽순 림 `px`)은 `S`로 나눈다.
- **죽순 핀**: 인트로가 85% 지나 죽순이 자리를 잡은 뒤에 보인다. 범위는 텍스처 안 실제 윤곽 비율로 줄인 회전 사각형의 AABB다.
- **디버그 패널 "카드 미리보기"**: `__TSUKUYOMI_CARD__`가 있을 때(허브)만 보이고, 다른 페이지에서는 섹션째 뺀다.

