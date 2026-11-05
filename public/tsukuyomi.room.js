/* 八 야치요의 방: 초안 yachiyo-room-scene.html(examples/ 임시 폴더) 이식.
 * 시점 3개: 방(main) / 병풍 정면(front) / 스탠딩 랜턴 근접(lantern, 참고 references/standinglantern.png). setView로 바꾼다.
 * 런타임 의존 파일(랜턴 iframe 2종, yachiroom.umd.js)은 public/components/에 복사본을 둔다.
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
const projMain = (x, y, z) => [CX + F * x / -z, CY - F * (y - EYE) / -z];
// 지금 그리는 시점의 투영. 병풍 정면 뷰를 구울 때만 잠시 projFront로 바꾼다(buildFront)
let proj = projMain;
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
function sideOutside(g, sides = [-1, 1], z0 = ZB - 2.2, z1 = -5) {
  // 옆 개구 밖 툇마루 + 난간. 뒤 난간과 같은 거리(벽에서 2.05m)·높이·동자 간격(아래 2칸·위 4칸)으로 깊이 방향을 따라 놓는다
  const xo = HX + 2.05, p = 0.36, w = 0.04;
  const wood = { f: '#4a3421', s: '#3d2a1b', b: '#2e2015', t: '#5a4030' };
  for (const sd of sides) {
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
// o: 정면 뷰에서 단 길이(z0~z1)·카펫 자리(rz0~rz1, 양끝 폭 가운데까지)·앞 모서리까지 깔기(edge)를 바꿀 때만 넘긴다
function dais(g, o = {}) {
  const { z0: Z0 = ZB, z1: Z1 = DZ1, rz0 = -15.5, rz1 = -9.6 } = o;
  // 몸체: 옆면(챌판)·윗면
  boxP(g, DX0, HX, 0, DH, Z0, Z1, { f: '#3a2818', s: '#1c120a', t: '#5a4030' });
  // 윗면 마루판 (깊이 방향 판 + 이음선)
  const r = mulberry32(9), step = 0.3;
  for (let x = DX0 + 0.12; x < HX - 1e-6; x += step) {
    const x1 = Math.min(HX, x + step), v = (r() - 0.5) * 12;
    const c = [78 + v, 56 + v * 0.7, 38 + v * 0.5].map(n => n | 0);
    poly(g, [proj(x, DH, Z0), proj(x1, DH, Z0), proj(x1, DH, Z1), proj(x, DH, Z1)], `rgb(${c})`);
    line3(g, [x, DH, Z0], [x, DH, Z1], 'rgba(15,8,4,0.5)', 1);
    for (let z = Z0 + r() * 2; z < Z1; z += 2 + r() * 2) line3(g, [x, DH, z], [x1, DH, z], 'rgba(15,8,4,0.45)', 1);
  }
  // 가장자리 귀틀 (밝은 윗선)
  boxP(g, DX0, DX0 + 0.12, DH - 0.06, DH + 0.01, Z0, Z1, { f: '#4a3421', s: '#3d2a1b', t: '#7a5a3c' });
  line3(g, [DX0, DH + 0.01, Z0], [DX0, DH + 0.01, Z1], 'rgba(255,220,170,0.45)', 2);
  line3(g, [DX0, 0, Z0], [DX0, 0, Z1], 'rgba(0,0,0,0.6)', 2);
  // 카펫: 넝쿨 무늬, 얇은 테 한 줄. edge면 단 앞 모서리까지 깐다(정면 뷰)
  const rug = (x0, x1, z0, z1, c) => poly(g, [proj(x0, DH + 0.01, z0), proj(x1, DH + 0.01, z0), proj(x1, DH + 0.01, z1), proj(x0, DH + 0.01, z1)], c);
  const [ra, rb, za, zb] = [DX0 + (o.edge ? 0.13 : 0.55), HX - 0.3, rz0, rz1];
  rug(ra, rb, za, zb, '#22100a');
  rugWeave(g, ra + 0.05, rb - 0.05, za + 0.06, zb - 0.06);
}
// ===== 카펫 무늬 (참고 이미지 yachiyoroom3) =====
// 어두운 적갈 바탕에 주황 넝쿨(C자 고리·S자 줄기)과 작은 꽃송이 줄. 선은 직조처럼 점선으로 끊기고 바탕엔 가는 사선 결.
// 타일은 카펫 평면 좌표(u = z 가로, v = x 깊이, m)로 한 번 그린다. 반 칸 엇갈린 두 줄이 한 주기
const RUG = { res: 420, pu: 0.78, pv: 1.0, ground: '#4c1a0e', ink: 'rgba(196,92,38,0.9)', weave: 'rgba(0,0,0,0.13)' };
// res: 타일 px/m. 화면에 맺힐 크기에 맞춰 시점마다 따로 굽는다(멀리서 크게 줄이면 점선이 지글거린다)
const rugTiles = new Map();
function rugTileCanvas(res) {
  let rugTile = rugTiles.get(res);
  if (rugTile) return rugTile;
  const { pu, pv } = RUG, TW = Math.round(pu * res), TH = Math.round(pv * res);
  rugTile = document.createElement('canvas'); rugTile.width = TW; rugTile.height = TH; rugTiles.set(res, rugTile);
  const t = rugTile.getContext('2d');
  t.fillStyle = RUG.ground; t.fillRect(0, 0, TW, TH);
  t.scale(res, res);   // 이제부터 m 단위
  // 한 칸 무늬(1 × 0.65 단위로 그려 pu × pv/2에 맞춘다). 타일 밖으로 넘친 부분은 이웃 위치에도 그려 이음매 없이 잇는다
  // 한 칸: 넝쿨 고리(두 겹 원호, 안에 꽃) + S자 줄기(두 겹, Y 갈래) + 꽃송이 줄이 뼈대.
  // 여기에 잎·작은 덩굴손·점 꽃을 덧붙여 빽빽하게 한다. 고리 안쪽은 말린 끝 대신 꽃을 둬 달팽이처럼 보이지 않게
  const cell = () => {
    const r = mulberry32(31);   // 칸마다 같은 배치 (이웃 복사본과 어긋나지 않게)
    const TAU = Math.PI * 2, CX0 = 0.26, CY0 = 0.33;
    const dash = (w, on = 0.016, off = 0.009) => { t.lineWidth = w; t.setLineDash([on, off]); };
    t.strokeStyle = RUG.ink; t.fillStyle = RUG.ink; t.lineCap = 'round';
    // 잎: 뾰족한 잎 윤곽(점선) + 잎맥
    const leaf = (x, y, ang, L) => {
      t.save(); t.translate(x, y); t.rotate(ang); dash(0.005, 0.01, 0.006);
      t.beginPath(); t.moveTo(0, 0); t.quadraticCurveTo(L * 0.5, -L * 0.34, L, 0); t.quadraticCurveTo(L * 0.5, L * 0.34, 0, 0); t.stroke();
      t.setLineDash([]); t.lineWidth = 0.0035; t.beginPath(); t.moveTo(L * 0.12, 0); t.lineTo(L * 0.8, 0); t.stroke();
      t.restore();
    };
    // 작은 덩굴손: (x, y)에서 각 ang로 뻗다 끝이 바깥으로 작게 말린다
    const curl = (x, y, ang, L, dir = 1) => {
      dash(0.006, 0.012, 0.007);
      const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L, rr = L * 0.22, na = ang + dir * Math.PI / 2;
      t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + Math.cos(ang - dir * 0.5) * L * 0.6, y + Math.sin(ang - dir * 0.5) * L * 0.6, ex, ey); t.stroke();
      const cx = ex + Math.cos(na) * rr, cy = ey + Math.sin(na) * rr;
      t.beginPath(); t.arc(cx, cy, rr, na + Math.PI, na + Math.PI + dir * TAU * 0.8, dir < 0); t.stroke();
    };
    // 다섯 잎 꽃
    const flower = (x, y, R) => {
      t.setLineDash([]);
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - Math.PI / 2; t.beginPath(); t.ellipse(x + Math.cos(a) * R, y + Math.sin(a) * R, R * 0.75, R * 0.45, a, 0, TAU); t.fill(); }
      t.save(); t.fillStyle = RUG.ground; t.beginPath(); t.arc(x, y, R * 0.45, 0, TAU); t.fill(); t.restore();
      t.beginPath(); t.arc(x, y, R * 0.25, 0, TAU); t.fill();
    };
    // 넝쿨 고리: 두 겹 원호 + 안쪽 가는 세 번째 원호
    for (const [rr, w] of [[0.15, 0.009], [0.172, 0.009], [0.122, 0.005]]) { dash(w); t.beginPath(); t.arc(CX0, CY0, rr, Math.PI * 0.95, Math.PI * 2.75); t.stroke(); }
    flower(CX0, CY0, 0.034);                                   // 고리 안 꽃
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + 0.2; t.beginPath(); t.arc(CX0 + Math.cos(a) * 0.085, CY0 + Math.sin(a) * 0.085, 0.006, 0, TAU); t.fill(); }   // 꽃 둘레 점
    // 고리 바깥 잎·덩굴손
    leaf(CX0 + 0.172 * Math.cos(-2.3), CY0 + 0.172 * Math.sin(-2.3), -2.3, 0.075);
    leaf(CX0 + 0.172 * Math.cos(-1.1), CY0 + 0.172 * Math.sin(-1.1), -1.3, 0.07);
    leaf(CX0 + 0.172 * Math.cos(2.0), CY0 + 0.172 * Math.sin(2.0), 2.2, 0.07);
    curl(CX0 + 0.172 * Math.cos(0.75 * Math.PI), CY0 + 0.172 * Math.sin(0.75 * Math.PI), 2.6, 0.09, -1);
    // S자 줄기: 고리 오른쪽에서 다음 칸 고리 왼쪽으로 (두 겹 + Y 갈래)
    dash(0.009);
    t.beginPath(); t.moveTo(0.43, 0.36); t.bezierCurveTo(0.58, 0.46, 0.66, 0.18, 0.86, 0.3); t.bezierCurveTo(0.95, 0.35, 1.02, 0.42, 1.09, 0.38); t.stroke();
    t.beginPath(); t.moveTo(0.43, 0.39); t.bezierCurveTo(0.58, 0.49, 0.66, 0.21, 0.86, 0.33); t.stroke();
    t.beginPath(); t.moveTo(0.7, 0.26); t.quadraticCurveTo(0.72, 0.18, 0.66, 0.13); t.moveTo(0.7, 0.26); t.quadraticCurveTo(0.77, 0.2, 0.8, 0.12); t.stroke();
    // 줄기 잎·Y 갈래 끝 덩굴손·아래로 처진 가는 곁가지
    leaf(0.52, 0.41, 1.2, 0.07); leaf(0.6, 0.36, -1.9, 0.065); leaf(0.8, 0.29, -1.2, 0.06); leaf(0.95, 0.37, 1.4, 0.065);
    curl(0.66, 0.13, -2.2, 0.06, 1); curl(0.8, 0.12, -0.9, 0.06, -1);
    dash(0.005, 0.012, 0.007);
    t.beginPath(); t.moveTo(0.86, 0.32); t.bezierCurveTo(0.84, 0.42, 0.78, 0.46, 0.74, 0.5); t.stroke();
    flower(0.72, 0.15, 0.022);
    // 꽃송이 줄: 가로로 퍼진 작은 꽃잎 덩어리
    t.setLineDash([]);
    for (const [cx, cy, n, wd] of [[0.72, 0.52, 26, 0.28], [0.27, 0.08, 20, 0.26], [0.56, 0.05, 14, 0.18], [0.06, 0.55, 14, 0.18]]) {
      for (let k = 0; k < n; k++) {
        const x = cx + (r() - 0.5) * wd, y = cy + (r() - 0.5) * 0.08, a = 0.005 + r() * 0.008;
        t.beginPath(); t.ellipse(x, y, a * 1.5, a, (r() - 0.5) * 0.8, 0, TAU); t.fill();
      }
      t.beginPath(); t.ellipse(cx, cy, 0.016, 0.011, 0, 0, TAU); t.fill();
      leaf(cx - wd * 0.55, cy, Math.PI + 0.3, 0.05); leaf(cx + wd * 0.55, cy, -0.3, 0.05);   // 송이 양끝 잎
    }
    // 점 꽃: 빈 자리 메우기
    for (const [cx, cy] of [[0.47, 0.18], [0.5, 0.58], [0.95, 0.12], [0.08, 0.2], [0.38, 0.56]]) {
      t.beginPath(); t.arc(cx, cy, 0.005, 0, TAU); t.fill();
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + 0.3; t.beginPath(); t.arc(cx + Math.cos(a) * 0.016, cy + Math.sin(a) * 0.016, 0.005, 0, TAU); t.fill(); }
    }
  };
  // cell을 두 줄(둘째 줄은 반 칸 밀림)·이웃 타일 위치에 반복
  for (const [ox, oy] of [[0, 0], [pu / 2, pv / 2]]) for (const dx of [-pu, 0, pu]) for (const dy of [-pv, 0, pv]) {
    t.save(); t.translate(ox + dx, oy + dy); t.scale(pu, pv / 1.3); cell(); t.restore();
  }
  // 직조 얼룩: 바탕색 잔점으로 선·꽃을 군데군데 끊는다
  const rs = mulberry32(37);
  t.fillStyle = RUG.ground;
  for (let i = 0; i < 9000; i++) t.fillRect(rs() * pu, rs() * pv, 0.002 + rs() * 0.004, 0.0015 + rs() * 0.002);
  // 직조 결: 가는 사선
  t.strokeStyle = RUG.weave; t.lineWidth = 0.0025;
  for (let k = -pv; k < pu + pv; k += 0.009) { t.beginPath(); t.moveTo(k, 0); t.lineTo(k + pv * 0.35, pv); t.stroke(); }
  return rugTile;
}
// 바닥에 카펫 무늬 붙이기: 두 시점 모두 같은 깊이는 화면에서 한 가로줄이므로, 줄마다 그 깊이에 맞는 배율로 패턴을 채운다
// (깊이 방향 원근을 줄 단위로 맞추는 방식이라 아핀 하나로 붙일 때의 일그러짐이 없다).
// 무늬 방향은 월드에 고정: 타일 u = z, v = x. 정면 뷰는 z가 가로·x가 깊이, 본 장면은 x가 가로·z가 깊이
function rugWeave(g, x0, x1, z0, z1) {
  const fr = proj === projFront, kNear = fr ? FV.F / (x0 - FV.x) : F / -z1;   // 카펫 가장 가까운 줄의 px/m
  const res = Math.max(120, Math.min(RUG.res, Math.round(kNear * dpr / 8) * 8));
  const pat = g.createPattern(rugTileCanvas(res), 'repeat'), m = 1 / res;
  const pts = [proj(x0, DH, z0), proj(x1, DH, z0), proj(x1, DH, z1), proj(x0, DH, z1)];
  const ys = pts.map(p => p[1]), step = 0.5;
  // 화면 줄 Y → 깊이 좌표 w(정면: x, 본: z), 가로 배율 s, 깊이당 Y 변화 dY
  const row = fr
    ? Y => { const d = FV.F * (FV.y - DH) / (Y - FV.CY); return { w: FV.x + d, s: FV.F / d, dY: -(Y - FV.CY) / d }; }
    : Y => { const d = F * (EYE - DH) / (Y - CY); return { w: -d, s: F / d, dY: (Y - CY) / d }; };
  g.save(); pathPts(g, pts); g.clip(); g.fillStyle = pat;
  for (let Y = Math.min(...ys); Y < Math.max(...ys); Y += step) {
    const Yc = Y + step / 2, { w, s, dY } = row(Yc);
    // 타일 px (pu, pv) → 화면
    pat.setTransform(new DOMMatrix(fr
      ? [s * m, 0, 0, dY * m, FV.CX - s * FV.z, Yc - dY * w]     // X = CX + s·(z − FV.z), Y = Yc + dY·(x − w)
      : [0, dY * m, s * m, 0, CX, Yc - dY * w]));                 // X = CX + s·x,          Y = Yc + dY·(z − w)
    g.fillRect(0, Y, W, step + 0.35);
  }
  g.restore();
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
  x0: 7.0, z0: -16.8, w: 1.0, h: 1.9, zig: 24, turn: [90, 90, 90, 90, 90, 90],
  edge: 0.014, frame: 0.065,          // 검은 옻칠 테 / 초록 비단 테 (m)
  wave: 0.17,                         // 청해파 물결 하나 지름 (m)
  shade: 0.45,                        // 지그재그 명암 (등불을 등진 폭이 어두워지는 정도)
  lamp: [5.5, -15.9],                 // 명암 기준 빛 (본 장면: 오른쪽 스탠드 등 / 정면 뷰: 관찰자 쪽)
};
const BYO_LAMP = BYO.lamp;
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
// 폭 로컬 좌표(m, v 위로)로 그리기: 폭 하나를 아핀 하나로 붙이면, 가까이서 보는 정면 뷰에선 원근 오차가 커져
// 먼 쪽 구석에 무늬가 비고 폭마다 줄 기울기가 달라진다. 세로 띠(BYO_STRIPS)로 나눠 띠마다 아핀을 다시 잡는다.
// 세로선은 원근에서도 곧아 띠 안에선 거의 정확하다. 띠 경계는 살짝 겹쳐 잘린 틈이 보이지 않게 한다
const BYO_STRIPS = 16;
function byoLocal(g, P, u0, u1, v0, v1, fn) {
  const du = (u1 - u0) / BYO_STRIPS, ov = du * 0.04;
  for (let i = 0; i < BYO_STRIPS; i++) {
    const a = u0 + i * du, b = a + du, m = (a + b) / 2;
    const pa = proj(...P.at(a, 0)), pb = proj(...P.at(b, 0)), pm = proj(...P.at(m, 0)), py = proj(...P.at(m, 1));
    const ex = [(pb[0] - pa[0]) / du, (pb[1] - pa[1]) / du], ey = [py[0] - pm[0], py[1] - pm[1]];
    g.save(); pathPts(g, byoRect(P, Math.max(u0, a - ov), Math.min(u1, b + ov), v0, v1)); g.clip();
    g.transform(ex[0], ex[1], ey[0], ey[1], pm[0] - m * ex[0], pm[1] - m * ex[1]);
    fn(a - ov, b + ov);
    g.restore();
  }
}
// 청해파 타일: 붙여주신 SVG와 같은 원 9겹·색. 가로 170·세로 85 단위가 한 주기 → 이음매 없이 반복.
// 아래 줄이 위 줄을 덮도록 y 순서대로 그린다. 화면에 맺힐 크기로 바로 래스터화해 축소 무아레를 피한다
// kM: 병풍 자리의 화면 px/m (시점마다 다르다. 정면 뷰는 buildFront에서 넘긴다)
const byoTiles = new Map();
function byoPattern(g, kM = kAt(-14)) {
  const Wt = Math.max(8, 2 * Math.round(BYO.wave * kM * dpr / 2)), Ht = Wt / 2;
  let byoTile = byoTiles.get(Wt);
  if (!byoTile) {
    byoTile = document.createElement('canvas'); byoTile.width = Wt; byoTile.height = Ht; byoTiles.set(Wt, byoTile);
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
function byobu(g, kM) {
  const { edge: e, frame: f, w, h } = BYO, pat = byoPattern(g, kM);
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
    byoLocal(g, P, e, w - e, e, h - e, () => {
      g.strokeStyle = 'rgba(10,20,6,0.45)'; g.lineWidth = 0.006;
      for (let v = 0; v < h + w; v += 0.022) { g.beginPath(); g.moveTo(0, v); g.lineTo(w, v - w); g.moveTo(0, v - w); g.lineTo(w, v); g.stroke(); }
    });
    // 청해파 바탕
    byoLocal(g, P, f, w - f, f * 1.25, h - f, (a, b) => { g.fillStyle = pat; g.fillRect(a, -0.05, b - a, h + 0.1); });
    poly(g, byoRect(P, f, w - f, f * 1.25, h - f), null, 'rgba(0,0,0,0.55)', 1);
    // 지그재그 명암: 가까운 스탠드 등불(오른쪽)을 등지는 폭일수록 어둡게. 빛무늬는 평균 평면에 투영하므로 꺾임은 여기서만 드러난다
    const lx = BYO.lamp[0] - P.c[0], lz = BYO.lamp[1] - P.c[1], ln = Math.hypot(lx, lz), cs = Math.max(0, (lx * P.n[0] + lz * P.n[1]) / ln);
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

// ===== 병풍 정면 뷰 (참고 이미지 yachiyoroom3) =====
// 단 앞 바닥에 서서 +x(병풍)를 똑바로 본다. 화면 오른쪽 = +z(방 앞쪽). 세로선이 서도록 고개는 숙이지 않고 화면 중심만 위로 옮긴다(렌즈 시프트).
// 병풍이 화면 폭을 거의 채우고, 아랫단에 단 앞 귀틀이 걸리게 눈높이·거리를 잡았다.
// 참고 이미지처럼 화면 안에 등은 두지 않는다. 빛은 관찰자 쪽(화면 밖 왼쪽 앞)에서 오는 따뜻한 빛으로 굽는다(FRONT_LIGHT)
const FV = (() => {
  const zs = BYO_P.flatMap(P => [P.p[1], P.q[1]]);
  return { x: 1.4, y: 1.3, z: (Math.min(...zs) + Math.max(...zs)) / 2, F: 1300, CX: 800, CY: 300 };
})();
// 화면 밖 빛: 중심(cx, cy: 화면 비율), 반경(r: 화면 폭 비율, 세로 sy배), 세기
const FRONT_LIGHT = { cx: 0.5, cy: 0.45, r: 0.8, sy: 0.7, a: 0.6 };
const projFront = (x, y, z) => { const d = Math.max(0.05, x - FV.x); return [FV.CX + FV.F * (z - FV.z) / d, FV.CY - FV.F * (y - FV.y) / d]; };
const kFront = x => FV.F / (x - FV.x);
// 병풍 뒤로 보이는 오른쪽 옆벽(x = HX): 먼 칸 회벽, ZW부터 앞은 밖으로 트인 개구(밤하늘), 가모이 위는 란마 띠
// 정면 뷰는 병풍 가운데(FV.z) 기준 좌우대칭으로 따로 꾸민다: 벽 없이 통째로 밖으로 트인 개구(밤하늘 + 툇마루 난간), 기둥은 양옆 한 쌍.
// 실제 방대로 그리면 왼쪽은 뒷벽 모서리에 막히고 오른쪽만 트여 한쪽으로 쏠려 보인다
const FW = { a: 3.0, b: 9.5 };   // 기둥 자리(± a + 3), 개구 바깥 끝 (FV.z에서 m)
function frontWall(g) {
  const x = HX, c = FV.z, A = c - FW.a, B = c + FW.a, Z0 = c - FW.b, Z1 = c + FW.b;
  g.fillStyle = '#120d09'; g.fillRect(0, 0, W, H);
  const r = mulberry32(17);
  for (const [za, zb] of [[Z0, Z1]]) {
    const sk = g.createLinearGradient(0, proj(x, YK, za)[1], 0, proj(x, DH, za)[1]);
    sk.addColorStop(0, '#113154'); sk.addColorStop(1, '#0d2441');
    const op = [proj(x, DH, za), proj(x, DH, zb), proj(x, YK, zb), proj(x, YK, za)];
    poly(g, op, sk);
    g.save(); pathPts(g, op); g.clip();
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(220,230,255,${0.2 + r() * 0.5})`; g.fillRect(r() * W, r() * H * 0.5, 1.2, 1.2); }
    sideOutside(g, [1], Z0, Z1);   // 개구 밖 툇마루 난간 (병풍 뒤·양옆으로 보인다)
    g.restore();
  }
  poly(g, [proj(x, YK, Z0), proj(x, YK, Z1), proj(x, YC, Z1), proj(x, YC, Z0)], '#1a1510');
  const wood = { f: '#4a3421', s: '#3d2a1b', b: '#2e2015', t: '#5a4030' };
  boxP(g, x - 0.18, x, DH, DH + 0.08, Z0, Z1, wood);   // 개구 문지방
  for (const z of [A - 3, B + 3]) poly(g, [proj(x - 0.36, 0, z - 0.18), proj(x - 0.36, 0, z + 0.18), proj(x - 0.36, YC, z + 0.18), proj(x - 0.36, YC, z - 0.18)], '#3d2a1b', 'rgba(0,0,0,0.35)', 0.8);
  poly(g, [proj(x - 0.18, YK - 0.12, Z0), proj(x - 0.18, YK - 0.12, Z1), proj(x - 0.18, YK + 0.12, Z1), proj(x - 0.18, YK + 0.12, Z0)], '#4a3421');
}
// 정면 뷰 정적 레이어(어둡게 하기 전 표면색 → 빛 반사용, 어둡게 한 것 → 바탕). 처음 필요할 때 한 번 굽는다
let front = null;
function buildFront() {
  const [bc, bg] = mkLayer();
  const nTags = TAGS.length;
  // 앞·뒷면은 이 뷰의 눈(FV) 기준으로 다시 가린다 (본 장면 눈 기준이면 끝 폭이 뒷면으로 보인다)
  const fr = BYO_P.map(P => P.front);
  BYO_P.forEach(P => { P.front = (FV.x - P.c[0]) * P.n[0] + (FV.z - P.c[1]) * P.n[1] > 0; });
  proj = projFront;
  try { frontWall(bg); dais(bg, { z0: FV.z - FW.b, z1: FV.z + FW.b, rz0: Math.min(...BYO_P.map(P => P.c[1])), rz1: Math.max(...BYO_P.map(P => P.c[1])), edge: true }); BYO.lamp = [FV.x, FV.z]; byobu(bg, kFront(BYO.x0)); } finally { proj = projMain; TAGS.length = nTags; BYO.lamp = BYO_LAMP; BYO_P.forEach((P, i) => { P.front = fr[i]; }); }
  const [ac, ag] = mkLayer();
  ag.drawImage(bc, 0, 0, W, H);
  ag.globalCompositeOperation = 'screen'; ag.fillStyle = 'rgb(110,100,90)'; ag.fillRect(0, 0, W, H);
  darken(bg);
  // 화면 밖 빛: 반사광 = 표면색 × 따뜻한 빛 (본 장면 reflect와 같은 방식)
  const [lc, lg] = mkLayer(), F = FRONT_LIGHT;
  lg.fillStyle = '#000'; lg.fillRect(0, 0, W, H);
  radial(lg, W * F.cx, H * F.cy, W * F.r, W * F.r * F.sy, glow('255,170,95', F.a));
  lg.globalCompositeOperation = 'multiply'; lg.drawImage(ac, 0, 0, W, H);
  bg.globalCompositeOperation = 'lighter'; bg.drawImage(lc, 0, 0, W, H);
  bg.globalCompositeOperation = 'source-over';
  front = { base: bc, alb: ac };
}

// ===== 스탠딩 랜턴 근접 뷰 (참고 이미지 references/standinglantern.png) =====
// 원통 랜턴 하나를 위에서 비스듬히 내려다본다(등 윗부분은 화면 밖). 랜턴 예제(lantern-cylinder.html)와 같은 정사영이라
// 바닥(y = Y_FLOOR)이 화면에 아핀 변환 하나로 맺힌다: 바닥점 (x, z) → (LV.ax + k·x, LV.ay + k·st·z), k = LV.k.
// 빛무늬: 아래 띠 육각별 투각 → 바닥에 고정 / 종이창 무늬(매화·물결) → 바닥에 맺혀 등과 함께 천천히 돈다.
// 위 띠는 광원보다 위라 천장 쪽으로 가므로 투영하지 않는다.
const LV = {
  // 시점 기울기(도, 위에서): 바닥 별 고리가 참고 이미지처럼 가로:세로 ≈ 2:1로 눌리고, 위 띠는 화면 위로 빠진다
  tilt: 30, rot: 0.55,      // 등 방향(rad): 화면상 판자와 평행 = -plankRot (3D 회전과 캔버스 회전 부호가 반대)
  ax: 1010, ay: 590,       // 등 축이 바닥과 만나는 화면 점 (참고 이미지처럼 오른쪽으로 치우침)
  k: 2.6,                  // 화면 px / 랜턴 이미지 px
  focusX: 1010,            // 세로 화면 등 좁은 화면에서 잘라 보일 때 가운데로 둘 x (등 축)
  period: 90,              // 종이창 무늬 1회전(초). 바닥에선 멀리 크게 맺혀 느려도 잘 보인다
  // 종이창 무늬 두 묶음(원래 광원 아래·위)을 옮겨 둘 높이(이미지 px, 광원 lightY · 아래 가로대 249.6).
  // 바닥 반지름 ρ = R·(Y_FLOOR − 광원)/(y − 광원) → 광원에 가까울수록 멀리 크게 맺힌다. 둘 다 광원 아래라 바닥에 닿는다
  motifY: [209, 186],
  plank: 80, plankRot: -0.55,  // 마루 판 너비(이미지 px)·방향(rad)
  wood: [[100, 64, 44], [134, 88, 62]],   // 마루 판 색 범위(albedo). 채도를 낮춰 그늘이 주황으로 뜨지 않게
  amb: 'rgb(40,34,32)',        // 바닥 바탕빛(어둠). 그늘에서도 나무결이 보이게 (참고 이미지)
  star: 1.0, starOver: 0.65, starBloom: 0.18,  // 육각별 빛 세기 / 넘침(노출) / 번짐. 참고 이미지처럼 바닥에서 가장 밝게
  starInner: 0.25,             // 별 고리 안쪽 가장자리 밝기(바깥 = 1). 참고 이미지 안쪽 줄 ≈ 바깥의 0.5배
  starGap: 0.2,                // 마름모 창 사이 나무살 비율(컴포넌트 기본 0.08). 참고 이미지처럼 창끼리 떨어져 바람개비 모양으로
  starShift: 7,                // 별무늬 세로 위상(px): 띠 아래 가장자리가 별 중심을 지나면 바닥 안쪽 경계가 톱니처럼 각진다 → 마름모를 가로지르게
  // 바닥 별 고리: 점광원 식 ρ = R·h/(y−광원)은 별이 반지름 방향으로 0.4~0.6배 눌려(화면 세로 압축과 겹치면 납작)
  // 참고 이미지와 다르다 → 원통→바닥 등각 사상으로 별 모양을 그대로 둔다:
  //   θ' = θ·s (s = 14/starM),  ρ = starIn·R·exp(s·(starY0 − y)/R)  → 반지름·둘레 방향 배율이 같다
  // starM: 바닥 한 바퀴 별 열 수(등 표면은 14 그대로). 참고 이미지처럼 작은 별이 고리를 촘촘히 채우게 26
  // starIn/starOut: 고리 안·밖 반지름(×R). 참고 이미지 왼쪽(화면 가로) 실측 ≈ 1.85R / 2.85R. 안쪽은 받침 둘레 빈 그늘
  // starY0: starIn에 맺히는 띠 높이. 고리에 담기는 띠 높이 = R·ln(밖/안)/s ≈ 50px → 엇갈린 별 두 줄.
  //   별 중심 높이(열 엇갈림 포함) 255.6·271.7·287.8·303.8·319.9 사이 '가운데'에 경계가 오게 한다:
  //   경계가 별 중심·끝을 지나면 바람개비·별 끝만 걸려 실루엣이 들쭉날쭉, 가운데를 지나면 모든 마름모가 같은 반지름에서 잘려 원으로 보인다.
  //   바깥 경계 y = 263.6, 안쪽은 띠 아랫변 312 (둘 다 줄 사이 가운데) → starY0 = 263.6 + 50
  starM: 26, starIn: 1.85, starOut: 2.85, starY0: 313.4,
  lightY: 150,                 // 등불 높이(이미지 px, 컴포넌트 기본 175). 별 고리 안·밖 반지름 ≈ 1.75R·2.85R (참고 이미지)
  penumbra: 0.6,               // 별무늬 가장자리 반그림자(px). 참고 이미지는 가장자리가 또렷하다
  glow: 0.3,                   // 등 바로 둘레 바닥빛
  spill: [1, 1.8],             // 등 둘레로 넓게 퍼지는 바닥빛 [세기, 반지름(×별 고리 바깥 반지름)]: 참고 이미지는 그늘 속 마루도 중간 톤으로 보인다
  halo: [0.38, 0.4, 0.95, 0.3], // 등 둘레 공기 빛(screen): 넓은 주황 / 아래 띠 / 종이창 흰빛 / 받침(위에서 내리비친 빛)
  burn: [1.0, 0.5],            // 갓 노출(screen): 종이창 / 아래 띠
  paper: 0.05,                 // 종이창을 지난 바탕빛 (별 띠 바깥)
  grade: 'rgb(255,242,230)',   // 마지막 색보정(곱하기): 노랑기를 빼 참고 이미지의 붉은 주황 쪽으로
  lift: 'rgb(8,7,7)',          // 검은 쪽 들어올림(screen): 참고 이미지의 그늘은 새까맣지 않다 (다이나믹 레인지를 참고 이미지에 맞춤)
  vig: 0.65,                   // 가장자리 어둡게
  lit: 0.3, dark: 0.5,          // 종이창 무늬(바닥에서 도는 바깥 그림자): 매화·물결 빛 / 어두운 윤곽
};
let lanternV = null, lanternBuilding = null;
function buildLanternView() {
  if (lanternV) return Promise.resolve(lanternV);
  if (lanternBuilding) return lanternBuilding;
  lanternBuilding = (async () => {
    const f = await loadFrame('components/lantern-cylinder.html');
    try {
      const w = f.contentWindow, A = w.__api;
      A.pause(); A.setSpin(0); A.setTilt(LV.tilt); A.setRot(LV.rot);
      w.eval(`STAR_GAP = ${LV.starGap}; STAR_YSHIFT = ${LV.starShift}; LIGHT_Y = ${LV.lightY}; rebuildBands(); rebuildFloor();`);   // 등 표면·바닥 투영 둘 다 같은 창 크기로
      const g = w.eval('({S, OY, ct, st, CX, W, H, YC, Y_FLOOR, R, LIGHT_Y, RAILS, BAND_LO, rIn: FLOOR_HOLES.rIn, rOut: FLOOR_HOLES.rOut})');
      const holes = lvStarHoles(g, JSON.parse(w.eval('JSON.stringify(BANDS[1].holes.map(h => ({ th: h.th, pts: h.pts })))')));
      const motifs = JSON.parse(w.eval('JSON.stringify(MOTIFS.map(m => ({ th: m.th, layers: m.layers })))'));
      const mcol = JSON.parse(w.eval('JSON.stringify(MOTIF_COL)'));
      // 등 몸통: 바닥 빛(타원·별·무늬)·후광 사각형은 빼고 무늬 아래(under)·위(over) 두 장. 크게 그려도 선명하게 SVG 크기를 키워 굽는다
      const m = LV.k / g.S, ox = LV.ax - m * g.CX, oy = LV.ay - m * (g.OY - g.S * (g.YC - g.Y_FLOOR) * g.ct);
      const sc = m * dpr;
      const svgOf = layer => A.buildSVG(false, { layer })
        .replace(/<ellipse[^>]*fill="url\(#floor\)"[^>]*\/>/g, '')
        .replace(/<rect[^>]*fill="url\(#halo\)"[^>]*\/>/g, '')
        .replace(/<g filter="url\(#soft\)">[\s\S]*?<\/g>/g, '')
        .replace(`width="${g.W}" height="${g.H}"`, `width="${Math.round(g.W * sc)}" height="${Math.round(g.H * sc)}"`);
      const [imU, imO] = await Promise.all([svgImg(svgOf('under')), svgImg(svgOf('over'))]);
      const lay = im => { const [c, cg] = mkLayer(); cg.drawImage(im, ox, oy, g.W * m, g.H * m); return c; };
      lanternV = { g, m, ox, oy, mcol, under: lay(imU), over: lay(imO) };
      lvMotifs(lanternV, motifs);
      lvFloor(lanternV, holes);
      lvGlow(lanternV);
      return lanternV;
    } finally { f.remove(); }
  })().catch(e => { lanternBuilding = null; throw e; });
  return lanternBuilding;
}
// 종이창 무늬를 LV.motifY 두 높이로 옮기고, 바닥에 맺힐 (θ, ρ) 다각형을 미리 만든다
function lvMotifs(V, motifs) {
  const { g } = V, LY = g.LIGHT_Y, h = g.Y_FLOOR - LY;
  const ys = m => { let s = 0, n = 0; for (const l of m.layers) for (const p of l.polys) for (const q of p) { s += q[1]; n++; } return n ? s / n : LY; };
  const groups = [motifs.filter(m => ys(m) > LY), motifs.filter(m => ys(m) <= LY)];
  groups.forEach((ms, gi) => {
    if (!ms.length) return;
    const dy = LV.motifY[gi] - ms.reduce((s, m) => s + ys(m), 0) / ms.length;
    for (const m of ms) for (const l of m.layers) l.polys = l.polys.map(p => p.map(([th, y]) => [th, y + dy]));
  });
  V.mot = motifs;
  // 바닥 투영: 광원 아래 종이창(가로대 사이)만. 화면 밖까지 멀리 가는 부분은 자른다
  const RMAX = 1200, rho = y => g.R * h / (y - LY);
  const irr = r => h / Math.pow(r * r + h * h, 1.5), e0 = irr(rho(g.BAND_LO[1]));
  const lo = Math.max(g.RAILS[0], LY + g.R * h / RMAX), hi = g.RAILS[1];
  const dens = (P, n) => { const o = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; for (let t = 0; t < n; t++) o.push([a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n]); } return o; };
  V.floorMot = [];
  for (const mo of motifs) {
    let n = 0, sum = 0;
    const layers = mo.layers.map(l => ({ lit: l.lit, polys: l.polys.map(p => {
      const P = clipYPoly(p, lo, hi); if (!P) return null;
      const q = dens(P, 3).map(([th, y]) => [th, rho(y)]);
      for (const v of q) { sum += v[1]; n++; }
      return q;
    }).filter(Boolean) })).filter(l => l.polys.length);
    if (n) V.floorMot.push({ layers, I: Math.min(1, Math.pow(irr(sum / n) / e0, 0.3)) });
  }
}
// 아래 띠 투각 → 바닥 별 고리 (θ, ρ) 다각형. 등각 사상이라 별 모양이 눌리지 않는다 (LV.starM 설명)
function lvStarHoles(g, raw) {
  const R = g.R, s = 14 / LV.starM, per = 2 * (2 * Math.PI / 14);   // 별무늬 θ 주기 = 두 열
  const hi = Math.min(LV.starY0, g.BAND_LO[1]), lo = Math.max(g.BAND_LO[0], LV.starY0 - R * Math.log(LV.starOut / LV.starIn) / s);
  const rho = y => LV.starIn * R * Math.exp(s * (LV.starY0 - y) / R);
  const arc = P => { const o = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], n = Math.max(2, Math.ceil(Math.abs(b[0] - a[0]) / 0.004)); for (let t = 0; t < n; t++) o.push([a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n]); } return o; };
  const one = [];   // 한 주기분
  for (const h of raw) {
    if (h.th < 0 || h.th >= per) continue;
    const P = clipYPoly(h.pts, lo, hi); if (!P) continue;
    const q = arc(P).map(([th, y]) => [th * s, rho(y)]);
    const rc = q.reduce((a, p) => a + p[1], 0) / q.length;
    one.push({ pts: q, I: Math.pow(LV.starIn * R / rc, 0.6) });
  }
  const out = [];
  for (let k = 0; k < LV.starM / 2; k++) for (const h of one) out.push({ I: h.I, pts: h.pts.map(([th, r]) => [th + k * per * s, r]) });
  return out;
}
// 바닥: 나무 마루(albedo) × (어둠 + 등 주변 빛 + 종이창 바탕빛 + 육각별) → 정적인 한 장. 도는 종이창 무늬만 매 프레임 따로
function lvFloor(V, holes) {
  const { g } = V, st = g.st, k = LV.k;
  const fx = (c, s = dpr) => c.setTransform(s * k, 0, 0, s * k * st, s * LV.ax, s * LV.ay);
  // 화면 네 귀퉁이까지 덮는 바닥 반경 (이미지 px)
  const E = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot((x - LV.ax) / k, (y - LV.ay) / (k * st)))) + 60;
  const [alb, ag] = mkLayer();
  fx(ag); ag.rotate(LV.plankRot);
  const rnd = mulberry32(11), PW = LV.plank;
  const tone = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t))})`;
  for (let z0 = -Math.ceil(E / PW) * PW - PW * 0.2; z0 < E; z0 += PW) {   // 판자 결 수직 방향 반대쪽으로 1/5 너비 이동
    ag.fillStyle = tone(LV.wood[0], LV.wood[1], rnd()); ag.fillRect(-E, z0, 2 * E, PW);
    for (let i = 0; i < 140; i++) {   // 결 (판 너비 2배에 맞춰 밀도 유지)
      ag.fillStyle = `rgba(${rnd() < 0.55 ? '36,14,4' : '255,210,150'},${0.05 + rnd() * 0.16})`;
      ag.fillRect(-E + rnd() * 2 * E, z0 + 1.5 + rnd() * (PW - 3), 40 + rnd() * 220, 0.35 + rnd() * 1.1);
    }
    ag.fillStyle = '#1e0c04'; ag.fillRect(-E, z0, 2 * E, 1.3);   // 판 사이 이음 (긴쪽만, 짧은쪽 가로선 없음)
  }
  V.alb = alb;
  // 육각별 (띠는 고정 → 한 번만)
  const [sm, sg] = mkLayer();
  fx(sg);
  sg.save(); sg.beginPath(); sg.arc(0, 0, LV.starOut * g.R, 0, Math.PI * 2); sg.arc(0, 0, LV.starIn * g.R, 0, Math.PI * 2, true); sg.clip();   // 고리만
  for (const hl of holes) {
    sg.beginPath();
    hl.pts.forEach(([th, r], i) => { const a = th + LV.rot, x = r * Math.sin(a), z = r * Math.cos(a); i ? sg.lineTo(x, z) : sg.moveTo(x, z); });
    sg.closePath();
    const I = Math.min(1, hl.I);
    sg.fillStyle = `rgba(255,${Math.round(165 + 45 * I)},${Math.round(90 + 50 * I)},${Math.min(1, hl.I * LV.star)})`;
    sg.fill();
  }
  // 안쪽 줄을 어둡게: 참고 이미지는 받침 쪽 안쪽 줄이 바깥 줄의 ~0.5배로 어둡고 붉다. 구멍 하나가 고리를 가로질러 걸치므로 구멍별 밝기 대신 반지름 그라디언트로
  const rI = LV.starIn * g.R, rOt = LV.starOut * g.R, fade = sg.createRadialGradient(0, 0, rI, 0, 0, rOt);
  for (let i = 0; i <= 8; i++) { const t = i / 8; fade.addColorStop(t, `rgba(0,0,0,${(LV.starInner + (1 - LV.starInner) * Math.pow(t, 0.8)).toFixed(3)})`); }
  sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = fade; sg.fillRect(-rOt, -rOt, 2 * rOt, 2 * rOt); sg.globalCompositeOperation = 'source-over';
  // 광량 지도
  const [lm, lg] = mkLayer();
  lg.fillStyle = LV.amb; lg.fillRect(0, 0, W, H);
  fx(lg); lg.globalCompositeOperation = 'lighter';
  sg.restore();
  const rO = Math.min(g.rOut || g.rIn * 1.8, LV.starOut * g.R);
  const radF = (r, stops) => { lg.fillStyle = (() => { const q = lg.createRadialGradient(0, 0, 0, 0, 0, r); stops.forEach(([o, c]) => q.addColorStop(o, c)); return q; })(); lg.fillRect(-r, -r, 2 * r, 2 * r); };
  const [sa, sr] = LV.spill;
  radF(rO * sr, [[0, `rgba(255,150,80,${sa})`], [0.35, `rgba(255,135,65,${sa * 0.7})`], [0.7, `rgba(255,120,55,${sa * 0.3})`], [1, 'rgba(255,110,50,0)']]);
  radF(rO * 2.2, [[0, `rgba(255,140,60,${LV.glow})`], [0.45, `rgba(255,120,45,${LV.glow * 0.35})`], [1, 'rgba(255,110,40,0)']]);
  // 종이창 바탕빛: 아래 띠 윗변의 투영(rOut)부터 바깥으로, 멀수록 옅게. 경계는 부드럽게
  const RP = rO * 4.2, e = rO / RP, P = LV.paper;
  radF(RP, [[0, 'rgba(255,150,70,0)'], [e * 0.9, 'rgba(255,150,70,0)'], [e * 1.06, `rgba(255,150,70,${P})`],
    [e * 1.6, `rgba(255,140,60,${P * 0.5})`], [0.6, `rgba(255,130,50,${P * 0.12})`], [1, 'rgba(255,120,40,0)']]);
  lg.setTransform(1, 0, 0, 1, 0, 0);
  if (CAN_FILTER) lg.filter = `blur(${(LV.penumbra * dpr).toFixed(1)}px)`;   // 등불 크기만큼의 반그림자
  lg.drawImage(sm, 0, 0); lg.filter = 'none';
  lg.globalCompositeOperation = 'multiply'; lg.drawImage(alb, 0, 0);
  // 별무늬 넘침(노출) + 번짐
  lg.globalCompositeOperation = 'lighter';
  lg.globalAlpha = LV.starOver; lg.drawImage(sm, 0, 0);
  if (CAN_FILTER) { lg.filter = `blur(${(9 * dpr).toFixed(1)}px)`; lg.globalAlpha = LV.starBloom; lg.drawImage(sm, 0, 0); lg.filter = 'none'; }
  lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
  V.floor = lm;
  // 매 프레임 쓰는 반해상도 무늬 버퍼 + 같은 해상도의 마루 (lit 무늬에 나무결을 입힌다)
  const hw = Math.ceil(W * dpr / 2), hh = Math.ceil(H * dpr / 2);
  const mk = () => { const c = document.createElement('canvas'); c.width = hw; c.height = hh; return c; };
  V.mLit = mk(); V.mDark = mk(); V.albH = mk();
  V.albH.getContext('2d').drawImage(alb, 0, 0, hw, hh);
  V.fxH = c => fx(c, dpr / 2);
}
// 등 둘레 공기 빛·블룸 (화면 공간, screen으로 얹는다)
function lvGlow(V) {
  const { g, m, ox, oy } = V;
  const sx = ox + m * g.CX, syAt = y => oy + m * (g.OY - g.S * (g.YC - y) * g.ct), rx = m * g.S * g.R;
  const [c, cg] = mkLayer();
  const rad = (x, y, r, stops) => { const q = cg.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([o, s]) => q.addColorStop(o, s)); cg.fillStyle = q; cg.fillRect(0, 0, W, H); };
  const [a0, a1, a2, a3] = LV.halo;
  rad(sx, syAt(g.LIGHT_Y), rx * 5.5, glow('255,160,80', a0));
  rad(sx, syAt((g.BAND_LO[0] + g.BAND_LO[1]) / 2), rx * 3, glow('255,150,70', a1));
  rad(sx, syAt(g.LIGHT_Y - 40), rx * 2.2, glow('255,236,200', a2));   // 종이창이 하얗게 날아갈 만큼
  // 받침에 내리비친 빛: 등 몸통(under·over) 모양으로만 — 바닥 안쪽 별 고리까지 밝히지 않게
  const [kc, kg] = mkLayer();
  const q0 = kg.createRadialGradient(sx, syAt(g.Y_FLOOR), 0, sx, syAt(g.Y_FLOOR), rx * 1.7);
  glow('255,180,120', a3).forEach(([o, s]) => q0.addColorStop(o, s));
  kg.fillStyle = q0; kg.fillRect(0, 0, W, H);
  const [mc, mg] = mkLayer(); mg.drawImage(V.under, 0, 0, W, H); mg.drawImage(V.over, 0, 0, W, H);
  kg.globalCompositeOperation = 'destination-in'; kg.drawImage(mc, 0, 0, W, H);
  cg.drawImage(kc, 0, 0, W, H);
  V.glow = c;
  // 갓 노출: 원통 실루엣(아래 띠 아랫변까지)으로 잘라 위쪽 종이창은 거의 흰빛, 아래 띠는 주황빛으로 들뜨게 (참고 이미지는 갓이 하얗게 날아간다)
  const [bc, bg] = mkLayer();
  const [p0, p1] = LV.burn, yT = syAt(g.LIGHT_Y - 60), yB = syAt(g.BAND_LO[0]), yE = syAt(g.BAND_LO[1]);
  bg.beginPath(); bg.moveTo(sx - rx, -10); bg.lineTo(sx - rx, yE); bg.ellipse(sx, yE, rx, rx * g.st, 0, Math.PI, 0, true); bg.lineTo(sx + rx, -10); bg.closePath(); bg.clip();
  const q = bg.createLinearGradient(0, yT, 0, yE);
  const at = y => Math.max(0, Math.min(1, (y - yT) / (yE - yT)));
  q.addColorStop(0, `rgba(255,255,250,${p0})`);
  q.addColorStop(at(yB) * 0.9, `rgba(255,246,226,${p0 * 0.85})`);
  q.addColorStop(at(yB), `rgba(255,170,95,${p1})`);
  q.addColorStop(1, `rgba(255,150,80,${p1 * 0.7})`);
  bg.fillStyle = q; bg.fillRect(0, 0, W, H);
  V.burn = bc;
}
// 등 표면 종이창 무늬 (랜턴 예제 projSurf와 같은 계산)
function lvSurface(V, sp) {
  const { g, m, ox, oy, mcol } = V, c = ctx;
  const P = ([th, y]) => {
    let a = th + LV.rot + sp; a = Math.atan2(Math.sin(a), Math.cos(a));
    a = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, a));
    const x = g.R * Math.sin(a), z = g.R * Math.cos(a);
    return [ox + m * (g.CX + g.S * x), oy + m * (g.OY - g.S * ((g.YC - y) * g.ct - z * g.st))];
  };
  const path = polys => { c.beginPath(); for (const q of polys) { q.forEach((p, i) => { const [x, y] = P(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); } };
  for (const mo of V.mot) {
    if (Math.cos(mo.th + LV.rot + sp) <= 0.12) continue;
    const ls = mo.layers;
    if (ls.length === 2 && !ls[0].lit && ls[1].lit) {
      path([...ls[0].polys, ...ls[1].polys]); c.fillStyle = mcol.dark; c.fill('evenodd');
      path(ls[1].polys); c.fillStyle = mcol.lit; c.fill();
    } else for (const ly of ls) { path(ly.polys); c.fillStyle = ly.lit ? mcol.lit : mcol.dark; c.fill(); }
  }
}
// 바닥에 맺힌 종이창 무늬 (매 프레임, 반해상도): 어두운 윤곽은 바탕빛을 가리고, 매화·물결은 나무결 위에 빛을 더한다
function lvFloorMotifs(V, sp) {
  const L = V.mLit.getContext('2d'), D = V.mDark.getContext('2d');
  for (const b of [L, D]) { b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, V.mLit.width, V.mLit.height); V.fxH(b); }
  const path = (b, polys) => { b.beginPath(); for (const p of polys) { p.forEach(([th, r], i) => { const a = th + LV.rot + sp, x = r * Math.sin(a), z = r * Math.cos(a); i ? b.lineTo(x, z) : b.moveTo(x, z); }); b.closePath(); } };
  for (const mo of V.floorMot) {
    for (const ly of mo.layers) {
      if (ly.lit) {
        path(L, ly.polys); L.fillStyle = `rgba(255,255,255,${mo.I})`; L.fill();
        path(D, ly.polys); D.globalCompositeOperation = 'destination-out'; D.fillStyle = '#000'; D.fill(); D.globalCompositeOperation = 'source-over';
      } else {
        path(D, ly.polys); D.fillStyle = `rgba(0,0,0,${mo.I})`; D.fill();
        path(L, ly.polys); L.globalCompositeOperation = 'destination-out'; L.fillStyle = '#000'; L.fill(); L.globalCompositeOperation = 'source-over';
      }
    }
  }
  L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-in'; L.drawImage(V.albH, 0, 0); L.globalCompositeOperation = 'source-over';
}
function drawLantern() {
  const V = lanternV;
  ctx.clearRect(0, 0, W, H);
  if (!V) { ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H); return; }
  const sp = (spinClock * Math.PI * 2 / LV.period) % (Math.PI * 2);
  ctx.drawImage(V.floor, 0, 0, W, H);
  lvFloorMotifs(V, sp);
  ctx.globalAlpha = LV.dark; ctx.drawImage(V.mDark, 0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = LV.lit; ctx.drawImage(V.mLit, 0, 0, W, H);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(V.under, 0, 0, W, H);
  lvSurface(V, sp);
  ctx.drawImage(V.over, 0, 0, W, H);
  vignette(LV.vig);   // 등빛(노출·후광)은 비네트 뒤에 얹는다: 화면 위쪽에 걸린 갓이 어두워지지 않게
  ctx.globalCompositeOperation = 'screen'; ctx.drawImage(V.glow, 0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = LV.grade; ctx.fillRect(0, 0, W, H);
  // 갓 노출은 색보정 뒤에: 곱하기 보정이 흰빛을 크림색으로 눌러 하이라이트가 255까지 가지 못하던 것을 막는다 (참고 이미지는 갓이 하얗게 날아간다)
  ctx.globalCompositeOperation = 'screen'; ctx.drawImage(V.burn, 0, 0, W, H);
  ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = LV.lift; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

// 장면이 쓰는 외부 파일은 components/에만 둔다(examples/·reference-images/는 수시로 바뀌는 임시 폴더).
// iframe은 404여도 onload가 불리므로 __api 존재로 성공을 판정해 원인 메시지를 남긴다.
function loadFrame(src) {
  return new Promise((res, rej) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:420px;height:1000px;border:0';
    f.onload = () => {
      let ok = false;
      try { ok = !!(f.contentWindow && f.contentWindow.__api); } catch (e) { /* cross-origin 등 */ }
      if (ok) res(f); else { f.remove(); rej(new Error('랜턴 컴포넌트 로드 실패(__api 없음): ' + src)); }
    };
    f.onerror = () => { f.remove(); rej(new Error('랜턴 컴포넌트 로드 실패: ' + src)); };
    f.src = src; document.body.appendChild(f);
  });
}
const svgImg = svg => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });

async function buildLanterns() {
  const [fSq, fCy] = await Promise.all([loadFrame('components/lantern-frustum.html'), loadFrame('components/lantern-cylinder.html')]);
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
let FRONT_EXTRA = [], LMOT = [], MCOL = null, SPIN_PERIOD = 16, WALL_MOTIFS = [], paperLayer = null, paperSp = null, ALB = null, PBUF = null, GLP = null;
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
  // WebGL 종이창 빛: 해상도(장면 기기 px 대비, 원래 2.5px 블러를 거치던 층이라 낮춰도 티가 덜 난다) / 소프트웨어 WebGL도 쓸지(시험용)
  glScale: 0.5, glSoftware: false,
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
  // 도는 종이창 무늬는 WebGL로 그린다. 안 되면 2D 경로(paperLight)가 쓸 버퍼·밝기 지도는 그때 만든다
  try { GLP = glInit(); } catch (e) { console.warn('[room] WebGL 빛무늬 초기화 실패, 2D로 그린다:', e); GLP = null; }
  paperSp = null;
}
// 2D 경로 준비: 버퍼 5장 + 등마다 밝기 지도 2장. WebGL이 안 될 때(또는 컨텍스트를 잃었을 때)만 만든다
function ensure2D() {
  if (!PBUF) PBUF = { l: mkLayer(), p: mkLayer(), r: mkLayer(), m: mkLayer(), d: mkLayer() };
  for (const L of LANTERNS) if (L.type === 'cy' && !L.maskLit) { L.maskLit = reachMask(L, true); L.maskDark = reachMask(L, false); }
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
  if (GLP) GLP.albDirty = true;
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
  ensure2D();
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
  paperSp = sp; paperView = 'main';
}
// ===== 종이창 무늬 투영: WebGL =====
// paperLight()(2D)는 매 프레임 무늬 다각형 수천 개를 면마다 투영하고 전체 화면 합성·블러를 스무 번 넘게 했다.
// 여기서는 반대로 화면 픽셀마다 계산한다: 픽셀 → 보이는 면 위 점 → 등 원통의 (θ, y) → 무늬 텍스처.
// 무늬는 (θ, y) 펼친 그림으로 한 번만 굽고, 회전은 θ 오프셋(uniform) 하나다.
// 계산은 projWall·projPoly·reachMask의 역변환이라 같은 그림이 나온다(다각형 꼭짓점 사이를 직선으로 잇지 않는 점만 다르다).
const gf = n => { const v = +n; if (!isFinite(v)) throw new Error('GLSL 상수 아님: ' + n); const t = v.toFixed(6); return t === '-0.000000' ? '0.0' : t; };
const gv3 = a => `vec3(${gf(a[0])},${gf(a[1])},${gf(a[2])})`;
const AXC = ['x', 'y', 'z'];
// 무늬를 (θ, y) 평면에 굽는다: lit = 밝은 무늬 겹침(lighter, 한 겹 PAT.lit) / dark = 어두운 윤곽(source-over, 한 겹 PAT.dark)
function motifAtlas() {
  let ylo = Infinity, yhi = -Infinity;
  for (const m of WALL_MOTIFS) for (const l of m.layers) for (const p of l.polys) for (const [, y] of p) { ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); }
  ylo -= 2; yhi += 2;
  const TAU = Math.PI * 2, TW = 4096, ppu = TW / (TAU * CYD.R);   // 텍스처 px / 원통 둘레 단위
  const TH = Math.min(4096, Math.ceil((yhi - ylo) * ppu));
  const sx = TW / TAU, sy = TH / (yhi - ylo);
  // willReadFrequently: 다 그린 뒤 getImageData로 읽어 가므로 CPU 캔버스로 (GPU 캔버스는 읽기가 아주 느릴 수 있다)
  const mk = () => { const c = document.createElement('canvas'); c.width = TW; c.height = TH; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, TW, TH); return [c, g]; };
  const [lc, lg] = mk(), [dc, dg] = mk();
  lg.globalCompositeOperation = 'lighter';
  lg.fillStyle = `rgb(${Math.round(PAT.lit * 255)},0,0)`;
  dg.fillStyle = `rgba(255,255,255,${PAT.dark})`;
  for (const m of WALL_MOTIFS) for (const layer of m.layers) {
    const g = layer.lit ? lg : dg;
    for (const P of layer.polys) {
      const base = Math.floor(Math.min(...P.map(q => q[0])) / TAU) * TAU;
      g.beginPath();
      for (const k of [-1, 0, 1]) P.forEach(([th, y], i) => { const x = (th - base + k * TAU) * sx, yy = (y - ylo) * sy; i ? g.lineTo(x, yy) : g.moveTo(x, yy); }), g.closePath();
      g.fill();
    }
  }
  const a = lg.getImageData(0, 0, TW, TH).data, b = dg.getImageData(0, 0, TW, TH).data, out = new Uint8Array(TW * TH * 2);
  for (let i = 0, j = 0; j < out.length; i += 4, j += 2) { out[j] = a[i]; out[j + 1] = b[i]; }
  return { data: out, w: TW, h: TH, ylo, yhi };
}
// extra: 정면 뷰에만 있는 등(FRONT_EXTRA). 바탕빛은 셰이더에서 계산하고 uView == 1일 때만 더한다. 본 장면 등은 uView == 0일 때만
function glShader(cyl, A, extra = []) {
  const LY = CYD.LIGHT_Y, [RA, RB] = CYD.RAILS, MID = (RA + RB) / 2;
  const iByo = SURF_ALL.findIndex(s => s.byo), SB = SURF_ALL[iByo];
  // 면 정보: kind 0 벽 / 1 바닥(단 윗면 포함) / 2 천장(종이창 빛 없음) / 3 병풍(벽 + 깊이 하한)
  const kindOf = s => s.byo ? 3 : s.ax !== 1 ? 0 : s.floor ? 1 : 2;
  const surf = SURF_ALL.map((s, i) => `  if (i == ${i}) { N = ${gv3(s.N)}; v = ${gf(s.v)}; kind = ${kindOf(s)}; tm = ${gf(ptmOf(s))}; }`).join('\n');
  // 레이캐스트: 방 면(축 정렬 사각형) + 병풍 6폭(뒷면이 보이면 아무 면도 아님 = −1)
  const quads = [];
  SURF_ALL.forEach((s, si) => { if (s.byo) return; for (const q of s.quads) {
    const lo = [0, 1, 2].map(a => a === s.ax ? -1e6 : Math.min(...q.map(p => p[a])) - 1e-3), hi = [0, 1, 2].map(a => a === s.ax ? 1e6 : Math.max(...q.map(p => p[a])) + 1e-3);
    const c = AXC[s.ax];
    quads.push(`  { float t = (${gf(s.v)} - O.${c}) / dv.${c}; if (t > 0.0 && t < best) { vec3 p = O + dv * t; if (all(greaterThanEqual(p, ${gv3(lo)})) && all(lessThanEqual(p, ${gv3(hi)}))) { best = t; sid = ${si}; } } }`);
  } });
  for (const P of BYO_P) quads.push(`  { vec2 n = vec2(${gf(P.n[0])}, ${gf(P.n[1])}); float den = dot(n, dv.xz); float t = dot(n, vec2(${gf(P.p[0])}, ${gf(P.p[1])}) - O.xz) / den;
    if (t > 0.0 && t < best) { vec3 p = O + dv * t; float u = dot(p.xz - vec2(${gf(P.p[0])}, ${gf(P.p[1])}), vec2(${gf(P.dir[0])}, ${gf(P.dir[1])}));
      if (u >= 0.0 && u <= ${gf(BYO.w)} && p.y >= ${gf(P.y0)} && p.y <= ${gf(P.y0 + BYO.h)}) { best = t; sid = ${P.front ? iByo : -1}; } } }`);
  const col = PAT.col.split(',').map(n => +n / 255);
  const lamps = cyl.concat(extra).map((L, i) => {
    const en = SURF_ALL.reduce((m, s, si) => L.SURF.includes(s) ? m | (1 << si) : m, 0);
    const y0w = cylPt(L, 0, MID)[1], kw = PAT.wallSpan * L.h / (RB - RA);
    const call = `vec3 r = lamp(sid, P, ${gv3(L.Lp)}, ${gf(L.sd)}, uDth[${i}], ${en}, ${gf(y0w)}, ${gf(kw)});`;
    if (L.extra) return `  if (uView == 1) { ${call}
    lg = min(lg + min(COL * (r.z * (1.0 - r.y) + r.x), 1.0), 1.0); }`;
    return `  if (uView == 0) { ${call}
    vec3 b = texture(uBase[${i}], uv).rgb; lg = min(lg + min(b * (1.0 - r.y) + COL * r.x, 1.0), 1.0); }`;
  }).join('\n');
  return `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uMotif, uBase[${cyl.length}];
uniform float uDth[${cyl.length + extra.length}];
uniform vec2 uSize;
// 시점: 눈 위치, 오른쪽·위·앞 방향, (화면 중심 x, y, 초점거리 px). uView 0 = 본 장면(바탕빛은 구운 텍스처) / 1 = 정면 뷰(바탕빛을 여기서 계산)
uniform vec3 uO, uRt, uUp, uFw, uCam;
uniform int uView;
out vec4 o;
const float PI = 3.14159265359, TAU = 6.28318530718;
const vec3 COL = ${gv3(col)};
void surf(int i, out vec3 N, out float v, out int kind, out float tm) {
  N = vec3(0.0); v = 0.0; kind = 2; tm = 1.0;
${surf}
}
// 종이창 바탕빛 세기 (buildPatterns의 paperSegs: 가로대 쪽 가장자리일수록 옅게)
float taper(float y) {
  float u = (y - ${gf(RA)}) / ${gf(RB - RA)};
  if (u <= 0.0 || u >= 1.0) return 0.0;
  float e = min(1.0, min(u, 1.0 - u) / ${gf(PAT.paperEdge)});
  return e * e * (3.0 - 2.0 * e);
}
// 무늬 (lit, dark) + 바탕빛(정면 뷰용). 밝기 지도(reachMask)와 같은 감쇠·끝 30% 페이드를 곱해 돌려준다
vec3 lamp(int sid, vec3 P, vec3 Lp, float sd, float dth, int en, float y0w, float kw) {
  if (sid < 0 || ((en >> sid) & 1) == 0) return vec3(0.0);
  vec3 N; float v; int kind; float tm;
  surf(sid, N, v, kind, tm);
  if (kind == 2) return vec3(0.0);
  float dh = length(P.xz - Lp.xz), d3 = length(vec2(dh, P.y - Lp.y));
  float fade = clamp((tm - (kind == 1 ? d3 : dh)) / (0.3 * tm), 0.0, 1.0);
  if (fade <= 0.0) return vec3(0.0);
  float fl = min(1.0, pow(${gf(PAT.D0)} / d3, ${gf(PAT.paperFall)}));
  float th, y, base;
  if (kind == 1) {   // 바닥: projPoly 역변환 (세로 성분 배율 VS, 위로 꺾기 LIFT)
    vec3 Q = P - Lp; float hd = length(Q.xz);
    if (Q.y >= 0.0 || hd <= 0.0) return vec3(0.0);
    th = atan(sd * Q.x, Q.z) - PI / 4.0;
    float s = Q.y / hd - ${gf(PAT.paperLift)};
    float yb = ${gf(LY)} - s * ${gf(CYD.R)} / ${gf(PAT.paperVS)};
    base = taper(yb) * smoothstep(${gf(LY + 0.5)}, ${gf(LY + 8)}, yb);   // 수평에 가까운 빛이 끊기는 자리(본 장면은 블러가 덮는다)
    y = ${gf(LY)} - s * ${gf(CYD.R)} / ${gf(PAT.motifVS)};
  } else {           // 벽·병풍: projWall 역변환. 병풍은 깊이를 byoDepth 이상으로 잡은 가상 면에서 방향을 구한다
    float h = v - dot(N, Lp), sg = sign(h), hv = kind == 3 ? sg * max(abs(h), ${gf(PAT.byoDepth)}) : h;
    vec2 q = (P - N * (h - hv) - Lp).xz;
    if (length(q) > tm) return vec3(0.0);
    th = atan(sd * q.x, q.y) - PI / 4.0;
    y = ${gf(MID)} - (P.y - y0w) / kw;
    base = taper(y);
  }
  base *= ${gf(PAT.paper)} * fade * fade * (3.0 - 2.0 * fade) * fl;   // 정면 뷰는 가까워 끝이 선으로 보이므로 부드럽게
  if (kind == 1 && y < ${gf(LY + 0.5)}) return vec3(0.0, 0.0, base);   // splitLY: 광원 높이 ±0.5 띠는 비우고 아래쪽만 바닥에 닿는다
  float tv = (y - ${gf(A.ylo)}) / ${gf(A.yhi - A.ylo)};
  if (tv < 0.0 || tv > 1.0) return vec3(0.0, 0.0, base);
  vec2 m = texture(uMotif, vec2((th - dth) / TAU, tv)).rg;
  return vec3(m.x * fade * fl, m.y * fade, base);
}
void main() {
  vec2 c = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) * vec2(${gf(W)}, ${gf(H)}) / uSize;   // 장면 좌표(css px)
  vec3 O = uO, dv = uRt * ((c.x - uCam.x) / uCam.z) - uUp * ((c.y - uCam.y) / uCam.z) + uFw;
  float best = 1e9; int sid = -1;
${quads.join('\n')}
  // 병풍은 폭들의 평균 평면 위 점으로 투영한다 (2D와 같음)
  vec3 P = sid == ${iByo} ? O + dv * ((${gf(SB.v)} - dot(${gv3(SB.N)}, O)) / dot(${gv3(SB.N)}, dv)) : O + dv * best;
  vec2 uv = c / vec2(${gf(W)}, ${gf(H)});
  vec3 lg = vec3(0.0);
${lamps}
  o = vec4(lg, 1.0);
}`;
}
// 2D의 blur(paperBlur) → reflect()를 가로·세로 가우스 두 번으로. 마지막 번에 두 번 더하고 표면색을 곱한다
const GL_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc, uAlb;
uniform vec2 uDir, uSize;
uniform int uN, uFinal;
uniform float uW[33];
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 s = texture(uSrc, uv).rgb * uW[0];
  for (int i = 1; i <= uN; i++) { vec2 d = uDir * float(i) / uSize; s += (texture(uSrc, uv + d).rgb + texture(uSrc, uv - d).rgb) * uW[i]; }
  o = uFinal == 1 ? vec4(min(2.0 * s, 1.0) * texture(uAlb, vec2(uv.x, 1.0 - uv.y)).rgb, 1.0) : vec4(s, 1.0);
}`;
function glInit() {
  const cyl = LANTERNS.filter(L => L.type === 'cy');
  if (!cyl.length) return null;
  // ?roomgl=0 이면 2D 경로로 그린다 (비교용)
  if (/[?&]roomgl=0(&|$)/.test(location.search)) return null;
  const c = document.createElement('canvas');
  // GPU가 없어 소프트웨어로 돌아가는 WebGL(SwiftShader 등)은 2D보다 훨씬 느리다 → 그런 환경이면 컨텍스트를 받지 않고 2D로 그린다
  const gl = c.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: true,
    failIfMajorPerformanceCaveat: !PAT.glSoftware });
  if (!gl) return null;
  if (!PAT.glSoftware) {   // failIfMajorPerformanceCaveat가 소프트웨어 렌더러를 못 거르는 경우가 있어 이름으로도 본다
    const ri = gl.getExtension('WEBGL_debug_renderer_info'), rn = String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(rn)) { const lc = gl.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); return null; }
  }
  const A = motifAtlas();
  const sh = (type, src) => {
    const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
    return o;
  };
  const vs = sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}');
  const prog = fs => {
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    return pr;
  };
  const pr = prog(glShader(cyl, A, FRONT_EXTRA)), pb = prog(GL_BLUR);
  gl.useProgram(pr);
  const tex = (unit, wrapS) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  // 0: 무늬 (θ 방향 반복) / 1: 표면색 / 2…: 등마다 바탕빛(이미 구운 것)
  tex(0, gl.REPEAT);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, A.w, A.h, 0, gl.RG, gl.UNSIGNED_BYTE, A.data);
  // 표면색은 시점마다 다르다(본 장면 ALB / 정면 뷰 front.alb). 지금 올라가 있는 쪽을 기억해 바뀔 때만 다시 올린다
  let albOn = null;
  const upAlb = src => { gl.activeTexture(gl.TEXTURE1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); albOn = src; };
  tex(1, gl.CLAMP_TO_EDGE); upAlb(ALB);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);   // 2D 캔버스 합성과 같은 곱해진 알파로 받는다
  cyl.forEach((L, i) => { tex(2 + i, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, L.paperBase); });
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.uniform1i(gl.getUniformLocation(pr, 'uMotif'), 0);
  gl.uniform1iv(gl.getUniformLocation(pr, 'uBase'), cyl.map((_, i) => 2 + i));
  const uDth = gl.getUniformLocation(pr, 'uDth'), uSize = gl.getUniformLocation(pr, 'uSize');
  const U = Object.fromEntries(['uO', 'uRt', 'uUp', 'uFw', 'uCam', 'uView'].map(n => [n, gl.getUniformLocation(pr, n)]));
  const CAMS = {
    main: { O: [0, EYE, 0], Rt: [1, 0, 0], Up: [0, 1, 0], Fw: [0, 0, -1], Cam: [CX, CY, F], view: 0 },
    front: { O: [FV.x, FV.y, FV.z], Rt: [0, 0, 1], Up: [0, 1, 0], Fw: [1, 0, 0], Cam: [FV.CX, FV.CY, FV.F], view: 1 },
  };
  // 중간 버퍼 2장 (빛 합 → 가로 블러). 단위 2+등 수부터
  const fbu = 2 + cyl.length, fb = [0, 1].map(i => {
    const t = tex(fbu + i, gl.CLAMP_TO_EDGE), f = gl.createFramebuffer();
    return { t, f, u: fbu + i };
  });
  gl.useProgram(pb);
  gl.uniform1i(gl.getUniformLocation(pb, 'uAlb'), 1);
  const B = { src: gl.getUniformLocation(pb, 'uSrc'), dir: gl.getUniformLocation(pb, 'uDir'), size: gl.getUniformLocation(pb, 'uSize'),
    n: gl.getUniformLocation(pb, 'uN'), fin: gl.getUniformLocation(pb, 'uFinal'), w: gl.getUniformLocation(pb, 'uW') };
  let kSig = -1;
  const G = { c, gl, albDirty: false, lost: false };
  c.addEventListener('webglcontextlost', e => { e.preventDefault(); G.lost = true; if (GLP === G) { GLP = null; paperSp = null; } });
  G.draw = (sp, view = 'main') => {
    if (G.lost) return false;
    const w = Math.max(1, Math.round(W * dpr * PAT.glScale)), h = Math.max(1, Math.round(H * dpr * PAT.glScale));
    if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h;
      for (const b of fb) {
        gl.activeTexture(gl.TEXTURE0 + b.u); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, b.t, 0);
      }
    }
    gl.viewport(0, 0, w, h);
    const alb = view === 'front' ? front.alb : ALB;
    if (G.albDirty || albOn !== alb) { upAlb(alb); G.albDirty = false; }
    // 1) 등마다 바탕빛 − 윤곽 + 무늬를 더한 빛 (2D의 lg, 블러 전)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb[0].f);
    gl.useProgram(pr);
    gl.uniform2f(uSize, w, h);
    gl.uniform1fv(uDth, cyl.concat(FRONT_EXTRA).map(L => L.sd * sp));
    const V = CAMS[view];
    for (const k of ['O', 'Rt', 'Up', 'Fw', 'Cam']) gl.uniform3fv(U['u' + k], V[k]);
    gl.uniform1i(U.uView, V.view);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2) 가우스 블러 σ = paperBlur 장면 px (GL px로 환산) → 가로, 세로 + reflect
    gl.useProgram(pb);
    const sig = PAT.paperBlur * w / W;
    if (sig !== kSig) {
      kSig = sig;
      const n = Math.min(32, Math.ceil(sig * 3)), ws = Array.from({ length: n + 1 }, (_, i) => Math.exp(-i * i / (2 * sig * sig)));
      const tot = ws.reduce((a, v, i) => a + (i ? 2 * v : v), 0);
      gl.uniform1i(B.n, n); gl.uniform1fv(B.w, ws.map(v => v / tot));
    }
    gl.uniform2f(B.size, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb[1].f);
    gl.uniform1i(B.src, fb[0].u); gl.uniform2f(B.dir, 1, 0); gl.uniform1i(B.fin, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.uniform1i(B.src, fb[1].u); gl.uniform2f(B.dir, 0, 1); gl.uniform1i(B.fin, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  };
  return G;
}
function glPaper(sp) {
  if (!GLP.draw(sp)) return paperLight(sp);
  paperLayer = GLP.c;
  paperSp = sp; paperView = 'main';
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
  darken(g);
}
// 밤 실내: 곱하기로 전체를 어둡게 (푸른 기)
function darken(g) {
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
const spinAngle = () => (spinClock * Math.PI * 2 / SPIN_PERIOD) % (Math.PI * 2);
// 시점: 'main' = 본 장면 / 'front' = 병풍 정면 뷰 / 'lantern' = 스탠딩 랜턴 근접 뷰.
// 바꿀 때는 직전 화면을 떠 두고 그 위로 새 시점을 서서히 드러낸다(setView)
let viewMode = 'main', wantView = null, onView = null, paperView = 'main', fadeFrom = null, fadeBuf = null, fadeT0 = 0;
const FADE_MS = 700;
function draw() {
  if (viewMode === 'front' && front) drawFront();
  else if (viewMode === 'lantern') drawLantern();
  else drawMain();
  if (fadeFrom) {
    const u = (performance.now() - fadeT0) / FADE_MS;
    if (u >= 1) fadeFrom = null;
    else { ctx.globalAlpha = 1 - u * u * (3 - 2 * u); ctx.drawImage(fadeFrom, 0, 0, W, H); ctx.globalAlpha = 1; }
  }
}
function drawMain() {
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
  const sp = spinAngle();
  if (litLayer) {
    if (paperSp !== sp || paperView !== 'main') { if (GLP) glPaper(sp); else paperLight(sp); }
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
// 병풍 정면 뷰: 등이 없어 빛까지 구운 정적 바탕 하나로 끝난다
function drawFront() {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(front.base, 0, 0, W, H);
  vignette();
}
// 시점 바꾸기. instant: 세계 전환 등으로 바로 돌아갈 때.
// 정면 뷰는 장면 준비가 끝나야, 랜턴 뷰는 랜턴 컴포넌트를 불러와 구운 뒤에 열린다. 아직이면 false를 돌려주고,
// 랜턴 뷰는 굽기가 끝나는 대로(그 사이 다른 시점을 고르지 않았다면) 넘어가며 onView로 알린다
const VIEWS = ['main', 'front', 'lantern'];
function setView(v, instant) {
  v = VIEWS.includes(v) ? v : 'main';
  wantView = v;
  if (v === viewMode) return true;
  if (v === 'front') {
    if (!ready) return false;
    if (!front) { try { buildFront(); } catch (e) { console.warn('[room] 정면 뷰 생성 실패:', e); return false; } }
  }
  if (v === 'lantern' && !lanternV) {
    buildLanternView().then(() => {
      if (wantView === 'lantern' && viewMode !== 'lantern' && setView('lantern') && onView) onView(viewMode);
    }).catch(e => console.warn('[room] 랜턴 뷰 생성 실패:', e));
    return false;
  }
  fadeFrom = null;
  if (!instant && !reduce && built) {
    if (!fadeBuf) fadeBuf = mkLayer();
    const [fc, fg] = fadeBuf;
    fg.clearRect(0, 0, W, H); fg.drawImage(cv, 0, 0, W, H);
    fadeFrom = fc; fadeT0 = performance.now();
  }
  viewMode = v;
  draw();
  return true;
}
function vignette(a = 0.55) {
  const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${a})`);
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
  // 좁은 화면에서 잘릴 때 가운데로 둘 x: 랜턴 뷰는 오른쪽으로 치우친 등을 따라간다
  const fx = viewMode === 'lantern' ? LV.focusX : W / 2;
  const ox = Math.min(0, Math.max(vw - dw, vw / 2 - fx * s));
  vg.setTransform(vdpr, 0, 0, vdpr, 0, 0);
  vg.fillStyle = '#05070d'; vg.fillRect(0, 0, vw, vh);
  vg.drawImage(cv, ox, (vh - dh) / 2, dw, dh);
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
    s.src = 'components/yachiroom.umd.js';
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
  if (S.flicker || S.spin || fadeFrom) draw();
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
// 허브 핀용 우측 병풍 기하 (css px, 카메라 적용 전). 6폭 전체 AABB의 중심+반폭.
function byobuGeom() {
  const none = { x: 0, y: 0, ext: { l: 0, r: 0, t: 0, b: 0 }, visible: false };
  try {
    if (!running || !built || viewMode !== 'main' || vw <= 0 || vh <= 0) return none;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const P of BYO_P) {
      const pts = byoRect(P, 0, BYO.w, 0, BYO.h);
      for (const q of pts) {
        if (q[0] < minX) minX = q[0];
        if (q[0] > maxX) maxX = q[0];
        if (q[1] < minY) minY = q[1];
        if (q[1] > maxY) maxY = q[1];
      }
    }
    if (!(maxX > minX && maxY > minY)) return none;
    const s = Math.max(vw / W, vh / H), dw = W * s, dh = H * s;
    const ox = (vw - dw) / 2, oy = (vh - dh) / 2;
    // 화면과 겹치지 않으면(세로 화면 크롭 등) 핀을 숨긴다
    if (ox + maxX * s < 0 || ox + minX * s > vw || oy + maxY * s < 0 || oy + minY * s > vh) return none;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const ex = (maxX - minX) / 2, ey = (maxY - minY) / 2;
    return { x: ox + cx * s, y: oy + cy * s,
      ext: { l: ex * s, r: ex * s, t: ey * s, b: ey * s }, visible: true };
  } catch (e) { return none; }
}
resize();
window.TsukuyomiRoom = { start, stop, setScene,
  get running() { return running; },
  get scene() { return 'room'; },
  get bg() { return '#05070d'; },
  get byobu() { return byobuGeom(); },
  // 병풍 정면 뷰: setView('front') / setView('main', instant). 허브 병풍 랜드마크가 확대 대신 쓴다
  setView, get view() { return viewMode; },
  // 시점이 비동기로 바뀌었을 때(랜턴 뷰 굽기 완료) 부를 함수. UI 동기화용
  set onView(fn) { onView = typeof fn === 'function' ? fn : null; },
};
window.__ROOM__ = { get ready() { return ready; }, start, stop, setView, get view() { return viewMode; }, get byobu() { try { return byobuGeom(); } catch (e) { return null; } } };

})();
