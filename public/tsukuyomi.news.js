/* 犬 뉴스 츠쿠요미: public/examples/뉴스장면 초안.html 이식 (단일 장면, 옵션 없음).
 * tsukuyomi.html의 세계(#worldNews, 경로 #news)로, tsukuyomi.worlds.js가 처음 필요할 때 로드.
 *
 * 레이어: 뒤 SVG(하늘·태양·구름·파도 언덕·토리이) → 바닥 캔버스 → 앞 SVG(가로등).
 * 세 레이어는 같은 1600×1066 설계 좌표를 "가운데 맞춰 꽉 채우기(slice)"로 공유한다.
 * 초안의 ` 조절 패널·참고 영상·localStorage 저장은 빼고 초안 기본값으로 고정했다.
 * SVG id는 다른 장면과 겹치지 않게 nw- 접두어를 붙였다.
 */
(() => {
'use strict';
const host = document.querySelector('#worldNews .world-view');
if (!host) return;

const NS = 'http://www.w3.org/2000/svg';
const VW = 1600, VH = 1066;
const mod = (a, n) => ((a % n) + n) % n;
const anim = []; // 매 프레임 호출: fn(초)
const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
// 고정 시드 난수 (배치가 매번 같도록)
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ───────── DOM ───────── */
host.innerHTML = `
<svg class="news-layer" viewBox="0 0 1600 1066" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="nw-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#163d4c"/>
      <stop offset=".35" stop-color="#2a6070"/>
      <stop offset=".62" stop-color="#5b98a6"/>
      <stop offset=".75" stop-color="#8fc3cb"/>
    </linearGradient>
    <radialGradient id="nw-glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset=".52" stop-color="#fffdf0" stop-opacity=".9"/>
      <stop offset=".68" stop-color="#fbf6dd" stop-opacity=".45"/>
      <stop offset="1" stop-color="#f8f2d6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nw-rayFade" gradientUnits="userSpaceOnUse" cx="815" cy="523" r="470">
      <stop offset="0" stop-color="#fffdf0" stop-opacity="1"/>
      <stop offset=".62" stop-color="#fffdf0" stop-opacity="1"/>
      <stop offset=".8" stop-color="#fbf6dd" stop-opacity=".45"/>
      <stop offset="1" stop-color="#f8f2d6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="nw-sunBody" x1="0.2" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#8cc6cd"/>
      <stop offset=".45" stop-color="#4a8d9b"/>
      <stop offset="1" stop-color="#2b6474"/>
    </linearGradient>
    <filter id="nw-blur18" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="nw-blur10" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
    <symbol id="nw-cloud" viewBox="20 41 117 55">
      <rect x="63" y="43" width="42" height="9" rx="4.5"/>
      <rect x="85" y="47" width="9" height="20"/>
      <rect x="22" y="63" width="113" height="10" rx="5"/>
      <rect x="43" y="68" width="10" height="20"/>
      <rect x="25" y="84" width="56" height="10" rx="5"/>
    </symbol>
    <linearGradient id="nw-legFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2596be" stop-opacity="0"/>
      <stop offset="0.67" stop-color="#2596be" stop-opacity="0"/>
      <stop offset="0.83" stop-color="#2596be" stop-opacity="1"/>
      <stop offset="1" stop-color="#2596be" stop-opacity="1"/>
    </linearGradient>
    <symbol id="nw-torii" viewBox="124 62 432 500">
      <path style="fill:var(--tr)" d="M216 110H244L249 550H211Z M436 110H464L469 550H431Z M331 118h18v76h-18Z M168 192h344v20h-344Z M146 86Q340 124 534 86L532 108Q340 146 148 108Z"/>
      <path style="fill:var(--tb)" d="M126 64Q340 108 554 64L548 85Q340 126 132 85Z"/>
      <path fill="#2596be" d="M208 532h44v28h-44Z M428 532h44v28h-44Z"/>
      <path fill="url(#nw-legFade)" d="M216 110H244L249 550H211Z M436 110H464L469 550H431Z"/>
    </symbol>
  </defs>
  <rect width="1600" height="1066" fill="url(#nw-sky)"/>
  <g>
    <circle cx="815" cy="523" r="560" fill="url(#nw-glow)" opacity=".7"/>
    <g data-part="rays" fill="url(#nw-rayFade)" filter="url(#nw-blur10)"></g>
    <circle cx="815" cy="523" r="306" fill="#fffbea" filter="url(#nw-blur18)"/>
    <circle cx="815" cy="523" r="287" fill="url(#nw-sunBody)"/>
  </g>
  <g data-part="clouds" fill="#eaf4f3"></g>
  <g data-part="waves"></g>
</svg>
<canvas class="news-layer" aria-hidden="true"></canvas>
<svg class="news-layer" viewBox="0 0 1600 1066" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <symbol id="nw-lamp" viewBox="0 0 200 264">
      <rect x="95" y="18" width="10" height="236" fill="#c9b28c"/>
      <rect x="101" y="18" width="4" height="236" fill="#a8916d"/>
      <rect x="91" y="252" width="18" height="10" rx="2" fill="#8f7a5a"/>
      <polygon points="44,30 156,30 162,78 38,78" fill="#d8c7a0" stroke="#d8c7a0" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="47,34 81.3,34 79.7,74 42,74" fill="#1b3048"/>
      <polygon points="83.3,34 116.7,34 118.3,74 81.7,74" fill="#1b3048"/>
      <polygon points="118.7,34 153,34 158,74 120.3,74" fill="#1b3048"/>
      <rect x="58" y="78" width="84" height="5" rx="1.5" fill="#2a3a4a"/>
      <rect x="63" y="83" width="30" height="5" rx="1" fill="#3a4a5a"/>
      <rect x="60" y="87" width="36" height="40" rx="10" fill="#f4f6f5"/>
      <rect x="66" y="92" width="6" height="26" rx="3" fill="#ffffff" opacity="0.9"/>
      <rect x="65" y="125" width="26" height="4" rx="1" fill="#3a4a5a"/>
      <rect x="107" y="83" width="30" height="5" rx="1" fill="#3a4a5a"/>
      <rect x="104" y="87" width="36" height="40" rx="10" fill="#f4f6f5"/>
      <rect x="110" y="92" width="6" height="26" rx="3" fill="#ffffff" opacity="0.9"/>
      <rect x="109" y="125" width="26" height="4" rx="1" fill="#3a4a5a"/>
    </symbol>
  </defs>
  <g data-part="lamps"></g>
</svg>`;
const part = n => host.querySelector(`[data-part="${n}"]`);

/* ───────── 정적 배치 ───────── */

// 빛줄기: 태양 중심에서 사방으로 고르게 퍼지는 짧고 옅은 쐐기. 위에서 오른쪽 30° 부근만 조금 더 길다.
(() => {
  const g = part('rays'), R = rng(11), cx = 815, cy = 523, N = 32, PEAK = -60;
  for (let i = 0; i < N; i++) {
    const deg = i * 360 / N + (R() - .5) * 8, d = mod(deg - PEAK + 180, 360) - 180;
    const a = deg * Math.PI / 180, w = (1.2 + R() * 1.8) * Math.PI / 180, L = 340 + R() * 50 + 90 * Math.exp(-(d * d) / (2 * 16 * 16));
    const p = [[cx, cy], [cx + Math.cos(a - w) * L, cy + Math.sin(a - w) * L], [cx + Math.cos(a + w) * L, cy + Math.sin(a + w) * L]];
    el('polygon', { points: p.map(q => q.map(v => v.toFixed(1)).join(',')).join(' '), opacity: (.22 + R() * .18).toFixed(2) }, g);
  }
})();

// 구름 글리프: 작은 것 다수 + 큰 것 몇 개. 봉우리마다 방향·속도 무작위로 천천히 흐른다
(() => {
  const g = part('clouds'), R = rng(7);
  const list = [], SPAN = VW + 500;
  const put = (x, y, w, op, flip, col) => {
    const h = w * 55 / 117;
    const u = el('use', { href: '#nw-cloud', width: w.toFixed(1), height: h.toFixed(1), opacity: op.toFixed(2) }, g);
    if (col) u.setAttribute('fill', col);
    const v = (R() < .5 ? -1 : 1) * (2 + R() * 5) * (0.7 + w / 180);
    list.push({ u, x, y, w, flip, v });
  };
  anim.push(t => {
    for (const c of list) {
      const x = mod(c.x + c.v * t + 250, SPAN) - 250;
      c.u.setAttribute('transform', c.flip ? `translate(${(x + c.w).toFixed(1)},${c.y.toFixed(1)}) scale(-1,1)` : `translate(${x.toFixed(1)},${c.y.toFixed(1)})`);
    }
  });
  put(10, 150, 190, .95, false); put(1380, 90, 120, .9, true); put(120, 30, 110, .85, false); put(760, 15, 95, .85, true);
  put(1080, 170, 130, .9, false); put(470, 95, 115, .88, true);
  for (let i = 0; i < 117; i++) {
    const x = -40 + R() * 1680, y = 20 + Math.pow(R(), 1.25) * 470;
    const w = 34 + Math.pow(R(), 2.2) * 80;
    put(x, y, w, .55 + R() * .4, R() < .45, R() < .25 ? '#bfdde1' : null);
  }
})();

// 토리이: [발 x, 파도 줄(WAVE_ROWS 인덱스, 이 줄부터 앞쪽 줄이 다리를 가림), 크기, 기울기(도), 팔레트]
const TORII = (() => {
  const NEAR = '--tr:#c3e2e2;--tb:#4f8f9b', MID = '--tr:#d3ebe9;--tb:#77acb4', FAR = '--tr:#dff1ef;--tb:#9cc8cc';
  return [
    [250, 1, .25, 3, FAR], [720, 0, .20, -4, FAR], [905, 1, .19, 5, FAR], [1300, 1, .24, -3, FAR],
    [600, 3, .34, -9, MID], [1020, 3, .37, 5, MID], [1190, 2, .29, -7, MID],
    [70, 5, .43, 6, NEAR], [400, 6, .56, -14, NEAR], [1530, 6, .56, 15, NEAR],
  ];
})();
const drawTorii = (x, y, s, a, pal, g) => {
  const u = el('use', { href: '#nw-torii', x: 124, y: 62, width: 432, height: 500, style: pal }, g);
  u.setAttribute('transform', `translate(${x},${y}) rotate(${a}) scale(${s}) translate(-340,-560)`);
};

// 파도 언덕: 뒤에서 앞으로 줄마다 단색 반타원 봉우리. 봉우리마다 속도·방향이 제각각(초안 기본값 고정)
const WP = {
  SEED: 23,
  PAL: ['#5fb1aa', '#d3f5f3', '#c6cab4', '#058ea4', '#225963'],
  W: [40.9, 19.4, 15.8, 12.1, 11.8],
  SYNC_V: [.55, .63], SLOW_V: [.15, .6], SYNC_BACK: 2, SYNC_P: [.7, .3], REVERSE_P: .5,
  FAST_V: [1.2, 1.45], FAST_N: 5,
  GAP: .75, POS_JITTER: .6, SIZE_VAR: .08, RY: [.58, .64], BASE_JITTER: 10,
  DRIFT: .035, DRIFT_W: [.5, 1.0],
  DEPTH_SPEED: .35, DEPTH_SIZE: .96,
};
const waveMoving = [];
anim.push(t => {
  for (const m of waveMoving) {
    const x = mod(m.x + m.v * SLIDE * t + m.M, m.L) - m.M + m.a * Math.sin(t * m.w + m.ph);
    m.g.setAttribute('transform', `translate(${(x - m.x).toFixed(2)},0)`);
  }
});
const SKIRT_Y = 724; // 바탕 띠 하한: 맨 앞 띠(y 720–728) 안에서 끝나야 띠 아래로 삐져나오지 않음
const WAVE_ROWS = [[560, 46], [573, 50], [585, 53], [598, 57], [611, 61], [624, 65], [638, 69], [652, 75], [668, 81], [684, 88], [703, 96], [722, 104]];
(() => {
  const P = WP, R = rng(P.SEED), g = part('waves');
  const PAL = P.PAL, W = P.W;
  const WSUM = W.reduce((a, b) => a + b, 0);
  const lerp = ([a, b], u) => a + (b - a) * u;
  const pick = () => { let t = R() * WSUM; for (let i = 0; i < PAL.length; i++) { t -= W[i]; if (t <= 0) return i; } return 0; };
  // 한 줄(n개)의 색: 비율대로 개수를 정확히 나눈 뒤 섞고, 이웃이 같은 색이면 자리를 바꿔 떼어 놓는다
  const rowColors = n => {
    const q = W.map(w => w / WSUM * n), cnt = q.map(Math.floor);
    q.map((v, i) => [v - cnt[i], i]).sort((a, b) => b[0] - a[0]).slice(0, n - cnt.reduce((a, b) => a + b, 0)).forEach(([, i]) => cnt[i]++);
    const out = []; cnt.forEach((k, i) => { for (let j = 0; j < k; j++) out.push(i); });
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    for (let i = 1; i < out.length; i++) {
      if (out[i] !== out[i - 1]) continue;
      let done = false;
      for (let j = i + 1; j < out.length; j++) if (out[j] !== out[i]) { [out[i], out[j]] = [out[j], out[i]]; done = true; break; }
      if (done) continue;
      const c = out[i], ok = (k, v) => out[k] !== v && (k === 0 || out[k - 1] !== v) && (k + 1 >= out.length || out[k + 1] !== v);
      for (let k = 0; k < i - 1; k++) if (ok(k, c) && out[k] !== out[i - 1] && (i + 1 >= out.length || out[k] !== out[i + 1])) { [out[i], out[k]] = [out[k], out[i]]; break; }
    }
    return out;
  };
  const dome = (cx, base, rx, ry, fill, parent) => {
    const L = (cx - rx).toFixed(1), Rt = (cx + rx).toFixed(1), B = base.toFixed(1);
    return el('path', { d: `M${L} ${B}A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 1 ${Rt} ${B}Z`, fill }, parent);
  };
  const rows = WAVE_ROWS, last = rows.length - 1;
  const main = W.indexOf(Math.max(...W));
  el('rect', { x: -200, y: rows[0][0] - 8, width: VW + 400, height: SKIRT_Y - rows[0][0] + 8, fill: PAL[main] }, g);
  const back = [...Array(last).keys()];
  for (let i = back.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [back[i], back[j]] = [back[j], back[i]]; }
  const sync = new Set([last, ...back.slice(0, P.SYNC_BACK)]);
  const fastRows = new Set(), fastN = Math.min(P.FAST_N, rows.length);
  while (fastRows.size < fastN) fastRows.add(Math.floor(R() * rows.length));
  rows.forEach(([base, r0], ri) => {
    for (const [x, row, s, a, pal] of TORII) if (row === ri) drawTorii(x, base + 6, s, a, pal, g);
    const front = ri === last;
    const depth = last ? ri / last : 1;
    const r = r0 * (P.DEPTH_SIZE + (1 - P.DEPTH_SIZE) * depth), vk = P.DEPTH_SPEED + (1 - P.DEPTH_SPEED) * depth;
    const pSync = P.SYNC_P[sync.has(ri) ? 0 : 1];
    const M = r * (1 + P.SIZE_VAR + P.DRIFT + .3), L = VW + 2 * M;
    const n = Math.max(1, Math.round(L / (r * P.GAP)));
    const made = [];
    const cols = rowColors(n);
    for (let i = 0; i <= n; i++) {
      const fast = i === n;
      if (fast && !fastRows.has(ri)) break;
      const x = fast ? -M + R() * L : -M + (i + (R() - .5) * P.POS_JITTER) * L / n;
      const rx = r * (1 + (R() * 2 - 1) * P.SIZE_VAR), ry = rx * lerp(P.RY, R()), b = base + (R() - .5) * P.BASE_JITTER;
      const c = fast ? pick() : cols[i];
      made.push({ x, b, rx, ry, c, v: (R() < P.REVERSE_P ? -1 : 1) * lerp(fast ? P.FAST_V : R() < pSync ? P.SYNC_V : P.SLOW_V, R()) * (fast ? 1 : vk), w: lerp(P.DRIFT_W, R()), ph: R() * 6.283, key: R() });
    }
    made.sort((p, q) => p.key - q.key);
    for (const d of made) {
      const dg = el('g', {}, g);
      dome(d.x, d.b, d.rx, d.ry, PAL[d.c], dg);
      waveMoving.push({ g: dg, x: d.x, M, L, v: d.v, a: r * P.DRIFT, w: d.w, ph: d.ph });
    }
    if (front) el('rect', { x: -200, y: base - 2, width: VW + 400, height: 8, fill: '#163a50' }, g);
  });
})();

// 별 패턴(띠 구간) 속도: 초안 기본값 고정
const SP = { KMODE: 'linear', SMODE: 'linear', T: .51, G: 2.2 };
function starKFor(p, mode) {
  p = Math.min(1, Math.max(0, p));
  if (mode === 'log') return 1 - Math.log10(1 + 9 * p);
  if (mode === 'log-rev') return Math.log10(1 + 9 * (1 - p));
  return 1 - p;
}
function starScaleFor(p, mode) {
  p = Math.min(1, Math.max(0, p));
  if (mode === 'log') return Math.log10(1 + 9 * p);
  if (mode === 'log-rev') return 1 - Math.log10(1 + 9 * (1 - p));
  return p;
}

/* ───────── 바닥 타일 (뉴스장면 바닥 타일.html) ───────── */
const HOLD_EXTRA = (42 - 35) * 0.4;
const PAIR_CUT = (118 - 108 + 10) * 0.3;
const FPS = 24, TOTAL = 118 + HOLD_EXTRA - PAIR_CUT, SPEED = 1.35 * 0.8;
const K = (() => {
  const k = { pairOut: [10, 22], rectIn: [18, 28], circIn: [25, 35], rcOut: [42, 51], rtDraw: [51, 77], rtOut: [82, 108], pairIn: [94, 108] };
  for (const n of ['rcOut', 'rtDraw', 'rtOut', 'pairIn']) k[n] = k[n].map(v => v + HOLD_EXTRA);
  k.rcOut = [k.rtDraw[0], (k.rtDraw[0] + k.rtDraw[1]) / 2];
  return k;
})();
const CELL = '#0d2b31', SAND = '#d9c79c';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const prog = (f, [a, b]) => clamp((f - a) / (b - a), 0, 1);
const eIn = t => t * t * t, eOut = t => 1 - Math.pow(1 - t, 3);
const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

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

// 칸 좌표 → 시작 오프셋 (흩뿌림 배열)
function hash(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const rnd = (x, y, s) => (hash(x ^ Math.imul(s, 0x632be5ab), y + s * 7919) >>> 0) / 4294967296;
function vnoise(x, y) {
  const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, sm = t => t * t * (3 - 2 * t);
  const v = (i, j) => rnd(i, j, 3) * 2 - 1;
  const p = v(X, Y) + (v(X + 1, Y) - v(X, Y)) * sm(fx), q = v(X, Y + 1) + (v(X + 1, Y + 1) - v(X, Y + 1)) * sm(fx);
  return p + (q - p) * sm(fy);
}
const SIG = 25, AMP = 50, SCALE = 8, DIAG = 12;
const cdist = (a, b) => { const d = mod(a - b, TOTAL); return Math.min(d, TOTAL - d); };
const memo = new Map();
function computeCell(x, y, sx, sy) {
  const deps = []; if (sx) deps.push(memo.get(`${x - sx},${y}`)); if (sy) deps.push(memo.get(`${x},${y - sy}`));
  const diag = (sx && sy) ? memo.get(`${x - sx},${y - sy}`) : null;
  const t = mod(Math.round(AMP * vnoise(x / SCALE + .37, y / SCALE + .71)), TOTAL);
  if (!deps.length) return t;
  const cands = [], w = []; let tot = 0;
  for (let c = 0; c < TOTAL; c++) {
    let ok = true; for (const n of deps) { const d = cdist(c, n); if (d < 10 || d > 30) { ok = false; break; } }
    if (!ok) continue;
    const dt = cdist(c, t); let ww = Math.exp(-dt * dt / (2 * SIG * SIG));
    if (diag !== null) { const dd = cdist(c, diag); ww *= 1 - Math.exp(-dd * dd / (2 * DIAG * DIAG)); }
    cands.push(c); w.push(ww + 1e-9); tot += ww + 1e-9;
  }
  let r = rnd(x, y, 7) * tot;
  for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) return cands[i]; }
  return cands[cands.length - 1];
}
function offsetOf(x, y) {
  const key = `${x},${y}`; const v = memo.get(key); if (v !== undefined) return v;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const k = `${cx},${cy}`; if (memo.has(k)) { stack.pop(); continue; }
    const sx = Math.sign(cx), sy = Math.sign(cy), need = [];
    if (sx && !memo.has(`${cx - sx},${cy}`)) need.push([cx - sx, cy]);
    if (sy && !memo.has(`${cx},${cy - sy}`)) need.push([cx, cy - sy]);
    if (sx && sy && !memo.has(`${cx - sx},${cy - sy}`)) need.push([cx - sx, cy - sy]);
    if (need.length) { stack.push(...need); continue; }
    memo.set(k, computeCell(cx, cy, sx, sy)); stack.pop();
  }
  return memo.get(key);
}

const TRI_TOP = new Path2D('M5.07 2.1L94.93 2.1L50 47.03Z');
const TRI_BOT = new Path2D('M5.07 97.9L94.93 97.9L50 52.97Z');
const rtCache = new Map();
function rtFor(f) {
  const k = f.toFixed(3);
  let p = rtCache.get(k);
  if (p !== undefined) return p;
  let T, Hd;
  if (f < K.rtOut[0]) { const q = eIO(prog(f, K.rtDraw)); Hd = 2 * q; T = q; }
  else { const q = eIO(prog(f, K.rtOut)); Hd = 1 + q; T = 2 * q; }
  p = Hd - T > 0.0005 ? new Path2D(rtPath(T, Hd)) : null;
  rtCache.set(k, p); return p;
}
function drawTile(g, f) {
  const scaleAt = (cx, cy, s) => { g.translate(cx, cy); g.scale(s, s); g.translate(-cx, -cy); };
  g.fillStyle = CELL; g.fillRect(0, 0, 100, 100);
  g.save();
  g.beginPath(); g.rect(0, 0, 100, 100); g.clip();
  g.strokeStyle = SAND; g.fillStyle = SAND; g.lineJoin = 'miter'; g.miterLimit = 10;
  let off, op;
  if (f < K.pairIn[0]) { const p = eIn(prog(f, K.pairOut)); off = 30 * p; op = 1 - p; }
  else { const q = eOut(prog(f, K.pairIn)); off = 30 * (1 - q); op = q; }
  if (op > 0.001) {
    g.globalAlpha = op; g.lineWidth = 4.2;
    g.save(); g.translate(0, -off); g.stroke(TRI_TOP); g.restore();
    g.save(); g.translate(0, off); g.stroke(TRI_BOT); g.restore();
  }
  const shapeState = (inSeg) => {
    if (f < inSeg[0] || f >= K.rcOut[1]) return { s: 0, o: 0 };
    if (f < K.rcOut[0]) return { s: eOut(prog(f, inSeg)), o: 1 };
    const p = eOut(prog(f, K.rcOut)); return { s: 1 + 0.12 * p, o: 1 - p };
  };
  const r = shapeState(K.rectIn), c = shapeState(K.circIn);
  g.lineWidth = 4.8;
  if (r.o > 0.001 && r.s > 0.0005) {
    g.globalAlpha = r.o; g.save(); scaleAt(50, 97.3, r.s);
    g.strokeRect(3.15, 78.8, 93.7, 18.5); g.restore();
  }
  if (c.o > 0.001 && c.s > 0.0005) {
    g.globalAlpha = c.o; g.save(); scaleAt(49.4, 37.4, c.s);
    g.beginPath(); g.arc(49.4, 37.4, 27.6, 0, Math.PI * 2); g.stroke(); g.restore();
  }
  if (f >= K.rtDraw[0] && f < K.rtOut[1]) {
    const p = rtFor(f);
    if (p) { g.globalAlpha = 1; g.fill(p); }
  }
  g.restore();
  g.globalAlpha = 1;
}

/* ───────── 원근 투영 ─────────
   화면 y의 지평선 거리 dy = y − HORIZON 일 때 깊이 Z = DEPTH / dy (칸 단위), 칸 한 변의 화면 폭 = TILE_K · dy.
   바닥은 FAR_Y부터 화면 아래까지. 깊이 BAND_ROW 칸부터 먼 쪽은 별 패턴 띠 구간 — 가로등과 같은 속도로 스크롤. */
const HORIZON = 537, FAR_Y = 704, TILE_K = 0.355, DEPTH = 3500;
const BAND_ROW = 16;
const LAMP_BASE_Y = 741, LAMP_GAP = 557, LAMP_W = 280, LAMP_TOP = 374;
const LAMP_IN = 3.5;
const SLIDE = (VW / 2 + LAMP_W / 2) / LAMP_IN;
const SLIDE_TILES = SLIDE / (TILE_K * (LAMP_BASE_Y - HORIZON));
const FOG = '150,206,219';

/* ───────── 띠 구간 별 패턴 (바닥패턴.html) ───────── */
const STAR_R = 50, STAR_ROT = Math.PI / 4;
const STAR_COLORS = ['#123E4B', '#C9F2F4', '#375757', '#A9B7A2'];
const starF = n => Math.round(n * 10) / 10;
function starPathFor(k) {
  const c = STAR_R / 2 * (1 - k);
  return `M0 ${-STAR_R} Q${starF(c)} ${starF(-c)} ${STAR_R} 0 Q${starF(c)} ${starF(c)} 0 ${STAR_R} Q${starF(-c)} ${starF(c)} ${-STAR_R} 0 Q${starF(-c)} ${starF(-c)} 0 ${-STAR_R}Z`;
}
function starCoverFor(k) {
  const c = 50 * (1 - k);
  return 100 / (25 + c / 2);
}
const STAR_MAX_GENS = 24;
function starGens(sec) {
  const T = Math.max(.05, SP.T), G = Math.max(.3, SP.G);
  const i0 = Math.floor(sec / T), done = Math.floor((sec - G) / T);
  const out = [];
  for (let k = done; k <= i0; k++) {
    const pRaw = Math.min(1, Math.max(0, (sec - k * T) / G));
    if (pRaw <= 0) continue;
    const ps = starScaleFor(pRaw, SP.SMODE);
    const kk = starKFor(ps, SP.KMODE);
    out.push({ color: STAR_COLORS[((k % 4) + 4) % 4], path: new Path2D(starPathFor(kk)), s: starCoverFor(kk) * ps });
  }
  if (out.length > STAR_MAX_GENS) out.splice(1, out.length - STAR_MAX_GENS);
  return out;
}
function drawBandTile(g, gens) {
  g.globalAlpha = 1;
  g.save();
  g.beginPath(); g.rect(0, 0, 100, 100); g.clip();
  g.fillStyle = gens.length ? gens[0].color : CELL;
  g.fillRect(0, 0, 100, 100);
  g.translate(50, 50);
  g.rotate(STAR_ROT);
  for (const gen of gens) {
    g.save();
    g.scale(gen.s, gen.s);
    g.fillStyle = gen.color;
    g.fill(gen.path);
    g.restore();
  }
  g.restore();
}

const cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
let s = 1, ox = 0, oy = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  s = Math.max(cv.width / VW, cv.height / VH);
  ox = (cv.width - VW * s) / 2; oy = (cv.height - VH * s) / 2;
}

const strips = [];
const stripFor = i => strips[i] || (strips[i] = document.createElement('canvas'));

function render(frame, slide, sec) {
  const W = cv.width, H = cv.height;
  const hy = oy + HORIZON * s, c = DEPTH * s, cx = ox + VW / 2 * s, far = Math.max(0, oy + FAR_Y * s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = CELL; ctx.fillRect(0, far, W, H - far);
  rtCache.clear();
  const bandGens = starGens(sec);

  const rMin = Math.max(1, Math.floor(c / (H - hy))), rMax = Math.ceil(c / (far - hy));
  for (let r = rMin, si = 0; r < rMax; r++, si++) {
    const yTop = Math.max(hy + c / (r + 1), far), yBot = Math.min(hy + c / r, H);
    if (yBot <= yTop) continue;
    const kFar = TILE_K * (yTop - hy);
    const gy = -r, isBand = r >= BAND_ROW, sh0 = isBand ? slide : 0;
    const x0 = Math.floor(-cx / kFar - sh0) - 1, x1 = Math.ceil((W - cx) / kFar - sh0) + 1;
    const R = Math.max(8, Math.min(512, Math.ceil(TILE_K * (yBot - hy))));
    const st = stripFor(si), sg = st.getContext('2d');
    const sw = (x1 - x0) * R;
    if (st.width !== sw || st.height !== R) { st.width = sw; st.height = R; }
    for (let x = x0; x < x1; x++) {
      sg.setTransform(R / 100, 0, 0, R / 100, (x - x0) * R, 0);
      if (isBand) drawBandTile(sg, bandGens);
      else drawTile(sg, (frame + offsetOf(x, gy)) % TOTAL);
    }
    for (let y = Math.floor(yTop); y < Math.ceil(yBot); y++) {
      const yc = Math.max(y, yTop) + 0.5, dy = yc - hy;
      const Z = c / dy, kk = TILE_K * dy;
      const sh = Math.max(0.5, Math.min(R, c / (dy * dy) * R));
      const sy = clamp((r + 1 - Z) * R - sh / 2, 0, R - sh);
      const sx = ((0 - cx) / kk - sh0 - x0) * R, swid = W / kk * R;
      ctx.drawImage(st, sx, sy, swid, sh, 0, y, W, 1);
    }
  }

  // 띠 구간 먼 쪽 안개 (움직이는 타일 경계까지만)
  const bandEnd = hy + c / BAND_ROW;
  if (bandEnd > far) {
    const gr = ctx.createLinearGradient(0, far, 0, bandEnd);
    gr.addColorStop(0, `rgba(${FOG},.85)`); gr.addColorStop(1, `rgba(${FOG},0)`);
    ctx.fillStyle = gr; ctx.fillRect(0, far, W, bandEnd - far);
  }
}

// 가로등: 간격 LAMP_GAP으로 반복, 슬라이드만큼 오른쪽으로 밀고 감싸기
const lampG = part('lamps');
const lamps = [];
for (let i = 0; i < Math.ceil((VW + LAMP_W) / LAMP_GAP) + 1; i++)
  lamps.push(el('use', { href: '#nw-lamp', y: LAMP_TOP, width: LAMP_W, height: (LAMP_W * 264 / 200).toFixed(1) }, lampG));
anim.push(t => {
  const off = mod(102 + t * SLIDE, LAMP_GAP) - LAMP_GAP;
  lamps.forEach((u, i) => u.setAttribute('x', (off + i * LAMP_GAP).toFixed(2)));
});

/* ───────── 재생 ───────── */
// 시간은 멈췄다 다시 올라와도 이어서 간다. 동작 줄이기 설정이면 시간을 멈춘 정지 화면.
const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
let sec = 0, frame = 0, last = null, raf = 0, running = false;
function drawNow() {
  for (const fn of anim) fn(sec);
  render(frame, sec * SLIDE_TILES, sec);
}
function tick(ts) {
  raf = 0;
  if (!running) return;
  if (!RM.matches) {
    if (last !== null) {
      const dt = Math.min(ts - last, 100) / 1000;
      frame = (frame + dt * FPS * SPEED) % TOTAL;
      sec += dt;
    }
    last = ts;
  } else last = null;
  drawNow();
  raf = requestAnimationFrame(tick);
}
let rzT = 0;
window.addEventListener('resize', () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => { resize(); if (running) drawNow(); }, 120);
});
function start() {
  resize();
  drawNow();   // 첫 프레임을 바로 그려 두고 전환이 시작되게 한다
  if (!running) {
    running = true;
    last = null;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  return Promise.resolve();
}
function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

window.TsukuyomiNews = {
  start, stop,
  get running() { return running; },
  get scene() { return 'news'; },
  get bg() { return '#173f4e'; },
};
})();
