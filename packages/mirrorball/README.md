# mirrorball

웹페이지에 회전하는 미러볼 하나를 배치하는 단일 파일 라이브러리입니다.
의존성이 없고, `<script>` 한 줄로 바로 쓸 수 있습니다. 미러볼은 캔버스로 그려지며, 클릭하면 타일 줄눈을 따라 빛줄기가 흐릅니다.

## 설치

### `<script>` 태그 (UMD)

```html
<script
  src="https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@mirrorball-v0.1.0/packages/mirrorball/dist/mirrorball.umd.js"
  integrity="sha384-QtsSCtB4Y0C5Mgb9pHFrWd0JzfFtmaUIAhQkz4U2/5i4qep+/4itmCee/75L6e56"
  crossorigin="anonymous"></script>
```

로드되면 전역 객체 `window.MirrorBall`이 생깁니다.

### ES 모듈

```html
<script type="importmap">
{
  "imports": {
    "mirrorball": "https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@mirrorball-v0.1.0/packages/mirrorball/dist/mirrorball.esm.js"
  },
  "integrity": {
    "https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@mirrorball-v0.1.0/packages/mirrorball/dist/mirrorball.esm.js": "sha384-rFtRloewfHjEzHQu+omBFEuV/GuKGOWoyENSP9BsdQFvUh7b4hVNjJi8YprpFovT"
  }
}
</script>
<script type="module">
  import { mount } from "mirrorball";
  const ball = mount("#ball");
</script>
```

`import` 문 자체에는 `integrity`를 붙일 수 없어서, 무결성 검사를 하려면 위처럼 import map의 `integrity` 필드를 써야 합니다. 이 필드를 지원하지 않는 브라우저에서는 검사 없이 그냥 로드됩니다.

### 무결성 해시

| 파일 | integrity |
| --- | --- |
| `mirrorball.umd.js` | `sha384-QtsSCtB4Y0C5Mgb9pHFrWd0JzfFtmaUIAhQkz4U2/5i4qep+/4itmCee/75L6e56` |
| `mirrorball.esm.js` | `sha384-rFtRloewfHjEzHQu+omBFEuV/GuKGOWoyENSP9BsdQFvUh7b4hVNjJi8YprpFovT` |

해시는 `mirrorball-v0.1.0` 태그 기준입니다. 버전을 바꾸면 해시도 바뀌니 함께 교체하세요.

## 빠른 시작

```html
<div id="ball" style="width: 320px"></div>

<script
  src="https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@mirrorball-v0.1.0/packages/mirrorball/dist/mirrorball.umd.js"
  integrity="sha384-QtsSCtB4Y0C5Mgb9pHFrWd0JzfFtmaUIAhQkz4U2/5i4qep+/4itmCee/75L6e56"
  crossorigin="anonymous"></script>
<script>
  const ball = MirrorBall.mount("#ball", { seed: 11, tilt: -32 });
  ball.fire(); // 빛줄기 한 번 발사
</script>
```

미러볼은 컨테이너 너비에 맞춰 정사각형으로 그려집니다. 고정 크기가 필요하면 `size` 옵션을 쓰세요.

## API

### `MirrorBall.mount(target, options?)`

미러볼을 만들어 `target` 안에 캔버스를 추가하고 인스턴스를 반환합니다.

- `target`: CSS 선택자 문자열 또는 DOM 요소. 선택자에 맞는 요소가 없으면 에러를 던집니다.
- `options`: 아래 [옵션](#옵션) 중 바꾸고 싶은 것만 넘기면 됩니다. 나머지는 기본값을 씁니다.

`MirrorBall.createMirrorBall(target, options)`와 `new MirrorBall.MirrorBall(target, options)`도 똑같이 동작합니다. ES 모듈에서는 `mount`, `createMirrorBall`, `MirrorBall`, `DEFAULTS`를 이름으로 가져올 수 있습니다.

한 페이지에 여러 개를 배치해도 서로 충돌하지 않습니다.

### 인스턴스 메서드

| 메서드 | 반환 | 설명 |
| --- | --- | --- |
| `set(partial)` | 현재 옵션 객체 | 옵션 일부를 바꾸고 즉시 다시 그립니다. |
| `get()` | 옵션 객체 | 현재 옵션과 함께 `rot`(현재 회전각, 정수)과 `playing`(회전 중 여부)을 돌려줍니다. |
| `fire()` | 인스턴스 | 빛줄기를 한 번 발사합니다. `glint`가 0이면 아무 일도 없습니다. |
| `play()` | 인스턴스 | 회전을 시작합니다. |
| `pause()` | 인스턴스 | 회전을 멈춥니다. 진행 중인 빛줄기는 끝까지 그려집니다. |
| `toggle()` | `boolean` | 회전 상태를 뒤집고, 바뀐 뒤의 회전 여부를 반환합니다. |
| `toSVG()` | `string` | 현재 모습을 440×440 SVG 문자열로 내보냅니다. |
| `destroy()` | 없음 | 애니메이션과 이벤트를 정리하고 캔버스를 제거합니다. |

`fire`, `play`, `pause`는 인스턴스를 반환하므로 `ball.pause().fire()`처럼 이어 쓸 수 있습니다.

### `MirrorBall.DEFAULTS`

모든 옵션의 기본값 객체입니다. 읽기 용도로 쓰세요.

## 옵션

모든 옵션은 `mount()`에서 초기값으로 넘기거나 `set()`으로 나중에 바꿀 수 있습니다. 예외는 표에 따로 적었습니다.

권장 범위는 원본 편집기 슬라이더의 범위입니다. 범위를 벗어난 값도 들어가지만 결과가 어색해질 수 있습니다. 별도로 값이 강제되는 옵션은 설명에 적었습니다.

### 형태

| 옵션 | 기본값 | 권장 범위 | 설명 |
| --- | --- | --- | --- |
| `tilt` | `-32` | -90 ~ 90 | 보는 시점의 위아래 기울기(도). 음수일수록 아래쪽 면이 더 보입니다. |
| `step` | `9.5` | 3 ~ 15 | 타일 크기(위도 간격, 도). 작을수록 타일이 잘고 많아집니다. 3 ~ 15로 강제됩니다. |
| `gap` | `0.14` | 0.02 ~ 0.4 | 줄눈 두께. 빛줄기 굵기도 이 값을 따릅니다. |
| `jit` | `0.06` | 0 ~ 0.2 | 같은 줄 안에서 타일 폭이 들쭉날쭉한 정도. |
| `off` | `1` | 0 ~ 1 | 각 줄의 시작 위치를 얼마나 무작위로 어긋나게 할지. 0이면 세로 줄눈이 정렬됩니다. |
| `seed` | `11` | 정수 | 타일 배치용 난수 시드. 같은 시드면 항상 같은 배치가 나옵니다. |

이 표의 `step`, `jit`, `off`, `seed`를 바꾸면 타일 배치를 새로 계산합니다. 다른 옵션은 다시 그리기만 하므로 더 가볍습니다.

### 색상

색상은 모두 `#rrggbb` 형식의 6자리 hex 문자열이어야 합니다. `#fff`나 `rgb()` 같은 형식은 지원하지 않습니다.

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `tile` | `"#dfe4ea"` | 타일 기본색. |
| `grout` | `"#d3e3e9"` | 줄눈 색. |
| `dark` | `"#5a8696"` | 그늘진 타일 색. |
| `light` | `"#eaf7ff"` | 빛을 반사하는 타일의 밝은 색. |
| `glowC` | `"#fff3f1"` | 하부 발광과 안개의 색. |

### 조명

| 옵션 | 기본값 | 권장 범위 | 설명 |
| --- | --- | --- | --- |
| `pole` | `0.3` | 0 ~ 3 | 극점광 세기. 남극 쪽을 중심으로 원형으로 밝아집니다. |
| `poleR` | `58` | 0 ~ 90 | 극점광이 퍼지는 범위(도). |
| `veil` | `0.8` | 0 ~ 1.5 | 아래쪽 발광 세기. 커질수록 줄눈을 덮으며 뿌옇게 빛납니다. |
| `veilR` | `0.36` | 0.05 ~ 1 | 아래쪽 발광이 올라오는 범위. |
| `haze` | `0.47` | 0 ~ 0.6 | 미러볼 전체에 깔리는 발광 안개. `veil`과 `haze`가 둘 다 0이면 발광이 꺼집니다. |
| `bloom` | `0.3` | 0 ~ 1 | 밝은 타일 주변이 번지는 효과. 0이면 끕니다. |
| `teal` | `0.6` | 0 ~ 1 | 위쪽을 청록 그늘로 어둡게 하는 정도. |
| `tjit` | `0` | 0 ~ 0.5 | 타일마다 밝기를 무작위로 다르게 하는 정도. |
| `sheen` | `0.6` | 0 ~ 1 | 타일 표면의 은빛 그라디언트 질감. |

### 빛줄기 (`fire()`)

이 옵션들은 `fire()`나 클릭으로 발사되는 빛줄기에 적용됩니다. 값을 바꾸면 다음 발사부터 반영됩니다.

| 옵션 | 기본값 | 권장 범위 | 설명 |
| --- | --- | --- | --- |
| `glint` | `0.1` | 0 ~ 2 | 빛줄기 밝기. 0이면 `fire()`를 불러도 발사되지 않습니다. 기본값은 은은한 편이라 눈에 띄게 하려면 0.5 이상을 권장합니다. |
| `gcount` | `6` | 1 ~ 12 | 한 번 발사할 때 나가는 빛줄기 개수. 1 이상의 정수로 반올림됩니다. |
| `gturn` | `0.22` | 0 ~ 1 | 줄눈 교차점마다 방향을 꺾을 확률. |
| `gspd` | `2.5` | 0.3 ~ 2.5 | 빛줄기 속도 배율. |
| `ghold` | `0.14` | 0 ~ 1.5 | 출발 직후 느리게(0.1배속) 머무는 시간(초). |
| `gacc` | `0.08` | 0 ~ 0.6 | 최고 속도까지 가속하는 데 걸리는 시간(초). |
| `gwhite` | `0.74` | 0.3 ~ 1 | 빛줄기 색에서 흰빛이 차지하는 비중. 낮을수록 색이 진해집니다. |

### 회전과 동작

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `rot` | `0` | 회전각(도). `set({ rot })`으로 특정 각도로 바로 돌릴 수 있습니다. 회전 중이면 그 각도에서 계속 돕니다. |
| `period` | `40` | 한 바퀴 도는 데 걸리는 시간(초). 작을수록 빠릅니다. 최소 1로 강제됩니다. |
| `autoplay` | `true` | `false`면 멈춘 상태로 시작합니다. `set({ autoplay })`는 `play()`/`pause()`와 같은 효과입니다. |
| `interactive` | `true` | `false`면 클릭으로 발사되지 않고 포인터 커서도 바뀌지 않습니다. `fire()`는 그대로 동작합니다. |
| `size` | `0` | 캔버스 크기(px). 0이면 컨테이너 너비에 맞춥니다. 생성할 때만 적용되며, `set()`으로 바꿔도 반영되지 않습니다. |

## 예시

### 멈춘 상태에서 버튼으로 발사

```js
const ball = MirrorBall.mount("#ball", { autoplay: false, interactive: false, glint: 0.8 });
document.querySelector("#btn").addEventListener("click", () => ball.fire());
```

### 색 바꾸기

```js
ball.set({ tile: "#f2d7e3", grout: "#e8c4d4", dark: "#8a4f6b", glowC: "#ffe6f0" });
```

### SVG로 저장

```js
const svg = ball.toSVG();
const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
```

`toSVG()`는 그 순간의 정지 화면입니다. 블룸과 빛줄기는 SVG 필터와 `mix-blend-mode`로 표현되므로 뷰어에 따라 캔버스와 조금 다르게 보일 수 있습니다.

### 정리

SPA에서 컴포넌트가 사라질 때는 꼭 `destroy()`를 호출하세요. 호출하지 않으면 애니메이션 루프가 계속 돕니다.

```js
ball.destroy();
```
