/* 八 야치요의 방: public/examples/yachiyo-room-scene.html 이식 (단일 장면, 옵션 없음).
 * tsukuyomi.html의 다섯 번째 세계(#worldRoom, 경로 #room)로, tsukuyomi.worlds.js가 처음 필요할 때 로드.
 */
(() => {
'use strict';
if (!document.getElementById('roomScene')) return;

'use strict';
let YR = null, I = null;
const cv = document.createElement('canvas'); const ctx = cv.getContext('2d');
const W = 1600, H = 900;
const dpr = Math.min(2, window.devicePixelRatio || 1);
cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);

// ===== 카메라 / 방 치수 (미터) =====
// 카메라 (0, EYE, 0)에서 -z를 바라봄. 화면 = CX + F·x/d, CY − F·(y−EYE)/d
const F = 1400, CX = 800, CY = 502, EYE = 1.6;
const ZB = -17.5;            // 뒷벽
const HX = 7.5;              // 방 반폭
const YK = 4.0, YR_ = 5.2, YC = 6.0;   // 가모이(개구 윗선), 란마 윗선, 천장
const BAYS = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
// 옆벽(방 앞·뒤 끝): ZB~ZW 먼 칸은 원창 회벽, ZW부터 앞은 밖으로 트인 개구
const ZW = -14.5;
// 우측 단 (상단): x DX0 ~ 오른쪽 벽, 높이 DH, 뒷벽부터 화면 앞(DZ1)까지
const DX0 = 3.9, DH = 0.3, DZ1 = -5;
const baseY = x => x > DX0 ? DH : 0;
const proj = (x, y, z) => [CX + F * x / -z, CY - F * (y - EYE) / -z];
const kAt = z => F / -z;
const deg = r => r * 180 / Math.PI;
let D = null;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function poly(g, pts, fill, stroke, sw) {
  g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = sw || 1; g.stroke(); }
}
function line3(g, a, b, stroke, sw) {
  const p = proj(...a), q = proj(...b);
  g.strokeStyle = stroke; g.lineWidth = sw; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
}
// 투시 상자 (천장보·측벽 기둥처럼 깊이 방향으로 긴 것). 카메라 쪽 면만.
function boxP(g, x0, x1, y0, y1, z0, z1, c) {
  const Q = pts => pts.map(p => proj(...p));
  const st = 'rgba(0,0,0,0.35)';
  if (x1 < 0) poly(g, Q([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]), c.s, st, 0.8);
  if (x0 > 0) poly(g, Q([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]), c.s, st, 0.8);
  if (y1 < EYE) poly(g, Q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]), c.t || c.f, st, 0.8);
  if (y0 > EYE) poly(g, Q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]), c.b || c.s, st, 0.8);
  poly(g, Q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]), c.f, st, 0.8);
}
// yachiroom 부품 배치: 부품 원점을 월드 (X,Y,Z)에 두고, 부품 1단위 = ux·uy 미터.
// 같은 깊이 평면 위 물체라 정사영 + 깊이 배율이면 정면은 정확한 투시와 같다.
// 측면 노출은 rot = atan(x/d), 위아래 노출은 tilt = atan((EYE−y)/d)로 근사.
const TAGS = [];
function comp(g, part, X, Y, Z, ux, uy, opts = {}, mirror = false, post) {
  const [sx, sy] = proj(X, Y, Z), k = kAt(Z), d = -Z;
  const o = { ...D, part, rot: deg(Math.atan(X / d)), tilt: deg(Math.atan((EYE - Y) / d)), ...opts };
  if (mirror) o.rot = -o.rot;
  let prims = YR.buildPrims(o);
  if (post) prims = post(prims);
  g.save(); g.translate(sx, sy); g.scale(k * ux / 150 * (mirror ? -1 : 1), k * uy / 150); g.translate(-I.C, -(I.C + 10));
  I.drawPrims(g, prims);
  g.restore();
  TAGS.push({ x: sx, y: sy, t: YR.PART_LABEL[part] || part });
}
// 평면 판 (뒷벽 회벽 등): yachiroom boxPrims를 정면 정사영으로 → 부품과 같은 음영
function wallBox(g, x0, x1, y0, y1, z, colors) {
  const k = kAt(z), o = { wood: colors[0], woodD: colors[1] };
  const prims = I.boxPrims((x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0, y1 - y0, 0.1, 0, I.sysOf(0), k, CX, CY + k * EYE, o);
  prims.forEach(p => p.stroke = null);
  I.drawPrims(g, prims);
}

// ===== 정적 레이어 =====
function sky(g) {
  const kb = kAt(ZB);
  const hz = CY;   // 바다 수평선 = 눈높이
  const gr = g.createLinearGradient(0, CY - kb * 3, 0, hz);
  gr.addColorStop(0, '#113154'); gr.addColorStop(0.7, '#174167'); gr.addColorStop(1, '#1d4c72');
  g.fillStyle = gr; g.fillRect(0, 0, W, hz);
  // 구름 (어두운 덩어리 + 옅은 윗가장자리)
  const r = mulberry32(11);
  for (let i = 0; i < 26; i++) {
    const x = 180 + r() * 1240, y = hz - 20 - r() * 150, rx = 60 + r() * 140, ry = 12 + r() * 22;
    const cg = g.createRadialGradient(x, y, 0, x, y, rx);
    cg.addColorStop(0, 'rgba(35,85,119,0.55)'); cg.addColorStop(1, 'rgba(35,85,119,0)');
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
    g.fillStyle = cg; g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }
  for (let i = 0; i < 220; i++) {
    const x = r() * W, y = r() * (hz - 30), a = 0.25 + r() * 0.6, s = r() < 0.1 ? 1.6 : 0.9;
    g.fillStyle = `rgba(220,230,255,${a})`; g.fillRect(x, y, s, s);
  }
  // 바다
  const sg = g.createLinearGradient(0, hz, 0, hz + 140);
  sg.addColorStop(0, '#0d2441'); sg.addColorStop(1, '#061230');
  g.fillStyle = sg; g.fillRect(0, hz, W, H - hz);
  g.strokeStyle = 'rgba(140,160,220,0.08)'; g.lineWidth = 1;
  for (let i = 1; i < 12; i++) { const y = hz + i * i * 1.2; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
}
function outside(g) {
  // 개구 밖 툇마루 + 난간 (yachiroom kouran)
  const zo = ZB - 2.2;
  // 난간은 개구(±4.5)보다 2m 뒤라 원근상 좁아 보임 → ±5.25까지 넓혀 창 밖을 채움
  const RW = 3.5;
  poly(g, [proj(-5.5, 0, ZB), proj(5.5, 0, ZB), proj(5.5, 0, zo), proj(-5.5, 0, zo)], '#3a2c20');
  for (const xc of [-RW, 0, RW]) comp(g, 'kouran', xc, 0.48, zo + 0.15, RW / 2.6, 0.95 / 0.57, { bars: 9, midRail: true, loStep: 2, upStep: 4 });
}
function ceiling(g) {
  const z1 = -9;
  poly(g, [proj(-HX, YC, ZB), proj(HX, YC, ZB), proj(HX, YC, z1), proj(-HX, YC, z1)], '#2a2018');
  for (let z = ZB + 0.6; z < z1; z += 0.6) line3(g, [-HX, YC, z], [HX, YC, z], 'rgba(0,0,0,0.35)', 1);
  const beam = { f: '#3c2a1b', s: '#2e2015', b: '#4a3421' };
  for (const x of [-4.5, -1.5, 1.5, 4.5]) boxP(g, x - 0.16, x + 0.16, YC - 0.32, YC, ZB, z1, beam);
  for (const z of [-14.5, -11.5]) boxP(g, -HX, HX, YC - 0.4, YC, z - 0.16, z + 0.16, beam);
}
function sideOutside(g) {
  // 옆 개구 밖 툇마루 + 난간. 뒤 난간과 같은 거리(벽에서 2.05m)·높이·동자 간격(아래 2칸·위 4칸)으로 깊이 방향을 따라 놓는다
  const xo = HX + 2.05, z0 = ZB - 2.2, z1 = -5, p = 0.36, w = 0.04;
  const wood = { f: '#4a3421', s: '#3d2a1b', b: '#2e2015', t: '#5a4030' };
  for (const sd of [-1, 1]) {
    const bx = (a, b, y0, y1, za, zb) => boxP(g, Math.min(sd * a, sd * b), Math.max(sd * a, sd * b), y0, y1, za, zb, wood);
    poly(g, [proj(sd * HX, 0, z0), proj(sd * (xo + 0.2), 0, z0), proj(sd * (xo + 0.2), 0, z1), proj(sd * HX, 0, z1)], '#3a2c20');
    for (let z = z0 + 0.15; z < z1; z += 2 * p) bx(xo - w, xo + w, 0.06, 0.48, z - w, z + w);
    for (let z = z0 + 0.15; z < z1; z += 4 * p) bx(xo - w, xo + w, 0.48, 0.9, z - w, z + w);
    for (const [ya, yb] of [[0, 0.12], [0.43, 0.53], [0.84, 0.96]]) bx(xo - w - 0.01, xo + w + 0.01, ya, yb, z0 + 0.1, z1);
  }
}
// 옆벽 원창: x = 일정한 평면 위 원 (뒷벽 marumado와 같은 반지름·살·색)
function sideMarumado(g, x, zc, yc, r) {
  const s = kAt(zc) / 100, N = 48;
  const ring = Array.from({ length: N }, (_, i) => { const a = i / N * Math.PI * 2; return proj(x, yc + r * Math.sin(a), zc + r * Math.cos(a)); });
  poly(g, ring, '#0d162e', '#241a12', 5 * s);
  const bar = (a, b) => line3(g, [x, yc + a[1], zc + a[0]], [x, yc + b[1], zc + b[0]], '#57493a', 3 * s);
  bar([-r, 0], [r, 0]); bar([0, -r], [0, r]);
  bar([-r * 0.5, -r * 0.86], [-r * 0.5, r * 0.86]); bar([r * 0.5, -r * 0.86], [r * 0.5, r * 0.86]);
}
function sideWalls(g) {
  const z1 = -9;
  for (const sd of [-1, 1]) {
    const x = sd * HX;
    // 먼 칸만 회벽 + 허리벽 + 원창. 그 앞(ZW~z1)은 개구로 뚫려 밖 툇마루가 보인다
    poly(g, [proj(x, 0, ZB), proj(x, 0, ZW), proj(x, YK, ZW), proj(x, YK, ZB)], '#4c3f31');
    poly(g, [proj(x, 0, ZB), proj(x, 0, ZW), proj(x, 0.9, ZW), proj(x, 0.9, ZB)], '#3a2f24');
    sideMarumado(g, x, (ZB + ZW) / 2, 2.3, 1.05);
    // 측면 란마 띠
    poly(g, [proj(x, YK, ZB), proj(x, YK, z1), proj(x, YC, z1), proj(x, YC, ZB)], '#1a1510');
    for (let z = ZB + 0.2; z < z1; z += 0.22) line3(g, [x, YK, z], [x, YR_, z], 'rgba(120,95,70,0.55)', 1.6);
    const wood = { f: '#4a3421', s: '#3d2a1b', b: '#2e2015', t: '#5a4030' };
    const xi = x - sd * 0.18, y0 = baseY(x);
    boxP(g, Math.min(x, xi), Math.max(x, xi), y0, y0 + 0.08, ZW, z1, wood);   // 개구 문지방
    boxP(g, Math.min(x, xi), Math.max(x, xi), YK - 0.12, YK + 0.12, ZB, z1, wood);
    boxP(g, Math.min(x, xi), Math.max(x, xi), YR_ - 0.12, YR_ + 0.14, ZB, z1, wood);
    for (const z of [-14.5, -11.5]) {
      const xa = x - sd * 0.36;
      boxP(g, Math.min(x, xa), Math.max(x, xa), 0, YC, z - 0.18, z + 0.18, wood);
    }
  }
}
function floor(g) {
  const z1 = -5;
  const r = mulberry32(3);
  const step = 0.25;
  for (let x = -HX; x < HX - 1e-6; x += step) {
    const v = (r() - 0.5) * 14;
    const c = [64 + v, 45 + v * 0.7, 31 + v * 0.5].map(n => n | 0);
    poly(g, [proj(x, 0, ZB), proj(x + step, 0, ZB), proj(x + step, 0, z1), proj(x, 0, z1)], `rgb(${c})`);
    line3(g, [x, 0, ZB], [x, 0, z1], 'rgba(15,8,4,0.55)', 1);
    for (let z = ZB + r() * 2; z < z1; z += 1.8 + r() * 2.2) line3(g, [x, 0, z], [x + step, 0, z], 'rgba(15,8,4,0.5)', 1);
  }
  // 문지방
  boxP(g, -HX, HX, 0, 0.1, ZB, ZB + 0.25, { f: '#3a2818', s: '#2c1e12', t: '#5a4030' });
  emblem(g, S.embX, S.embZ, S.embR);
}
// 바닥 가운데 원 문양: 붙여주신 맨홀 뚜껑 SVG(680×500, 중심 340,250, 바깥 r 214)를 바닥 평면에 그대로 옮김.
// 색은 금·검정 둘만: SVG의 밝은 회색 → 금, 어두운 회색 → 검정. SVG 1단위 = R/214, SVG 아래(+y) = 앞쪽(+z)
const EMB_T = [   // 80×80 타일 안 T자 4개 (SVG tgrid3 경로)
  [[3, 3], [37, 3], [37, 15], [26, 15], [26, 37], [14, 37], [14, 15], [3, 15]],
  [[43, 3], [55, 3], [55, 14], [77, 14], [77, 26], [55, 26], [55, 37], [43, 37]],
  [[37, 43], [37, 77], [25, 77], [25, 66], [3, 66], [3, 54], [25, 54], [25, 43]],
  [[43, 77], [77, 77], [77, 65], [66, 65], [66, 43], [54, 43], [54, 65], [43, 65]],
];
function emblem(g, xc, zc, R) {
  const s = R / 214;
  const P = (x, y) => proj(xc + (x - 340) * s, 0.001, zc + (y - 250) * s);   // SVG 좌표 → 화면
  const circ = (r, cx = 340, cy = 250, n = 96) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return P(cx + Math.cos(a) * r, cy + Math.sin(a) * r); });
  const GOLD = '#b89040', INK = '#1a120b';
  // 이중 테두리: 214 검정 / 208 금 / 194 검정 / 190 금 / 170 검정 / 166 금 / 160 검정(무늬 바탕)
  [[214, INK], [208, GOLD], [194, INK], [190, GOLD], [170, INK], [166, GOLD], [160, INK]].forEach(([r, c]) => poly(g, circ(r), c));
  // T자 무늬: 타일 원점 (300,210), 주기 80. 반지름 158 원으로 자른다. 칸 경계선(stroke)은 검정 바탕이 대신함
  g.save(); g.beginPath(); circ(158).forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.clip();
  g.fillStyle = GOLD;
  for (let ty = 210 - 160; ty < 410; ty += 80) for (let tx = 300 - 160; tx < 500; tx += 80) for (const T of EMB_T) {
    g.beginPath(); T.forEach(([x, y], i) => { const q = P(tx + x + 0.8, ty + y + 0.8); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); g.fill();
  }
  g.restore();
  // 좌우 열쇠 구멍 (둥근 막대 22×8 + 원 r6)
  for (const kx of [171, 509]) {
    poly(g, circ(6, kx, 250, 24), INK);
    poly(g, [P(kx - 7, 246), P(kx + 7, 246), ...circ(4, kx + 7, 250, 16).slice(12).concat(circ(4, kx + 7, 250, 16).slice(0, 5)), P(kx + 7, 254), P(kx - 7, 254), ...circ(4, kx - 7, 250, 16).slice(4, 13)], INK);
  }
}
function backWall(g) {
  const plaster = [D.plaster, D.plasterD];
  // 란마 뒤 (밖이 비치는 어두운 남색) + 란마 위 벽
  wallBox(g, -HX, HX, YK, YR_, ZB - 0.05, ['#16203a', '#0b1020']);
  wallBox(g, -HX, HX, YR_, YC, ZB, ['#3a2a1c', '#241a12']);
  // 양끝 회벽 + 원창
  for (const [x0, x1] of [[BAYS[0], BAYS[1]], [BAYS[4], BAYS[5]]]) {
    const xc = (x0 + x1) / 2;
    wallBox(g, x0, x1, 0, YK, ZB, plaster);
    wallBox(g, x0, x1, 0, 0.9, ZB + 0.01, ['#4a3e30', '#2c241b']);   // 허리벽
    // 원창: 부품 1단위 = 1.5m → 벽판 3.0×2.25m, 창 반지름 1.05m. 부품 벽판 테두리선은 지움
    comp(g, 'marumado', xc, 2.3, ZB + 0.02, 1.5, 1.5, { roundR: 1.13, rot: 0, tilt: 0 }, false,
      ps => ps.map(p => (p.fill === '#0d162e' || p.k === 'line') ? p : { ...p, stroke: null }));
  }
  // 란마 (칸마다)
  for (let i = 0; i < 5; i++) {
    const x0 = BAYS[i], x1 = BAYS[i + 1];
    comp(g, 'ranma', (x0 + x1) / 2, (YK + YR_) / 2, ZB + 0.05, (x1 - x0 - 0.36) / 2.4, (YR_ - YK) / 0.48, { slats: 15, rot: 0 });
  }
  // 가모이 2단 (전폭)
  comp(g, 'kamoi', 0, YK, ZB + 0.12, (2 * HX) / 3.0, 0.26 / 0.16, { rot: 0 });
  comp(g, 'kamoi', 0, YR_, ZB + 0.12, (2 * HX) / 3.0, 0.3 / 0.16, { rot: 0 });
  // 기둥 6
  for (const x of BAYS) comp(g, 'hashira', x, YC / 2, ZB + 0.18, 0.36 / 0.34, YC / 2.6);
  // 기둥·가모이 이음 금구
  for (const x of BAYS) for (const y of [YK, YR_]) {
    const [sx, sy] = proj(x, y, ZB + 0.3), k = kAt(ZB + 0.3);
    g.fillStyle = '#9a7a34'; g.fillRect(sx - k * 0.28, sy - k * 0.07, k * 0.56, k * 0.14);
    g.fillStyle = 'rgba(255,230,160,0.25)'; g.fillRect(sx - k * 0.28, sy - k * 0.07, k * 0.56, k * 0.035);
  }
}
function dais(g) {
  // 몸체: 옆면(챌판)·윗면
  boxP(g, DX0, HX, 0, DH, ZB, DZ1, { f: '#3a2818', s: '#1c120a', t: '#5a4030' });
  // 윗면 마루판 (깊이 방향 판 + 이음선)
  const r = mulberry32(9), step = 0.3;
  for (let x = DX0 + 0.12; x < HX - 1e-6; x += step) {
    const x1 = Math.min(HX, x + step), v = (r() - 0.5) * 12;
    const c = [78 + v, 56 + v * 0.7, 38 + v * 0.5].map(n => n | 0);
    poly(g, [proj(x, DH, ZB), proj(x1, DH, ZB), proj(x1, DH, DZ1), proj(x, DH, DZ1)], `rgb(${c})`);
    line3(g, [x, DH, ZB], [x, DH, DZ1], 'rgba(15,8,4,0.5)', 1);
    for (let z = ZB + r() * 2; z < DZ1; z += 2 + r() * 2) line3(g, [x, DH, z], [x1, DH, z], 'rgba(15,8,4,0.45)', 1);
  }
  // 가장자리 귀틀 (밝은 윗선)
  boxP(g, DX0, DX0 + 0.12, DH - 0.06, DH + 0.01, ZB, DZ1, { f: '#4a3421', s: '#3d2a1b', t: '#7a5a3c' });
  line3(g, [DX0, DH + 0.01, ZB], [DX0, DH + 0.01, DZ1], 'rgba(255,220,170,0.45)', 2);
  line3(g, [DX0, 0, ZB], [DX0, 0, DZ1], 'rgba(0,0,0,0.6)', 2);
  // 카펫 (적갈색, 테두리 2겹)
  const rug = (x0, x1, z0, z1, c) => poly(g, [proj(x0, DH + 0.01, z0), proj(x1, DH + 0.01, z0), proj(x1, DH + 0.01, z1), proj(x0, DH + 0.01, z1)], c);
  const [ra, rb, za, zb] = [DX0 + 0.55, HX - 0.3, -15.5, -9.6];
  rug(ra, rb, za, zb, '#2a120d');
  rug(ra + 0.12, rb - 0.12, za + 0.12, zb - 0.12, '#6a3a22');
  rug(ra + 0.22, rb - 0.22, za + 0.22, zb - 0.22, '#5a2218');
  const rr = mulberry32(21);
  for (let i = 0; i < 70; i++) {   // 잔무늬
    const x = ra + 0.35 + rr() * (rb - ra - 0.7), z = za + 0.35 + rr() * (zb - za - 0.7), w = 0.08 + rr() * 0.1;
    rug(x - w, x + w, z - w * 0.6, z + w * 0.6, `rgba(150,80,45,${0.25 + rr() * 0.2})`);
  }
}
const SCR = { x: 6.55, z: -17.15, u: 1.25, rot: 0, fold: 70 };
function screens(g) {
  // 충립: 원창 오른쪽(왼쪽은 거울상), 뒷벽 구석에 붙여 거의 정면. 접힌 폭은 옆벽 쪽으로. 우측은 단 위
  // 부품 1폭 = 0.9×1.5 → 배율 1.4: 폭 1.26m, 높이 2.1m
  // 오른쪽 자리는 병풍(byobu)이 대신한다
  for (const sd of [-1]) {
    const X = sd * SCR.x, Z = SCR.z, d = -Z, u = SCR.u;
    const view = deg(Math.atan(Math.abs(X) / d));
    comp(g, 'tsuitate', X, baseY(X) + 0.75 * u + 0.02, Z, u, u, { rot: SCR.rot + view, fold: SCR.fold }, sd > 0);
  }
}

// ===== 병풍 (오른쪽 벽과 나란히, 단 위) =====
// 6폭 지그재그. 평면(x,z)에서 이음매를 차례로 잇는다: 폭 i 방향 = turn[i] ± zig (도, 0 = +x, 90 = +z 카메라 쪽).
// 오른쪽 옆벽 기둥 바로 안쪽에 벽과 평행하게 세워 방 가운데를 보게 한다 → 오른쪽 벽 자리를 병풍이 대신 막는다.
// 방 가운데에서 오른쪽을 보면 참고 이미지 3처럼 정면이 된다
const BYO = {
  x0: 7.0, z0: -16.8, w: 1.0, h: 1.9, zig: 12, turn: [90, 90, 90, 90, 90, 90],
  edge: 0.014, frame: 0.065,          // 검은 옻칠 테 / 초록 비단 테 (m)
  wave: 0.17,                         // 청해파 물결 하나 지름 (m)
  shade: 0.45,                        // 지그재그 명암 (등불을 등진 폭이 어두워지는 정도)
};
const BYO_P = (() => {
  const J = [[BYO.x0, BYO.z0]];
  return BYO.turn.map((t, i) => {
    const a = (t + (i % 2 ? -BYO.zig : BYO.zig)) * Math.PI / 180, p = J[i];
    const dir = [Math.cos(a), Math.sin(a)], q = [p[0] + BYO.w * dir[0], p[1] + BYO.w * dir[1]];
    J.push(q);
    const n = [-dir[1], dir[0]], c = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];   // n: 앞면(방 안쪽) 법선
    const y0 = baseY(c[0]);
    // 폭 위 점 (u: 폭 방향 m, v: 위로 m) → 월드
    const at = (u, v) => [p[0] + dir[0] * u, y0 + v, p[1] + dir[1] * u];
    return { p, q, dir, n, c, y0, at, front: -c[0] * n[0] - c[1] * n[1] > 0, d: Math.hypot(c[0], c[1]) };
  }).sort((A, B) => B.d - A.d);   // 먼 폭부터
})();
// 폭 위 직사각형 (u0..u1, v0..v1) → 화면 다각형
const byoRect = (P, u0, u1, v0, v1) => [P.at(u0, v0), P.at(u1, v0), P.at(u1, v1), P.at(u0, v1)].map(w => proj(...w));
// 폭 로컬 좌표(m, v 위로) → 화면 아핀. 폭 하나의 깊이 차가 작아(≤0.6m / 15m+) 아핀 근사로 충분, 테두리는 정확한 다각형으로 자른다
function byoAffine(g, P) {
  const o = proj(...P.at(0, 0)), ex = proj(...P.at(1, 0)), ey = proj(...P.at(0, 1));
  g.transform(ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]);
}
// 청해파 타일: 붙여주신 SVG와 같은 원 9겹·색. 가로 170·세로 85 단위가 한 주기 → 이음매 없이 반복.
// 아래 줄이 위 줄을 덮도록 y 순서대로 그린다. 화면에 맺힐 크기로 바로 래스터화해 축소 무아레를 피한다
let byoTile = null;
function byoPattern(g) {
  const kM = kAt(-14), Wt = Math.max(8, 2 * Math.round(BYO.wave * kM * dpr / 2)), Ht = Wt / 2;
  if (!byoTile || byoTile.width !== Wt) {
    byoTile = document.createElement('canvas'); byoTile.width = Wt; byoTile.height = Ht;
    const t = byoTile.getContext('2d'), s = Wt / 170;
    t.scale(s, s);
    const R = [85, 75.6, 66.1, 56.7, 47.2, 37.8, 28.3, 18.9, 9.4];
    for (let j = -2; j <= 4; j++) {
      const cy = j * 42.5, off = j % 2 ? 85 : 0;
      for (const cx of [off - 170, off, off + 170]) R.forEach((r, i) => {
        t.fillStyle = i % 2 ? '#1e1c11' : '#8a7d3b'; t.beginPath(); t.arc(cx, cy, r, 0, Math.PI * 2); t.fill();
      });
    }
  }
  const pat = g.createPattern(byoTile, 'repeat'), m = BYO.wave / Wt;
  // 타일 px → 폭 로컬 m. 로컬 v는 위로라 y를 뒤집고, 물결 줄이 폭 윗선에서 시작하게 맞춘다
  pat.setTransform(new DOMMatrix([m, 0, 0, -m, 0, BYO.h]));
  return pat;
}
function byobu(g) {
  const { edge: e, frame: f, w, h } = BYO, pat = byoPattern(g);
  for (const P of BYO_P) {
    // 바닥 닿는 그늘 (앞면 쪽 얇은 띠)
    const s = P.front ? 1 : -1, sh = [[0, 0], [w, 0], [w, 0.14], [0, 0.14]].map(([u, k]) => proj(P.p[0] + P.dir[0] * u + s * P.n[0] * k, P.y0 + 0.012, P.p[1] + P.dir[1] * u + s * P.n[1] * k));
    const gr = g.createLinearGradient(...sh[0], ...sh[3]);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    poly(g, sh, gr);
    poly(g, byoRect(P, 0, w, 0, h), '#0d0b07');
    if (!P.front) { poly(g, byoRect(P, e, w - e, e, h - e), '#2a2416'); continue; }   // 뒷면: 무지
    poly(g, byoRect(P, e, w - e, e, h - e), '#34502a');                               // 초록 비단 테
    // 비단 테 잔무늬 (가는 격자)
    g.save(); pathPts(g, byoRect(P, e, w - e, e, h - e)); g.clip(); byoAffine(g, P);
    g.strokeStyle = 'rgba(10,20,6,0.45)'; g.lineWidth = 0.006;
    for (let v = 0; v < h + w; v += 0.022) { g.beginPath(); g.moveTo(0, v); g.lineTo(w, v - w); g.moveTo(0, v - w); g.lineTo(w, v); g.stroke(); }
    g.restore();
    // 청해파 바탕
    g.save(); pathPts(g, byoRect(P, f, w - f, f * 1.25, h - f)); g.clip(); byoAffine(g, P);
    g.fillStyle = pat; g.fillRect(0, 0, w, h);
    g.restore();
    poly(g, byoRect(P, f, w - f, f * 1.25, h - f), null, 'rgba(0,0,0,0.55)', 1);
    // 지그재그 명암: 가까운 스탠드 등불(오른쪽)을 등지는 폭일수록 어둡게. 빛무늬는 평균 평면에 투영하므로 꺾임은 여기서만 드러난다
    const lx = 5.5 - P.c[0], lz = -15.9 - P.c[1], ln = Math.hypot(lx, lz), cs = Math.max(0, (lx * P.n[0] + lz * P.n[1]) / ln);
    poly(g, byoRect(P, 0, w, 0, h), `rgba(0,0,0,${(BYO.shade * (1 - cs)).toFixed(3)})`);
  }
  // 이음매 (폭 사이 세로선)
  for (const P of BYO_P) line3(g, P.at(0, 0), P.at(0, h), 'rgba(0,0,0,0.7)', 1.2);
  const [tx, ty] = proj(...BYO_P[0].at(w / 2, h / 2));
  TAGS.push({ x: tx, y: ty, t: '병풍' });
}

// ===== 등불 =====
// type: sq(사각뿔대 바닥등) | cy(원통 스탠딩). h = 실제 높이(m)
const LANTERNS = [];
for (const sd of [-1, 1]) LANTERNS.push({ type: 'cy', x: sd * 5.5, z: -15.9, h: 1.75 });
// 사각뿔대: 앞·뒤 줄 각 5개, 같은 x에 놓아 두 줄이 대응(좌우대칭, 가운데 1개)
const SQX = [-3.5, -1.75, 0, 1.75, 3.5];
for (const z of [-15.4, -7.9]) for (const x of SQX) LANTERNS.push({ type: 'sq', x, z, h: 0.5 });
LANTERNS.forEach(L => { L.d = -L.z; L.k = kAt(L.z); L.y0 = baseY(L.x); });

function loadFrame(src) {
  return new Promise(res => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:420px;height:1000px;border:0';
    f.onload = () => res(f);
    f.src = src; document.body.appendChild(f);
  });
}
const svgImg = svg => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });

async function buildLanterns() {
  const [fSq, fCy] = await Promise.all([loadFrame('examples/사각뿔대 랜턴.html'), loadFrame('examples/원통 스탠딩 랜턴 수평투영.html')]);
  const wSq = fSq.contentWindow, wCy = fCy.contentWindow;
  wCy.__api.pause(); wSq.__api.setFlick(1);
  // 랜턴 자체 후광·바닥 빛웅덩이는 이미지 경계에서 잘려 윤곽이 생기므로 빼고, 장면 쪽 빛으로 대신한다.
  // 사각뿔대: 최상위 screen 타원 중 큰 것(바닥 웅덩이 175·S, 블룸 165·S)만 제거. 안쪽 바닥빛(56·S)은 유지
  const sqScene = wSq.scene, sqS = wSq.eval('S');
  wSq.scene = bg => sqScene(bg).filter(p => !(p.k === 'ell' && p.blend === 'screen' && p.rx > 120 * sqS));
  // 원통: 바닥 타원(url(#floor)), 후광 사각형(url(#halo)) 제거.
  // 몸통·띠는 고정, 가운데 종이창 무늬만 돈다 → 무늬 아래(under)·위(over) 두 장으로 받고, 무늬는 매 프레임 사이에 그린다
  const cySVG = layer => wCy.__api.buildSVG(false, { layer })
    .replace(/<ellipse[^>]*fill="url\(#floor\)"[^>]*\/>/g, '')
    .replace(/<rect[^>]*fill="url\(#halo\)"[^>]*\/>/g, '');
  LMOT = JSON.parse(wCy.eval('JSON.stringify(MOTIFS.map(m => ({ th: m.th, layers: m.layers })))'));
  MCOL = JSON.parse(wCy.eval('JSON.stringify(MOTIF_COL)'));
  SPIN_PERIOD = wCy.eval('PERIOD');
  wCy.__api.setSpin(0);
  for (const L of LANTERNS) {
    const tilt = deg(Math.atan((EYE - L.y0 - L.h / 2) / L.d)), rot = Math.atan(L.x / L.d);
    let g, svg;
    if (L.type === 'sq') {
      wSq.__api.setTilt(tilt); wSq.__api.setRot(rot);
      g = wSq.eval('({S, OY, ct, CX, W, H, HH})');
      svg = wSq.__api.buildSVG(false);
      g.ax = g.CX; g.ay = g.OY + g.S * g.HH * g.ct;   // 바닥 중심의 이미지 좌표
      g.units = 2 * g.HH;
    } else {
      wCy.__api.setTilt(tilt); wCy.__api.setRot(Math.PI / 4 + rot);
      g = wCy.eval('({S, OY, ct, st, CX, W, H, YC, Y_FLOOR, Y0, R, rot})');
      svg = cySVG('under');
      L.imgOver = await svgImg(cySVG('over'));
      L.cyg = g;
      g.ax = g.CX; g.ay = g.OY - g.S * (g.YC - g.Y_FLOOR) * g.ct;
      g.units = g.Y_FLOOR - g.Y0;
    }
    L.sd = Math.sign(L.x) || 1;
    L.img = await svgImg(svg);
    const m = (L.k * L.h / g.units) / g.S;              // 화면 px / 이미지 px
    const [sx, sy] = proj(L.x, L.y0, L.z);
    L.sx = sx; L.sy = sy; L.m = m;
    L.dx = sx - g.ax * m; L.dy = sy - g.ay * m; L.dw = g.W * m; L.dh = g.H * m;
  }
  // 빛무늬 투영용 원통 랜턴 기하 (이미지 px 단위 θ·y 좌표)
  CYD = JSON.parse(wCy.eval('JSON.stringify({R, LIGHT_Y, Y_FLOOR, Y0, RAILS, BAND_UP, BAND_LO, BANDS, MOTIFS})'));
  // 물결: 원본 인자로 굵고 크게 다시 만든다 (랜턴 예제 원본은 그대로).
  // 광원 아래·위 줄에서 waveKeep개씩만 남겨 둘레를 아래·위 번갈아 칸으로 나눠 놓는다 → 물결끼리 겹치지 않음
  const WG = wCy.__waveGen;
  if (WG) {
    const C = 2 * Math.PI * CYD.R, gens = CYD.MOTIFS.filter(m => m.gen);
    // 줄마다 waveKeep개만 남김: 3갈래(wave3)를 먼저 빼고, 그래도 많으면 뒤에서부터 뺀다 (순서는 원본 그대로)
    const keep = row => {
      const out = row.slice();
      for (let i = 0; out.length > PAT.waveKeep && i < out.length;) out[i].gen[0] === 'wave3' ? out.splice(i, 1) : i++;
      return out.slice(0, PAT.waveKeep);
    };
    const lo = keep(gens.filter(m => m.gen[1][1] > CYD.LIGHT_Y));
    const up = keep(gens.filter(m => m.gen[1][1] <= CYD.LIGHT_Y));
    const order = [], wLo = PAT.waveSlot, wUp = 2 / (lo.length + up.length) - wLo;   // 칸 너비(둘레 비율)
    for (let i = 0; i < Math.max(lo.length, up.length); i++) {
      if (lo[i]) order.push([lo[i], lo.length && up.length ? wLo : 1 / lo.length]);
      if (up[i]) order.push([up[i], lo.length && up.length ? wUp : 1 / up.length]);
    }
    let s0 = gens.length ? gens[0].gen[1][0] : 0;   // 시작 위치는 원본 첫 물결 자리에 고정
    const waves = order.map(([m, w], i) => {
      if (i) s0 += (order[i - 1][1] + w) / 2 * C;
      const [fn, a] = m.gen, z = PAT.waveSize, amp = a[3] * z;
      const len = Math.min(a[2] * PAT.waveLen, w * C * PAT.waveFit);
      const r = fn === 'wave'
        ? WG.wave(s0, a[1], len, amp, a[4], a[5], a[6] * z, { ...a[7], ...PAT.wave2 })
        : WG.wave3(s0, a[1], len, amp, a[4], { ...a[5], sc: (a[5].sc || 1) * z, ...PAT.wave3 });
      return JSON.parse(JSON.stringify(r));
    });
    CYD.MOTIFS = waves.concat(CYD.MOTIFS.filter(m => !m.gen));   // 물결 먼저 → 매화가 그 위에
  }
  fSq.remove(); fCy.remove();
  LANTERNS.sort((a, b) => b.d - a.d);   // 먼 것부터
}

// ===== 원통 랜턴 빛무늬 투영 =====
// 등 속 점광원에서 원통 표면(θ, y)의 투각·종이무늬를 지난 빛을 방의 평면(뒷벽·옆벽·천장·바닥)에 맺는다.
// 방 안쪽은 볼록 상자라 평면마다 화면 영역으로 잘라 그리면 모서리 경계도 맞는다.
let CYD = null, albedo = null, litLayer = null;
// 도는 종이창 무늬: 등 표면용(LMOT, 랜턴 예제 그대로)·벽 투영용(WALL_MOTIFS, 재배치본), 1회전 초
let LMOT = [], MCOL = null, SPIN_PERIOD = 16, WALL_MOTIFS = [], paperLayer = null, paperSp = null, ALB = null, PBUF = null;
const PAT = {
  col: '255,170,95',
  star: 0.2, starFall: 0.7, starLift: 0.75,   // 위 띠 육각별: 천장·윗벽 넓게, 흐리게. starLift: 종이창 띠 위로 밀어 올림
  starBlur: [4, 9, 16], starBins: [3, 7],   // 맺힌 거리(m)별 번짐(px): 멀수록 흐림
  low: 0.5, lowBlur: 2.5, lowTMAX: 3, // 아래 띠 → 등 바로 아래 바닥에만 (원본처럼)
  paper: 0.24, lit: 0.22, dark: 0.38, paperFall: 1.1, paperBlur: 2.5,   // 종이창: 바탕빛 / 매화·물결 / 어두운 윤곽
  paperRows: 16, paperEdge: 0.18, paperBaseBlur: 16,   // 바탕빛: 가로 줄로 나눠 위아래 가장자리로 갈수록 옅게(가장자리 비율) + 크게 번지게 → 띠 경계가 부드럽게
  paperVS: 0.9, paperLift: 0.06, paperTMAX: 16, paperFloorTMAX: 3,   // 종이창 빛: 위아래 퍼짐을 눌러 수평~살짝 위로, 벽 넓게 (바닥엔 등 근처만)
  // 종이창 무늬 재배치: 원본은 바닥 투영용이라 무늬가 종이창 아래쪽(y≈231)·광원 바로 위(y≈161)에 몰려 있다.
  // 수평 투영이 되도록 두 묶음을 광원 높이 바로 아래·위(이미지 px 오프셋)로 옮긴다. 광원에 가까울수록 벽에 크게 맺힌다.
  motifLo: 11, motifHi: -11, motifVS: 1,
  // 벽 수평 투영: 가로는 실제 광선 방향, 세로는 종이창 띠(가로대 사이)를 랜턴 높이 × wallSpan 범위에 고르게 펼친다.
  // 띠 중앙 = 종이창 중앙 높이 → 위아래로 치우치지 않음. 무늬 묶음도 띠 중앙 기준 ± 오프셋에 둔다
  wallSpan: 1.5, motifFill: 0.92, motifRowGap: 1.2,
  // 물결 무늬 다시 만들기: 굵기·흔들림(waveSize), 길이(waveLen) 배율.
  // 2갈래: 끝 갈래 길고(mid 작을수록) 굵게(wk) / 3갈래: 줄은 가늘게(wk), 끝으로 갈수록 더 가늘게(taper)
  // waveKeep: 광원 아래·위 줄마다 남길 물결 수(넘치면 3갈래부터 뺌), waveSlot: 아래 줄 물결 한 칸의 둘레 비율(위 줄은 나머지), waveFit: 칸 안에서 물결이 차지하는 비율
  waveKeep: 2, waveSlot: 0.32, waveFit: 0.86,
  waveSize: 2.7, waveLen: 1.35, wave2: { stag: 0.8, mid: 0.55, wk: 1.3 }, wave3: { stag: 0.45, split: 0.2, wk: 0.75, taper: 0.45 },
  // 병풍: 등불(1.4m)에 비해 길어(6m) 먼 쪽은 빛이 스치듯 닿는다 → 무늬가 길게 늘고 조금만 돌아도 미끄러진다.
  // byoTMAX: 무늬가 닿는 거리(끝 30%에서 서서히 사라짐), byoDepth: 투영할 때 쓰는 최소 깊이(m). 실제보다 깊게 잡아 스치는 각을 완만하게
  byoTMAX: 4.2, byoDepth: 2.4,
  D0: 1.6, TMAX: 30,
};
const SURF_ALL = (() => {
  const B = ZB, Z1 = -9;
  return [
    { ax: 2, v: B, quads: [[[-HX, YK, B], [HX, YK, B], [HX, YC, B], [-HX, YC, B]],
      [[-HX, 0, B], [-4.5, 0, B], [-4.5, YK, B], [-HX, YK, B]], [[4.5, DH, B], [HX, DH, B], [HX, YK, B], [4.5, YK, B]]] },
    // 옆벽: 먼 칸(원창 회벽) + 개구 위 란마 띠
    { ax: 0, v: -HX, quads: [[[-HX, 0, B], [-HX, 0, ZW], [-HX, YK, ZW], [-HX, YK, B]], [[-HX, YK, B], [-HX, YK, Z1], [-HX, YC, Z1], [-HX, YC, B]]] },
    { ax: 0, v: HX, quads: [[[HX, DH, B], [HX, DH, ZW], [HX, YK, ZW], [HX, YK, B]], [[HX, YK, B], [HX, YK, Z1], [HX, YC, Z1], [HX, YC, B]]] },
    { ax: 1, v: YC, quads: [[[-HX, YC, B], [HX, YC, B], [HX, YC, Z1], [-HX, YC, Z1]]] },
    { ax: 1, v: 0, floor: true, quads: [[[-HX, 0, B], [DX0, 0, B], [DX0, 0, DZ1], [-HX, 0, DZ1]]] },
    // 우측 단: 윗면 + 옆면(챌판, -x 쪽을 봄 → 단 왼쪽의 등만 비춤)
    { ax: 1, v: DH, floor: true, quads: [[[DX0, DH, B], [HX, DH, B], [HX, DH, DZ1], [DX0, DH, DZ1]]] },
    { ax: 0, v: DX0, face: -1, quads: [[[DX0, 0, B], [DX0, 0, DZ1], [DX0, DH, DZ1], [DX0, DH, B]]] },
  ].map(s => { const N = [0, 0, 0]; N[s.ax] = 1; return { ...s, N }; }).concat(
    // 병풍 앞면: 폭마다 따로 투영하면 빛이 비스듬히 닿아 같은 무늬가 이음매마다 크게 어긋나 조각난다.
    // → 폭들의 평균 평면 하나로 투영해 무늬를 잇고, 그리는 영역만 폭 다각형으로 자른다. 지그재그 명암은 byobu()에서
    (() => {
      const F = BYO_P.filter(P => P.front);
      let nx = 0, nz = 0; for (const P of F) { nx += P.n[0]; nz += P.n[1]; }
      const nl = Math.hypot(nx, nz), N = [nx / nl, 0, nz / nl], T = [-N[2], N[0]];
      const js = F.flatMap(P => [P.p, P.q]), v = js.reduce((s, p) => s + N[0] * p[0] + N[2] * p[1], 0) / js.length;
      const us = js.map(p => T[0] * p[0] + T[1] * p[1]);
      return [{ N, v, face: 1, byo: { T, u0: Math.min(...us), u1: Math.max(...us), y0: F[0].y0 },
        quads: F.map(P => [P.at(0, 0), P.at(BYO.w, 0), P.at(BYO.w, BYO.h), P.at(0, BYO.h)]) }];
    })());
})();
const dotN = (s, a) => s.N[0] * a[0] + s.N[1] * a[1] + s.N[2] * a[2];
const mkLayer = () => { const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr); return [c, g]; };
const CAN_FILTER = (() => { try { const g = document.createElement('canvas').getContext('2d'); g.filter = 'blur(1px)'; return g.filter === 'blur(1px)'; } catch (e) { return false; } })();
function clipSurf(g, s) {
  g.beginPath();
  for (const q of s.quads) { q.forEach((p, i) => { const [x, y] = proj(...p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
  g.clip();
  // 병풍 뒤로 가려진 벽·바닥: 병풍 실루엣을 빼고 그린다 (폭끼리는 화면에서 겹치지 않아 evenodd로 충분)
  if (!s.byo) {
    g.beginPath(); g.rect(-10, -10, W + 20, H + 20);
    for (const P of BYO_P) pathAdd(g, byoRect(P, 0, BYO.w, 0, BYO.h));
    g.clip('evenodd');
  }
}
const pathAdd = (g, pts) => { pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
// 원통 표면점 → 월드. 등 방향은 π/4 고정, 좌우 등은 거울상
function cylPt(L, th, y) {
  const s = L.h / (CYD.Y_FLOOR - CYD.Y0), a = th + Math.PI / 4;
  return [L.x + L.sd * CYD.R * s * Math.sin(a), L.y0 + (CYD.Y_FLOOR - y) * s, L.z + CYD.R * s * Math.cos(a)];
}
// (θ,y) 다각형에서 g ≥ 0 인 부분만 남긴다. 경계 교차점은 이분법으로 찾아 g ≥ 0 쪽 점을 쓴다
function clipBy(pts, g) {
  const v = pts.map(([th, y]) => g(th, y));
  if (v.every(x => x >= 0)) return pts;
  if (v.every(x => x < 0)) return null;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length, a = pts[i], b = pts[j];
    if (v[i] >= 0) out.push(a);
    if ((v[i] >= 0) !== (v[j] >= 0)) {
      let p0 = v[i] >= 0 ? a : b, p1 = v[i] >= 0 ? b : a;
      for (let k = 0; k < 12; k++) { const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]; if (g(m[0], m[1]) >= 0) p0 = m; else p1 = m; }
      out.push(p0);
    }
  }
  return out.length >= 3 ? out : null;
}
// 평면 s에 닿는 조건: 0 < t ≤ tmax ⟺ (방향의 법선 성분)·부호 ≥ |거리|/tmax
// 예전엔 한 점이라도 안 닿으면 다각형을 통째로 버려서, 무늬가 돌며 경계를 지날 때 깜빡였다 → 닿는 부분만 잘라 쓴다
// hv: 투영에 쓰는 깊이. 병풍만 byoDepth 이상으로 깊게 → 맺힌 점을 법선 방향으로 (h − hv)만큼 당겨 실제 면 위에 둔다
const reach = (Lp, s, tmax) => {
  const h = s.v - dotN(s, Lp), sg = Math.sign(h), hv = s.byo ? sg * Math.max(Math.abs(h), PAT.byoDepth) : h;
  return { h, hv, sg, c: Math.abs(hv) / tmax, sh: s.N.map(n => n * (h - hv)) };
};
// (θ,y) 다각형을 평면 s에 투영 → 화면 점, 평균 거리. 전혀 안 닿으면 null
// vs: 빛 방향의 세로 성분 배율(1 = 실제 투영, 작을수록 수평으로 납작), lift: 위로 꺾는 양(수평거리 대비), tmax: 최대 도달 거리
function projPoly(L, Lp, pts, s, vs = 1, tmax = PAT.TMAX, lift = 0) {
  const dir = (th, y) => {
    const P = cylPt(L, th, y), dx = P[0] - Lp[0], dz = P[2] - Lp[2];
    const d = [dx, (P[1] - Lp[1]) * vs + lift * Math.hypot(dx, dz), dz], n = Math.hypot(...d);
    return [d[0] / n, d[1] / n, d[2] / n];
  };
  // 바닥·천장은 도달 경계가 원이라, 거기서 다각형을 자르면 잘린 점끼리 잇는 직선이 엉뚱한 조각을 만든다.
  // → 다각형은 먼 거리(FAR)에서만 자르고, 실제 도달 범위(원판)는 그릴 때 캔버스 클립으로 자른다
  const far = s.ax === 1 ? Math.max(4 * tmax, 40) : tmax;
  const { h, hv, sg, c, sh } = reach(Lp, s, far);
  const Q = clipBy(pts, (th, y) => dotN(s, dir(th, y)) * sg - c); if (!Q) return null;
  const out = []; let dsum = 0, dmin = Infinity;
  for (const [th, y] of Q) {
    const n = dir(th, y), t = hv / dotN(s, n);
    out.push(proj(Lp[0] + n[0] * t + sh[0], Lp[1] + n[1] * t + sh[1], Lp[2] + n[2] * t + sh[2])); dsum += Math.min(t, tmax); dmin = Math.min(dmin, t);
  }
  if (dmin > tmax) return null;
  const r = { pts: out, d: dsum / Q.length, tmax };
  if (s.ax === 1) r.disk = diskPts(Lp, s.v, Math.sqrt(Math.max(0, tmax * tmax - h * h)));
  return r;
}
const diskCache = new Map();
function diskPts(Lp, v, rr) {
  const key = Lp.join() + '|' + v + '|' + rr;
  let d = diskCache.get(key);
  if (!d) { d = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * Math.PI * 2; return proj(Lp[0] + rr * Math.cos(a), v, Lp[2] + rr * Math.sin(a)); }); diskCache.set(key, d); }
  return d;
}
// 종이창 띠 → 벽(수직면). 거리와 상관없이 세로 범위가 일정하다
function projWall(L, Lp, pts, s, tmax) {
  const [RA, RB] = CYD.RAILS, mid = (RA + RB) / 2, k = PAT.wallSpan * L.h / (RB - RA), y0 = cylPt(L, 0, mid)[1];
  const dir = th => { const P = cylPt(L, th, mid), dx = P[0] - Lp[0], dz = P[2] - Lp[2], n = Math.hypot(dx, dz); return [dx / n, dz / n]; };
  const { hv, sg, c, sh } = reach(Lp, s, tmax), dn = d => s.N[0] * d[0] + s.N[2] * d[1];   // 수평 방향 · 면 법선
  const Q = clipBy(pts, th => dn(dir(th)) * sg - c); if (!Q) return null;
  const out = []; let dsum = 0;
  for (const [th, y] of Q) {
    const n = dir(th), t = hv / dn(n), wy = y0 + (mid - y) * k;
    out.push(proj(Lp[0] + n[0] * t + sh[0], wy, Lp[2] + n[1] * t + sh[2])); dsum += Math.hypot(t, wy - Lp[1]);
  }
  return { pts: out, d: dsum / Q.length, tmax };
}
// 종이창 빛: 벽은 수평 투영, 바닥은 등 근처만 실제 투영, 천장은 닿지 않음
const projPaper = (L, Lp, P, s, vs, tmax, lift) => s.ax !== 1 ? projWall(L, Lp, P, s, tmax) : s.floor ? projPoly(L, Lp, P, s, vs, tmax, lift) : null;
const pathPts = (g, pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
// r: 투영 결과. 바닥·천장(r.disk)은 도달 원판 안쪽만 칠한다
function fillPts(g, r) {
  if (!r.disk) { pathPts(g, r.pts); g.fill(); return; }
  g.save(); pathPts(g, r.disk); g.clip(); pathPts(g, r.pts); g.fill(); g.restore();
}
const fall = (d, k) => Math.min(1, Math.pow(PAT.D0 / d, k));
function clipYPoly(P, lo, hi) {
  const cut = (Q, keep, yv) => {
    const out = [];
    for (let i = 0; i < Q.length; i++) {
      const a = Q[i], b = Q[(i + 1) % Q.length], ka = keep(a[1]), kb = keep(b[1]);
      if (ka) out.push(a);
      if (ka !== kb) { const t = (yv - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, yv]); }
    }
    return out;
  };
  let Q = cut(P, y => y >= lo, lo); if (Q.length < 3) return null;
  Q = cut(Q, y => y <= hi, hi); return Q.length < 3 ? null : Q;
}
function buildPatterns() {
  const [lc, lg] = mkLayer();
  const LY = CYD.LIGHT_Y, TAU = Math.PI * 2;
  // 위 띠 별 / 아래 띠 별 (한 바퀴분만)
  const holes = b => b.holes.filter(h => h.th >= 0 && h.th < TAU).map(h => h.pts);
  const upHoles = holes(CYD.BANDS[0]), loHoles = holes(CYD.BANDS[1]);
  // 종이창 바탕: 가로대 사이 띠를 조각내고 광원 높이에서 위·아래로 나눔 (천장·바닥은 한쪽만 닿음).
  // 세로로도 여러 줄로 나눠, 가로대 쪽 가장자리일수록 옅게 (w) → 벽에 맺힌 띠 윗선·아랫선이 딱 끊기지 않는다
  const paperSegs = [], N = 96, [RA, RB] = CYD.RAILS;
  const taper = y => { const u = (y - RA) / (RB - RA), e = Math.min(1, Math.min(u, 1 - u) / PAT.paperEdge); return e * e * (3 - 2 * e); };
  const rowsOf = (y0, y1, n) => Array.from({ length: n }, (_, i) => [y0 + (y1 - y0) * i / n, y0 + (y1 - y0) * (i + 1) / n]);
  const nUp = Math.max(1, Math.round(PAT.paperRows * (LY - RA) / (RB - RA)));
  for (const [y0, y1] of [...rowsOf(RA, LY - 0.5, nUp), ...rowsOf(LY + 0.5, RB, PAT.paperRows - nUp)]) {
    const w = taper((y0 + y1) / 2);
    if (w < 0.02) continue;
    for (let k = 0; k < N; k++) {
      const p = [];
      for (let i = 0; i <= 3; i++) p.push([TAU * (k + i / 3) / N, y0]);
      for (let i = 3; i >= 0; i--) p.push([TAU * (k + i / 3) / N, y1]);
      p.w = w; paperSegs.push(p);
    }
  }
  // 모든 면을 합친 영역 (번진 바탕빛이 개구부·하늘로 새지 않게)
  const clipAll = g => { g.beginPath(); for (const s of SURF_ALL) for (const q of s.quads) { q.forEach((p, i) => { const [x, y] = proj(...p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); } g.clip(); };
  // 무늬 묶음(광원 아래 / 위)을 통째로 옮겨 묶음 중심이 광원 높이 ± 오프셋에 오게 한다 (모양은 그대로)
  const motifs = (() => {
    const yc = m => { let lo = 1e9, hi = -1e9; for (const l of m.layers) for (const p of l.polys) for (const [, y] of p) { lo = Math.min(lo, y); hi = Math.max(hi, y); } return (lo + hi) / 2; };
    const hh = m => { let lo = 1e9, hi = -1e9; for (const l of m.layers) for (const p of l.polys) for (const [, y] of p) { lo = Math.min(lo, y); hi = Math.max(hi, y); } return (hi - lo) / 2; };
    const mid = (CYD.RAILS[0] + CYD.RAILS[1]) / 2, grp = [[], []];
    for (const m of CYD.MOTIFS) grp[yc(m) > LY ? 0 : 1].push(m);
    // 묶음 중심을 띠 중앙 ± 오프셋에 둔 뒤, 높이가 거의 같은 무늬끼리 한 줄로 묶는다
    const ms = grp.flatMap((g, gi) => {
      const c = g.reduce((s, m) => s + yc(m), 0) / (g.length || 1), off = mid + (gi ? PAT.motifHi : PAT.motifLo) - c;
      return g.map(m => ({ m, c: yc(m) + off, h: hh(m) }));
    }).sort((a, b) => a.c - b.c);
    const rows = [];
    for (const o of ms) { const r = rows[rows.length - 1]; if (r && o.c - r[r.length - 1].c < PAT.motifRowGap) r.push(o); else rows.push([o]); }
    // 줄을 띠 높이 × motifFill 안에 위에서 아래로 같은 간격으로 늘어놓는다 (모양·줄 안 위치는 그대로) → 위아래 무게가 고르다
    const T = (CYD.RAILS[1] - CYD.RAILS[0]) / 2 * PAT.motifFill, hm = Math.max(...ms.map(o => o.h));
    const out = [];
    rows.forEach((r, i) => {
      const rc = r.reduce((s, o) => s + o.c, 0) / r.length;
      const sp = Math.max(0, T - hm), ty = rows.length > 1 ? mid - sp + 2 * sp * i / (rows.length - 1) : mid;
      for (const { m, c } of r) out.push([m, ty + (c - rc) - yc(m)]);
    });
    return out.map(([m, dy]) => {
      return { ...m, layers: m.layers.map(l => ({ ...l, polys: l.polys.map(p => p.map(([th, y]) => [th, y + dy])) })) };
    });
  })();
  WALL_MOTIFS = motifs;
  for (const L of LANTERNS) {
    if (L.type !== 'cy') continue;
    const Lp = cylPt(L, 0, LY); Lp[0] = L.x; Lp[2] = L.z;
    // 등이 면의 뒤쪽에 있으면 그 면은 비추지 않음 (챌판)
    const SURF = SURF_ALL.filter(s => !s.face || Math.sign(dotN(s, Lp) - s.v) === s.face);
    L.Lp = Lp; L.SURF = SURF;
    // 1) 종이창 바탕빛(크게 번짐): 둘레가 고르므로 회전과 무관 → 한 번만 굽는다. 무늬는 paperLight()에서 매 프레임
    const [bc, bgc] = mkLayer();
    for (const s of SURF) {
      bgc.save(); clipSurf(bgc, s);
      for (const P of paperSegs) { const r = projPaper(L, Lp, P, s, PAT.paperVS, ptmOf(s), PAT.paperLift); if (!r) continue; bgc.fillStyle = `rgba(${PAT.col},${PAT.paper * P.w * fall(r.d, PAT.paperFall)})`; fillPts(bgc, r); }
      bgc.restore();
    }
    const [pc, pg] = mkLayer();
    pg.save(); clipAll(pg);
    if (CAN_FILTER) pg.filter = `blur(${PAT.paperBaseBlur * dpr}px)`;
    pg.drawImage(bc, 0, 0, W, H); pg.filter = 'none'; pg.restore();
    L.paperBase = pc;
    lg.globalCompositeOperation = 'lighter';
    // 2) 육각별 (띠는 고정): 위 띠는 거리별로 점점 더 번지게, 아래 띠는 바닥에 비교적 또렷이
    const bins = PAT.starBlur.map(() => mkLayer()), [oc, og] = mkLayer();
    for (const s of SURF) {
      for (const [c, g] of bins) { g.save(); clipSurf(g, s); }
      og.save(); clipSurf(og, s);
      for (const P of upHoles) {
        const r = projPoly(L, Lp, P, s, 1, s.byo ? PAT.byoTMAX : PAT.TMAX, PAT.starLift); if (!r) continue;
        const bi = r.d < PAT.starBins[0] ? 0 : r.d < PAT.starBins[1] ? 1 : 2, g = bins[bi][1];
        g.fillStyle = `rgba(${PAT.col},${PAT.star * fall(r.d, PAT.starFall)})`; fillPts(g, r);
      }
      if (s.floor) for (const P of loHoles) {
        const r = projPoly(L, Lp, P, s, 1, PAT.lowTMAX); if (!r) continue;
        og.fillStyle = `rgba(${PAT.col},${PAT.low * fall(r.d, 1)})`; fillPts(og, r);
      }
      for (const [c, g] of bins) g.restore();
      og.restore();
    }
    bins.forEach(([c], i) => { if (CAN_FILTER) lg.filter = `blur(${PAT.starBlur[i] * dpr}px)`; lg.drawImage(c, 0, 0, W, H); });
    if (CAN_FILTER) lg.filter = `blur(${PAT.lowBlur * dpr}px)`;
    lg.drawImage(oc, 0, 0, W, H); lg.filter = 'none';
    lg.globalCompositeOperation = 'source-over';
  }
  litSrc = lc;
  refreshAlbedo();
  PBUF ={ l: mkLayer(), p: mkLayer(), r: mkLayer(), m: mkLayer(), d: mkLayer() };
  for (const L of LANTERNS) if (L.type === 'cy') { L.maskLit = reachMask(L, true); L.maskDark = reachMask(L, false); }
  paperSp = null;
}
const ptmOf = s => s.byo ? PAT.byoTMAX : s.floor ? PAT.paperFloorTMAX : PAT.paperTMAX;
// 벽(수직면)은 광원 높이를 지나도 투영이 이어지므로 나누지 않는다. 천장·바닥만 광원 위·아래로 나눈다
const splitLY = (P, s) => s.ax !== 1 ? [P] : [clipYPoly(P, -1e9, CYD.LIGHT_Y - 0.5), clipYPoly(P, CYD.LIGHT_Y + 0.5, 1e9)].filter(Boolean);
// 반사광 = 표면색(어둡게 하기 전) × 빛. 어두운 나무·란마에서도 무늬가 보이게 표면색을 밝은 쪽으로 끌어올림.
// 바닥 원 문양을 옮기면 표면색이 바뀌므로 다시 부른다
let litSrc = null;
function refreshAlbedo() {
  const [ac, ag] = mkLayer();
  ag.drawImage(albedo, 0, 0, W, H);
  ag.globalCompositeOperation = 'screen'; ag.fillStyle = 'rgb(110,100,90)'; ag.fillRect(0, 0, W, H);
  ALB = ac;
  if (litSrc) litLayer = reflect(litSrc, mkLayer());
}
function reflect(src, [rc, rg]) {
  rg.globalCompositeOperation = 'source-over'; rg.fillStyle = '#000'; rg.fillRect(0, 0, W, H);
  rg.globalCompositeOperation = 'lighter'; rg.drawImage(src, 0, 0, W, H); rg.drawImage(src, 0, 0, W, H);
  rg.globalCompositeOperation = 'multiply'; rg.drawImage(ALB, 0, 0, W, H);
  rg.globalCompositeOperation = 'source-over';
  return rc;
}
// 종이창 무늬 밝기 지도 (등마다 한 번): 화면 픽셀 → 그 자리 면 위 점 → 광원까지 거리로 세기를 정한다.
// 다각형마다 평균 거리로 밝기를 정하면, 면에 비스듬히 닿아 길게 늘어난 무늬 꼬리가 멀리까지 밝게 쓸고 지나가며 깜빡였다.
// 픽셀 단위로 거리 감쇠(lit만) + 도달 거리 끝 30% 페이드 → 잘리는 경계에선 이미 0이라 끊김이 없다
function reachMask(L, lit) {
  const MW = 400, MH = 225, c = document.createElement('canvas'); c.width = MW; c.height = MH;
  const g = c.getContext('2d'), im = g.createImageData(MW, MH), Lp = L.Lp, O = [0, EYE, 0];
  const inQ = (s, P) => s.byo ? (() => { const B = s.byo, u = B.T[0] * P[0] + B.T[1] * P[2]; return u >= B.u0 - 1e-3 && u <= B.u1 + 1e-3 && P[1] >= B.y0 - 1e-3 && P[1] <= B.y0 + BYO.h + 1e-3; })() : s.quads.some(q => [0, 1, 2].every(a => a === s.ax || (P[a] >= Math.min(...q.map(v => v[a])) - 1e-3 && P[a] <= Math.max(...q.map(v => v[a])) + 1e-3)));
  for (let py = 0; py < MH; py++) for (let px = 0; px < MW; px++) {
    const dv = [((px + 0.5) * W / MW - CX) / F, -((py + 0.5) * H / MH - CY) / F, -1];
    let best = Infinity, bs = null, hit = null;
    for (const s of SURF_ALL) {
      const t = (s.v - dotN(s, O)) / dotN(s, dv); if (!(t > 0) || t >= best) continue;
      const P = [O[0] + dv[0] * t, O[1] + dv[1] * t, O[2] + dv[2] * t];
      if (!inQ(s, P)) continue;
      best = t; bs = s; hit = P;
    }
    if (!bs || !L.SURF.includes(bs) || (bs.ax === 1 && !bs.floor)) continue;
    const dh = Math.hypot(hit[0] - Lp[0], hit[2] - Lp[2]), d3 = Math.hypot(dh, hit[1] - Lp[1]);
    const tm = ptmOf(bs), rd = bs.ax === 1 ? d3 : dh;
    const f = Math.max(0, Math.min(1, (tm - rd) / (0.3 * tm))) * (lit ? fall(d3, PAT.paperFall) : 1);
    const i = (py * MW + px) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(f * 255);
  }
  g.putImageData(im, 0, 0);
  return c;
}
// 종이창 무늬 투영 (도는 부분): 바탕빛 위에 어두운 윤곽을 파내고 밝은 무늬를 얹는다. sp = 무늬 회전각
// 회전 방향: 모든 등이 위에서 볼 때 반시계(앞면이 오른쪽으로). 왼쪽 등은 cylPt에서 거울상(sd = −1)이라 θ를 반대로 돌려야 실제로 반시계가 된다
function paperLight(sp) {
  const [lc, lg] = PBUF.l, [pc, pg] = PBUF.p, [mc, mg] = PBUF.m, [dc, dg] = PBUF.d;
  lg.clearRect(0, 0, W, H);
  for (const L of LANTERNS) {
    if (L.type !== 'cy') continue;
    const dth = L.sd * sp;
    const ms = WALL_MOTIFS.map(m => ({ layers: m.layers.map(l => ({ lit: l.lit, polys: l.polys.map(p => p.map(([th, y]) => [th + dth, y])) })) }));
    // 밝은 무늬(mg)·어두운 윤곽(dg)을 따로 모은 뒤 밝기 지도를 곱한다 → 바탕빛에서 윤곽을 파내고 무늬를 더함
    for (const g of [mg, dg]) { g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H); }
    mg.globalCompositeOperation = 'lighter';
    mg.fillStyle = `rgba(${PAT.col},${PAT.lit})`; dg.fillStyle = `rgba(0,0,0,${PAT.dark})`;
    for (const s of L.SURF) {
      if (s.ax === 1 && !s.floor) continue;
      mg.save(); dg.save(); clipSurf(mg, s); clipSurf(dg, s);
      const ptm = ptmOf(s);
      for (const m of ms) for (const layer of m.layers) {
        const g = layer.lit ? mg : dg;
        for (const poly of layer.polys) for (const P of splitLY(poly, s)) {
          const r = projPaper(L, L.Lp, P, s, PAT.motifVS, ptm, PAT.paperLift); if (r) fillPts(g, r);
        }
      }
      mg.restore(); dg.restore();
    }
    mg.globalCompositeOperation = dg.globalCompositeOperation = 'destination-in';
    mg.drawImage(L.maskLit, 0, 0, W, H); dg.drawImage(L.maskDark, 0, 0, W, H);
    pg.globalCompositeOperation = 'source-over'; pg.clearRect(0, 0, W, H);
    pg.drawImage(L.paperBase, 0, 0, W, H);
    pg.globalCompositeOperation = 'destination-out'; pg.drawImage(dc, 0, 0, W, H);
    pg.globalCompositeOperation = 'lighter'; pg.drawImage(mc, 0, 0, W, H);
    pg.globalCompositeOperation = 'source-over';
    lg.globalCompositeOperation = 'lighter';
    if (CAN_FILTER) lg.filter = `blur(${PAT.paperBlur * dpr}px)`;
    lg.drawImage(pc, 0, 0, W, H); lg.filter = 'none';
    lg.globalCompositeOperation = 'source-over';
  }
  paperLayer = reflect(lc, PBUF.r);
  paperSp = sp;
}
// 등 표면의 종이창 무늬 (랜턴 예제 projSurf·draw와 같은 계산, 이미지 px → 화면)
function lanternMotifs(g, L, sp) {
  const c = L.cyg, off = sp;   // 등 이미지는 거울상이 아니므로 +sp = 위에서 볼 때 반시계 (랜턴 예제와 같음)
  const P = ([th, y]) => {
    let a = th + c.rot + off; a = Math.atan2(Math.sin(a), Math.cos(a));
    a = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a));
    const x = c.R * Math.sin(a), z = c.R * Math.cos(a);
    return [L.dx + L.m * (c.CX + c.S * x), L.dy + L.m * (c.OY - c.S * ((c.YC - y) * c.ct - z * c.st))];
  };
  const path = polys => { g.beginPath(); for (const q of polys) { q.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); } };
  for (const m of LMOT) {
    if (Math.cos(m.th + c.rot + off) <= 0.12) continue;
    const ls = m.layers;
    if (ls.length === 2 && !ls[0].lit && ls[1].lit) {
      path([...ls[0].polys, ...ls[1].polys]); g.fillStyle = MCOL.dark; g.fill('evenodd');
      path(ls[1].polys); g.fillStyle = MCOL.lit; g.fill();
    } else for (const ly of ls) { path(ly.polys); g.fillStyle = ly.lit ? MCOL.lit : MCOL.dark; g.fill(); }
  }
}

// ===== 그리기 =====
const S = { dark: 96, glowSq: 50, glowCy: 85, pat: 90, flicker: false, spin: true, tags: false,
  embX: -2.46, embZ: -11.64, embR: 0.8 };   // 바닥 원 문양 위치(m)·반지름(m)
let base = null, albedoDirty = false;
function buildBase() {
  base = document.createElement('canvas'); base.width = W * dpr; base.height = H * dpr;
  const g = base.getContext('2d'); g.scale(dpr, dpr);
  TAGS.length = 0;
  sky(g); outside(g); sideOutside(g); ceiling(g); sideWalls(g); floor(g); backWall(g); dais(g); screens(g); byobu(g);
  if (!albedo || albedoDirty) {
    if (!albedo) [albedo] = mkLayer();
    const ag = albedo.getContext('2d'); ag.setTransform(1, 0, 0, 1, 0, 0); ag.clearRect(0, 0, albedo.width, albedo.height);
    ag.setTransform(dpr, 0, 0, dpr, 0, 0); ag.drawImage(base, 0, 0, W, H);
    if (albedoDirty && ALB) refreshAlbedo();
    albedoDirty = false;
  }
  // 밤 실내: 곱하기로 전체를 어둡게 (푸른 기)
  const a = S.dark / 100;
  const c = [255 - 190 * a, 255 - 192 * a, 255 - 180 * a].map(n => n | 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${c})`; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}
// 중심 색 rgb, 세기 a. 반경 끝에서 값과 기울기가 함께 0이 되어 경계선이 생기지 않는다.
function glow(rgb, a, n = 16) {
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, f = Math.pow(1 - t * t, 3); return [t, `rgba(${rgb},${(a * f).toFixed(4)})`]; });
}
function radial(g, x, y, rx, ry, stops) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
}
let clock = 0, spinClock = 0;   // spinClock: 원통 랜턴 종이창 무늬 회전 시간 (멈추면 그 자리에서 정지)
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(base, 0, 0, W, H);
  // 종류별 불빛 세기 (사각뿔대 바닥등 / 원통 스탠딩)
  const GL = L => (L.type === 'cy' ? S.glowCy : S.glowSq) / 100, GC = S.glowCy / 100;
  if (!ready) { vignette(); return; }
  ctx.globalCompositeOperation = 'screen';
  // 일렁임: 모든 등불이 같은 타이밍
  const fl = S.flicker ? 1 + 0.06 * Math.sin(clock * 3.65) + 0.04 * Math.sin(clock * 6.55) : 1;
  for (const L of LANTERNS) {
    L.fl = fl;
    const big = L.type === 'cy', G = GL(L);
    const r = (big ? 3.4 : 1.5) * L.k;
    const ry = r * Math.sin(Math.atan(EYE / L.d)) * 1.15;
    radial(ctx, L.sx, L.sy, r, ry, glow('255,150,70', 0.55 * G * fl));
    // 주변 벽·공기로 번지는 빛
    const cy = L.sy - L.h * 0.55 * L.k, rr = (big ? 4.2 : 1.6) * L.k;
    radial(ctx, L.sx, cy, rr, rr, glow('255,145,60', (big ? 0.32 : 0.16) * G * fl));
  }
  // 원통 랜턴 빛무늬 (벽·천장·바닥): 육각별·바탕빛은 고정(litLayer), 종이창 무늬만 회전(paperLayer)
  const sp = (spinClock * Math.PI * 2 / SPIN_PERIOD) % (Math.PI * 2);
  if (litLayer) {
    if (paperSp !== sp) paperLight(sp);
    ctx.globalCompositeOperation = 'lighter';
    const pa = S.pat / 100 * GC * fl;   // 빛무늬는 원통 랜턴에서만 나옴
    for (const layer of [litLayer, paperLayer]) {
      ctx.globalAlpha = Math.min(1, pa);
      ctx.drawImage(layer, 0, 0, W, H);
      if (pa > 1) { ctx.globalAlpha = Math.min(1, pa - 1); ctx.drawImage(layer, 0, 0, W, H); }
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
  // 원통 랜턴: 몸통(무늬 아래) → 도는 종이창 무늬 → 띠·가로대·테(무늬 위)
  for (const L of LANTERNS) {
    ctx.drawImage(L.img, L.dx, L.dy, L.dw, L.dh);
    if (L.imgOver) { lanternMotifs(ctx, L, sp); ctx.drawImage(L.imgOver, L.dx, L.dy, L.dw, L.dh); }
  }
  // 등불 블룸
  ctx.globalCompositeOperation = 'screen';
  for (const L of LANTERNS) {
    const cy = L.sy - L.h * (L.type === 'cy' ? 0.62 : 0.45) * L.k, r = L.h * 0.9 * L.k;
    radial(ctx, L.sx, cy, r, r, glow('255,190,110', 0.3 * GL(L) * L.fl));
  }
  ctx.globalCompositeOperation = 'source-over';
  vignette();
  if (S.tags) drawTags();
}
function vignette() {
  const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
function drawTags() {
  ctx.save(); ctx.font = '12px system-ui';
  const seen = new Set();
  for (const t of TAGS) {
    const key = t.t + Math.round(t.y / 40);
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, Math.PI * 2); ctx.fill();
    if (seen.has(key)) continue; seen.add(key);
    const w = ctx.measureText(t.t).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(t.x + 5, t.y - 16, w, 18);
    ctx.fillStyle = '#ffd27a'; ctx.fillText(t.t, t.x + 10, t.y - 3);
  }
  for (const L of LANTERNS) {
    const t = L.type === 'cy' ? '원통 스탠딩' : '사각뿔대';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; const w = ctx.measureText(t).width + 10;
    ctx.fillRect(L.sx - w / 2, L.sy + 4, w, 18); ctx.fillStyle = '#9fd0ff'; ctx.fillText(t, L.sx - w / 2 + 5, L.sy + 17);
  }
  ctx.restore();
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
S.flicker = false; S.spin = !reduce;
let ready = false, built = false, building = null;
const view = document.getElementById('roomScene');
const vg = view ? view.getContext('2d') : null;
let vw = 0, vh = 0, vdpr = 1, raf = 0, running = false, last = 0;
function resize() {
  if (!view || !vg) return;
  vdpr = Math.min(2, window.devicePixelRatio || 1);
  vw = window.innerWidth; vh = window.innerHeight;
  view.width = Math.max(1, Math.round(vw * vdpr)); view.height = Math.max(1, Math.round(vh * vdpr));
  if (ready || built) present();
}
let rzT = 0;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(resize, 120); });
function present() {
  if (!view || !vg || !built) return;
  if (vw <= 0 || vh <= 0) return;
  const s = Math.max(vw / W, vh / H), dw = W * s, dh = H * s;
  vg.setTransform(vdpr, 0, 0, vdpr, 0, 0);
  vg.fillStyle = '#05070d'; vg.fillRect(0, 0, vw, vh);
  vg.drawImage(cv, (vw - dw) / 2, (vh - dh) / 2, dw, dh);
}
const _drawInner = draw;
draw = function () {
  if (!built) return;
  _drawInner();
  present();
};
function ensureYR() {
  if (window.YachiRoom) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'examples/lib/yachiroom.umd.js';
    s.onload = () => window.YachiRoom ? resolve() : reject(new Error('yachiroom 없음'));
    s.onerror = () => reject(new Error('yachiroom 로드 실패'));
    document.head.appendChild(s);
  });
}
function init() {
  if (building) return building;
  building = baseReady().then(() => buildLanterns()).then(() => {
    buildPatterns(); ready = true; draw();
  }).catch(e => { console.warn('[room] 장면 생성 실패:', e); });
  return building;
}
let baseDone = false, basePromise = null;
function baseReady() {
  if (baseDone) return Promise.resolve();
  if (basePromise) return basePromise;
  basePromise = ensureYR().then(() => {
    YR = window.YachiRoom; I = YR.internals; D = YR.DEFAULTS;
    buildBase(); built = true; baseDone = true;
    draw();
  }).catch(e => { console.warn('[room] 방 생성 실패:', e); basePromise = null; throw e; });
  return basePromise;
}
function frame(now) {
  if (!running) { raf = 0; return; }
  const dt = Math.min(0.1, Math.max(0, now - last) / 1000); last = now;
  clock += dt; if (S.spin) spinClock += dt;
  if (S.flicker || S.spin) draw();
  raf = requestAnimationFrame(frame);
}
function start() {
  resize();
  if (!running) {
    running = true;
    last = performance.now();
    draw();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  init();
  return baseReady();
}
function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
function setScene() {}
resize();
window.TsukuyomiRoom = { start, stop, setScene,
  get running() { return running; },
  get scene() { return 'room'; },
  get bg() { return '#05070d'; },
};
window.__ROOM__ = { get ready() { return ready; }, start, stop };

})();
