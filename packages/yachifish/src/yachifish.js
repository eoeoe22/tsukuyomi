// yachifish — 네온 물고기 떼 이펙트를 웹페이지에 넣는 단일 파일 패키지.
// 원본: examples/물고기 이펙트 초안 Argon.html <script> (DOM 컨트롤러 결합 제거, 인스턴스화, seq 모드 제외)
// 의존성 없음. ESM 소스. UMD/Min은 build.mjs가 여기서 생성.

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 논리 높이 고정. 폭(S.W)은 인스턴스마다 컨테이너 비율로 정해짐 (원본: 800×450 고정)
const H = 450;
const rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const f1 = n => (Math.round(n * 10) / 10).toString();

// "#rgb" / "#rrggbb" → [r, g, b]. 그 외 형식은 null
function hxRGB(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.replace(/./g, ch => ch + ch);
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mixRGB = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const mixW = (c, k) => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
const scaleRGB = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;
const hex = c => "#" + c.map(v => clamp(v | 0, 0, 255).toString(16).padStart(2, "0")).join("");

// =========================================================================
// 1. 레퍼런스(fisheffect.mp4) 기반 5종 물고기 실루엣 & 내부 기하·골격 무늬 정의
// =========================================================================
// 좌표계: u ∈ [-0.32, 1.0] (u=1 주둥이 끝, u=0 꼬리자루, u<0 꼬리지느러미)
//         v ∈ [-1, 1] (몸통 반높이 H(u)에 대한 상대 비율; +v 등쪽, -v 배쪽)
//
// 모티프 종류 (type 1..5):
//   1: 마름모·점열형 (세장형, 앞몸통 마름모 ◇ + 척추 점열 •• + 꼬리 삼각형 ◁) — f258, f268
//   2: X-마름모 사슬형 (중형, 몸통 전체 |╳|╳| 마름모 사슬 + 꼬리 삼각형 ◁) — f245, f247
//   3: 광폭 대형 마름모형 (복어/돔형 넓은 몸통 + 중앙 큰 마름모 ◇ + 노란 눈점 2개 + 꼬리 ◁) — f247, f255, f265
//   4: 사각 마디 사슬형 (중형, 척추 따라 ▢▢▢ 사각 창 + 대각선 결 + 꼬리 ◁) — f247, f265
//   5: 어골·청어뼈형 (머리 캡 + 척추선 + <<< 갈비뼈/청어뼈 + 꼬리 ◁) — f95, f116, f177

const SIL_STD = [
  [0.00, 0.22], [0.10, 0.44], [0.28, 0.82], [0.48, 0.98],
  [0.66, 0.92], [0.82, 0.66], [0.93, 0.34], [1.00, 0.00]
];
const SIL_WIDE = [
  [0.00, 0.24], [0.10, 0.56], [0.28, 0.96], [0.50, 1.08],
  [0.70, 0.96], [0.85, 0.68], [0.95, 0.34], [1.00, 0.00]
];

function evalProfile(prof, u) {
  if (u <= 0) return prof[0][1];
  if (u >= 1) return 0;
  for (let k = 1; k < prof.length; k++) {
    if (u <= prof[k][0]) {
      const [u0, h0] = prof[k - 1], [u1, h1] = prof[k];
      const t = (u - u0) / (u1 - u0);
      return h0 + (h1 - h0) * (t * t * (3 - 2 * t));
    }
  }
  return 0;
}

// 각 모티프(1..5)의 로컬 폴리곤·선분·점 템플릿 생성 (척추 변환 전 (u, y_norm) 좌표)
function createMotifGeometry(type) {
  const isWide = type === 3;
  const isSlender = type === 1;
  const baseAspect = isWide ? 0.44 : isSlender ? 0.22 : 0.26;
  const prof = isWide ? SIL_WIDE : SIL_STD;
  const hAt = u => baseAspect * 0.5 * evalProfile(prof, u);

  // 외곽 실루엣 정점 (주둥이 → 등선 + 등지느러미 → 꼬리 상엽 → 꼬리 홈 → 꼬리 하엽 → 배선 + 배지느러미)
  const outline = [];
  const usFwd = [1.0, 0.95, 0.88, 0.78, 0.68, 0.58, 0.50, 0.44, 0.36, 0.26, 0.14, 0.0];
  for (const u of usFwd) {
    let y = hAt(u) * 0.96;
    // 등지느러미 돌출
    if (u === 0.50) y += baseAspect * (isWide ? 0.22 : 0.26);
    else if (u === 0.44) y += baseAspect * (isWide ? 0.16 : 0.18);
    outline.push([u, y]);
  }
  // 꼬리지느러미 (넓게 퍼진 삼각 V자형 — 레퍼런스 특유의 ◁ 꼬리)
  const tailLen = isWide ? 0.27 : 0.30;
  const tailH = baseAspect * (isWide ? 0.62 : 0.72);
  outline.push(
    [-tailLen * 0.52, tailH * 0.60],
    [-tailLen, tailH],
    [-tailLen * 0.66, 0],
    [-tailLen, -tailH],
    [-tailLen * 0.52, -tailH * 0.60]
  );
  const usBack = [0.0, 0.14, 0.26, 0.34, 0.40, 0.50, 0.62, 0.74, 0.86, 0.95];
  for (const u of usBack) {
    let y = -hAt(u) * 1.04;
    // 배지느러미 돌출
    if (u === 0.34) y -= baseAspect * (isWide ? 0.20 : 0.22);
    else if (u === 0.40) y -= baseAspect * (isWide ? 0.12 : 0.13);
    outline.push([u, y]);
  }

  // 내부 어두운 속창 폴리곤(windows), 밝은 네온 선분(lines), 닫힌 네온 테두리(loops), 점 장식(dots)
  // dots 원소: { u, y, r, yellow }
  const windows = [];
  const loops = [];
  const lines = [];
  const dots = [];

  // 모든 모티프 공통: 꼬리지느러미 내부 삼각형 (◁)
  const tTri = [
    [-0.02, 0],
    [-tailLen * 0.80, tailH * 0.64],
    [-tailLen * 0.54, 0],
    [-tailLen * 0.80, -tailH * 0.64]
  ];
  windows.push(tTri);
  loops.push(tTri);

  if (type === 1) {
    // ① 마름모·점열형 (◇ • • ◁): 앞몸통 마름모 창 + 척추 점 2~3개 + 눈점
    const u0 = 0.46, um = 0.64, u1 = 0.82;
    const hm = hAt(um) * 0.66;
    const dia = [[u0, 0], [um, hm], [u1, 0], [um, -hm]];
    windows.push(dia);
    loops.push(dia);
    dots.push(
      { u: 0.34, y: 0, r: 0.022, yellow: false },
      { u: 0.21, y: 0, r: 0.019, yellow: false },
      { u: 0.10, y: 0, r: 0.015, yellow: false },
      { u: 0.89, y: hAt(0.89) * 0.22, r: 0.014, yellow: true }
    );
  } else if (type === 2) {
    // ② X-마름모 사슬형 (|╳|╳|╳| ◁): 몸통을 따라 3개의 연결된 마름모 + 세로 갈비선
    const segs = [[0.10, 0.31], [0.32, 0.55], [0.56, 0.80]];
    for (const [ua, ub] of segs) {
      const um = (ua + ub) * 0.5;
      const hm = hAt(um) * 0.68;
      const dia = [[ua, 0], [um, hm], [ub, 0], [um, -hm]];
      windows.push(dia);
      loops.push(dia);
      // 마름모 사이 세로 구분선 & 내부 X 보강선
      lines.push([[um, hm * 0.92], [um, -hm * 0.92]]);
    }
    lines.push([[0.315, hAt(0.315) * 0.72], [0.315, -hAt(0.315) * 0.72]]);
    lines.push([[0.555, hAt(0.555) * 0.75], [0.555, -hAt(0.555) * 0.75]]);
    dots.push({ u: 0.88, y: hAt(0.88) * 0.22, r: 0.015, yellow: false });
  } else if (type === 3) {
    // ③ 광폭 대형 마름모 + 노란 눈점 2개 (레퍼런스 f247 청록 광폭어, f255/f265 분홍 광폭어)
    const u0 = 0.27, um = 0.53, u1 = 0.77;
    const hm = hAt(um) * 0.68;
    const bigDia = [[u0, 0], [um, hm], [u1, 0], [um, -hm]];
    const inDia = [[u0 + 0.05, 0], [um, hm * 0.76], [u1 - 0.05, 0], [um, -hm * 0.76]];
    windows.push(bigDia);
    loops.push(bigDia, inDia);
    // 마름모 앞쪽 꼭짓점 안의 노란 발광점 + 머리 양옆 노란 눈점 + 뒤쪽 점
    dots.push(
      { u: 0.69, y: 0, r: 0.028, yellow: true },
      { u: 0.84, y: hAt(0.84) * 0.48, r: 0.025, yellow: true },
      { u: 0.84, y: -hAt(0.84) * 0.48, r: 0.025, yellow: true },
      { u: 0.14, y: 0, r: 0.019, yellow: false }
    );
  } else if (type === 4) {
    // ④ 사각 마디 사슬형 (▢ ▢ ▢ ◁): 척추를 따라 3개의 사다리꼴/사각 박스 창 + 내부 대각선 결
    const boxes = [[0.11, 0.29], [0.33, 0.53], [0.57, 0.77]];
    for (const [ua, ub] of boxes) {
      const ha = hAt(ua) * 0.54, hb = hAt(ub) * 0.54;
      const bx = [[ua, ha], [ub, hb], [ub, -hb], [ua, -ha]];
      windows.push(bx);
      loops.push(bx);
      lines.push([[ua + 0.02, -ha * 0.75], [ub - 0.02, hb * 0.75]]);
    }
    dots.push({ u: 0.87, y: hAt(0.87) * 0.20, r: 0.016, yellow: true });
  } else {
    // ⑤ 어골·청어뼈형 (<<< ◁): 아가미 경계선 + 척추선 + V자 청어뼈 갈비선 + 마름모 속창
    const gillU = 0.76, gh = hAt(gillU) * 0.82;
    lines.push([[gillU, gh], [gillU - 0.04, 0], [gillU, -gh]]);
    lines.push([[0.04, 0], [gillU - 0.04, 0]]);
    const chevU = [0.16, 0.30, 0.44, 0.58];
    for (const cu of chevU) {
      const ch = hAt(cu) * 0.76;
      lines.push([[cu - 0.06, ch], [cu + 0.05, 0], [cu - 0.06, -ch]]);
    }
    const hdDia = [[0.78, 0], [0.85, hAt(0.85) * 0.48], [0.93, 0], [0.85, -hAt(0.85) * 0.48]];
    windows.push(hdDia);
    loops.push(hdDia);
    dots.push({ u: 0.86, y: hAt(0.86) * 0.22, r: 0.015, yellow: false });
  }

  return { type, baseAspect, outline, windows, loops, lines, dots };
}

const MOTIFS = [null, 1, 2, 3, 4, 5].map(t => t ? createMotifGeometry(t) : null);

// =========================================================================
// 2. 척추 곡선 변환: (u, y_local) → 화면 (X, Y)
// =========================================================================
// 물고기가 선회하거나 파동칠 때 몸통과 내부 기하 무늬가 함께 유기적인 곡선으로 휜다.
function mapFishPoint(u, yLocal, st, o) {
  // st = { x, y, hd, sz, ph, bend, aspectMul, foreshorten }
  const s = (u - 0.45) * st.foreshorten;
  const w = clamp(1.12 - u, 0.08, 1.42);
  const wagOff = o.wag * Math.sin(st.ph - u * 5.2) * w * w;
  const bendOff = st.bend * s * s;
  const yc = wagOff + bendOff;
  // 접선 기울기 dyc/du 근사
  const slope = (-5.2 * o.wag * Math.cos(st.ph - u * 5.2) * w * w + 2 * st.bend * s) * 0.55;
  const inv = 1 / Math.hypot(1, slope);
  const tx = inv, ty = slope * inv;
  const nx = -ty, ny = tx;

  const yy = yLocal * o.aspect * st.aspectMul;
  const lx = (s + yy * nx) * st.sz;
  const ly = (yc + yy * ny) * st.sz;

  const c = Math.cos(st.hd), sn = Math.sin(st.hd);
  return [st.x + lx * c - ly * sn, st.y + lx * sn + ly * c];
}

function bakeFishInstance(f, st, o) {
  const M = MOTIFS[f.motif];
  const mapPoly = pts => pts.map(([u, y]) => mapFishPoint(u, y, st, o));
  return {
    f,
    st,
    col: o.pal[f.ci % o.pal.length],
    out: mapPoly(M.outline),
    windows: M.windows.map(mapPoly),
    loops: M.loops.map(mapPoly),
    lines: M.lines.map(mapPoly),
    dots: M.dots.map(d => ({
      pt: mapFishPoint(d.u, d.y, st, o),
      r: Math.max(1.1, d.r * st.sz * Math.sqrt(o.aspect)),
      yellow: d.yellow
    }))
  };
}

// 구체 회전 좌표계 변환 (구체 중심: cx, cy, 반지름: Rs)
function spherePointAndVel(lat, lon, tiltDeg, rollDeg) {
  const cl = Math.cos(lat), sl = Math.sin(lat);
  const co = Math.cos(lon), so = Math.sin(lon);
  // 구면 점 P0 및 경도 방향 단위 접선 T0
  let x = cl * so, y = sl, z = cl * co;
  let tx = cl * co, ty = 0, tz = -cl * so;

  // X축 기울기(tilt) → Z축 기울기(roll: 레퍼런스 구체처럼 왼쪽 위→오른쪽 위로 흐르는 사선 밴드)
  const T = rad(tiltDeg), ct = Math.cos(T), st = Math.sin(T);
  const y1 = y * ct - z * st, z1 = y * st + z * ct;
  const ty1 = ty * ct - tz * st, tz1 = ty * st + tz * ct;

  const R = rad(rollDeg), cr = Math.cos(R), sr = Math.sin(R);
  const x2 = x * cr - y1 * sr, y2 = x * sr + y1 * cr;
  const tx2 = tx * cr - ty1 * sr, ty2 = tx * sr + ty1 * cr;

  return { x: x2, y: y2, z: z1, tx: tx2, ty: ty2, tz: tz1 };
}

// =========================================================================
// 3. 모드 · 프리셋 · 기본값
// =========================================================================
// 원본 컨트롤러의 seq(구체 → 폭발 시퀀스)는 제외
const MODES = Object.freeze(["sphere", "burst", "spiral", "rise", "bokeh"]);

// 원본 MODE_PRESETS 그대로 (seq 제외). 키 = 원본 컨트롤러 input id
const PRESETS = Object.freeze({
  sphere: Object.freeze({ motif: 0, size: 48, aspect: 1.0, wag: 0.085, patA: 0.88, winD: 0.58, fillA: 0.72, nMid: 184, nNear: 24, nFar: 24, farBlur: 7.0, farA: 0.32, spd: 1.15, swR: 0.18, tilt: -24, persp: 1.45, swirl: 1.25, trail: 2, trailA: 0.22, glow: 0.85, glowR: 9, spark: 28, aurora: 0.35, refl: 0.68, hz: 0.64, bg0: "#02060e", bg1: "#09101b" }),
  burst: Object.freeze({ motif: 0, size: 58, aspect: 1.0, wag: 0.105, patA: 0.96, winD: 0.66, fillA: 0.66, nMid: 96, nNear: 36, nFar: 48, farBlur: 6.0, farA: 0.48, spd: 1.0, swR: 0.18, tilt: -20, persp: 2.15, swirl: 1.1, trail: 3, trailA: 0.24, glow: 0.76, glowR: 10, spark: 38, aurora: 0.68, refl: 0.52, hz: 0.68, bg0: "#071422", bg1: "#0f2132" }),
  spiral: Object.freeze({ motif: 5, size: 60, aspect: 0.96, wag: 0.09, patA: 0.9, winD: 0.55, fillA: 0.64, nMid: 64, nNear: 24, nFar: 60, farBlur: 7.5, farA: 0.45, spd: 1.25, swR: 0.22, tilt: -15, persp: 1.5, swirl: 1.2, trail: 5, trailA: 0.34, glow: 0.72, glowR: 9, spark: 26, aurora: 0.2, refl: 0.0, hz: 0.82, bg0: "#06070d", bg1: "#0c1422" }),
  rise: Object.freeze({ motif: 1, size: 46, aspect: 0.95, wag: 0.11, patA: 0.9, winD: 0.6, fillA: 0.7, nMid: 56, nNear: 18, nFar: 36, farBlur: 6.0, farA: 0.38, spd: 1.0, swR: 0.18, tilt: -20, persp: 1.5, swirl: 0.8, trail: 3, trailA: 0.25, glow: 0.75, glowR: 9, spark: 34, aurora: 0.25, refl: 0.65, hz: 0.62, bg0: "#040811", bg1: "#0b1420" }),
  bokeh: Object.freeze({ motif: 0, size: 52, aspect: 1.0, wag: 0.075, patA: 0.92, winD: 0.62, fillA: 0.68, nMid: 18, nNear: 9, nFar: 190, farBlur: 5.0, farA: 0.75, spd: 0.6, swR: 0.2, tilt: 0, persp: 1.4, swirl: 0.4, trail: 1, trailA: 0.18, glow: 0.72, glowR: 8, spark: 20, aurora: 0.4, refl: 0.0, hz: 0.85, bg0: "#09242e", bg1: "#05111a" })
});

const DEFAULTS = Object.freeze({
  mode: "sphere",
  ...PRESETS.sphere,
  // 원본 c0~c5 슬라이더 초기값
  palette: Object.freeze(["#ff6ad5", "#52f2ff", "#f4f255", "#ffaa5c", "#6aaeff", "#6bf5a8"]),
  seed: 17,
  // 마운트 전용 (원본에 없음)
  background: true, autoplay: true, interactive: true, maxPixelRatio: 2
});

const ORB_COUNT = 90;
const NUM_KEYS = Object.keys(PRESETS.sphere).filter(k => k !== "bg0" && k !== "bg1").concat("seed", "maxPixelRatio");
const REBUILD_POP = ["nMid", "nNear", "nFar", "seed", "motif"];

function sanitize(o) {
  const out = { ...o };
  if (!MODES.includes(out.mode)) throw new Error(`yachifish: 알 수 없는 mode '${out.mode}' (가능: ${MODES.join(", ")})`);
  for (const k of NUM_KEYS) {
    const v = +out[k];
    out[k] = Number.isFinite(v) ? v : DEFAULTS[k];
  }
  out.motif = clamp(Math.round(out.motif), 0, 5);
  for (const k of ["nMid", "nNear", "nFar", "trail"]) out[k] = Math.max(0, Math.round(out[k]));
  out.spark = clamp(Math.round(out.spark), 0, ORB_COUNT);
  out.seed = Math.round(out.seed);
  out.size = Math.max(1, out.size);
  out.spd = Math.max(0, out.spd);
  out.hz = clamp(out.hz, 0.05, 1);
  out.maxPixelRatio = clamp(out.maxPixelRatio, 0.25, 4);
  out.bg0 = String(out.bg0);
  out.bg1 = String(out.bg1);
  const pal = Array.isArray(out.palette) ? out.palette.map(hxRGB) : [];
  if (!pal.length || pal.some(c => !c)) throw new Error("yachifish: palette는 '#rrggbb' 또는 '#rgb' 문자열이 1개 이상 든 배열이어야 합니다");
  out.palette = out.palette.slice();
  return { o: out, pal };
}

// =========================================================================
// 4. 개체군 & 5대 연출 시뮬레이션 (구체 소용돌이 / 3D 방사 확산 / 나선 상승 / 수면 상승 / 보케)
// =========================================================================
// S: 인스턴스 상태 { W, fish, orbs, ripples, tNow, burstClock, ... }
const isSph = o => o.mode === "sphere" || o.mode === "burst";

function pickMotif(r, motifOpt) {
  if (motifOpt >= 1 && motifOpt <= 5) return motifOpt;
  // 레퍼런스 빈도: 마름모·점열(30%), X-마름모 사슬(26%), 광폭 대형 마름모(16%), 사각 마디(14%), 어골·청어뼈(14%)
  const u = r();
  return u < 0.30 ? 1 : u < 0.56 ? 2 : u < 0.72 ? 3 : u < 0.86 ? 4 : 5;
}

function buildPop(S, o) {
  const W = S.W;
  const r = mulberry32((o.seed ^ 0x27d4eb2f) >>> 0);
  const fish = [];

  const makeFish = (layer, idx, total) => {
    // 구체 위 분포: 피보나치 구면 + 상단 북극 소용돌이 캡 밀집
    const u = (idx + 0.5) / Math.max(1, total);
    let lat0 = Math.asin(clamp(2 * u - 1 + (r() - 0.5) * 0.1, -0.97, 0.97));
    if (r() < 0.24) lat0 = 0.48 + r() * 0.46;
    const lon0 = (idx * 2.3999632 + r() * 0.45) % (Math.PI * 2);
    const isOutlier = layer === 1 && r() < 0.11;
    const sphShell = isOutlier ? (1.04 + r() * 0.22) : (0.78 + r() * 0.22);

    // 3D 방사 확산 방향: 위쪽 하늘 전방위 + 좌우 측면·하단 모서리까지 퍼지는 250° 부채꼴 (정중앙 바닥만 피함)
    const uAng = (idx + (r() - 0.5) * 0.8) / Math.max(1, total);
    const fan = (uAng * 2 - 1);
    const shaped = Math.sign(fan) * Math.pow(Math.abs(fan), 0.86);
    const burstAng = -Math.PI * 0.5 + shaped * (Math.PI * 0.68);
    const burstElev = (r() - 0.5) * 0.18;

    return {
      L: layer, // 0: 원경 보케, 1: 주 군집(구체·중경), 2: 근경 대형
      motif: pickMotif(r, o.motif),
      ci: Math.floor(r() * 6),
      x: r() * W,
      y: r() * H,
      hd: -0.4,
      bend: 0,
      ph: r() * 6.283,
      sm: 0.78 + r() * 0.48,
      sk: 0.75 + r() * 0.48,
      aspectMul: 0.92 + r() * 0.18,
      lat0,
      lon0,
      sphShell,
      isOutlier,
      burstAng,
      burstElev,
      // 폭발 시 빈 도넛이 생기지 않도록 출발 지연과 방사 속도를 넓게 분포
      burstDelay: Math.pow(r(), 1.05) * 0.64,
      burstSpd: 0.18 + Math.pow(r(), 0.9) * 1.15,
      streamPhase: r(),
      kx: 0,
      ky: 0,
      hist: []
    };
  };

  for (let k = 0; k < o.nFar; k++) fish.push(makeFish(0, k, o.nFar));
  for (let k = 0; k < o.nMid; k++) fish.push(makeFish(1, k, o.nMid));
  for (let k = 0; k < o.nNear; k++) fish.push(makeFish(2, k, o.nNear));

  // 빛방울(둥근 발광 구체) & 십자 반짝이 입자
  const orbs = [];
  for (let k = 0; k < ORB_COUNT; k++) {
    orbs.push({
      ang: r() * Math.PI * 2,
      rad: 0.05 + r() * 0.95,
      yOff: (r() - 0.5) * H * 0.85,
      x: r() * W,
      y: r() * H,
      sz: 1.8 + r() * 4.2,
      ci: Math.floor(r() * 6),
      ph: r() * 6.283,
      sp: 0.5 + r() * 1.1,
      isStar: r() < 0.42
    });
  }

  S.fish = fish;
  S.orbs = orbs;
  S.ripples = [
    { x: W * 0.5, y: H * 0.76, r: 18, maxR: 135, a: 0.7 },
    { x: W * 0.36, y: H * 0.82, r: 55, maxR: 120, a: 0.4 }
  ];
}

// 폭발 진행도 burstP ∈ [0, 1] (0 = 단단한 회전 구체)
function getBurstProgress(S, o) {
  if (o.mode === "sphere") {
    if (S.burstClock < 0) return 0;
    const u = S.burstClock / 3.2;
    if (u >= 1) return 0;
    return Math.sin(u * Math.PI) * 0.55;
  }
  if (o.mode === "burst") return 1;
  return 0;
}

function triggerBurst(S, o) {
  S.burstClock = 0.001;
  // 바닥 수면 파문 추가
  const hzY = H * o.hz;
  S.ripples.push({ x: S.W * 0.5 + (Math.random() - 0.5) * 60, y: hzY + 28 + Math.random() * 45, r: 4, maxR: 150, a: 0.9 });
}

function update(S, o, dt) {
  const W = S.W;
  S.tNow += dt;
  const tNow = S.tNow;
  if (S.burstClock >= 0) {
    S.burstClock += dt * o.spd;
    if (S.burstClock > 3.4) S.burstClock = -1;
  }

  const hzY = H * o.hz;
  const sphCx = W * 0.5;
  const Rs = H * o.swR;
  const sphCy = Math.min(hzY - Rs * 0.88, H * 0.46);
  const burstP = getBurstProgress(S, o);
  const histLen = o.trail * 2 + 1;

  for (const f of S.fish) {
    const layerSpd = f.L === 0 ? 0.55 : f.L === 1 ? 0.92 : 1.18;
    f.ph += dt * (7.5 + o.spd * 4.5) * f.sm;

    if (isSph(o)) {
      // 구체 위 각속도: 적도 부근이 빠르고 양극으로 갈수록 완만
      const spinRate = (1.65 + 0.55 * f.sm) * o.spd * (o.swirl >= 0 ? 1 : -1);
      const lon = f.lon0 + tNow * spinRate;
      const lat = f.lat0 + Math.sin(tNow * 1.4 + f.lon0 * 2) * 0.07;
      const sp = spherePointAndVel(lat, lon, o.tilt, -18);
      const rShell = Rs * (f.L === 0 ? 0.82 * f.sphShell : f.sphShell * (f.L === 2 ? 1.04 : 0.98));

      const sx = sphCx + sp.x * rShell;
      const sy = sphCy - sp.y * rShell;
      const shd = Math.atan2(-sp.ty, sp.tx);
      const sForeshorten = clamp(Math.hypot(sp.tx, sp.ty), 0.36, 1.0);

      if (f.L === 0 && o.mode === "burst") {
        // 방사 모드에서 원경 보케 개체: 하늘 위쪽에서 은은하게 퍼짐
        const ang = tNow * 0.22 * o.spd + f.lon0;
        f.x = (f.x + Math.cos(ang) * 26 * o.spd * dt + W) % W;
        f.y = (f.y - (12 + Math.sin(ang) * 9) * o.spd * dt + hzY) % hzY;
        f.hd = -0.35 + Math.sin(ang) * 0.25;
        f.zDepth = -0.9;
        f.scaleMul = 0.44 * f.sk;
        f.foreshorten = 1;
        f.alphaMul = 0.72;
        continue;
      }

      if (o.mode === "burst") {
        // 연속 3D 방사 확산 스트림
        const u = (f.streamPhase + tNow * 0.24 * o.spd * (0.68 + 0.45 * f.sm)) % 1;
        const easeR = Math.pow(u, 1.08);
        const spiralAng = f.burstAng + o.swirl * 0.34 * (1 - u);
        const rx = W * 0.64 * easeR * (0.45 + 0.65 * f.burstSpd);
        const ry = H * 0.66 * easeR * (0.45 + 0.65 * f.burstSpd);

        f.x = sphCx + Math.cos(spiralAng) * rx + f.kx * 0.2;
        f.y = sphCy + (Math.sin(spiralAng) + f.burstElev * 0.25) * ry + f.ky * 0.2;

        const vx = Math.cos(spiralAng) * W - o.swirl * 0.32 * Math.sin(spiralAng) * 140;
        const vy = (Math.sin(spiralAng) + f.burstElev * 0.25) * H * 0.85 + o.swirl * 0.32 * Math.cos(spiralAng) * 90;
        f.hd = Math.atan2(vy, vx);
        f.bend = clamp(o.swirl * 0.24 * (1 - 0.35 * u), -0.42, 0.42);
        f.zDepth = -0.5 + 1.5 * u * (f.L === 2 ? 1.15 : 0.75);
        const perspScale = lerp(0.24, o.persp * (f.L === 2 ? 1.15 : 0.68), Math.pow(u, 1.32));
        f.scaleMul = perspScale * f.sk;
        f.foreshorten = 0.90;
        f.alphaMul = smstep(0.0, 0.10, u) * (1 - smstep(0.84, 1.0, u));
      } else {
        // 구체(burstP=0) ↔ 3D 방사 폭발(burstP>0) 부드러운 보간
        const bp = clamp((burstP - f.burstDelay * 0.50) / (1 - f.burstDelay * 0.50), 0, 1);
        const easeBp = bp * bp * (3 - 2 * bp);
        const spiralAng = f.burstAng + o.swirl * 0.36 * easeBp;
        const rx = (f.L === 2 ? 0.64 : 0.54) * W * f.burstSpd * easeBp;
        const ry = (f.L === 2 ? 0.66 : 0.56) * H * f.burstSpd * easeBp;
        const bx = sphCx + Math.cos(spiralAng) * rx;
        const by = sphCy + (Math.sin(spiralAng) + f.burstElev * 0.25) * ry;

        const bhd = Math.atan2(
          (Math.sin(spiralAng) + f.burstElev * 0.25) * H * 0.85,
          Math.cos(spiralAng) * W
        );

        f.x = lerp(sx, bx, easeBp) + f.kx * dt * 8;
        f.y = lerp(sy, by, easeBp) + f.ky * dt * 8;
        let dA = bhd - shd;
        dA = Math.atan2(Math.sin(dA), Math.cos(dA));
        f.hd = shd + dA * easeBp;
        f.bend = lerp(clamp(-sp.y * 0.26, -0.34, 0.34), clamp(o.swirl * 0.24, -0.38, 0.38), easeBp);

        // 구체 상태일 때는 물고기들이 구체 표면을 가득 메우고(0.36~0.52x), 폭발 시 원근 확대
        const sphScale = (f.isOutlier ? 0.26 : f.L === 2 ? 0.50 : f.L === 1 ? 0.42 : 0.35) * (0.78 + 0.28 * (sp.z + 1) * 0.5);
        const burstScale = lerp(0.28, o.persp * (f.L === 2 ? 1.15 : 0.68), Math.pow(easeBp * f.burstSpd, 1.12));
        f.scaleMul = lerp(sphScale, burstScale, easeBp) * f.sk;
        f.foreshorten = lerp(sForeshorten, 0.90, easeBp);
        f.zDepth = lerp(sp.z, -0.3 + easeBp * f.burstSpd * (f.L === 2 ? 1.2 : 0.65), easeBp);
        const sphAlpha = sp.z < 0 ? lerp(0.38, 0.68, sp.z + 1) : lerp(0.84, 1.0, sp.z);
        f.alphaMul = lerp(sphAlpha, 1 - 0.35 * smstep(0.86, 1.0, easeBp), easeBp);
      }
    } else if (o.mode === "spiral") {
      // 좌하단→우상단으로 휘감아 오르는 나선 상승 유영 + 잔상
      const sp = o.spd * 95 * layerSpd * f.sm;
      const waveAng = -0.58 + Math.sin(tNow * 1.6 + f.x * 0.008 + f.lon0) * 0.38 * o.swirl;
      f.hd = waveAng;
      f.bend = Math.cos(tNow * 1.6 + f.x * 0.008 + f.lon0) * 0.28 * o.swirl;
      f.x += (Math.cos(f.hd) * sp + f.kx) * dt;
      f.y += (Math.sin(f.hd) * sp + f.ky) * dt;
      f.scaleMul = (f.L === 0 ? 0.5 : f.L === 1 ? 0.82 : 1.18) * f.sk;
      f.foreshorten = 0.94;
      f.zDepth = f.L === 2 ? 0.8 : f.L === 1 ? 0.1 : -0.7;
      f.alphaMul = 1;
    } else if (o.mode === "rise") {
      // 수면 파문에서 작은 물고기들이 수직·나선으로 솟아오름
      const sp = o.spd * 78 * layerSpd * f.sm;
      const sway = Math.sin(tNow * 2.4 + f.y * 0.018 + f.lon0) * 0.36;
      f.hd = -Math.PI * 0.5 + sway;
      f.bend = Math.cos(tNow * 2.4 + f.y * 0.018 + f.lon0) * 0.25;
      f.x += (Math.cos(f.hd) * sp + f.kx) * dt;
      f.y += (Math.sin(f.hd) * sp + f.ky) * dt;
      if (f.y < -40) {
        f.y = hzY + 10 + Math.random() * (H - hzY - 20);
        f.x = W * (0.2 + Math.random() * 0.6);
        f.hist.length = 0;
        if (Math.random() < 0.28 && S.ripples.length < 10) {
          S.ripples.push({ x: f.x, y: f.y, r: 3, maxR: 85 + Math.random() * 55, a: 0.65 });
        }
      }
      const hRatio = clamp((hzY + 40 - f.y) / (hzY + 40), 0, 1);
      f.scaleMul = (f.L === 0 ? 0.42 : f.L === 1 ? 0.68 : 0.95) * f.sk * (0.65 + 0.45 * Math.sin(hRatio * Math.PI));
      f.foreshorten = 0.92;
      f.zDepth = f.L - 1;
      f.alphaMul = smstep(0, 0.08, hRatio) * (1 - smstep(0.88, 1.0, hRatio));
    } else {
      // 보케: 가득 흐린 물고기 보케 + 소수의 선명한 근경 유영
      const sp = o.spd * (f.L === 0 ? 24 : 52) * f.sm;
      const dir = f.lon0 > Math.PI ? 0 : Math.PI;
      f.hd = dir + Math.sin(tNow * 1.1 + f.lon0) * 0.22;
      f.bend = Math.cos(tNow * 1.1 + f.lon0) * 0.16;
      f.x += (Math.cos(f.hd) * sp + f.kx) * dt;
      f.y += (Math.sin(f.hd) * sp + f.ky) * dt;
      f.scaleMul = (f.L === 0 ? 0.85 : f.L === 1 ? 0.78 : 1.12) * f.sk;
      f.foreshorten = 0.95;
      f.zDepth = f.L - 1;
      f.alphaMul = f.L === 1 ? 0.35 : 0.95;
    }

    // 클릭 반발 감쇠 및 화면 경계 래핑 (비구체 모드)
    const kd = Math.exp(-3.0 * dt);
    f.kx *= kd; f.ky *= kd;

    if (o.mode === "spiral" || o.mode === "bokeh" || f.L === 0) {
      const pad = 90;
      let wrapped = false;
      if (f.x < -pad) { f.x += W + pad * 2; wrapped = true; }
      else if (f.x > W + pad) { f.x -= W + pad * 2; wrapped = true; }
      if (f.y < -pad) { f.y += H + pad * 2; wrapped = true; }
      else if (f.y > H + pad) { f.y -= H + pad * 2; wrapped = true; }
      if (wrapped) f.hist.length = 0;
    }

    // 잔상 히스토리 저장
    if (f.L > 0) {
      f.hist.push({
        x: f.x, y: f.y, hd: f.hd,
        sz: o.size * f.scaleMul,
        ph: f.ph, bend: f.bend,
        aspectMul: f.aspectMul,
        foreshorten: f.foreshorten
      });
      if (f.hist.length > histLen) f.hist.splice(0, f.hist.length - histLen);
    }
  }

  // 빛방울(orbs) & 수면 파문(ripples) 업데이트
  for (const ob of S.orbs) {
    ob.ph += dt * (2.2 + ob.sp) * o.spd;
    if (isSph(o)) {
      ob.ang += dt * 0.9 * o.spd * ob.sp;
    } else {
      ob.y -= dt * 28 * ob.sp * o.spd;
      ob.x += Math.sin(ob.ph) * 14 * dt;
      if (ob.y < -10) { ob.y = H + 10; ob.x = Math.random() * W; }
    }
  }
  for (const rp of S.ripples) {
    rp.r += dt * 58 * o.spd;
    rp.a = Math.max(0, 1 - rp.r / rp.maxR) * 0.7;
  }
  S.ripples = S.ripples.filter(rp => rp.r < rp.maxR);
}

// =========================================================================
// 5. 장면 데이터 조립 (캔버스 & SVG 공용)
// =========================================================================
function buildSceneData(S, o) {
  const W = S.W;
  const farList = [], backSphere = [], midList = [], nearList = [];
  const burstP = getBurstProgress(S, o);
  const inSphereCore = o.mode === "sphere";
  for (const f of S.fish) {
    if (f.alphaMul <= 0.02) continue;
    // 화면 밖 멀리 나간 개체 컬링
    if (f.x < -160 || f.x > W + 160 || f.y < -160 || f.y > H + 160) continue;
    const st = {
      x: f.x, y: f.y, hd: f.hd,
      sz: o.size * (f.scaleMul || 0.7),
      ph: f.ph, bend: f.bend || 0,
      aspectMul: f.aspectMul,
      foreshorten: f.foreshorten || 1
    };
    const inst = bakeFishInstance(f, st, o);
    inst.alpha = f.alphaMul;
    inst.z = f.zDepth || 0;

    // 잔상(ghosts)
    inst.ghosts = [];
    if (f.L > 0 && o.trail > 0 && o.trailA > 0 && f.hist.length > 2) {
      const M = MOTIFS[f.motif];
      for (let k = 1; k <= o.trail; k++) {
        const hi = f.hist.length - 1 - k * 2;
        if (hi < 0) break;
        const hst = f.hist[hi];
        if (Math.hypot(hst.x - f.x, hst.y - f.y) > 140) break;
        inst.ghosts.push({
          out: M.outline.map(([u, y]) => mapFishPoint(u, y, hst, o)),
          a: o.trailA * (1 - (k - 1) / o.trail) * f.alphaMul
        });
      }
    }

    if ((f.L === 0 && !inSphereCore) || (o.mode === "bokeh" && f.L === 1 && f.ci % 2 === 0)) {
      farList.push(inst);
    } else if (o.mode === "sphere" && inst.z < -0.05) {
      backSphere.push(inst);
    } else if (f.L <= 1) {
      midList.push(inst);
    } else {
      nearList.push(inst);
    }
  }
  backSphere.sort((a, b) => a.z - b.z);
  midList.sort((a, b) => a.z - b.z);
  nearList.sort((a, b) => a.z - b.z);

  // 현재 활성 빛방울 위치 계산
  const hzY = H * o.hz;
  const sphCx = W * 0.5;
  const Rs = H * o.swR;
  const sphCy = Math.min(hzY - Rs * 0.88, H * 0.46);
  const activeOrbs = [];
  const nOrbs = Math.min(S.orbs.length, o.spark);

  for (let i = 0; i < nOrbs; i++) {
    const ob = S.orbs[i];
    let x = ob.x, y = ob.y, szMul = 1;
    if (isSph(o)) {
      const rBase = Rs * (0.94 + 0.30 * ob.rad);
      const rBurst = W * 0.56 * ob.rad;
      const bp = o.mode === "burst" ? ((ob.rad + S.tNow * 0.18 * ob.sp) % 1) : burstP;
      const rr = lerp(rBase, rBurst, bp);
      x = sphCx + Math.cos(ob.ang) * rr;
      y = sphCy + Math.sin(ob.ang) * rr * lerp(0.95, 0.68, bp);
      szMul = lerp(0.52, 1.05, bp);
    }
    const pulse = 0.55 + 0.45 * Math.sin(ob.ph);
    activeOrbs.push({
      x, y,
      r: ob.sz * szMul * (0.75 + 0.35 * pulse),
      col: o.pal[ob.ci % o.pal.length],
      a: (0.45 + 0.5 * pulse),
      isStar: ob.isStar
    });
  }

  return { farList, backSphere, midList, nearList, activeOrbs, hzY, sphCx, sphCy, Rs, burstP };
}

// =========================================================================
// 6. 캔버스 렌더러 (다중 레이어 합성)
// =========================================================================
function tracePoly(g, pts) {
  if (!pts.length) return;
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
  g.closePath();
}
function traceOpen(g, pts) {
  if (!pts.length) return;
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
}

function drawSilhouette(g, pts, col, a) {
  g.beginPath();
  tracePoly(g, pts);
  g.fillStyle = rgba(col, a);
  g.fill();
}

// 개별 물고기 상세 렌더 (투명 홀로그램 스테인드글라스 네온 질감):
// 1) 밝은 파스텔 네온 몸통 채움
// 2) 마름모(◇)·사각창(▢)·꼬리삼각형(◁) 내부는 고채도 원색 네온 창(winCol)으로 대비 확보
// 3) 부드러운 네온 후광 스트로크 + 고휘도 화이트-네온 코어 선(loops/lines) 및 노란/흰 발광 점(dots)
function drawDetailedFish(g, inst, o, layerAlpha) {
  const a = inst.alpha * layerAlpha;
  if (a <= 0.02) return;
  const col = inst.col;
  const bodyCol = mixW(col, 0.42);
  const winCol = mixRGB(bodyCol, scaleRGB(col, 0.78), o.winD * 0.85);
  const glowLineCol = mixW(col, 0.55);
  const lineCol = mixW(col, 0.92);
  const rimCol = mixW(col, 0.68);
  const yellowCol = [255, 244, 118];

  // 잔상
  for (const gh of inst.ghosts) {
    drawSilhouette(g, gh.out, mixW(col, 0.2), gh.a * 0.45);
  }

  // 1) 몸통 실루엣 채움
  g.beginPath();
  tracePoly(g, inst.out);
  g.fillStyle = rgba(bodyCol, o.fillA * a);
  g.fill();

  // 2) 기하 무늬 속창
  if (o.winD > 0.02 && inst.windows.length) {
    g.beginPath();
    for (const wPoly of inst.windows) tracePoly(g, wPoly);
    g.fillStyle = rgba(winCol, Math.min(0.92, (o.fillA + 0.12) * a));
    g.fill();
  }

  // 3) 외곽 네온 테두리
  const lw = clamp(inst.st.sz * 0.022, 0.7, 2.1);
  g.beginPath();
  tracePoly(g, inst.out);
  g.strokeStyle = rgba(rimCol, 0.92 * a);
  g.lineWidth = lw;
  g.lineJoin = "round";
  g.stroke();

  // 4) 내부 기하·골격 네온 선 (색 번짐 + 흰빛 코어 2패스)
  if (o.patA > 0.02) {
    const pa = Math.min(1, o.patA * a);
    g.beginPath();
    for (const lp of inst.loops) tracePoly(g, lp);
    for (const ln of inst.lines) traceOpen(g, ln);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = rgba(glowLineCol, pa * 0.48);
    g.lineWidth = lw * 2.2;
    g.stroke();
    g.strokeStyle = rgba(lineCol, pa);
    g.lineWidth = lw * 1.05;
    g.stroke();

    // 5) 내부 점열 및 광폭어 노란 눈점/코어점
    for (const d of inst.dots) {
      const dc = d.yellow ? yellowCol : lineCol;
      g.beginPath();
      g.arc(d.pt[0], d.pt[1], d.r * 1.45, 0, Math.PI * 2);
      g.fillStyle = rgba(dc, pa * 0.48);
      g.fill();
      g.beginPath();
      g.arc(d.pt[0], d.pt[1], d.r * 0.82, 0, Math.PI * 2);
      g.fillStyle = rgba(mixW(dc, 0.75), pa);
      g.fill();
    }
  }
}

function drawOrbOrStar(g, ob) {
  const hi = mixW(ob.col, 0.75);
  if (ob.isStar) {
    const s = ob.r * 1.65, x = ob.x, y = ob.y;
    g.fillStyle = rgba(hi, ob.a);
    g.beginPath();
    g.moveTo(x, y - s); g.lineTo(x + s * 0.18, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.18, y); g.closePath();
    g.moveTo(x - s, y); g.lineTo(x, y + s * 0.18); g.lineTo(x + s, y); g.lineTo(x, y - s * 0.18); g.closePath();
    g.fill();
  } else {
    const rg = g.createRadialGradient(ob.x, ob.y, 0, ob.x, ob.y, ob.r * 2.2);
    rg.addColorStop(0, rgba([255, 255, 255], ob.a));
    rg.addColorStop(0.4, rgba(hi, ob.a * 0.85));
    rg.addColorStop(1, rgba(ob.col, 0));
    g.fillStyle = rg;
    g.beginPath();
    g.arc(ob.x, ob.y, ob.r * 2.2, 0, Math.PI * 2);
    g.fill();
  }
}

// 캔버스 filter의 blur 반경은 변환 행렬과 무관하게 비트맵 픽셀 단위이므로 렌더 배율(S.s)을 곱함
const blurPx = (S, px) => `blur(${(px * S.s).toFixed(2)}px)`;

function drawFrame(S, o) {
  const W = S.W;
  const { ctx, farC, farG, gloC, gloG, sceneC, sceneG, reflC, reflG } = S;
  const sc = S.s;
  const { farList, backSphere, midList, nearList, activeOrbs, hzY, sphCx, sphCy, Rs, burstP } = buildSceneData(S, o);

  // 1. 배경 (밤하늘 + 수평선 아래 수면·바닥). background:false면 투명
  sceneG.globalCompositeOperation = "source-over";
  sceneG.filter = "none";
  sceneG.globalAlpha = 1;
  if (o.background) {
    const skyG = sceneG.createLinearGradient(0, 0, 0, hzY);
    skyG.addColorStop(0, o.bg0);
    skyG.addColorStop(1, o.bg1);
    sceneG.fillStyle = skyG;
    sceneG.fillRect(0, 0, W, hzY + 2);

    const flG = sceneG.createLinearGradient(0, hzY, 0, H);
    flG.addColorStop(0, o.bg1);
    flG.addColorStop(1, "#05080f");
    sceneG.fillStyle = flG;
    sceneG.fillRect(0, hzY, W, H - hzY);
  } else {
    sceneG.clearRect(0, 0, W, H);
  }

  // 2. 오로라 빛기둥 & 구체 코어 후광 (배경의 일부이므로 background:false면 생략)
  if (o.background && o.aurora > 0.01) {
    sceneG.save();
    sceneG.globalCompositeOperation = "lighter";
    const aurA = o.aurora * (o.mode === "burst" ? 0.34 : lerp(0.14, 0.34, burstP));
    const pillars = [
      [sphCx - W * 0.16, W * 0.11, [75, 235, 195]],
      [sphCx, W * 0.15, [85, 220, 250]],
      [sphCx + W * 0.16, W * 0.11, [110, 240, 185]]
    ];
    for (const [px, pw, pc] of pillars) {
      const pg = sceneG.createRadialGradient(px, hzY * 0.65, 4, px, hzY * 0.55, pw * 1.9);
      pg.addColorStop(0, rgba(pc, aurA));
      pg.addColorStop(0.5, rgba(pc, aurA * 0.4));
      pg.addColorStop(1, rgba(pc, 0));
      sceneG.fillStyle = pg;
      sceneG.fillRect(px - pw * 2, 0, pw * 4, hzY);
    }
    if (isSph(o)) {
      const coreR = Rs * lerp(1.3, 2.1, burstP);
      const cg = sceneG.createRadialGradient(sphCx, sphCy, 2, sphCx, sphCy, coreR);
      cg.addColorStop(0, rgba([190, 245, 255], 0.28 * o.aurora));
      cg.addColorStop(0.45, rgba([120, 220, 245], 0.11 * o.aurora));
      cg.addColorStop(1, "rgba(0,0,0,0)");
      sceneG.fillStyle = cg;
      sceneG.fillRect(sphCx - coreR, sphCy - coreR, coreR * 2, coreR * 2);
    }
    sceneG.restore();
  }

  // 3. 원경 보케 레이어 (강한 블러)
  if (farList.length && o.farA > 0.01) {
    farG.clearRect(0, 0, W, H);
    farG.globalCompositeOperation = "lighter";
    for (const it of farList) {
      drawSilhouette(farG, it.out, mixW(it.col, 0.18), 0.85 * it.alpha);
    }
    sceneG.save();
    sceneG.globalCompositeOperation = "lighter";
    sceneG.globalAlpha = o.farA;
    sceneG.filter = o.farBlur > 0 ? blurPx(S, o.farBlur) : "none";
    sceneG.drawImage(farC, 0, 0, W, H);
    sceneG.restore();
  }

  // 4. 중경·구체 물고기 블룸 및 본체 (수면 반사의 대상이 되는 하늘·중경 층)
  if (o.glow > 0.01) {
    gloG.clearRect(0, 0, W, H);
    gloG.globalCompositeOperation = "lighter";
    for (const it of [...backSphere, ...midList]) {
      drawSilhouette(gloG, it.out, it.col, 0.72 * it.alpha);
      for (const gh of it.ghosts) drawSilhouette(gloG, gh.out, it.col, gh.a * 0.65);
    }
    sceneG.save();
    sceneG.globalCompositeOperation = "lighter";
    sceneG.globalAlpha = Math.min(1, o.glow);
    sceneG.filter = blurPx(S, o.glowR);
    sceneG.drawImage(gloC, 0, 0, W, H);
    sceneG.restore();
  }

  sceneG.save();
  sceneG.filter = "none";
  for (const it of backSphere) drawDetailedFish(sceneG, it, o, 0.75);

  // 구체 표면을 감싸 흐르는 짧은 빛 실선
  if (o.mode === "sphere" && burstP < 0.65) {
    const ringA = (1 - burstP / 0.65) * 0.34;
    sceneG.lineWidth = 1.0;
    sceneG.lineCap = "round";
    for (let k = 0; k < 10; k++) {
      const lat = -0.68 + (k / 9) * 1.36;
      const lonBase = S.tNow * 1.8 * o.spd + k * 1.9;
      sceneG.strokeStyle = rgba(mixW(o.pal[k % o.pal.length], 0.65), ringA);
      sceneG.beginPath();
      let started = false;
      for (let s = 0; s <= 10; s++) {
        const lon = lonBase + s * 0.09;
        const p = spherePointAndVel(lat, lon, o.tilt, -18);
        if (p.z < 0) continue;
        const x = sphCx + p.x * Rs * 0.98, y = sphCy - p.y * Rs * 0.98;
        if (!started) { sceneG.moveTo(x, y); started = true; }
        else sceneG.lineTo(x, y);
      }
      sceneG.stroke();
    }
  }

  for (const it of midList) drawDetailedFish(sceneG, it, o, 0.94);
  sceneG.restore();

  // 5. 메인 캔버스에 하늘·중경 복사 후, 수평선 아래 블러된 수면·바닥 반사 합성
  // (전경 nearList 물고기는 반사 합성 뒤에 그려 수평선 절단선이 전경 물고기를 가로지르지 않게 함)
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(sceneC, 0, 0, W, H);

  if (o.refl > 0.01 && hzY < H - 10) {
    const reflH = H - hzY;
    // sceneC의 상반부(하늘·구체)를 블러 버퍼 reflC에 한 번 흐리게 구워 물결 반사 소스로 사용
    reflG.clearRect(0, 0, W, H);
    reflG.save();
    reflG.filter = blurPx(S, 4.5);
    reflG.drawImage(sceneC, 0, 0, W, H);
    reflG.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, hzY, W, reflH);
    ctx.clip();

    ctx.globalCompositeOperation = "lighter";
    const step = 3;
    for (let r = 0; r < reflH; r += step) {
      const k = r / reflH;
      const srcY = hzY - r * 1.12 - step;
      if (srcY < 0) break;
      const dx = (1.5 + 8 * k * k) * Math.sin(r * 0.24 - S.tNow * 4.2);
      // 수평선 경계(r=0)에서 부드럽게 시작해 절단선이 생기지 않도록 fadeIn 적용
      const fadeIn = smstep(0, 12, r);
      const rowA = o.refl * 0.58 * fadeIn * (1 - k * 0.78);
      if (rowA <= 0.01) continue;
      ctx.globalAlpha = rowA;
      ctx.drawImage(
        reflC,
        0, srcY * sc, W * sc, step * 1.12 * sc,
        dx, hzY + r, W, step + 0.5
      );
    }

    // 바닥 데크/수면 가로 결 (배경이 있을 때만)
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (o.background) {
      for (let r = 6; r < reflH; r += Math.max(5, r * 0.16)) {
        const y = hzY + r;
        ctx.strokeStyle = `rgba(6,11,20,${(0.22 + 0.36 * (r / reflH)).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    // 수면 위 동심원 파문
    ctx.globalCompositeOperation = "lighter";
    for (const rp of S.ripples) {
      if (rp.y < hzY) continue;
      const perspY = clamp((rp.y - hzY) / reflH * 0.42 + 0.12, 0.12, 0.5);
      ctx.strokeStyle = `rgba(150,235,255,${(rp.a * o.refl).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * perspY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. 최전경(nearList) 물고기 블룸 + 본체 + 빛방울/반짝이 합성
  if (nearList.length && o.glow > 0.01) {
    gloG.clearRect(0, 0, W, H);
    gloG.globalCompositeOperation = "lighter";
    for (const it of nearList) {
      drawSilhouette(gloG, it.out, it.col, 0.95 * it.alpha);
      for (const gh of it.ghosts) drawSilhouette(gloG, gh.out, it.col, gh.a * 0.65);
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, o.glow);
    ctx.filter = blurPx(S, o.glowR);
    ctx.drawImage(gloC, 0, 0, W, H);
    ctx.restore();
  }

  ctx.save();
  ctx.filter = "none";
  for (const it of nearList) drawDetailedFish(ctx, it, o, 1.0);
  ctx.globalCompositeOperation = "lighter";
  for (const ob of activeOrbs) drawOrbOrStar(ctx, ob);
  ctx.restore();
}

// =========================================================================
// 7. SVG 스냅샷 내보내기 (현재 프레임의 기하 무늬·블룸 포함)
// =========================================================================
function buildSVG(S, o) {
  const W = S.W;
  const { farList, backSphere, midList, nearList, activeOrbs, hzY } = buildSceneData(S, o);
  const pd = pts => "M" + pts.map(p => f1(p[0]) + " " + f1(p[1])).join("L") + "Z";
  const po = pts => "M" + pts.map(p => f1(p[0]) + " " + f1(p[1])).join("L");
  const sil = (pts, col, a) => `<path d="${pd(pts)}" fill="${hex(col)}" fill-opacity="${clamp(a, 0, 1).toFixed(2)}"/>`;

  const renderFishSVG = (inst, layerAlpha) => {
    const a = inst.alpha * layerAlpha;
    if (a <= 0.02) return "";
    const col = inst.col;
    const bodyRGB = mixW(col, 0.42);
    const bodyCol = hex(bodyRGB);
    const winCol = hex(mixRGB(bodyRGB, scaleRGB(col, 0.78), o.winD * 0.85));
    const lineCol = hex(mixW(col, 0.92));
    const rimCol = hex(mixW(col, 0.68));
    const lw = f1(clamp(inst.st.sz * 0.022, 0.7, 2.1));
    let s = `<g>`;
    for (const gh of inst.ghosts) s += sil(gh.out, col, gh.a * 0.48);
    s += `<path d="${pd(inst.out)}" fill="${bodyCol}" fill-opacity="${(o.fillA * a).toFixed(2)}" stroke="${rimCol}" stroke-opacity="${(0.92 * a).toFixed(2)}" stroke-width="${lw}" stroke-linejoin="round"/>`;
    if (o.winD > 0.02 && inst.windows.length) {
      s += `<path d="${inst.windows.map(pd).join("")}" fill="${winCol}" fill-opacity="${Math.min(0.92, (o.fillA + 0.15) * a).toFixed(2)}"/>`;
    }
    if (o.patA > 0.02) {
      const pa = Math.min(1, o.patA * a).toFixed(2);
      const dStr = inst.loops.map(pd).join("") + inst.lines.map(po).join("");
      if (dStr) s += `<path d="${dStr}" fill="none" stroke="${lineCol}" stroke-opacity="${pa}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
      for (const d of inst.dots) {
        const dc = d.yellow ? "#fff476" : lineCol;
        s += `<circle cx="${f1(d.pt[0])}" cy="${f1(d.pt[1])}" r="${f1(d.r)}" fill="${dc}" fill-opacity="${pa}"/>`;
      }
    }
    return s + `</g>`;
  };

  const allMain = [...backSphere, ...midList, ...nearList];
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<defs><style>.add{mix-blend-mode:screen}</style>`,
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.bg0}"/><stop offset="1" stop-color="${o.bg1}"/></linearGradient>`,
    `<linearGradient id="flr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.bg1}"/><stop offset="1" stop-color="#05080f"/></linearGradient>`,
    `<filter id="fFar" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="${o.farBlur}"/></filter>`,
    `<filter id="fGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${o.glowR}"/></filter>`,
    `</defs>`
  ];
  if (o.background) {
    out.push(
      `<rect width="${W}" height="${f1(hzY)}" fill="url(#sky)"/>`,
      `<rect y="${f1(hzY)}" width="${W}" height="${f1(H - hzY)}" fill="url(#flr)"/>`
    );
  }

  if (farList.length && o.farA > 0.01) {
    out.push(`<g class="add" filter="url(#fFar)" opacity="${o.farA.toFixed(2)}">${farList.map(it => sil(it.out, mixW(it.col, 0.18), 0.85 * it.alpha)).join("")}</g>`);
  }
  if (o.glow > 0.01 && allMain.length) {
    out.push(`<g class="add" filter="url(#fGlow)" opacity="${Math.min(1, o.glow).toFixed(2)}">${allMain.map(it => sil(it.out, it.col, (it.f.L === 2 ? 0.95 : 0.68) * it.alpha)).join("")}</g>`);
  }
  out.push(`<g>${backSphere.map(it => renderFishSVG(it, 0.72)).join("")}${midList.map(it => renderFishSVG(it, 0.92)).join("")}${nearList.map(it => renderFishSVG(it, 1.0)).join("")}</g>`);
  if (activeOrbs.length) {
    out.push(`<g class="add">${activeOrbs.map(ob => `<circle cx="${f1(ob.x)}" cy="${f1(ob.y)}" r="${f1(ob.r)}" fill="${hex(mixW(ob.col, 0.7))}" fill-opacity="${ob.a.toFixed(2)}"/>`).join("")}</g>`);
  }
  out.push(`</svg>`);
  return out.join("\n");
}

// =========================================================================
// 8. 인스턴스
// =========================================================================
function resolveEl(target) {
  if (typeof target === "string") {
    if (typeof document === "undefined") throw new Error("yachifish: document 없음. target element를 직접 전달하세요.");
    const el = document.querySelector(target);
    if (!el) throw new Error(`yachifish: '${target}' 요소를 찾을 수 없음`);
    return el;
  }
  if (!target || typeof target !== "object") throw new Error("yachifish: target(CSS 선택자 또는 DOM 요소)이 필요합니다");
  return target;
}

class YachiFish {
  constructor(target, userOpts = {}) {
    this.el = resolveEl(target);
    const mode = userOpts.mode !== undefined ? userOpts.mode : DEFAULTS.mode;
    // 모드 프리셋을 깔고 그 위에 사용자 옵션
    this._apply(sanitize({ ...DEFAULTS, ...PRESETS[mode], ...userOpts }));
    this.playing = this.o.autoplay !== false;
    const S = this.S = { W: 800, s: 1, bw: 0, bh: 0, fish: [], orbs: [], ripples: [], tNow: 0, burstClock: -1 };
    this._raf = 0;
    this._last = 0;
    this._dead = false;
    this._visible = true;

    if (typeof document === "undefined") { buildPop(S, this.ro); return; } // node 테스트용: 상태만 구성

    // 컨테이너에 높이가 있으면 꽉 채우고, 없으면 16:9
    const cs = getComputedStyle(this.el);
    const innerH = this.el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    const cv = document.createElement("canvas");
    cv.style.display = "block";
    cv.style.width = "100%";
    if (innerH < 1) cv.style.aspectRatio = "16 / 9";
    else cv.style.height = "100%";
    this.el.appendChild(cv);
    this.cv = cv;
    S.cv = cv;
    S.ctx = cv.getContext("2d");
    const mk = () => { const c = document.createElement("canvas"); return [c, c.getContext("2d")]; };
    [S.farC, S.farG] = mk();
    [S.gloC, S.gloG] = mk();
    [S.sceneC, S.sceneG] = mk();
    [S.reflC, S.reflG] = mk();
    this._measure();
    this._syncPointer();

    buildPop(S, this.ro);
    for (let i = 0; i < 15; i++) update(S, this.ro, 0.03); // 원본과 같은 예열
    drawFrame(S, this.ro);

    this._onDown = e => {
      if (e.button > 0 || !this.o.interactive) return;
      const r = cv.getBoundingClientRect();
      this.fire((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    cv.addEventListener("pointerdown", this._onDown);

    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => {
        if (this._measure() && !this.playing) drawFrame(S, this.ro);
      });
      this._ro.observe(cv);
    }
    // 화면 밖에 있으면 렌더 중지
    if (typeof IntersectionObserver !== "undefined") {
      this._io = new IntersectionObserver(entries => {
        this._visible = entries[entries.length - 1].isIntersecting;
        this._kick();
      });
      this._io.observe(cv);
    }

    this._loop = t => {
      this._raf = 0;
      if (this._dead || !this.playing || !this._visible) return;
      const dt = clamp((t - this._last) / 1000, 0, 0.05);
      this._last = t;
      update(S, this.ro, dt);
      drawFrame(S, this.ro);
      this._raf = requestAnimationFrame(this._loop);
    };
    this._kick();
  }

  _apply({ o, pal }) {
    this.o = o;
    this.ro = { ...o, pal }; // 렌더용 (팔레트 RGB 포함)
  }

  _kick() {
    if (this._raf || this._dead || !this.playing || !this._visible || !this.cv) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  _syncPointer() {
    if (!this.cv) return;
    // 상호작용이 꺼져 있으면 클릭이 아래 페이지로 통과
    this.cv.style.cursor = this.o.interactive ? "pointer" : "";
    this.cv.style.pointerEvents = this.o.interactive ? "" : "none";
  }

  // 표시 크기 → 논리 폭 W(높이 450 고정)와 비트맵 배율 결정. 바뀌었으면 true
  _measure() {
    const S = this.S;
    const r = this.cv.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) {
      if (S.bw) return false; // 숨김 상태: 기존 크기 유지
    }
    const cw = r.width >= 1 ? r.width : 16, ch = r.height >= 1 ? r.height : 9;
    const W = Math.round(H * clamp(cw / ch, 0.25, 5));
    const dpr = Math.min(this.o.maxPixelRatio, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const s = clamp((r.height >= 1 ? r.height : H) * dpr / H, 0.25, 8);
    const bw = Math.max(1, Math.round(W * s)), bh = Math.max(1, Math.round(H * s));
    if (W === S.W && bw === S.bw && bh === S.bh) return false;
    if (W !== S.W && S.fish.length) {
      // 폭이 바뀌면 가로 위치를 비례 이동
      const k = W / S.W;
      for (const f of S.fish) { f.x *= k; f.hist.length = 0; }
      for (const ob of S.orbs) ob.x *= k;
      for (const rp of S.ripples) rp.x *= k;
    }
    S.W = W; S.s = s; S.bw = bw; S.bh = bh;
    for (const [c, g] of [[S.cv, S.ctx], [S.farC, S.farG], [S.gloC, S.gloG], [S.sceneC, S.sceneG], [S.reflC, S.reflG]]) {
      c.width = bw; c.height = bh;
      g.setTransform(bw / W, 0, 0, bh / H, 0, 0);
    }
    return true;
  }

  set(partial = {}) {
    const prev = this.o;
    const modeChanged = partial.mode !== undefined && partial.mode !== prev.mode;
    // 모드가 바뀌면 그 모드 프리셋으로 시각 옵션을 초기화한 뒤 같은 호출의 값을 덮어씀
    const base = modeChanged ? { ...prev, ...PRESETS[partial.mode] } : prev;
    this._apply(sanitize({ ...base, ...partial }));
    const S = this.S;
    if (partial.autoplay !== undefined) this.playing = this.o.autoplay !== false;
    if (modeChanged) S.burstClock = -1;
    if (modeChanged || REBUILD_POP.some(k => this.o[k] !== prev[k])) buildPop(S, this.ro);
    if (this.cv) {
      if (this.o.maxPixelRatio !== prev.maxPixelRatio) this._measure();
      this._syncPointer();
      drawFrame(S, this.ro);
      this._kick();
    }
    return this.get();
  }

  get() { return { ...this.o, palette: this.o.palette.slice(), playing: this.playing }; }

  // x, y: 캔버스 기준 0~1 좌표 (생략 시 중앙 폭발만)
  fire(x, y) {
    const S = this.S, o = this.ro;
    triggerBurst(S, o);
    const at = Number.isFinite(x) && Number.isFinite(y);
    if (at) {
      // 지점 주변 물고기를 밀어내고 파문 방출
      const px = x * S.W, py = y * H;
      for (const f of S.fish) {
        const dx = f.x - px, dy = f.y - py, d = Math.hypot(dx, dy);
        if (d < 180 && d > 0.1) {
          const k = 280 * (1 - d / 180);
          f.kx += (dx / d) * k;
          f.ky += (dy / d) * k;
        }
      }
      S.ripples.push({ x: px, y: Math.max(py, H * o.hz + 6), r: 3, maxR: 130, a: 0.85 });
    }
    if (!this.playing && this.cv) { update(S, o, at ? 0.06 : 0.08); drawFrame(S, o); }
    return this;
  }

  play() { this.playing = true; this._kick(); return this; }
  pause() { this.playing = false; return this; }
  toggle() { return (this.playing ? this.pause() : this.play()).playing; }
  toSVG() { return buildSVG(this.S, this.ro); }

  destroy() {
    this._dead = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._ro) this._ro.disconnect();
    if (this._io) this._io.disconnect();
    if (this.cv) {
      this.cv.removeEventListener("pointerdown", this._onDown);
      this.cv.remove();
    }
  }
}

function yachifish(target, options) { return new YachiFish(target, options); }
yachifish.YachiFish = YachiFish;
yachifish.DEFAULTS = DEFAULTS;
yachifish.PRESETS = PRESETS;
yachifish.MODES = MODES;

export { yachifish, YachiFish, DEFAULTS, PRESETS, MODES };
export default yachifish;
