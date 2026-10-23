# newstile

뉴스장면 바닥 타일 1개를 웹페이지에 배치하는 단일 파일 라이브러리입니다.
의존성이 없고, `<script>` 한 줄로 바로 쓸 수 있습니다. 타일은 캔버스로 그려지며, 원본 예제의 100×100 타일 루프를 그대로 재생합니다.

원본: `public/examples/뉴스장면 바닥 타일.html`에서 무한 확장·카메라·UI를 제거하고 타일 1개 루프만 남긴 것입니다.
타이밍은 `public/examples/뉴스장면 초안.html` 기준입니다 (`TOTAL 114.8`, `SPEED 1.08`).

## 설치

### `<script>` 태그 (UMD)

```html
<script
  src="https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@newstile-v0.1.0/packages/newstile/dist/newstile.umd.js"
  integrity="sha384-/aFG27tfToRfaN+bi599pO1J00qylSMcUSCZ3c2veeGlebyb3v22Vds5sNnlm0Yl"
  crossorigin="anonymous"></script>
```

로드되면 전역 객체 `window.Newstile`이 생깁니다.

### ES 모듈

```html
<script type="importmap">
{
  "imports": {
    "newstile": "https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@newstile-v0.1.0/packages/newstile/dist/newstile.esm.js"
  },
  "integrity": {
    "https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@newstile-v0.1.0/packages/newstile/dist/newstile.esm.js": "sha384-vdqbai8z2p86QV2DCR3KKYmYASbIFvOEwedZsXTRUs5soSaYEqQr/5PXRFdf0rDd"
  }
}
</script>
<script type="module">
  import { mount } from "newstile";
  const tile = mount("#tile");
</script>
```

`import` 문 자체에는 `integrity`를 붙일 수 없어서, 무결성 검사를 하려면 위처럼 import map의 `integrity` 필드를 써야 합니다. 이 필드를 지원하지 않는 브라우저에서는 검사 없이 그냥 로드됩니다.

### 무결성 해시

| 파일 | integrity |
| --- | --- |
| `newstile.umd.js` | `sha384-/aFG27tfToRfaN+bi599pO1J00qylSMcUSCZ3c2veeGlebyb3v22Vds5sNnlm0Yl` |
| `newstile.esm.js` | `sha384-vdqbai8z2p86QV2DCR3KKYmYASbIFvOEwedZsXTRUs5soSaYEqQr/5PXRFdf0rDd` |

해시는 `newstile-v0.1.0` 태그 기준입니다. 버전을 바꾸면 해시도 바뀌니 함께 교체하세요.

## 빠른 시작

```html
<div id="tile" style="width: 320px"></div>

<script
  src="https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@newstile-v0.1.0/packages/newstile/dist/newstile.umd.js"
  integrity="sha384-/aFG27tfToRfaN+bi599pO1J00qylSMcUSCZ3c2veeGlebyb3v22Vds5sNnlm0Yl"
  crossorigin="anonymous"></script>
<script>
  const tile = Newstile.mount("#tile");
</script>
```

타일은 컨테이너 너비에 맞춰 정사각형으로 그려집니다. 고정 크기가 필요하면 `size` 옵션을 쓰세요.

## API

### `Newstile.mount(target, options?)`

타일을 만들어 `target` 안에 캔버스를 추가하고 인스턴스를 반환합니다.

- `target`: CSS 선택자 문자열 또는 DOM 요소. 선택자에 맞는 요소가 없으면 에러를 던집니다.
- `options`: 아래 [옵션](#옵션) 중 바꾸고 싶은 것만 넘기면 됩니다. 나머지는 기본값을 씁니다.

`Newstile.createNewstile(target, options)`와 `new Newstile.Newstile(target, options)`도 똑같이 동작합니다. ES 모듈에서는 `mount`, `createNewstile`, `Newstile`, `DEFAULTS`를 이름으로 가져올 수 있습니다.

한 페이지에 여러 개를 배치해도 서로 충돌하지 않습니다.

### 인스턴스 메서드

| 메서드 | 반환 | 설명 |
| --- | --- | --- |
| `set(partial)` | 현재 옵션 객체 | 옵션 일부를 바꾸고 즉시 다시 그립니다. 타이밍 옵션을 바꾸면 `K`/`TOTAL`을 다시 계산합니다. `frame`을 넘기면 그 프레임으로 이동합니다. |
| `get()` | 옵션 객체 | 현재 옵션과 함께 `total`(루프 길이), `frame`(현재 프레임), `playing`(재생 중 여부)을 돌려줍니다. |
| `seek(f)` | 인스턴스 | `f` 프레임으로 이동하고 즉시 다시 그립니다. 루프 길이를 넘어가면 감아 들어갑니다. |
| `play()` | 인스턴스 | 애니메이션을 시작합니다. |
| `pause()` | 인스턴스 | 애니메이션을 멈춥니다. 마지막 프레임이 남습니다. |
| `toggle()` | `boolean` | 재생 상태를 뒤집고, 바뀐 뒤의 재생 여부를 반환합니다. |
| `toSVG(f?)` | `string` | 해당 프레임(기본은 현재 프레임)을 100×100 SVG 문자열로 내보냅니다. |
| `destroy()` | 없음 | 애니메이션 루프를 정리하고 캔버스를 제거합니다. |

`seek`, `play`, `pause`는 인스턴스를 반환하므로 `tile.pause().seek(0)`처럼 이어 쓸 수 있습니다.

### `Newstile.DEFAULTS`

모든 옵션의 기본값 객체입니다. 읽기 용도로 쓰세요.

## 옵션

모든 옵션은 `mount()`에서 초기값으로 넘기거나 `set()`으로 나중에 바꿀 수 있습니다. `size`만 생성할 때 적용되며, `set()`으로 바꿔도 반영되지 않습니다.

타이밍 유도식(초안.html과 동일): 베이스 키(`pairOut`~`pairIn`)를 `holdExtra`만큼 뒤로 민 뒤, `rcOut`은 `[rtDraw[0], rtDraw 중간]`으로 덮어씁니다. 루프 길이는 `TOTAL = 118 + holdExtra - pairCut`입니다. 기본값은 `holdExtra 2.8`, `pairCut 6`이라 `TOTAL 114.8`이 됩니다.

### 색상

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `cell` | `"#0d2b31"` | 타일 바탕색. |
| `sand` | `"#d9c79c"` | 선·도형색. |

### 재생

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `fps` | `24` | 기준 프레임 속도. 1 이상으로 강제됩니다. |
| `speed` | `1.08` | 재생 배속. 실제 초당 프레임은 `fps × speed`입니다 (기본 25.9fps 상당). 0 이상으로 강제됩니다. |
| `frame` | `0` | 시작 프레임. `set({ frame })`과 `seek()`으로 이동할 수 있습니다. |
| `autoplay` | `true` | `false`면 멈춘 상태로 시작합니다. `set({ autoplay })`는 `play()`/`pause()`와 같은 효과입니다. |
| `size` | `0` | 캔버스 크기(px). 0이면 컨테이너 너비에 맞춥니다. 생성할 때만 적용됩니다. |

### 타이밍 (프레임 단위)

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `pairOut` | `[10, 22]` | 위·아래 삼각형이 벌어지며 사라지는 구간. |
| `rectIn` | `[18, 28]` | 아래 사각형이 커지며 나타나는 구간. |
| `circIn` | `[25, 35]` | 위 원이 커지며 나타나는 구간. |
| `rcOut` | `[42, 51]` | 사각형·원이 사라지기 시작하는 베이스 구간. 실제 적용값은 위 유도식으로 덮어써집니다. |
| `rtDraw` | `[51, 77]` | 직각삼각형이 그려지는 구간. |
| `rtOut` | `[82, 108]` | 직각삼각형이 지워지는 구간. |
| `pairIn` | `[94, 108]` | 위·아래 삼각형이 돌아오는 구간. |
| `holdExtra` | `2.8` | 사각형·원 유지 시간 추가분. 이후 키를 전부 뒤로 밉니다. |
| `pairCut` | `6` | 삼각형만 보이는 구간 단축분. `TOTAL`에서 뺍니다. |

## 예시

### 멈춘 상태에서 특정 프레임 보기

```js
const tile = Newstile.mount("#tile", { autoplay: false });
tile.seek(tile.get().total / 2);
```

### 색 바꾸기

```js
tile.set({ cell: "#10252a", sand: "#f2e6c8" });
```

### SVG로 저장

```js
const svg = tile.toSVG();
const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
```

`toSVG()`는 그 순간의 정지 화면입니다.

### 정리

SPA에서 컴포넌트가 사라질 때는 꼭 `destroy()`를 호출하세요. 호출하지 않으면 애니메이션 루프가 계속 돕니다.

```js
tile.destroy();
```
