# mirrorball

월페이퍼/웹페이지 전용 코드를 건드리지 않고, 미러볼 하나만 배치하는 단일 파일 패키지.
원본: `examples/미러볼 SVG 생성기.html`. npm 없이 GitHub + jsDelivr로 배포.

## 배포 파일 (이 폴더만 jsDelivr로 나감)

```
packages/mirrorball/dist/mirrorball.esm.js  # import용
packages/mirrorball/dist/mirrorball.umd.js  # <script src>용 → window.MirrorBall
```

## 버전 태그

태그는 레포 공용이므로 prefix 권장:

```sh
node packages/mirrorball/build.mjs
git add packages/mirrorball/dist
git commit -m "mirrorball v0.1.0"
git tag mirrorball-v0.1.0
git push origin HEAD --tags
```

## 사용

```html
<div id="ball" style="width:320px"></div>
<script src="https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@mirrorball-v0.1.0/packages/mirrorball/dist/mirrorball.umd.js"></script>
<script>
  const ball = MirrorBall.mount('#ball', { seed: 11, tilt: -32 });
  ball.set({ veil: 0.8, glint: 0.5 }); // 옵션 조정
  ball.fire();                          // 빛줄기 발사
  const svg = ball.toSVG();             // SVG 스냅샷
  // ball.pause(); ball.play(); ball.destroy();
</script>
```

```html
<script type="module">
  import { mount } from "https://cdn.jsdelivr.net/gh/eoeoe22/tsukuyomi@mirrorball-v0.1.0/packages/mirrorball/dist/mirrorball.esm.js";
  const ball = mount(document.getElementById('ball'), { seed: 11 });
</script>
```

`mount(el, opts)` / `createMirrorBall(el, opts)` 동일. `el`은 셀렉터 또는 엘리먼트.
`set()`은 `step/jit/off/seed` 변경 시에만 토폴로지 재빌드, 나머지는 리렌더.
SVG `defs` id는 인스턴스별 `uid` prefix라 한 페이지 다중 배치 충돌 없음.
