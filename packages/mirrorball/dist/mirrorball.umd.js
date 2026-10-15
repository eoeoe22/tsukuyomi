(function (global) {
"use strict";
// mirrorball — 미러볼 하나를 웹페이지에 배치하는 단일 파일 패키지.
// 원본: examples/미러볼 SVG 생성기.html <script> (DOM 슬라이더 결합 제거, 인스턴스화)
// 의존성 없음. ESM 소스. UMD/Min은 build.mjs가 여기서 생성.

const REF = { amb: 0.30, glow: 1.15, pw: 1.4, njit: 1.2, rim: 0.5, side: [0.5, 0.6, 0.64] };
const S = 440, C = 220, R = 200;
const POLE_LIMIT = 60;
const LON_SPAN = 300;
const SLOW = 0.1, LN10 = Math.LN10;

const rad = d => d * Math.PI / 180;
const f2 = n => n.toFixed(2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function hxRGB(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const pm = (c, a) => { const k = Math.min(1, a); return `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`; };

// 원본 opts() 기본값 (슬라이더 초기값 그대로)
const DEFAULTS = {
  tilt: -32, step: 9.5, gap: 0.14, jit: 0.06, off: 1,
  tile: "#dfe4ea", grout: "#d3e3e9", dark: "#5a8696", light: "#eaf7ff", glowC: "#fff3f1",
  pole: 0.3, poleR: 58, veil: 0.8, veilR: 0.36, haze: 0.47,
  bloom: 0.3, teal: 0.6, tjit: 0, sheen: 0.6,
  glint: 0.1, gcount: 6, gturn: 0.22, gspd: 2.5,
  ghold: 0.14, gacc: 0.08, gwhite: 0.74,
  seed: 11, rot: 0, period: 40,
  // 마운트 전용 (렌더 코어와 무관)
  size: 0, autoplay: true, interactive: true,
};
// 원본 input id ghold/gacc/gspd/gwhite 순서와 동일하게 유지. gcount 정수화는 mount에서.

const RIM_STOPS = [[0, 226, 240, 245, 0], [0.6, 226, 240, 245, 0.3], [0.9, 234, 246, 248, 0.8], [1, 238, 247, 249, 0.55]];
const TOPOLOGY_KEYS = ["step", "jit", "off", "seed"];

function sys(tilt) { const T = rad(tilt); return { ct: Math.cos(T), st: Math.sin(T) }; }
function V(lat, lon, s) {
  const la = rad(lat), lo = rad(lon);
  const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
  return [x, y * s.ct - z * s.st, y * s.st + z * s.ct];
}
function Pj(lat, lon, s) { const q = V(lat, lon, s); return [C + R * q[0], C - R * q[1]]; }

function buildTiles(o) {
  const rnd = mulberry32(o.seed), rndR = mulberry32((o.seed ^ 0x85ebca6b) >>> 0), rndB = mulberry32((o.seed ^ 0x27d4eb2f) >>> 0);
  const tiles = [];
  const rows = Math.ceil(180 / o.step);
  for (let i = 0; i < rows; i++) {
    const lat = -90 + i * o.step, lat2 = Math.min(90, lat + o.step), mid = (lat + lat2) / 2;
    const n = Math.max(4, Math.round(360 * Math.cos(rad(mid)) / o.step));
    const ws = []; let sum = 0;
    for (let j = 0; j < n; j++) { const w = 1 + (rnd() * 2 - 1) * o.jit; ws.push(w); sum += w }
    const lonStart = (rnd() * o.off) * (360 / n);
    let lon = lonStart;
    for (let j = 0; j < n; j++) {
      const tw = ws[j] * 360 / sum;
      tiles.push({
        lat, lat2, mid, lon0: lon, tw,
        jLat: (rndR() * 2 - 1) * REF.njit, jLon: (rndR() * 2 - 1) * REF.njit,
        jB: rndB() * 2 - 1,
      });
      lon += tw;
    }
  }
  return tiles;
}

function lit(n, mid, o, jB) {
  const DR = hxRGB(o.dark), TR = hxRGB(o.tile), LR = hxRGB(o.light), GR = hxRGB(o.grout);
  const nz = Math.max(0, n[2]);
  const bb = (REF.amb + REF.glow * Math.pow(Math.max(0, -n[1]), REF.pw)) * (0.45 + 0.55 * nz);
  const pr = Math.max(0.001, rad(o.poleR));
  const pu = Math.max(0, 1 - rad(mid + 90) / pr);
  const f = pu * pu * (3 - 2 * pu);
  const b = bb + o.pole * f * 1.2;
  let fr, fg, fb;
  if (b < 1) {
    const e = 1 - nz, u = clamp((Math.max(0, b) + REF.rim * e * e * e) * (1 - o.teal) + o.tjit * (jB + 1) * 0.5, 0, 1);
    fr = DR[0] + (TR[0] - DR[0]) * u; fg = DR[1] + (TR[1] - DR[1]) * u; fb = DR[2] + (TR[2] - DR[2]) * u;
  } else {
    const u = Math.min(1, b - 1);
    fr = TR[0] + (LR[0] - TR[0]) * u; fg = TR[1] + (LR[1] - TR[1]) * u; fb = TR[2] + (LR[2] - TR[2]) * u;
  }
  const sd = REF.side, w = clamp((1.2 - b) / 0.4, 0, 1);
  const front = [fr, fg, fb];
  const side = [0, 1, 2].map(i => { const d = front[i] * sd[i]; return d + (GR[i] - d) * w; });
  return { b, f, w, front, side };
}

function sheenSpec(t, fx, L, o) {
  if (!(L.w > 0 && o.sheen > 0)) return null;
  const [p0, p1] = t.jB > 1 - 4 * o.tjit ? [fx[1], fx[3]] : [fx[0], fx[2]];
  const c = L.front, sw = L.w * o.sheen, hw = 0.5 * sw;
  return {
    p0, p1, stops: [[0, c.map(v => v * (1 - 0.3 * sw))], [0.5, c], [1, c.map((v, i) => v + ([244, 251, 255][i] - v) * hw)]],
  };
}

function veilSpec(o) {
  const s = sys(o.tilt);
  const cy = C + R * (s.st < 0 ? s.ct : 1);
  const rg = R * 2.1;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const stops = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const u = t / Math.max(0.02, o.veilR);
    const core = Math.exp(-2.2 * u * u);
    const skirt = 0.35 * (1 - sm(0, 1, u * 0.55));
    const tail = o.haze * (1 - 0.5 * t);
    const a = 1 - (1 - o.veil * core) * (1 - o.veil * skirt) * (1 - tail);
    stops.push([t, Math.min(0.96, Math.max(0, a))]);
  }
  const [r, g, b] = hxRGB(o.glowC);
  return { cx: C, cy, rg, stops, r, g, b, on: o.veil > 0 || o.haze > 0 };
}

// ---- 줄눈 빛줄기 ----
function hsl2rgb(h, sat, l) {
  const a = sat * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
function glintRGB(p, w) {
  const h = 60 * (1 - Math.cos(2 * Math.PI * p));
  const c = hsl2rgb(h, 1, 0.55);
  return [255 * w + c[0] * (1 - w), 255 * w + c[1] * (1 - w), 255 * w + c[2] * (1 - w)];
}

function buildRows(st) {
  const m = new Map();
  for (const t of st.tiles) {
    let r = m.get(t.lat);
    if (!r) { r = { lat: t.lat, lat2: t.lat2, edges: [] }; m.set(t.lat, r); }
    r.edges.push(((t.lon0 % 360) + 360) % 360);
  }
  st.rowsInfo = [...m.values()].sort((a, b) => a.lat - b.lat);
  st.rowsInfo.forEach(r => r.edges.sort((a, b) => a - b));
  st.streaks = [];
}
function rowOK(st, i) { const r = st.rowsInfo[i]; return !!r && Math.abs(r.lat) <= POLE_LIMIT && Math.abs(r.lat2) <= POLE_LIMIT; }
function tileAt(st, i, L) {
  const E = st.rowsInfo[i].edges, n = E.length, Ln = ((L % 360) + 360) % 360;
  let j = n - 1;
  for (let q = 0; q < n; q++) { if (E[q] <= Ln) j = q; else break; }
  let ta = E[j], tb = E[(j + 1) % n];
  if (tb <= ta) tb += 360;
  if (Ln < ta) { ta -= 360; tb -= 360; }
  const off = L - Ln;
  return { i, a: ta + off, b: tb + off };
}
function tileCluster(st, t) {
  const out = [t, tileAt(st, t.i, t.a - 0.01), tileAt(st, t.i, t.b + 0.01)];
  const m = (t.a + t.b) / 2;
  for (const r of [t.i + 1, t.i - 1]) {
    if (!rowOK(st, r)) continue;
    const T = tileAt(st, r, m);
    out.push(T, m < (T.a + T.b) / 2 ? tileAt(st, r, T.a - 0.01) : tileAt(st, r, T.b + 0.01));
  }
  return out;
}
function pathCum(P) {
  const cum = [0];
  for (let j = 1; j < P.length; j++) cum.push(cum[j - 1] + Math.abs(P[j][0] - P[j - 1][0]) + Math.abs(P[j][1] - P[j - 1][1]) * Math.cos(rad(P[j][0])));
  return { P, cum, total: cum[cum.length - 1] };
}
function buildPath(st, st0, o) {
  const s = sys(o.tilt), nR = st.rowsInfo.length, p = o.gturn;
  const zv = (la, lo) => V(la, lo + st.rotDeg, s)[2];
  let la = st0.la, x = st0.x, cur = st0, last = 0;
  const P = [[la, x]];
  let arc = 0;
  const x0 = x;
  if (Math.abs(la) > POLE_LIMIT) return { P, cum: [0], total: 0 };
  for (let it = 0; it < 800; it++) {
    if (cur.mode === "v") {
      const row = st.rowsInfo[cur.i];
      const nl = cur.dv > 0 ? row.lat2 : row.lat;
      if (Math.abs(nl) > POLE_LIMIT) break;
      arc += Math.abs(nl - la); la = nl; P.push([la, x]);
      if (zv(la, x) < -0.2) break;
      const side = last ? -last : (Math.random() < 0.5 ? -1 : 1);
      const east = cur.dv > 0 ? side === 1 : side === -1;
      last = side;
      cur = { mode: "h", k: cur.dv > 0 ? cur.i + 1 : cur.i, dh: east ? 1 : -1 };
    } else {
      if (Math.abs(la) > POLE_LIMIT) break;
      const k = cur.k, up = k < nR ? st.rowsInfo[k] : null, dn = k >= 1 ? st.rowsInfo[k - 1] : null;
      let best = 1e9, kind = 0;
      const scan = (E, kd) => {
        for (const e of E) {
          const d = (((e - x) * cur.dh) % 360 + 360) % 360;
          if (d < 1e-6) continue;
          if (d < best - 1e-6) { best = d; kind = kd; } else if (d < best + 1e-6) kind |= kd;
        }
      };
      if (up) scan(up.edges, 1);
      if (dn) scan(dn.edges, 2);
      if (best > 360) break;
      x += cur.dh * best; arc += best * Math.cos(rad(la)); P.push([la, x]);
      if (zv(la, x) < -0.2 || arc > 720 || Math.abs(x - x0) > LON_SPAN) break;
      if (Math.random() < p) {
        const c = [];
        if ((kind & 1) && rowOK(st, k)) c.push({ side: cur.dh > 0 ? -1 : 1, dv: 1, i: k });
        if ((kind & 2) && rowOK(st, k - 1)) c.push({ side: cur.dh > 0 ? 1 : -1, dv: -1, i: k - 1 });
        const ok = c.filter(q => q.side !== last);
        if (ok.length) { const q = ok[Math.floor(Math.random() * ok.length)]; last = q.side; cur = { mode: "v", i: q.i, dv: q.dv }; }
      }
    }
  }
  return pathCum(P);
}
function buildPathV(st, st0, o) {
  const s = sys(o.tilt);
  const zv = (la, lo) => V(la, lo + st.rotDeg, s)[2];
  let la = st0.la, x = st0.x, i = st0.j;
  const dir = st0.dv > 0 ? 1 : -1;
  const P = [[la, x]];
  let arc = 0;
  const x0 = x;
  if (!st.rowsInfo[i] || Math.abs(la) > POLE_LIMIT) return { P, cum: [0], total: 0 };
  for (let it = 0; it < 40; it++) {
    if (!rowOK(st, i)) break;
    const row = st.rowsInfo[i];
    let bj = 0, found = false;
    for (const e of row.edges) {
      let d = ((e - x) % 360 + 360) % 360;
      if (d > 180) d -= 360;
      if (!found || Math.abs(d) < Math.abs(bj)) { bj = d; found = true; }
    }
    if (!found) break;
    if (Math.abs(bj) > 1e-6) { x += bj; arc += Math.abs(bj) * Math.cos(rad(la)); P.push([la, x]); }
    const nl = dir > 0 ? row.lat2 : row.lat;
    if (Math.abs(nl) > POLE_LIMIT) break;
    arc += Math.abs(nl - la); la = nl; P.push([la, x]);
    if (zv(la, x) < -0.2 || arc > 720 || Math.abs(x - x0) > LON_SPAN) break;
    i += dir;
  }
  return pathCum(P);
}
function pathAt(pt, sv) {
  const { P, cum } = pt;
  let j = 0;
  while (j < cum.length - 2 && cum[j + 1] < sv) j++;
  const d = cum[j + 1] - cum[j], t = d > 0 ? Math.min(1, Math.max(0, (sv - cum[j]) / d)) : 0;
  return [P[j][0] + (P[j + 1][0] - P[j][0]) * t, P[j][1] + (P[j + 1][1] - P[j][1]) * t];
}
function travel(s, age) {
  if (age <= 0) return 0;
  const v = s.spd, h = s.hold, a = s.acc;
  if (age < h) return v * SLOW * age;
  let d = v * SLOW * h, t = age - h;
  if (a > 0) {
    if (t < a) return d + v * SLOW * a / LN10 * (Math.pow(10, t / a) - 1);
    d += v * (1 - SLOW) * a / LN10; t -= a;
  }
  return d + v * t;
}

function fireBurst(st, o) {
  if (!st.rowsInfo.length || o.glint <= 0) return;
  const s = sys(o.tilt), dg = 180 / Math.PI;
  let center = null;
  for (let tries = 0; tries < 30 && !center; tries++) {
    const X = Math.random() * 2 - 1, Y = Math.random() * 2 - 1, Z2 = 1 - X * X - Y * Y;
    if (Z2 < 0.25) continue;
    const Z = Math.sqrt(Z2);
    const y = Y * s.ct + Z * s.st, z = -Y * s.st + Z * s.ct;
    const lat = Math.asin(Math.max(-1, Math.min(1, y))) * dg;
    const i = Math.floor((lat + 90) / o.step);
    if (!rowOK(st, i) || !rowOK(st, i + 1) || !rowOK(st, i - 1)) continue;
    center = tileAt(st, i, Math.atan2(X, z) * dg - st.rotDeg);
  }
  if (!center) return;
  const cl = tileCluster(st, center);
  for (let q = cl.length - 1; q > 0; q--) { const r = Math.floor(Math.random() * (q + 1));[cl[q], cl[r]] = [cl[r], cl[q]]; }
  const count = Math.max(1, Math.round(o.gcount));
  for (let n = 0; n < count; n++) {
    const T = cl[n % cl.length], row = st.rowsInfo[T.i];
    const top = Math.random() < 0.5, left = Math.random() < 0.5;
    const la = top ? row.lat2 : row.lat, x = left ? T.a : T.b;
    const vert = Math.random() < 1 / 3;
    let path;
    if (vert) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const j = dir > 0 ? (top ? T.i + 1 : T.i) : (top ? T.i : T.i - 1);
      if (!rowOK(st, j)) continue;
      path = buildPathV(st, { la, x, j, dv: dir }, o);
    } else {
      const k = top ? T.i + 1 : T.i;
      const r = Math.random();
      const st0 = r < 0.34 ? { mode: "v", i: T.i, dv: top ? -1 : 1, la, x }
        : { mode: "h", k, dh: r < 0.67 ? 1 : -1, la, x };
      path = buildPath(st, st0, o);
    }
    if (path.total < 1) continue;
    const red0 = Math.random() < 0.5;
    st.streaks.push({
      path, spd: (300 + Math.random() * 160) * o.gspd, len: 32 + Math.random() * 30, hold: o.ghold, acc: o.gacc,
      t0: st.tNow + (n === 0 ? 0 : Math.random() * 0.08), ph: Math.random(), k: 0.85 + Math.random() * 0.25,
      red0, backG: red0 && Math.random() < 0.5,
    });
  }
}

function streakGeom(st, o) {
  const s = sys(o.tilt), w = o.gwhite;
  const gapPx = Math.max(0.6, o.gap * R * rad(o.step));
  const segs = [];
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  for (const q of st.streaks) {
    if (st.tNow < q.t0) continue;
    const pt = q.path, sHead = travel(q, st.tNow - q.t0), sTail = sHead - q.len;
    const a = Math.max(0, sTail), b = Math.min(pt.total, sHead);
    if (b - a < 0.05) continue;
    const sv = [a, b];
    for (let v = a + 1; v < b; v += 1) sv.push(v);
    for (const c of pt.cum) if (c > a && c < b) sv.push(c);
    sv.sort((p, q2) => p - q2);
    const env = o.glint * q.k;
    const P = sv.map(v => { const [la, lo] = pathAt(pt, v); const z = V(la, lo + st.rotDeg, s); return [C + R * z[0], C - R * z[1], z[2], (v - sTail) / q.len]; });
    const ageC = st.tNow - q.t0, midAcc = q.hold + q.acc * 0.5;
    const redNow = q.red0 && !(q.backG && ageC >= midAcc);
    for (let j = 1; j < P.length; j++) {
      const u = (P[j][3] + P[j - 1][3]) / 2;
      const z = (P[j][2] + P[j - 1][2]) / 2;
      const prof = Math.pow(u, 1.2) * Math.min(1, (1 - u) * 14 + 0.15);
      const al = env * prof * sm(0.02, 0.3, z);
      if (al < 0.01) continue;
      const ph = (redNow ? 0 : 0.5) + u * 0.08 + Math.max(0, ageC) * 0.03;
      segs.push({ x0: P[j - 1][0], y0: P[j - 1][1], x1: P[j][0], y1: P[j][1], a: al, halo: glintRGB(ph, w * 0.7), core: glintRGB(ph, 1 - (1 - w) * 0.3) });
    }
  }
  return { segs, gapPx, hw: gapPx * 2.8 + 3, mw: gapPx * 1.1 + 0.6, cw: Math.max(0.7, gapPx * 0.42) };
}

function visibleTiles(st, o) {
  const s = sys(o.tilt), K = 1 - o.gap, out = [];
  for (const t of st.tiles) {
    const midLon = t.lon0 + t.tw / 2 + st.rotDeg;
    if (V(t.mid, midLon, s)[2] <= 0) continue;
    const lon0 = t.lon0 + st.rotDeg, lon1 = lon0 + t.tw;
    const pts = [Pj(t.lat, lon0, s), Pj(t.lat, lon1, s), Pj(t.lat2, lon1, s), Pj(t.lat2, lon0, s)];
    const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
    const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
    const fx = pts.map(q => [cx + (q[0] - cx) * K, cy + (q[1] - cy) * K]);
    const L = lit(V(t.mid + t.jLat, midLon + t.jLon, s), t.mid, o, t.jB);
    out.push({ t, pts, cx, cy, fx, L, sh: sheenSpec(t, fx, L, o) });
  }
  return out;
}

function drawFrame(st, o) {
  const ctx = st.og;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2);
  ctx.fillStyle = o.grout; ctx.fill(); ctx.clip();
  const tops = [], bots = [], capQ = [];
  for (const { pts, fx, L, sh } of visibleTiles(st, o)) {
    ctx.beginPath();
    pts.forEach((q, k) => { k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.closePath(); ctx.fillStyle = css(L.side); ctx.fill();
    ctx.beginPath();
    fx.forEach((q, k) => { k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.closePath();
    const FS = css(L.front);
    if (sh) {
      const lg = ctx.createLinearGradient(sh.p0[0], sh.p0[1], sh.p1[0], sh.p1[1]);
      for (const [tt, c] of sh.stops) lg.addColorStop(tt, css(c));
      ctx.fillStyle = lg;
    } else ctx.fillStyle = FS;
    ctx.fill();
    tops.push([fx[3], fx[2]]); bots.push([fx[0], fx[1]]);
    if (L.f > 0.15) capQ.push([fx, FS]);
  }
  ctx.strokeStyle = "rgba(222,244,248,0.9)"; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const [a, b] of tops) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of bots) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  const rimG = ctx.createRadialGradient(C, C, R * 0.74, C, C, R);
  for (const [tt, r, g, b, a] of RIM_STOPS) rimG.addColorStop(tt, `rgba(${r},${g},${b},${a})`);
  ctx.fillStyle = rimG; ctx.fillRect(0, 0, S, S);
  const vs = veilSpec(o);
  if (vs.on) {
    const gr = ctx.createRadialGradient(vs.cx, vs.cy, 0, vs.cx, vs.cy, vs.rg);
    for (const [tt, a] of vs.stops) gr.addColorStop(tt, `rgba(${vs.r},${vs.g},${vs.b},${a.toFixed(3)})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S);
  }
  ctx.restore();
  const mctx = st.mctx;
  mctx.clearRect(0, 0, S, S);
  mctx.drawImage(st.off, 0, 0, S, S);
  if (o.bloom > 0 && capQ.length > 0) {
    const og2 = st.og2;
    og2.clearRect(0, 0, S, S);
    for (const [q, c] of capQ) {
      og2.beginPath();
      q.forEach((p, k) => { k ? og2.lineTo(p[0], p[1]) : og2.moveTo(p[0], p[1]); });
      og2.closePath(); og2.fillStyle = c; og2.fill();
    }
    mctx.save();
    mctx.beginPath(); mctx.arc(C, C, R, 0, Math.PI * 2); mctx.clip();
    mctx.globalCompositeOperation = "lighter";
    mctx.filter = `blur(${(4 + o.bloom * 10).toFixed(1)}px)`;
    mctx.globalAlpha = o.bloom * 0.65;
    mctx.drawImage(st.off2, 0, 0, S, S);
    mctx.restore();
  }
  drawStreaks(st, o);
}

function drawStreaks(st, o) {
  if (!st.streaks.length || o.glint <= 0) return;
  const G = streakGeom(st, o);
  if (!G.segs.length) return;
  const mctx = st.mctx, og3 = st.og3;
  const pass = (ctx, width, key, k) => {
    ctx.lineWidth = width;
    for (const g of G.segs) {
      ctx.strokeStyle = pm(g[key], g.a * k);
      ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.lineTo(g.x1, g.y1); ctx.stroke();
    }
  };
  og3.save(); og3.clearRect(0, 0, S, S); og3.lineCap = "round"; og3.globalCompositeOperation = "lighter";
  pass(og3, G.hw, "halo", 0.9);
  og3.restore();
  mctx.save();
  mctx.beginPath(); mctx.arc(C, C, R, 0, Math.PI * 2); mctx.clip();
  mctx.globalCompositeOperation = "lighter";
  mctx.filter = `blur(${(G.hw * 0.45).toFixed(1)}px)`;
  mctx.drawImage(st.off3, 0, 0, S, S);
  mctx.filter = "none";
  mctx.lineCap = "round";
  pass(mctx, G.mw, "halo", 0.85);
  pass(mctx, G.cw, "core", 1.15);
  mctx.restore();
}

function buildSVG(st, o) {
  const uid = st.uid;
  const tops = [], bots = [], tpolys = [], cpolys = [], grads = [];
  const ptsAttr = fx => fx.map(q => `${f2(q[0])},${f2(q[1])}`).join(" ");
  for (const { pts, cx, cy, fx, L, sh } of visibleTiles(st, o)) {
    const rr = (Math.hypot(pts[0][0] - cx, pts[0][1] - cy) + Math.hypot(pts[1][0] - cx, pts[1][1] - cy)
      + Math.hypot(pts[2][0] - cx, pts[2][1] - cy) + Math.hypot(pts[3][0] - cx, pts[3][1] - cy)) / 4 || 1;
    const sw = f2(Math.max(0.4, o.gap * rr));
    let fill = css(L.front);
    if (sh) {
      const id = `${uid}-s` + grads.length;
      grads.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f2(sh.p0[0])}" y1="${f2(sh.p0[1])}" x2="${f2(sh.p1[0])}" y2="${f2(sh.p1[1])}">`
        + sh.stops.map(([tt, c]) => `<stop offset="${tt}" stop-color="${css(c)}"/>`).join("") + `</linearGradient>`);
      fill = `url(#${id})`;
    }
    tpolys.push(`<polygon points="${ptsAttr(fx)}" fill="${fill}" stroke="${css(L.side)}" stroke-width="${sw}"/>`);
    if (L.f > 0.15) cpolys.push(`<polygon points="${ptsAttr(fx)}" fill="${css(L.front)}"/>`);
    tops.push(`M${f2(fx[3][0])} ${f2(fx[3][1])}L${f2(fx[2][0])} ${f2(fx[2][1])}`);
    bots.push(`M${f2(fx[0][0])} ${f2(fx[0][1])}L${f2(fx[1][0])} ${f2(fx[1][1])}`);
  }
  const glowOn = o.bloom > 0 && cpolys.length > 0;
  let defs = `<defs><clipPath id="${uid}-ball"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>` + grads.join("");
  if (glowOn) defs += `<filter id="${uid}-capBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(3 + o.bloom * 5).toFixed(1)}"/></filter>`;
  defs += `<radialGradient id="${uid}-rim" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="${R}">`
    + RIM_STOPS.map(([tt, r, g, b, a]) => `<stop offset="${(0.74 + 0.26 * tt).toFixed(4)}" stop-color="rgb(${r},${g},${b})" stop-opacity="${a}"/>`).join("")
    + `</radialGradient>`;
  const vs = veilSpec(o);
  if (vs.on) defs += `<radialGradient id="${uid}-veil" gradientUnits="userSpaceOnUse" cx="${f2(vs.cx)}" cy="${f2(vs.cy)}" r="${f2(vs.rg)}">`
    + vs.stops.map(([tt, a]) => `<stop offset="${tt.toFixed(4)}" stop-color="rgb(${vs.r},${vs.g},${vs.b})" stop-opacity="${a.toFixed(3)}"/>`).join("")
    + `</radialGradient>`;
  let G = null;
  if (st.streaks.length && o.glint > 0) {
    G = streakGeom(st, o);
    if (G.segs.length) defs += `<filter id="${uid}-glintHalo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f2(G.hw * 0.45)}"/></filter>`;
  }
  defs += `</defs>`;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 440" width="440" height="440">`,
    defs,
    `<circle cx="${C}" cy="${C}" r="${R}" fill="${o.grout}"/>`, `<g clip-path="url(#${uid}-ball)">`];
  for (const p of tpolys) out.push(p);
  out.push(`<path d="${tops.join("")}" stroke="rgb(222,244,248)" stroke-opacity="0.9" stroke-width="1.2" fill="none"/>`);
  out.push(`<path d="${bots.join("")}" stroke="#000000" stroke-opacity="0.2" stroke-width="1" fill="none"/>`);
  out.push(`<circle cx="${C}" cy="${C}" r="${R}" fill="url(#${uid}-rim)"/>`);
  if (vs.on) out.push(`<circle cx="${C}" cy="${C}" r="${R}" fill="url(#${uid}-veil)"/>`);
  if (glowOn) out.push(`<g filter="url(#${uid}-capBlur)" opacity="${(o.bloom * 0.65).toFixed(3)}" style="mix-blend-mode:screen">${cpolys.join("")}</g>`);
  if (G && G.segs.length) {
    const line = (g, key, k, wd) => `<line x1="${f2(g.x0)}" y1="${f2(g.y0)}" x2="${f2(g.x1)}" y2="${f2(g.y1)}" stroke="${pm(g[key], g.a * k)}" stroke-width="${f2(wd)}"/>`;
    out.push(`<g style="mix-blend-mode:screen" stroke-linecap="round">`);
    out.push(`<g filter="url(#${uid}-glintHalo)">${G.segs.map(g => line(g, "halo", 0.9, G.hw)).join("")}</g>`);
    out.push(`${G.segs.map(g => line(g, "halo", 0.85, G.mw)).join("")}${G.segs.map(g => line(g, "core", 1.15, G.cw)).join("")}`);
    out.push(`</g>`);
  }
  out.push(`</g>`, `</svg>`);
  return out.join("\n");
}

let __uid = 0;

function resolveEl(target) {
  if (typeof target === "string") {
    if (typeof document === "undefined") throw new Error("mirrorball: document 없음. target element를 직접 전달하세요.");
    const el = document.querySelector(target);
    if (!el) throw new Error(`mirrorball: '${target}' 요소를 찾을 수 없음`);
    return el;
  }
  return target;
}

function sanitize(o) {
  const out = { ...o };
  out.step = Math.min(15, Math.max(3, +out.step || 9.5));
  out.gcount = Math.max(1, Math.round(+out.gcount || 1));
  out.period = Math.max(1, +out.period || 40);
  return out;
}

class MirrorBall {
  constructor(target, userOpts = {}) {
    this.el = resolveEl(target);
    this.o = sanitize({ ...DEFAULTS, ...userOpts });
    this.uid = `mb${++__uid}`;
    this.rotDeg = +this.o.rot || 0;
    this.playing = this.o.autoplay !== false;
    this.tNow = 0;
    this.tiles = buildTiles(this.o);
    this.rowsInfo = [];
    this.streaks = [];
    this._raf = 0;
    this._last = 0;
    this._disposed = false;

    if (typeof document === "undefined") return; // node 테스트용: 상태만 구성
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    this.dpr = dpr;
    const cv = document.createElement("canvas");
    cv.setAttribute("title", "미러볼을 클릭하면 빛줄기 발사");
    cv.width = S * dpr; cv.height = S * dpr;
    if (this.o.size > 0) { cv.style.width = `${this.o.size}px`; cv.style.height = `${this.o.size}px`; }
    else { cv.style.width = "100%"; cv.style.aspectRatio = "1 / 1"; cv.style.display = "block"; }
    this.el.appendChild(cv);
    this.cv = cv;
    this.mctx = cv.getContext("2d");
    this.mctx.scale(dpr, dpr);
    const mk = () => { const c = document.createElement("canvas"); c.width = S * dpr; c.height = S * dpr; const g = c.getContext("2d"); g.scale(dpr, dpr); return [c, g]; };
    [this.off, this.og] = mk();
    [this.off2, this.og2] = mk();
    [this.off3, this.og3] = mk();
    buildRows(this);

    this._onDown = e => {
      if (e.button > 0 || !this.o.interactive) return;
      if (this._onBall(e)) this.fire();
    };
    this._onMove = e => {
      if (!this.o.interactive) return;
      cv.style.cursor = this._onBall(e) ? "pointer" : "";
    };
    cv.addEventListener("pointerdown", this._onDown);
    cv.addEventListener("pointermove", this._onMove);

    this._last = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const loop = t => {
      if (this._disposed) return;
      const now = typeof t === "number" ? t : Date.now();
      const dt = Math.min(0.1, (now - this._last) / 1000); this._last = now;
      const had = this.streaks.length > 0;
      this.tNow += dt;
      this.streaks = this.streaks.filter(q => travel(q, this.tNow - q.t0) - q.len < q.path.total);
      if (this.playing) {
        this.rotDeg = (this.rotDeg + dt * 360 / this.o.period) % 360;
        drawFrame(this, this.o);
      } else if (had || this.streaks.length) {
        drawFrame(this, this.o);
      }
      this._raf = requestAnimationFrame(loop);
    };
    drawFrame(this, this.o);
    if (typeof requestAnimationFrame !== "undefined") this._raf = requestAnimationFrame(loop);
  }
  _onBall(e) {
    const r = this.cv.getBoundingClientRect();
    const x = (e.clientX - r.left) * S / r.width, y = (e.clientY - r.top) * S / r.height;
    return (x - C) ** 2 + (y - C) ** 2 <= R * R;
  }
  set(partial = {}) {
    const next = sanitize({ ...this.o, ...partial });
    const needRebuild = TOPOLOGY_KEYS.some(k => next[k] !== this.o[k]);
    this.o = next;
    if (partial.rot !== undefined) this.rotDeg = ((+partial.rot % 360) + 360) % 360;
    if (partial.autoplay !== undefined) this.playing = next.autoplay !== false;
    if (needRebuild) { this.tiles = buildTiles(this.o); buildRows(this); }
    if (this.cv) drawFrame(this, this.o);
    return this.get();
  }
  get() { return { ...this.o, rot: Math.round(this.rotDeg), playing: this.playing }; }
  fire() { fireBurst(this, this.o); return this; }
  play() { this.playing = true; return this; }
  pause() { this.playing = false; return this; }
  toggle() { this.playing = !this.playing; return this.playing; }
  toSVG() { return buildSVG(this, this.o); }
  destroy() {
    this._disposed = true;
    if (typeof cancelAnimationFrame !== "undefined" && this._raf) cancelAnimationFrame(this._raf);
    if (this.cv) {
      this.cv.removeEventListener("pointerdown", this._onDown);
      this.cv.removeEventListener("pointermove", this._onMove);
      this.cv.remove();
    }
  }
}

function createMirrorBall(target, opts) { return new MirrorBall(target, opts); }
function mount(target, opts) { return new MirrorBall(target, opts); }

{ MirrorBall, createMirrorBall, mount, DEFAULTS };
const internals = {
  buildTiles, buildRows, visibleTiles, buildSVG, veilSpec, lit, travel, pathCum,
  REF, S, C, R,
};

global.MirrorBall = { MirrorBall, createMirrorBall, mount, DEFAULTS };
if (typeof module !== "undefined" && module.exports) module.exports = global.MirrorBall;
})(typeof globalThis !== "undefined" ? globalThis : window);
