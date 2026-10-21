# yachiroom

야치요 방 개별 물건 반3D 컴포넌트. 랜턴 제외.

- 박스 기반 정사영 회전 (`rot` + `tilt`), Canvas/SVG 동일 prim.
- 부품: 기둥 `hashira`, 원창+회벽 `marumado`, 란마 `ranma`, 가모이 `kamoi`, 종보 `hari`, 마루판 `yuka`, 우측 단 `dan`, 충립 `tsuitate`, 바깥 난간 `kouran`.
- 랜턴은别 패키지에서 구현済이므로含まない.

## 사용

```html
<script src="./dist/yachiroom.umd.js"></script>
<div id="st"></div>
<script>
  const inst = YachiRoom.mount('#st', { part: 'marumado', rot: 24, tilt: 12 });
  inst.set({ part: 'ranma' });
  const svg = inst.toSVG();
</script>
```

`node build.mjs` 로 dist 재생성.
