# yachifish

웹페이지에 네온 물고기 떼 이펙트를 넣는 단일 파일 라이브러리입니다.
의존성이 없고, `<script>` 한 줄과 함수 호출 한 번이면 됩니다. 이펙트는 캔버스로 그려지며, 다섯 가지 연출 모드(구체 군집, 3D 방사 확산, 나선 상승, 수면 상승, 보케)가 있습니다.

## 설치

### `<script>` 태그 (UMD)

```html
<script
  src="https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@yachifish-v0.1.0/packages/yachifish/dist/yachifish.umd.js"
  integrity="sha384-kTT4yIeJT6gtQRvork5i962MOIQrgXihlPi8lnyc2QKmQhm7HsKqKrl6vDhYwEf0"
  crossorigin="anonymous"></script>
```

로드되면 전역 함수 `window.yachifish`가 생깁니다.

### ES 모듈

```html
<script type="importmap">
{
  "imports": {
    "yachifish": "https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@yachifish-v0.1.0/packages/yachifish/dist/yachifish.esm.js"
  },
  "integrity": {
    "https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@yachifish-v0.1.0/packages/yachifish/dist/yachifish.esm.js": "sha384-FbbV8ODeU4+j5cIIUWC4igCa//GUVDq4FALkj0CdCGCGmQKec6t6IVtt+FjimBfs"
  }
}
</script>
<script type="module">
  import yachifish from "yachifish";
  const fx = yachifish("#fx");
</script>
```

`import` 문 자체에는 `integrity`를 붙일 수 없어서, 무결성 검사를 하려면 위처럼 import map의 `integrity` 필드를 써야 합니다. 이 필드를 지원하지 않는 브라우저에서는 검사 없이 그냥 로드됩니다.

### 무결성 해시

| 파일 | integrity |
| --- | --- |
| `yachifish.umd.js` | `sha384-kTT4yIeJT6gtQRvork5i962MOIQrgXihlPi8lnyc2QKmQhm7HsKqKrl6vDhYwEf0` |
| `yachifish.esm.js` | `sha384-FbbV8ODeU4+j5cIIUWC4igCa//GUVDq4FALkj0CdCGCGmQKec6t6IVtt+FjimBfs` |

해시는 `yachifish-v0.1.0` 태그 기준입니다. 버전을 바꾸면 해시도 바뀌니 함께 교체하세요.

## 빠른 시작

```html
<div id="fx" style="width: 800px"></div>

<script
  src="https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@yachifish-v0.1.0/packages/yachifish/dist/yachifish.umd.js"
  integrity="sha384-kTT4yIeJT6gtQRvork5i962MOIQrgXihlPi8lnyc2QKmQhm7HsKqKrl6vDhYwEf0"
  crossorigin="anonymous"></script>
<script>
  const fx = yachifish("#fx", { mode: "burst" });
</script>
```

### 크기

캔버스는 컨테이너 안을 채웁니다.

- 컨테이너에 높이가 있으면(`height`가 지정됐거나 `position: absolute; inset: 0` 등) 가로·세로를 모두 채웁니다. 비율은 컨테이너를 따르며, 화면 전체를 덮는 배경으로도 쓸 수 있습니다.
- 컨테이너에 높이가 없으면 너비에 맞춰 16:9로 그립니다.

내부 좌표계는 높이 450 기준이고, 폭은 컨테이너 비율에 따라 정해집니다. 그래서 `size`(물고기 크기)나 `glowR` 같은 픽셀 단위 옵션은 표시 크기와 함께 비례해서 커집니다. 컨테이너 크기가 바뀌면 자동으로 따라갑니다.

`min-height`만 있고 `height`가 없는 컨테이너는 채우기가 제대로 되지 않습니다. 이럴 때는 안쪽에 `position: absolute; inset: 0`인 요소를 하나 두고 그 요소를 대상으로 쓰세요.

### 페이지 위에 겹치기

`background: false`면 밤하늘·바닥·오로라를 그리지 않고, 물고기와 빛방울만 투명한 캔버스에 그립니다.

```html
<section style="position: relative">
  <h1>페이지 내용</h1>
  <div id="fx" style="position: absolute; inset: 0; z-index: 10"></div>
</section>
<script>
  yachifish("#fx", { mode: "spiral", background: false, refl: 0, interactive: false });
</script>
```

- `interactive: false`면 캔버스에 `pointer-events: none`이 걸려서, 클릭이 아래쪽 페이지로 그대로 통과합니다.
- 투명 모드에서도 `refl`이 0보다 크면 `hz` 아래로 수면 반사와 파문이 그려집니다. 이게 필요 없으면 위처럼 `refl: 0`을 주세요.
- 글로우는 빛을 더하는 방식이라 어두운 배경에서 가장 잘 보입니다. 밝은 페이지에서는 은은한 파스텔 번짐으로 보입니다.

## API

### `yachifish(target, options?)`

이펙트를 만들어 `target` 안에 캔버스를 추가하고 인스턴스를 반환합니다.

- `target`: CSS 선택자 문자열 또는 DOM 요소. 꼭 넘겨야 하며, 선택자에 맞는 요소가 없으면 에러를 던집니다.
- `options`: 아래 [옵션](#옵션) 중 바꾸고 싶은 것만 넘기면 됩니다. 나머지는 `mode`의 프리셋 값을 씁니다.

`new yachifish.YachiFish(target, options)`도 똑같이 동작합니다. ES 모듈에서는 기본 내보내기 `yachifish` 외에 `YachiFish`, `DEFAULTS`, `PRESETS`, `MODES`를 이름으로 가져올 수 있습니다.

한 페이지에 여러 개를 배치해도 서로 충돌하지 않습니다. 캔버스가 화면 밖에 있을 때는 그리기를 멈춥니다.

### 인스턴스 메서드

| 메서드 | 반환 | 설명 |
| --- | --- | --- |
| `set(partial)` | 현재 옵션 객체 | 옵션 일부를 바꾸고 즉시 다시 그립니다. `mode`를 바꾸는 경우는 [모드와 프리셋](#모드와-프리셋)을 보세요. |
| `get()` | 옵션 객체 | 현재 옵션과 함께 `playing`(재생 중 여부)을 돌려줍니다. |
| `fire(x?, y?)` | 인스턴스 | 폭발/파동을 한 번 발사합니다. 아래 설명을 보세요. |
| `play()` | 인스턴스 | 애니메이션을 시작합니다. |
| `pause()` | 인스턴스 | 애니메이션을 멈춥니다. 마지막 프레임이 남습니다. |
| `toggle()` | `boolean` | 재생 상태를 뒤집고, 바뀐 뒤의 재생 여부를 반환합니다. |
| `toSVG()` | `string` | 현재 프레임을 SVG 문자열로 내보냅니다. |
| `destroy()` | 없음 | 애니메이션과 이벤트를 정리하고 캔버스를 제거합니다. |

`fire`, `play`, `pause`는 인스턴스를 반환하므로 `fx.pause().fire()`처럼 이어 쓸 수 있습니다.

#### `fire(x?, y?)`

- 인자 없이 부르면 `sphere` 모드에서 구체가 잠깐 터졌다가 다시 모이고, 수면에 파문이 하나 생깁니다. 다른 모드에서는 파문만 생깁니다.
- `x`, `y`(캔버스 기준 0 ~ 1 비율)를 넘기면 그 지점 주변의 물고기를 밀어내고 그 자리에 파문을 하나 더 만듭니다. 캔버스를 클릭했을 때 동작이 바로 이것입니다.

```js
fx.fire();          // 중앙 폭발
fx.fire(0.2, 0.5);  // 왼쪽 가운데에서 밀어내기
```

### `yachifish.DEFAULTS` / `yachifish.PRESETS` / `yachifish.MODES`

- `DEFAULTS`: 모든 옵션의 기본값입니다(`sphere` 프리셋 기준).
- `PRESETS`: 모드별 프리셋 객체입니다. 예: `yachifish.PRESETS.burst.size`
- `MODES`: 사용할 수 있는 모드 이름 배열 `["sphere", "burst", "spiral", "rise", "bokeh"]`입니다.

셋 다 고정(frozen) 객체이므로 읽기 전용입니다.

## 모드와 프리셋

| `mode` | 연출 |
| --- | --- |
| `"sphere"` | 물고기가 회전하는 구체 표면을 메우며 돕니다. 클릭하면 잠깐 터졌다가 다시 모입니다. 기본값입니다. |
| `"burst"` | 중앙에서 위쪽과 좌우로 물고기가 끊임없이 퍼져 나오며 원근감 있게 커집니다. |
| `"spiral"` | 좌하단에서 우상단으로 휘감아 오르는 떼가 잔상을 남기며 흐릅니다. |
| `"rise"` | 수면 아래에서 작은 물고기들이 흔들리며 솟아오르고, 수면에 파문이 생깁니다. |
| `"bokeh"` | 흐린 물고기 보케가 화면을 메우고, 선명한 물고기 몇 마리가 가로로 헤엄칩니다. |

모드마다 어울리는 옵션 값(프리셋)이 따로 있습니다. 그래서 다음과 같이 동작합니다.

- `yachifish(target, { mode, ... })`: 해당 모드의 프리셋을 깔고, 그 위에 넘긴 옵션을 덮어씁니다.
- `set({ mode })`로 모드를 바꾸면: 프리셋에 있는 옵션이 모두 새 모드의 값으로 초기화되고, 물고기 배치를 새로 만듭니다. 같은 호출에 넘긴 다른 옵션은 그 위에 덮어씁니다. 프리셋에 없는 옵션(`palette`, `seed`, `background`, `autoplay`, `interactive`, `maxPixelRatio`)은 그대로 유지됩니다.

```js
fx.set({ mode: "bokeh", nFar: 120 }); // bokeh 프리셋 + nFar만 120
```

## 옵션

모든 옵션은 `yachifish()`에서 초기값으로 넘기거나 `set()`으로 나중에 바꿀 수 있습니다.

아래 표의 기본값은 `sphere` 프리셋 값입니다. 다른 모드의 값은 `yachifish.PRESETS`에서 확인하세요. 권장 범위는 원본 편집기 슬라이더의 범위입니다. 범위를 벗어난 값도 들어가지만 결과가 어색해질 수 있습니다. 별도로 값이 강제되는 옵션은 설명에 적었습니다.

### 무늬 · 물고기 형태

| 옵션 | 기본값 | 권장 범위 | 설명 |
| --- | --- | --- | --- |
| `motif` | `0` | 0 ~ 5 | 물고기 안쪽 무늬. `0` 전체 혼합, `1` 마름모·점열형, `2` X-마름모 사슬형, `3` 광폭 대형 마름모 + 노란 눈점, `4` 사각 마디 사슬형, `5` 어골(청어뼈)형. 0 ~ 5 정수로 강제됩니다. |
| `size` | `48` | 20 ~ 120 | 물고기 기준 크기(내부 좌표 px). |
| `aspect` | `1.0` | 0.6 ~ 1.6 | 몸통 굵기 배율. |
| `wag` | `0.085` | 0 ~ 0.24 | 척추가 휘는 정도와 꼬리 파동. |
| `patA` | `0.88` | 0 ~ 1.2 | 안쪽 무늬 선의 선명도. |
| `winD` | `0.58` | 0 ~ 0.9 | 무늬 창(마름모·사각 안쪽)의 색 대비. |
| `fillA` | `0.72` | 0.15 ~ 1 | 몸통 채움 불투명도. |

### 개체 · 깊이 구성

| 옵션 | 기본값 | 권장 범위 | 설명 |
| --- | --- | --- | --- |
| `nMid` | `184` | 10 ~ 260 | 주 군집(구체·중경) 개체 수. |
| `nNear` | `24` | 0 ~ 80 | 앞쪽의 크고 선명한 개체 수. |
| `nFar` | `24` | 0 ~ 240 | 뒤쪽의 흐린 보케 개체 수. |
| `farBlur` | `7.0` | 0 ~ 18 | 보케 개체의 흐림 정도(px). |
| `farA` | `0.32` | 0 ~ 1 | 보케 개체의 밝기. |

개체 수는 0 이상의 정수로 반올림됩니다. 많을수록 무거워집니다.

### 움직임

| 옵션 | 기본값 | 권장 범위 | 설명 |
| --- | --- | --- | --- |
| `spd` | `1.15` | 0.1 ~ 2.5 | 헤엄·회전 속도 배율. 0 이상으로 강제됩니다. |
| `swR` | `0.18` | 0.10 ~ 0.34 | 구체 반지름(캔버스 높이 대비). `sphere`, `burst`에서 씁니다. |
| `tilt` | `-24` | -55 ~ 55 | 구체 회전축 기울기(도). `sphere`, `burst`에서 씁니다. |
| `persp` | `1.45` | 0.5 ~ 3.0 | 퍼져 나올 때 앞쪽 물고기가 커지는 배율. `sphere`(클릭 폭발), `burst`에서 씁니다. |
| `swirl` | `1.25` | -2.0 ~ 2.0 | 나선 회전 세기. 음수면 반대 방향으로 돕니다. |
| `trail` | `2` | 0 ~ 8 | 잔상 개수. 0 이상의 정수로 반올림됩니다. |
| `trailA` | `0.22` | 0 ~ 0.8 | 잔상 세기. |

### 빛 · 배경 · 수면 반사

| 옵션 | 기본값 | 권장 범위 | 설명 |
| --- | --- | --- | --- |
| `glow` | `0.85` | 0 ~ 1.6 | 네온 글로우 세기. 0이면 끕니다. |
| `glowR` | `9` | 2 ~ 28 | 글로우 번짐 반경(px). |
| `spark` | `28` | 0 ~ 80 | 빛방울·반짝이 개수. 0 ~ 90 정수로 강제됩니다. |
| `aurora` | `0.35` | 0 ~ 1 | 뒤쪽 오로라 빛기둥과 구체 후광의 세기. `background: false`면 그리지 않습니다. |
| `refl` | `0.68` | 0 ~ 1 | 수평선 아래 수면 반사와 파문의 세기. 0이면 끕니다. |
| `hz` | `0.64` | 0.48 ~ 0.85 | 수평선 위치(캔버스 높이 대비, 위에서부터). 0.05 ~ 1로 강제됩니다. |

### 색상

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `palette` | `["#ff6ad5", "#52f2ff", "#f4f255", "#ffaa5c", "#6aaeff", "#6bf5a8"]` | 물고기와 빛방울 색. `#rrggbb` 또는 `#rgb` 문자열 배열이며 1개 이상이어야 합니다. 6개가 아니어도 되며, 색이 돌아가며 배정됩니다. 형식이 틀리면 에러를 던집니다. |
| `bg0` | `"#02060e"` | 하늘 위쪽 색. CSS 색 문자열이면 됩니다. |
| `bg1` | `"#09101b"` | 수평선 부근과 바닥 색. CSS 색 문자열이면 됩니다. |

`bg0`, `bg1`은 모드 프리셋에 포함되어 있어서, `set({ mode })`를 하면 새 모드의 값으로 바뀝니다.

### 기타

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `seed` | `17` | 물고기 배치용 난수 시드(정수). 같은 시드면 같은 배치가 나옵니다. |
| `background` | `true` | `false`면 하늘·바닥·데크 결·오로라를 그리지 않고 캔버스를 투명하게 둡니다. [페이지 위에 겹치기](#페이지-위에-겹치기)를 보세요. |
| `autoplay` | `true` | `false`면 멈춘 상태로 시작합니다. `set({ autoplay })`는 `play()`/`pause()`와 같은 효과입니다. |
| `interactive` | `true` | `false`면 클릭해도 반응하지 않고, 클릭이 캔버스를 통과합니다. `fire()`는 그대로 동작합니다. |
| `maxPixelRatio` | `2` | 기기 픽셀 비율의 상한. 고해상도 화면이나 전체 화면에서 무거우면 `1`로 낮추세요. 0.25 ~ 4로 강제됩니다. |

`motif`, `nMid`, `nNear`, `nFar`, `seed`를 바꾸면 물고기 배치를 새로 만듭니다. 다른 옵션은 다음 프레임부터 그대로 반영됩니다.

## 예시

### 버튼으로 모드 바꾸기

```js
const fx = yachifish("#fx");
for (const m of yachifish.MODES) {
  const b = document.createElement("button");
  b.textContent = m;
  b.onclick = () => fx.set({ mode: m });
  document.body.appendChild(b);
}
```

### 색 바꾸기

```js
fx.set({ palette: ["#ffb3c7", "#ffd6a5", "#fdffb6"], bg0: "#1a0b14", bg1: "#2a1220" });
```

### 움직임 줄이기 설정 존중

```js
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fx = yachifish("#fx", { autoplay: !reduce });
```

### SVG로 저장

```js
const svg = fx.toSVG();
const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
```

`toSVG()`는 그 순간의 정지 화면입니다. 물고기·글로우·보케·빛방울은 들어가지만 오로라와 수면 반사는 빠집니다. 블러와 빛 섞임은 SVG 필터와 `mix-blend-mode`로 표현되므로 뷰어에 따라 캔버스와 조금 다르게 보일 수 있습니다.

### 정리

SPA에서 컴포넌트가 사라질 때는 꼭 `destroy()`를 호출하세요. 호출하지 않으면 애니메이션 루프와 크기 감시가 계속 남습니다.

```js
fx.destroy();
```

## 브라우저 지원

캔버스 2D의 `filter`(블러)를 쓰는 최신 브라우저가 필요합니다. `filter`를 지원하지 않는 브라우저에서는 글로우와 보케가 흐려지지 않고 선명하게 보입니다.
