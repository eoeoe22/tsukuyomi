// yachiroom — 야치요 방 개별 물건 반3D 컴포넌트 (랜턴 제외).
// 박스 기반 볼록체: (u,v)->(x,y,z) 대신 8꼭짓점 박스 + 면법선으로 앞면 판정.
// 규약은 pseudo-3d-svg 스킬과 동일: x 우, y 위, z 관찰자쪽.
// 세로축 회전(rotY) + x축 기울기(tilt) → 정사영. z'는 가시성·정렬에만 사용.
// Canvas와 SVG가 같은 prim 목록을 공유한다.
const S = 420, C = 210;
const rad = d => d * Math.PI / 180;
const f2 = n => n.toFixed(2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function hxRGB(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }; }
const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const cssA = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const DEFAULTS = {
  part: 'hashira', // hashira | marumado | ranma | kamoi | hari | yuka | dan | tsuitate | kouran
  rot: 24,         // 세로축 회전(도)
  tilt: 12,        // 시점 기울기(도, +면 위에서)
  wood: '#4a3421', woodD: '#241a12', plaster: '#6b5c48', plasterD: '#3a3128',
  seed: 7,
  // 부품별
  slats: 14,       // ranma 세로살 수
  roundR: 0.62,    // marumado 반지름(벽폭 대비)
  fold: 28,        // tsuitate 두 번째 폭 꺾임(도)
  bars: 9,         // kouran 동자 수
  size: 0, autoplay: false, period: 24, label: true,
};
const PARTS = ['hashira', 'marumado', 'ranma', 'kamoi', 'hari', 'yuka', 'dan', 'tsuitate', 'kouran'];
const PART_LABEL = { hashira: '기둥', marumado: '원창+회벽', ranma: '란마', kamoi: '가모이', hari: '종보', yuka: '마루판', dan: '우측 단', tsuitate: '충립(병풍)', kouran: '바깥 난간' };

// ---- 투영 코어 ----
function sysOf(tilt) { const T = rad(tilt); return { ct: Math.cos(T), st: Math.sin(T) }; }
function rotY(x, z, r) { const c = Math.cos(r), s = Math.sin(r); return [x * c + z * s, -x * s + z * c]; }
function projectPt(x, y, z, R, s, sc, ox, oy) {
  const [x1, z1] = rotY(x, z, R);
  const y2 = y * s.ct - z1 * s.st, z2 = y * s.st + z1 * s.ct;
  return [ox + sc * x1, oy - sc * y2, z2];
}
function rotNormal(nx, ny, nz, R, s) {
  const [x1, z1] = rotY(nx, nz, R);
  return [x1, ny * s.ct - z1 * s.st, ny * s.st + z1 * s.ct];
}
// 면 음영: 법선+광원내적. 광원은 좌상앞 고정.
const LIGHT = (() => { const l = [-0.45, 0.75, 0.65]; const n = Math.hypot(...l); return l.map(v => v / n); })();
function shadeOf(nw, base, dark) {
  const d = Math.max(0, nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2]);
  const b = 0.42 + 0.58 * d;
  const B = hxRGB(base), D = hxRGB(dark);
  // 어두운 면은 dark 쪽으로
  const t = clamp((1 - b) * 1.1, 0, 1) * 0.55;
  const c = B.map((v, i) => v + (D[i] - v) * t);
  // 윗면은 살짝 밝게
  const up = clamp(nw[1], 0, 1) * 14;
  return [c[0] + up, c[1] + up, c[2] + up];
}

// 박스: c中心, size(w,h,d). 8 꼭짓점 + 6면. 보이는 면만 뒤→앞 정렬 후 prim 반환.
function boxPrims(cx, cy, cz, w, h, d, R, s, sc, ox, oy, o, faceScale = 1) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const F = [
    { n: [0, 0, 1], idx: [4, 5, 6, 7] }, { n: [0, 0, -1], idx: [1, 0, 3, 2] },
    { n: [1, 0, 0], idx: [1, 2, 6, 5] }, { n: [-1, 0, 0], idx: [0, 4, 7, 3] },
    { n: [0, 1, 0], idx: [3, 7, 6, 2] }, { n: [0, -1, 0], idx: [0, 1, 5, 4] },
  ];
  const P = V.map(v => projectPt(v[0], v[1], v[2], R, s, sc, ox, oy));
  const out = [];
  const vis = [];
  for (const f of F) {
    const nw = rotNormal(f.n[0], f.n[1], f.n[2], R, s);
    if (nw[2] <= 1e-4) continue;
    let z = 0; for (const i of f.idx) z += P[i][2]; z /= 4;
    vis.push({ f, nw, z });
  }
  vis.sort((a, b) => a.z - b.z);
  for (const { f, nw } of vis) {
    const pts = f.idx.map(i => [P[i][0], P[i][1]]);
    const fill = css(shadeOf(nw, o.wood, o.woodD));
    out.push({ k: 'poly', pts, fill, stroke: 'rgba(0,0,0,0.35)', sw: 1 });
  }
  return out;
}
// 얇은 판(벽·패널): 양면 중 보이는 쪽만. 앞면이 +z, 뒷면이 -z.
function panelPrims(corners, R, s, sc, ox, oy, fillFront, fillBack) {
  const P = corners.map(v => projectPt(v[0], v[1], v[2], R, s, sc, ox, oy));
  // 법선 = (b-a)×(d-a)
  const ax = corners[1][0] - corners[0][0], ay = corners[1][1] - corners[0][1], az = corners[1][2] - corners[0][2];
  const bx = corners[3][0] - corners[0][0], by = corners[3][1] - corners[0][1], bz = corners[3][2] - corners[0][2];
  let n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  const l = Math.hypot(...n) || 1; n = n.map(v => v / l);
  const nw = rotNormal(n[0], n[1], n[2], R, s);
  const pts = P.map(p => [p[0], p[1]]);
  const fill = nw[2] >= 0 ? fillFront : fillBack;
  return [{ k: 'poly', pts, fill, stroke: 'rgba(0,0,0,0.4)', sw: 1.2, nz: nw[2] }];
}

// ---- 부품별 빌더: prim 배열 반환 ----
function buildPrims(o) {
  const R = rad(o.rot), s = sysOf(o.tilt);
  const sc = 150; // 월드 1 = 150px
  const ox = C, oy = C + 10;
  const P = [];
  const woodLine = 'rgba(20,12,8,0.5)';
  if (o.part === 'hashira') {
    // 각기둥 0.34×2.6×0.34. 상하 Mars? 목리 세로선 2개
    P.push(...boxPrims(0, 0, 0, 0.34, 2.6, 0.34, R, s, sc, ox, oy, o));
    for (const dx of [-0.07, 0.07]) {
      const a = projectPt(dx, -1.2, 0.175, R, s, sc, ox, oy), b = projectPt(dx, 1.2, 0.175, R, s, sc, ox, oy);
      P.push({ k: 'line', pts: [[a[0], a[1]], [b[0], b[1]]], stroke: 'rgba(255,220,170,0.14)', sw: 1.5 });
    }
    P.push({ k: 'line', pts: null, label: '기둥 0.34×2.6' });
  } else if (o.part === 'marumado') {
    // 회벽 2.0×1.5×0.12 + 원창 링(원 48분할) + 십자+세로살 2
    P.push(...boxPrims(0, 0, -0.06, 2.0, 1.5, 0.12, R, s, sc, ox, oy, { wood: o.plaster, woodD: o.plasterD }));
    const r = o.roundR * 0.62, N = 48, ring = [];
    for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; ring.push([Math.cos(a) * r, Math.sin(a) * r * 1.0, 0.005]); }
    const rp = ring.map(v => projectPt(v[0], v[1], v[2], R, s, sc, ox, oy));
    P.push({ k: 'poly', pts: rp.map(p => [p[0], p[1]]), fill: '#0d162e', stroke: '#241a12', sw: 5 });
    const bar = (x0, y0, x1, y1) => {
      const a = projectPt(x0, y0, 0.005, R, s, sc, ox, oy), b = projectPt(x1, y1, 0.005, R, s, sc, ox, oy);
      P.push({ k: 'line', pts: [[a[0], a[1]], [b[0], b[1]]], stroke: '#57493a', sw: 3 });
    };
    bar(-r, 0, r, 0); bar(0, -r, 0, r); bar(-r * 0.5, -r * 0.86, -r * 0.5, r * 0.86); bar(r * 0.5, -r * 0.86, r * 0.5, r * 0.86);
  } else if (o.part === 'ranma') {
    // 틀 2.4×0.42 + 세로살 slats개
    P.push(...boxPrims(0, 0.21, 0, 2.4, 0.06, 0.1, R, s, sc, ox, oy, o));
    P.push(...boxPrims(0, -0.21, 0, 2.4, 0.06, 0.1, R, s, sc, ox, oy, o));
    P.push(...boxPrims(-1.17, 0, 0, 0.06, 0.48, 0.1, R, s, sc, ox, oy, o));
    P.push(...boxPrims(1.17, 0, 0, 0.06, 0.48, 0.1, R, s, sc, ox, oy, o));
    const n = Math.max(3, Math.round(o.slats));
    for (let i = 0; i < n; i++) {
      const x = -1.1 + 2.2 * (i + 0.5) / n;
      P.push(...boxPrims(x, 0, 0, 0.035, 0.38, 0.05, R, s, sc, ox, oy, o));
    }
  } else if (o.part === 'kamoi') {
    // 가모이 긴 보 3.0×0.16×0.18
    P.push(...boxPrims(0, 0, 0, 3.0, 0.16, 0.18, R, s, sc, ox, oy, o));
    const a = projectPt(-1.5, 0.08, 0.09, R, s, sc, ox, oy), b = projectPt(1.5, 0.08, 0.09, R, s, sc, ox, oy);
    P.push({ k: 'line', pts: [[a[0], a[1]], [b[0], b[1]]], stroke: 'rgba(255,220,170,0.16)', sw: 1.5 });
  } else if (o.part === 'hari') {
    // 종보 0.18×0.22×3.2 (깊이 방향으로 김)
    P.push(...boxPrims(0, 0, 0, 0.18, 0.22, 3.2, R, s, sc, ox, oy, o));
  } else if (o.part === 'yuka') {
    // 마루판 1.6×0.08×0.9 + 결 3줄 + 이음선
    P.push(...boxPrims(0, 0, 0, 1.6, 0.08, 0.9, R, s, sc, ox, oy, o));
    const rnd = mulberry32(o.seed);
    for (let i = 0; i < 3; i++) {
      const z = -0.3 + i * 0.3 + (rnd() - 0.5) * 0.05;
      const a = projectPt(-0.78, 0.045, z, R, s, sc, ox, oy), b = projectPt(0.78, 0.045, z, R, s, sc, ox, oy);
      P.push({ k: 'line', pts: [[a[0], a[1]], [b[0], b[1]]], stroke: 'rgba(30,18,10,0.45)', sw: 1 });
    }
  } else if (o.part === 'dan') {
    // 2단: 하단 2.2×0.18×1.2, 상단 2.2×0.12×1.0 (뒤로 물림)
    P.push(...boxPrims(0, -0.09, 0.1, 2.2, 0.18, 1.2, R, s, sc, ox, oy, o));
    P.push(...boxPrims(0, 0.06, -0.05, 2.2, 0.12, 1.0, R, s, sc, ox, oy, { wood: '#5a4030', woodD: o.woodD }));
    const a = projectPt(-1.1, 0.12, 0.45, R, s, sc, ox, oy), b = projectPt(1.1, 0.12, 0.45, R, s, sc, ox, oy);
    P.push({ k: 'line', pts: [[a[0], a[1]], [b[0], b[1]]], stroke: 'rgba(255,220,170,0.20)', sw: 2 });
  } else if (o.part === 'tsuitate') {
    // 충립 2폭: 각 0.9×1.5. 2폭은 fold만큼 꺾임. 초록 테두리(레퍼런스 우측)
    const panels = [
      { c: [[-0.45, -0.75, 0], [0.45, -0.75, 0], [0.45, 0.75, 0], [-0.45, 0.75, 0]], fill: '#4c5747' },
    ];
    const fr = rad(o.fold);
    const hinge = [0.45, 0, 0];
    const w = 0.9, h = 1.5;
    // 2폭 코너: 힌지 기준 회전
    const c2 = [[0, -h / 2, 0], [w, -h / 2, 0], [w, h / 2, 0], [0, h / 2, 0]]
      .map(([x, y]) => [hinge[0] + x * Math.cos(fr), y, hinge[2] - x * Math.sin(fr)]);
    const all = [
      { corners: panels[0].c, fill: '#4c5747' },
      { corners: c2, fill: '#55614f' },
    ];
    // 뒤→앞 정렬: 평균 z2
    const scored = all.map(p => {
      let z = 0; for (const v of p.corners) { const [, , z2] = projectPt(v[0], v[1], v[2], R, s, sc, ox, oy); z += z2; }
      return { p, z: z / 4 };
    }).sort((a, b) => a.z - b.z);
    for (const { p } of scored) P.push(...panelPrims(p.corners, R, s, sc, ox, oy, p.fill, '#2c332a'));
    // 테두리선
    for (const { p } of scored) {
      const q = p.corners.map(v => projectPt(v[0], v[1], v[2], R, s, sc, ox, oy));
      P.push({ k: 'poly', pts: q.map(t => [t[0], t[1]]), fill: 'none', stroke: '#1d5c3a', sw: 3 });
    }
  } else if (o.part === 'kouran') {
    // 횡대 2.6×0.07 + 동자 bars개(0.06×0.5)
    P.push(...boxPrims(0, 0.25, 0, 2.6, 0.07, 0.07, R, s, sc, ox, oy, o));
    P.push(...boxPrims(0, -0.25, 0, 2.6, 0.06, 0.06, R, s, sc, ox, oy, o));
    const n = Math.max(2, Math.round(o.bars));
    for (let i = 0; i < n; i++) {
      const x = -1.2 + 2.4 * (i + 0.5) / n;
      P.push(...boxPrims(x, 0, 0, 0.06, 0.5, 0.06, R, s, sc, ox, oy, o));
    }
  }
  void woodLine;
  return P.filter(p => p.k);
}

// ---- 렌더 ----
function drawPrims(g, prims) {
  for (const p of prims) {
    if (p.k === 'poly') {
      if (!p.pts || p.pts.length < 2) continue;
      g.beginPath();
      p.pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]));
      g.closePath();
      if (p.fill && p.fill !== 'none') { g.fillStyle = p.fill; g.fill(); }
      if (p.stroke) { g.strokeStyle = p.stroke; g.lineWidth = p.sw || 1; g.stroke(); }
    } else if (p.k === 'line') {
      if (!p.pts) continue;
      g.strokeStyle = p.stroke; g.lineWidth = p.sw; g.lineCap = 'round';
      g.beginPath(); g.moveTo(p.pts[0][0], p.pts[0][1]); g.lineTo(p.pts[1][0], p.pts[1][1]); g.stroke();
    }
  }
}
function primsToSVG(prims, uid) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = prims.map(p => {
    if (p.k === 'poly') {
      if (!p.pts || p.pts.length < 2) return '';
      const pts = p.pts.map(q => `${f2(q[0])},${f2(q[1])}`).join(' ');
      const fill = p.fill === 'none' ? 'none' : esc(p.fill || 'none');
      const st = p.stroke ? ` stroke="${esc(p.stroke)}" stroke-width="${p.sw || 1}"` : '';
      return `<polygon points="${pts}" fill="${fill}"${st}/>`;
    }
    if (p.k === 'line') {
      if (!p.pts) return '';
      return `<line x1="${f2(p.pts[0][0])}" y1="${f2(p.pts[0][1])}" x2="${f2(p.pts[1][0])}" y2="${f2(p.pts[1][1])}" stroke="${esc(p.stroke)}" stroke-width="${p.sw}" stroke-linecap="round"/>`;
    }
    return '';
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" id="${uid}">\n${body}\n</svg>`;
}

let __uid = 0;
function resolveEl(t) {
  if (typeof t === 'string') {
    if (typeof document === 'undefined') throw new Error('yachiroom: document 없음');
    const el = document.querySelector(t); if (!el) throw new Error(`yachiroom: '${t}' 없음`); return el;
  }
  return t;
}
class YachiRoom {
  constructor(target, userOpts = {}) {
    this.el = resolveEl(target);
    this.o = { ...DEFAULTS, ...userOpts };
    this.uid = `yr${++__uid}`;
    this.rot = +this.o.rot || 0; this.playing = this.o.autoplay === true;
    this.t = 0; this._raf = 0; this._disposed = false;
    if (typeof document === 'undefined') return;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S; cv.style.width = '100%'; cv.style.aspectRatio = '1/1'; cv.style.display = 'block';
    cv.style.background = '#0b0e16'; cv.style.borderRadius = '10px';
    this.el.appendChild(cv); this.cv = cv; this.g = cv.getContext('2d');
    this._last = performance.now();
    const loop = now => {
      if (this._disposed) return;
      const dt = Math.min(0.1, (now - this._last) / 1000); this._last = now;
      if (this.playing) { this.rot = (this.rot + dt * 360 / (this.o.period || 24)) % 360; this.render(); }
      this._raf = requestAnimationFrame(loop);
    };
    this.render();
    if (typeof requestAnimationFrame !== 'undefined') this._raf = requestAnimationFrame(loop);
  }
  render() {
    const prims = buildPrims({ ...this.o, rot: this.rot });
    this._prims = prims;
    this.g.clearRect(0, 0, S, S);
    drawPrims(this.g, prims);
    if (this.o.label !== false) {
      this.g.fillStyle = 'rgba(255,255,255,0.55)'; this.g.font = '13px system-ui';
      this.g.fillText(`${PART_LABEL[this.o.part] || this.o.part} · rot ${Math.round(this.rot)}° tilt ${this.o.tilt}°`, 12, 20);
    }
  }
  set(p = {}) {
    Object.assign(this.o, p);
    if (p.rot !== undefined) this.rot = +p.rot || 0;
    if (p.autoplay !== undefined) this.playing = p.autoplay === true;
    if (this.g) this.render();
    return this.get();
  }
  get() { return { ...this.o, rot: Math.round(this.rot), playing: this.playing }; }
  play() { this.playing = true; return this; }
  pause() { this.playing = false; return this; }
  toSVG() { return primsToSVG(this._prims || buildPrims({ ...this.o, rot: this.rot }), this.uid); }
  destroy() { this._disposed = true; if (this._raf) cancelAnimationFrame(this._raf); if (this.cv) this.cv.remove(); }
}
function createYachiRoom(t, o) { return new YachiRoom(t, o); }
function mount(t, o) { return new YachiRoom(t, o); }

export { YachiRoom, createYachiRoom, mount, DEFAULTS, PARTS, PART_LABEL, buildPrims };
export default { YachiRoom, createYachiRoom, mount, DEFAULTS, PARTS, PART_LABEL, buildPrims };
export const internals = { projectPt, boxPrims, panelPrims, buildPrims, S, C };
