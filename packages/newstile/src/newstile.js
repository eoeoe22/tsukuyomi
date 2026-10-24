// newstile — 뉴스장면 바닥 타일 1개를 웹페이지에 배치하는 단일 파일 패키지.
// 원본: public/examples/뉴스장면 바닥 타일.html <script> (무한 확장·카메라·UI 제거, 타일 1개 루프만 인스턴스화)
//        타이밍은 public/examples/뉴스장면 초안.html 기준 (HOLD_EXTRA/PAIR_CUT 적용, TOTAL 114.8, SPEED 1.08).
// 의존성 없음. ESM 소스. UMD/Min은 build.mjs가 여기서 생성.

const BASE_TOTAL = 118;
const TILE = 100;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mod = (a, n) => ((a % n) + n) % n;
const prog = (f, [a, b]) => clamp((f - a) / (b - a), 0, 1);
const eIn = t => t * t * t;
const eOut = t => 1 - Math.pow(1 - t, 3);
const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// 원본 기본값 (뉴스장면 초안.html의 타일 상수 그대로)
const DEFAULTS = {
  cell: '#0d2b31', sand: '#d9c79c',
  fps: 24, speed: 1.08,
  pairOut: [10, 22], rectIn: [18, 28], circIn: [25, 35],
  rcOut: [42, 51], rtDraw: [51, 77], rtOut: [82, 108], pairIn: [94, 108],
  holdExtra: 2.8000000000000003, pairCut: 6,
  frame: 0,
  // 마운트 전용 (렌더 코어와 무관)
  size: 0, autoplay: true,
};
const TIMING_KEYS = ['pairOut', 'rectIn', 'circIn', 'rcOut', 'rtDraw', 'rtOut', 'pairIn', 'holdExtra', 'pairCut'];

// 초안.html과 같은 유도: 베이스 키를 holdExtra만큼 뒤로 민 뒤,
// rcOut은 직각삼각형 진입 3분의 1 지점부터 사라지기 시작해 rtDraw 끝에 완전히 사라지도록
// [rtDraw 시작 + rtDraw 길이/3, rtDraw 끝]으로 덮어쓴다.
// TOTAL은 베이스 루프(118)에 holdExtra를 더하고 pairCut을 뺀다.
function buildTiming(o) {
  const k = {
    pairOut: [...o.pairOut], rectIn: [...o.rectIn], circIn: [...o.circIn],
    rcOut: [...o.rcOut], rtDraw: [...o.rtDraw], rtOut: [...o.rtOut], pairIn: [...o.pairIn],
  };
  for (const n of ['rcOut', 'rtDraw', 'rtOut', 'pairIn']) k[n] = k[n].map(v => v + o.holdExtra);
  k.rcOut = [k.rtDraw[0] + (k.rtDraw[1] - k.rtDraw[0]) / 3, k.rtDraw[1]];
  const TOTAL = BASE_TOTAL + o.holdExtra - o.pairCut;
  return { K: k, TOTAL };
}

// 직각삼각형 (반시계방향: 왼쪽 아래 → 오른쪽 아래 → 오른쪽 위) — 예제와 동일
const RT_C = [[5.07, 97.9], [97.9, 97.9], [97.9, 5.07]], RT_W = 2.1, RT_R = 8;
const RT = (() => {
  const n = RT_C.length;
  const cx = RT_C.reduce((s, p) => s + p[0], 0) / n, cy = RT_C.reduce((s, p) => s + p[1], 0) / n;
  const E = [];
  for (let i = 0; i < n; i++) {
    const A = RT_C[i], B = RT_C[(i + 1) % n];
    const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy), d = [dx / len, dy / len];
    let nn = [-d[1], d[0]];
    if (nn[0] * ((A[0] + B[0]) / 2 - cx) + nn[1] * ((A[1] + B[1]) / 2 - cy) < 0) nn = [-nn[0], -nn[1]];
    E.push({ A, d, n: nn, len });
  }
  const isect = (P, d1, Q, d2) => {
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    const t = ((Q[0] - P[0]) * d2[1] - (Q[1] - P[1]) * d2[0]) / den;
    return [P[0] + d1[0] * t, P[1] + d1[1] * t];
  };
  const off = (e, sg) => [e.A[0] + sg * RT_W * e.n[0], e.A[1] + sg * RT_W * e.n[1]];
  let acc = 0;
  E.forEach((e, i) => {
    e.start = acc; acc += e.len;
    const pv = E[(i + n - 1) % n], nx = E[(i + 1) % n];
    e.side = {};
    for (const sg of [1, -1]) {
      const base = off(e, sg);
      const cs = isect(base, e.d, off(pv, sg), pv.d), ce = isect(base, e.d, off(nx, sg), nx.d);
      const proj = p => (p[0] - base[0]) * e.d[0] + (p[1] - base[1]) * e.d[1];
      e.side[sg] = { base, s0: proj(cs), s1: proj(ce) };
    }
  });
  return { E, P: acc };
})();
function rtPiece(e, u0, u1) {
  const b0 = clamp(1 - u0 / RT_R, 0, 1), b1 = clamp(1 - (e.len - u1) / RT_R, 0, 1);
  const pt = (S, u) => `${(S.base[0] + e.d[0] * u).toFixed(3)} ${(S.base[1] + e.d[1] * u).toFixed(3)}`;
  const seg = {};
  for (const sg of [1, -1]) {
    const S = e.side[sg];
    let a = u0 * (1 - b0) + S.s0 * b0, b = u1 * (1 - b1) + S.s1 * b1;
    if (a > b) a = b = (a + b) / 2;
    seg[sg] = [pt(S, a), pt(S, b)];
  }
  return `M${seg[1][0]}L${seg[1][1]}L${seg[-1][1]}L${seg[-1][0]}Z`;
}
function rtPath(T, H) {
  const P = RT.P; let d = '';
  if (H - T >= 1 - 1e-6) { for (const e of RT.E) d += rtPiece(e, 0, e.len); return d; }
  const x0 = T * P, x1 = H * P;
  for (let k = Math.floor(x0 / P) - 1; k <= Math.floor(x1 / P) + 1; k++) {
    for (const e of RT.E) {
      const s = k * P + e.start, t = s + e.len;
      const a = Math.max(x0, s), b = Math.min(x1, t);
      if (b - a > 1e-6) d += rtPiece(e, a - s, b - s);
    }
  }
  return d;
}
function rtFor(K, f) {
  let T, Hd;
  if (f < K.rtOut[0]) { const q = eIO(prog(f, K.rtDraw)); Hd = 2 * q; T = q; }
  else { const q = eIO(prog(f, K.rtOut)); Hd = 1 + q; T = 2 * q; }
  return Hd - T > 0.0005 ? rtPath(T, Hd) : '';
}

const TRI_TOP_D = 'M5.07 2.1L94.93 2.1L50 47.03Z';
const TRI_BOT_D = 'M5.07 97.9L94.93 97.9L50 52.97Z';

function drawTile(ctx, f, K, o) {
  const { cell, sand } = o;
  const scaleAt = (cx, cy, s) => { ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); };
  ctx.fillStyle = cell; ctx.fillRect(0, 0, TILE, TILE);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, TILE, TILE); ctx.clip();
  ctx.strokeStyle = sand; ctx.fillStyle = sand; ctx.lineJoin = 'miter'; ctx.miterLimit = 10;

  let off, op;
  if (f < K.pairIn[0]) { const p = eIn(prog(f, K.pairOut)); off = 30 * p; op = 1 - p; }
  else { const q = eOut(prog(f, K.pairIn)); off = 30 * (1 - q); op = q; }
  if (op > 0.001) {
    ctx.globalAlpha = op; ctx.lineWidth = 4.2;
    ctx.save(); ctx.translate(0, -off); ctx.stroke(new Path2D(TRI_TOP_D)); ctx.restore();
    ctx.save(); ctx.translate(0, off); ctx.stroke(new Path2D(TRI_BOT_D)); ctx.restore();
  }

  const shapeState = (inSeg) => {
    if (f < inSeg[0] || f >= K.rcOut[1]) return { s: 0, o: 0 };
    if (f < K.rcOut[0]) return { s: eOut(prog(f, inSeg)), o: 1 };
    const p = eOut(prog(f, K.rcOut)); return { s: 1 + 0.12 * p, o: 1 - p };
  };
  const r = shapeState(K.rectIn), c = shapeState(K.circIn);
  ctx.lineWidth = 4.8;
  if (r.o > 0.001 && r.s > 0.0005) {
    ctx.globalAlpha = r.o; ctx.save(); scaleAt(50, 97.3, r.s);
    ctx.strokeRect(3.15, 78.8, 93.7, 18.5); ctx.restore();
  }
  if (c.o > 0.001 && c.s > 0.0005) {
    ctx.globalAlpha = c.o; ctx.save(); scaleAt(49.4, 37.4, c.s);
    ctx.beginPath(); ctx.arc(49.4, 37.4, 27.6, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  if (f >= K.rtDraw[0] && f < K.rtOut[1]) {
    const d = rtFor(K, f);
    if (d) { ctx.globalAlpha = 1; ctx.fill(new Path2D(d)); }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function buildSVG(K, o, f) {
  const { cell, sand } = o;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">`];
  out.push(`<rect width="100" height="100" fill="${cell}"/>`);
  out.push(`<g clip-path="url(#ns-clip)">`);
  out.push(`<defs><clipPath id="ns-clip"><rect width="100" height="100"/></clipPath></defs>`);
  let off, op;
  if (f < K.pairIn[0]) { const p = eIn(prog(f, K.pairOut)); off = 30 * p; op = 1 - p; }
  else { const q = eOut(prog(f, K.pairIn)); off = 30 * (1 - q); op = q; }
  if (op > 0.001) {
    out.push(`<g opacity="${op.toFixed(3)}" fill="none" stroke="${sand}" stroke-width="4.2">`);
    out.push(`<path d="${TRI_TOP_D}" transform="translate(0 ${(-off).toFixed(2)})"/>`);
    out.push(`<path d="${TRI_BOT_D}" transform="translate(0 ${off.toFixed(2)})"/>`);
    out.push(`</g>`);
  }
  const shapeState = (inSeg) => {
    if (f < inSeg[0] || f >= K.rcOut[1]) return { s: 0, o: 0 };
    if (f < K.rcOut[0]) return { s: eOut(prog(f, inSeg)), o: 1 };
    const p = eOut(prog(f, K.rcOut)); return { s: 1 + 0.12 * p, o: 1 - p };
  };
  const r = shapeState(K.rectIn), c = shapeState(K.circIn);
  if (r.o > 0.001 && r.s > 0.0005) {
    out.push(`<rect x="3.15" y="78.8" width="93.7" height="18.5" transform="translate(50 97.3) scale(${r.s.toFixed(4)}) translate(-50 -97.3)" fill="none" stroke="${sand}" stroke-width="4.8" opacity="${r.o.toFixed(3)}"/>`);
  }
  if (c.o > 0.001 && c.s > 0.0005) {
    out.push(`<circle cx="49.4" cy="37.4" r="27.6" transform="translate(49.4 37.4) scale(${c.s.toFixed(4)}) translate(-49.4 -37.4)" fill="none" stroke="${sand}" stroke-width="4.8" opacity="${c.o.toFixed(3)}"/>`);
  }
  if (f >= K.rtDraw[0] && f < K.rtOut[1]) {
    const d = rtFor(K, f);
    if (d) out.push(`<path d="${d}" fill="${sand}"/>`);
  }
  out.push(`</g>`, `</svg>`);
  return out.join('\n');
}

function resolveEl(target) {
  if (typeof target === 'string') {
    if (typeof document === 'undefined') throw new Error('newstile: document 없음. target element를 직접 전달하세요.');
    const el = document.querySelector(target);
    if (!el) throw new Error(`newstile: '${target}' 요소를 찾을 수 없음`);
    return el;
  }
  return target;
}

function numPair(v, fb) {
  const a = Array.isArray(v) ? v : fb;
  const x = +a[0], y = +a[1];
  return [Number.isFinite(x) ? x : fb[0], Number.isFinite(y) ? y : fb[1]];
}
function sanitize(o) {
  const out = { ...o };
  out.cell = String(out.cell || DEFAULTS.cell);
  out.sand = String(out.sand || DEFAULTS.sand);
  out.fps = Math.max(1, +out.fps || DEFAULTS.fps);
  out.speed = Math.max(0, Number.isFinite(+out.speed) ? +out.speed : DEFAULTS.speed);
  for (const k of ['pairOut', 'rectIn', 'circIn', 'rcOut', 'rtDraw', 'rtOut', 'pairIn']) {
    out[k] = numPair(out[k], DEFAULTS[k]);
  }
  out.holdExtra = Number.isFinite(+out.holdExtra) ? +out.holdExtra : DEFAULTS.holdExtra;
  out.pairCut = Number.isFinite(+out.pairCut) ? +out.pairCut : DEFAULTS.pairCut;
  out.frame = Number.isFinite(+out.frame) ? +out.frame : 0;
  out.size = Math.max(0, +out.size || 0);
  return out;
}

class Newstile {
  constructor(target, userOpts = {}) {
    this.el = resolveEl(target);
    this.o = sanitize({ ...DEFAULTS, ...userOpts });
    const { K, TOTAL } = buildTiming(this.o);
    this.K = K; this.TOTAL = TOTAL;
    this.frame = mod(+this.o.frame || 0, TOTAL);
    this.playing = this.o.autoplay !== false;
    this._raf = 0;
    this._last = 0;
    this._disposed = false;

    if (typeof document === 'undefined') return; // node 테스트용: 상태만 구성
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.dpr = dpr;
    const cv = document.createElement('canvas');
    cv.width = TILE * dpr; cv.height = TILE * dpr;
    if (this.o.size > 0) { cv.style.width = `${this.o.size}px`; cv.style.height = `${this.o.size}px`; }
    else { cv.style.width = '100%'; cv.style.aspectRatio = '1 / 1'; cv.style.display = 'block'; }
    this.el.appendChild(cv);
    this.cv = cv;
    this.ctx = cv.getContext('2d');

    this._last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const loop = t => {
      if (this._disposed) return;
      const now = typeof t === 'number' ? t : Date.now();
      const dt = Math.min(0.1, (now - this._last) / 1000); this._last = now;
      if (this.playing) {
        this.frame = (this.frame + dt * this.o.fps * this.o.speed) % this.TOTAL;
        this.draw();
      }
      this._raf = requestAnimationFrame(loop);
    };
    this.draw();
    if (typeof requestAnimationFrame !== 'undefined') this._raf = requestAnimationFrame(loop);
  }
  draw() {
    if (!this.cv) return;
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTile(ctx, this.frame, this.K, this.o);
  }
  set(partial = {}) {
    const next = sanitize({ ...this.o, ...partial });
    const needTiming = TIMING_KEYS.some(k => {
      const a = next[k], b = this.o[k];
      return Array.isArray(a) ? (a[0] !== b[0] || a[1] !== b[1]) : a !== b;
    });
    this.o = next;
    if (needTiming) {
      const { K, TOTAL } = buildTiming(this.o);
      this.K = K; this.TOTAL = TOTAL;
      this.frame = mod(this.frame, TOTAL);
    }
    if (partial.frame !== undefined) this.frame = mod(+partial.frame || 0, this.TOTAL);
    if (partial.autoplay !== undefined) this.playing = next.autoplay !== false;
    if (this.cv) this.draw();
    return this.get();
  }
  get() { return { ...this.o, total: this.TOTAL, frame: this.frame, playing: this.playing }; }
  seek(f) {
    this.frame = mod(+f || 0, this.TOTAL);
    if (this.cv) this.draw();
    return this;
  }
  play() { this.playing = true; return this; }
  pause() { this.playing = false; return this; }
  toggle() { this.playing = !this.playing; return this.playing; }
  toSVG(f = this.frame) { return buildSVG(this.K, this.o, mod(+f || 0, this.TOTAL)); }
  destroy() {
    this._disposed = true;
    if (typeof cancelAnimationFrame !== 'undefined' && this._raf) cancelAnimationFrame(this._raf);
    if (this.cv) this.cv.remove();
  }
}

function createNewstile(target, opts) { return new Newstile(target, opts); }
function mount(target, opts) { return new Newstile(target, opts); }

export { Newstile, createNewstile, mount, DEFAULTS };
export default { Newstile, createNewstile, mount, DEFAULTS };
export const internals = {
  buildTiming, drawTile, buildSVG, rtPath, rtFor,
  BASE_TOTAL, TILE,
};
