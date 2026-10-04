        (() => {
            const cv = document.getElementById('scene');
            const ctx = cv.getContext('2d');
            const sky = document.createElement('canvas');
            const S = sky.getContext('2d');
            const cloudLayer = document.createElement('canvas');
            const CL = cloudLayer.getContext('2d');
            // horizon-side blur for the reflection only
            const band = document.createElement('canvas');
            const BD = band.getContext('2d');
            const FILTER_OK = (() => { const t = document.createElement('canvas').getContext('2d'); t.filter = 'blur(1px)'; return t.filter === 'blur(1px)'; })();
            const BAND_SCALE = FILTER_OK ? 2 : 5;   // work at reduced resolution; without filter support the downscale itself blurs
            // NOTE: BAND_PAD/BLUR_PX/BAND_H 실값은 CFG에서 관리 (debug UI로 조절). 아래 구형 상수는 삭제됨.
            let bandH = 0;
            // band blur cache: 비싼 blur+복사는 BAND_EVERY 프레임마다만 갱신, 사이엔 blit만
            let bandTick = 0, bandValid = false, bandLastP = -1, bandBuilds = 0;
            // torii sprite and its flipped, darkened copy for the reflection
            const torC = document.createElement('canvas');
            const TC = torC.getContext('2d');
            const torR = document.createElement('canvas');
            const TR = torR.getContext('2d');
            let torS = 1, torX = 0, torY = 0, torW = 0, torH = 0, torBase = 0;
            // torii sprite cache: 색(p)/크기(dpr)가 바뀔 때만 torC/torR 재래스터
            let torKey = '', torRKey = '', torBuilds = 0;
            // sky-mirror downscale buffer (REFL_SCALE < 1일 때만 사용)
            const reflC = document.createElement('canvas');
            const RC = reflC.getContext('2d');
            const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
            // real torii and vignette live on their own layer above the ripple copy,
            // so only the mirror image bends
            const fg = document.getElementById('fg');
            const FG = fg.getContext('2d');

            const elPanel = document.getElementById('panel');
            const elStatus = document.getElementById('status');
            const elDay = document.getElementById('btnDay');
            const elDusk = document.getElementById('btnDusk');
            const elNight = document.getElementById('btnNight');

            // ---------- tunable params (F12 debug UI에서 수동 조절) ----------
            // 모든 수치 파라미터는 CFG 하나로 모음. 기본값 = 기존 하드코딩 값과 동일.
            // debug 패널(tsukuyomi.debug.js)이 window.__TSUKUYOMI__ 를 통해 live로 읽고 쓴다.
            const CFG = {
                T_NIGHT: 9.5, T_DAY: 2.4, W_SLOW: 0.025, TRAIL_LEN: 0.6,
                // 별 회전은 달 상승(mt)과 동일한 보간으로 동기화되며 별도 고속 단계가 없다.
                // 최종 궤적 길이는 TRAIL_LEN 그대로 유지된다.
                P_DUSK: 0.32,
                HZ_RATIO: 0.56, DPR_MAX: 2, PIX_BUDGET: 5e6,
                BAND_PAD: 12, BLUR_PX: 3, BAND_H: 0.3, BAND_EVERY: 3,
                POLE_X: 0.25, POLE_Y: 0.27,
                SUN_F: 0.03, SUN_MIN: 14, SUN_MAX: 34,
                MOON_F: 0.026, MOON_MIN: 12, MOON_MAX: 28,
                TORII_SCALE: 0.7, TORII_X: 0.76, TORII_BASE: 0.75,
                // TORII_X는 토리이 중심과 달 중심이 공유하는 수직선 (항상 같은 x)
                MOON_Y: 0.34,
                STAR_DENS: 2400, STAR_MAX: 1600, STAR_A0: 0.40, STAR_A1: 0.62,
                POLARIS_R: 0.7, HALO_R: 4, HALO_A: 0.35,
                MTN_H: 0.022, MTN_MIN: 6, MTN_MAX: 20, MTN_TH: 0.47, MTN_POW: 1.15,
                MTN_W0: 0.62, MTN_W1: 0.28, MTN_W2: 0.10,
                CLOUD_N: 7, CLOUD_SP0: 0.003, CLOUD_SP1: 0.005, CLOUD_Y0: 0.5, CLOUD_YR: 0.34,
                CLOUD_X0: -0.25, CLOUD_SPREAD: 1.4,
                CLOUD_F0: 0.2, CLOUD_F1: 0.48,
                SUN_PATH: 0.42, SUN_X0: 0.27, SUN_X1: 0.32, SUN_DROP: 2.4,
                SUN_F0: 0.34, SUN_F1: 0.46,
                SUN_G0: 0.18, SUN_G1: 0.32, SUN_G2: 0.4, SUN_G3: 0.56,
                MOON_A0: 0.46, MOON_A1: 0.92, MOON_GLOW: 9, MOON_A: 0.24,
                HAZE_MIX: 0.22, HAZE_A: 0.32,
                REFL_AMP0: 0.15, REFL_AMP1: 2.4, SEAM_A: 0.22,
                SL_F0: 0.11, SL_F1: 1.1, SL_F2: 0.037, SL_F3: 0.7, ROW_STEP: 8,
                REFL_SCALE: 1, REFL_AUTO: 1, REFL_MAX_STEP: 8,
                RIP_MAX: 8, RIP_V: 0.42, RIP_MAX_R: 0.95, RIP_K: 80, RIP_STR: 0.04, FOCAL: 0.9,
                LANTERN_N: 64, LANTERN_GX: 0.54, LANTERN_SN0: 0.02, LANTERN_SN1: 1,
                LANTERN_TX: 0.62, LANTERN_PAD: 2, LANTERN_SN_POW: 1.25,
                LANTERN_H: 0.15, LANTERN_GLOW: 0.5, LANTERN_POOL: 0.4,
                LANTERN_SEED: 7, LANTERN_EXCL: 1.0,
            };
            const CFG_DEFAULTS = JSON.parse(JSON.stringify(CFG));
            // 수동 스크럽용 플래그 (debug UI에서 토글)
            let debugHold = false;    // true면 p 자동 진행을 멈추고 슬라이더 값을 그대로 유지
            let debugPaused = false;  // true면 update/stepRipples 전체를 멈춤 (렌더는 계속)

            // ---------- helpers ----------
            const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
            const lerp = (a, b, t) => a + (b - a) * t;
            const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
            const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
            const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
            const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
            const prep = keys => keys.map(k => k.map((v, i) => (i > 0 && typeof v === 'string') ? hex(v) : v));
            function keyed(keys, x) {
                if (x <= keys[0][0]) return keys[0].slice(1);
                for (let i = 1; i < keys.length; i++) {
                    if (x <= keys[i][0]) {
                        const a = keys[i - 1], b = keys[i];
                        const t = ss(a[0], b[0], x);
                        return a.slice(1).map((v, j) => Array.isArray(v) ? mix(v, b[j + 1], t) : lerp(v, b[j + 1], t));
                    }
                }
                return keys[keys.length - 1].slice(1);
            }
            function mulberry32(a) {
                return function () {
                    a |= 0; a = a + 0x6D2B79F5 | 0;
                    let t = Math.imul(a ^ a >>> 15, 1 | a);
                    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
                    return ((t ^ t >>> 14) >>> 0) / 4294967296;
                };
            }

            // ---------- palettes keyed by scene progress p (0 = day idle, P_DUSK = dusk idle, 1 = night) ----------
            // 낮/황혼/밤 선택은 하단 아이콘 버튼이 정하고, p는 현재 p에서 목표까지 부드럽게 이동한다.
            const P_NOON_DUMMY = 0;  // 낮 idle 시작점 (p = 0, 실제 사용)
            // P_DUSK 초기값은 CFG에서 가져옴 (debug UI로 조절 가능)
            let SKY_RAW = [
                [0.00, '#2a64b4', '#6aa0d8', '#dbe9f3'],
                [0.16, '#2f63ad', '#7ea7d3', '#e8e2d2'],
                [0.26, '#E87A5D', '#EE966C', '#F3B27A'],
                [0.34, '#E06D53', '#EA9067', '#F3B27A'],
                [0.42, '#121838', '#523866', '#d0604c'],
                [0.52, '#070b22', '#1a1f48', '#4a3f68'],
                [0.64, '#03050f', '#070d24', '#18264a'],
                [1.00, '#02040c', '#060b20', '#172848']
            ];
            let SKY = prep(SKY_RAW);
            let MOUNT_RAW = [
                [0.00, '#93a8bd'], [0.20, '#8d90a8'], [0.32, '#5b4560'],
                [0.42, '#2a2038'], [0.56, '#0b0d1c'], [1.00, '#04060d']
            ];
            let MOUNT = prep(MOUNT_RAW);
            // torii: vermilion / black / gold, sinking into silhouette as night falls
            let TORII_RAW = [
                [0.00, '#D9472B', '#2A2522', '#C9A24A'],
                [0.30, '#c8452c', '#261f1e', '#c99a4a'],
                [0.42, '#7a2a26', '#1a1418', '#7a6038'],
                [0.56, '#3a1a20', '#0d0b12', '#3e3428'],
                [1.00, '#33171d', '#0b0a10', '#3a3126']
            ];
            let TORII = prep(TORII_RAW);
            // shapes in the source SVG's 680×450 space; the feet sit on y = 420
            const TORII_RED = new Path2D(
                'M216 110H244L247 410H213Z M436 110H464L467 410H433Z ' +
                'M331 118h18v76h-18Z M168 192h344v20h-344Z ' +
                'M146 86Q340 124 534 86L532 108Q340 146 148 108Z');
            const TORII_BLK = new Path2D(
                'M210 392h40v28h-40Z M430 392h40v28h-40Z M314 134h52v46h-52Z ' +
                'M126 64Q340 108 554 64L548 85Q340 126 132 85Z');
            // SVG-space bounding box (with a little room for the gold stroke)
            const TB = { x: 124, y: 62, w: 432, h: 360, base: 420 };
            let CLOUD_TINT_RAW = [
                [0.00, '#ffffff', 0], [0.14, '#ffe8c8', 0.10], [0.26, '#ffb07a', 0.42],
                [0.34, '#ff6f6a', 0.52], [0.42, '#5a3d6e', 0.62], [1.00, '#1a1a30', 0.7]
            ];
            let CLOUD_TINT = prep(CLOUD_TINT_RAW);
            // reflection dimming: day and sunset unchanged, stronger only once the sky is night
            let REFL = [[0, 0.06, 0.20], [0.45, 0.14, 0.34], [0.64, 0.42, 0.60], [1, 0.42, 0.60]];
            let VIG = [[0, 0.05], [0.6, 0.32], [1, 0.32]];

            // ---------- star brightness levels and colours ----------
            // d = star diameter = trail width (css px), al = brightness for both head and trail
            let LV = [
                { d: 0.9, al: 0.50 },
                { d: 1.2, al: 0.70 },
                { d: 1.6, al: 0.88 },
                { d: 2.2, al: 1.00 }
            ];
            let COLS_RAW = ['#e3ebff', '#ffe7cc', '#b9ccff'];
            let COLS = COLS_RAW.map(hex);

            // ---------- state ----------
            let W = 0, H = 0, HZ = 0, dpr = 1, R = 1;
            let pole = { x: 0, y: 0 }, sunR = 20, moonR = 18;
            let state = 'dusk', p = CFG.P_DUSK, tState = 0, tNight = 0;
            // 진행 중인 전환의 시작/목표 p (클릭 시 현재 p에서 캡처 → 어디서든 자연스럽게 전환)
            let transFrom = CFG.P_DUSK, transTo = CFG.P_DUSK;
            // 태양 정규화 진행도 nk (0 = idle 고도 → 1 = night).
            // 낮/황혼 idle 모두 nk = 0에서 시작하므로 최대 태양 고도가 동일하고,
            // p와 함께 연속으로만 움직이므로 전환 중 점프가 없다.
            // 태양 위치/소멸/여광이 모두 nk에 묶여 전환 총시간(T_NIGHT/T_DAY)도 동일하다.
            let nk = 0, nkFrom = 0, nkTo = 0;
            const sunK = () => clamp(nk, 0, 1);
            let phi = 0, phiTail = null, omega = 0, clock = 0;   // phiTail: 궤적 꼬리 각도 (null = 궤적 없음)
            // 달 상승 보간(mt)과 궤적 길이를 공유하는 헬퍼: drawSky의 달 위치와 동일한 식
            const moonMT = pp => { const m = ss(CFG.MOON_A0, CFG.MOON_A1, pp); return 1 - Math.pow(1 - m, 3); };
            let stars = [], buckets = [];
            let mtn = [], clouds = [];
            // stone lanterns on the flat (lantern-front.svg, all facing the viewer)
            let lanterns = [], lanImg = null, lanReady = false;
            // lantern raster cache: SVG를 1회 비트맵으로 구워 매 프레임 벡터 재래스터 방지
            const lanC = document.createElement('canvas');
            const LC = lanC.getContext('2d');
            let lanCW = 0, lanCH = 0, lanBodyH = 0;
            // reflection adaptive step governor (ROW_STEP=최소, REFL_MAX_STEP=상한)
            let reflStep = 8, reflLastBase = 8, reflEMA = 16, reflCool = 0;

            const starAlpha = () => ss(CFG.STAR_A0, CFG.STAR_A1, p);

            // ---------- scene construction ----------
            function buildStars() {
                const rng = mulberry32(7);
                const corners = [[0, 0], [W, 0], [0, HZ], [W, HZ]];
                R = Math.max(...corners.map(([x, y]) => Math.hypot(x - pole.x, y - pole.y)));
                const dens = 1 / (CFG.STAR_DENS * clamp(W / 1400, 0.55, 1));
                const n = Math.min(CFG.STAR_MAX, Math.round(Math.PI * R * R * dens));
                stars = [];
                buckets = Array.from({ length: 12 }, () => []);
                for (let i = 0; i < n; i++) {
                    const rn = Math.sqrt(0.0004 + rng() * 0.9996);
                    const th = rng() * Math.PI * 2;
                    const u = rng();
                    const lvl = u < 0.55 ? 0 : u < 0.83 ? 1 : u < 0.95 ? 2 : 3;
                    const c = rng();
                    const col = c < 0.62 ? 0 : c < 0.86 ? 1 : 2;
                    const s = { rn, th, lvl, col };
                    stars.push(s);
                    buckets[lvl * 3 + col].push(s);
                }
                // Polaris: a small point almost on the pole, tracing a tiny circle
                buckets[3].push({ rn: 0, rAbs: CFG.POLARIS_R, th: 0, lvl: 1, col: 0, polaris: true });
            }

            function buildMountains() {
                const rng = mulberry32(21);
                const octave = n => Array.from({ length: n }, () => rng());
                const a1 = octave(9), a2 = octave(31), a3 = octave(97);
                const sample = (arr, x) => {
                    const f = x * (arr.length - 1), i = Math.floor(f);
                    let t = f - i; t = t * t * (3 - 2 * t);
                    return lerp(arr[i], arr[Math.min(i + 1, arr.length - 1)], t);
                };
                mtn = [];
                for (let i = 0; i <= 320; i++) {
                    const x = i / 320;
                    const v = CFG.MTN_W0 * sample(a1, x) + CFG.MTN_W1 * sample(a2, x) + CFG.MTN_W2 * sample(a3, x);
                    mtn.push(Math.pow(Math.max(0, (v - CFG.MTN_TH) / (1 - CFG.MTN_TH)), CFG.MTN_POW));
                }
            }

            function makeCloudSprite(rng) {
                const c = document.createElement('canvas');
                const cw = 560, ch = 220;
                c.width = cw; c.height = ch;
                const g = c.getContext('2d');
                for (let i = 0; i < 36; i++) {
                    const u = rng();
                    const x = cw * (0.12 + 0.76 * u);
                    const bell = Math.sin(Math.PI * u);
                    const y = ch * (0.66 - 0.38 * bell * (0.5 + 0.5 * rng()));
                    const r = (22 + rng() * 48) * (0.55 + 0.6 * bell);
                    const gr = g.createRadialGradient(x, y, 0, x, y, r);
                    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
                    gr.addColorStop(0.6, 'rgba(255,255,255,0.32)');
                    gr.addColorStop(1, 'rgba(255,255,255,0)');
                    g.fillStyle = gr;
                    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
                }
                g.globalCompositeOperation = 'destination-out';
                const fl = g.createLinearGradient(0, ch * 0.64, 0, ch * 0.8);
                fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(1, 'rgba(0,0,0,1)');
                g.fillStyle = fl; g.fillRect(0, 0, cw, ch);
                g.globalCompositeOperation = 'source-atop';
                const sh = g.createLinearGradient(0, ch * 0.2, 0, ch * 0.75);
                sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(126,140,166,0.55)');
                g.fillStyle = sh; g.fillRect(0, 0, cw, ch);
                return c;
            }

            function buildClouds() {
                const rng = mulberry32(42);
                clouds = [];
                const n = Math.max(0, Math.round(CFG.CLOUD_N));
                for (let i = 0; i < n; i++) {
                    clouds.push({
                        spr: makeCloudSprite(rng),
                        xn: CFG.CLOUD_X0 + (i / Math.max(1, n)) * CFG.CLOUD_SPREAD + rng() * 0.08,
                        yn: CFG.CLOUD_Y0 + rng() * CFG.CLOUD_YR,
                        sp: CFG.CLOUD_SP0 + rng() * CFG.CLOUD_SP1
                    });
                }
            }

            // ---------- stone lanterns scattered on the flat ----------
            // lantern-front.svg (viewBox -130 -276 260x318): lantern body y -256..22,
            // feet at 298/318 of the image height, horizontally centred.
            const LAN_FEET = 298 / 318, LAN_WHR = 260 / 318;
            function buildLanterns() {
                const rng = mulberry32(Math.round(CFG.LANTERN_SEED * 1000 + 11));
                lanterns = [];
                const n = Math.max(0, Math.round(CFG.LANTERN_N));
                const sn0 = Math.min(CFG.LANTERN_SN0, CFG.LANTERN_SN1);
                const sn1 = Math.max(CFG.LANTERN_SN0, CFG.LANTERN_SN1);
                // jittered grid (shuffled cells): pure uniform random clumps and leaves
                // large voids (e.g. a ~35%W gap on the far band at 16:9). One lantern
                // per grid cell guarantees even coverage with no shared cells.
                const POW = clamp(CFG.LANTERN_SN_POW ?? 1.25, 0.5, 2.5);
                if (n === 1) {
                    lanterns.push({ sn: (sn0 + sn1) / 2, ux: 0, x: 0, y: 0, w: 0, h: 0, s: 0 });
                } else if (n > 1) {
                    const cols = Math.ceil(Math.sqrt(n));
                    const rows = Math.ceil(n / cols);
                    const cells = [];
                    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([r, c]);
                    for (let i = cells.length - 1; i > 0; i--) {
                        const j = (rng() * (i + 1)) | 0;
                        const t = cells[i]; cells[i] = cells[j]; cells[j] = t;
                    }
                    for (let i = 0; i < n; i++) {
                        const cr = cells[i][0], cc = cells[i][1];
                        // POW > 1 biases depths toward the horizon so the bottom
                        // band (large bodies) doesn't dominate the coverage.
                        const t = (cr + 0.15 + 0.7 * rng()) / rows;
                        const sn = lerp(sn0, sn1, Math.pow(t, POW));
                        const ux = -1 + 2 * ((cc + 0.15 + 0.7 * rng()) / cols);
                        lanterns.push({ sn, ux, x: 0, y: 0, w: 0, h: 0, s: 0 });
                    }
                }
                lanterns.sort((a, b) => a.sn - b.sn);   // far-to-near painter order
                projectLanterns();
            }
            function projectLanterns() {
                if (!W || !H) return;
                const reflH = Math.max(1, H - HZ);
                const minS = Math.max(2, 0.03 * reflH);
                const halfW = W * clamp(CFG.LANTERN_GX, 0.05, 0.65);
                // TX: top-width ratio (1 = rectangle, 0 = vanishing point).
                // Old hardcoded 0.22 left ~41% of the floor empty at 16:9.
                const TX = clamp(CFG.LANTERN_TX ?? 0.62, 0.15, 1);
                const PAD = Math.max(0, CFG.LANTERN_PAD ?? 2);
                for (const L of lanterns) {
                    const s = clamp(L.sn * reflH, minS, reflH);
                    L.s = s;
                    L.x = W / 2 + L.ux * halfW * (TX + (1 - TX) * L.sn);
                    L.y = HZ + s;
                    L.h = Math.max(2, CFG.LANTERN_H * s);
                    L.w = L.h * LAN_WHR;
                }
                // keep clear of the torii and the bottom control card
                const tcx = torX + torW / 2;
                const narrow = W <= 460;
                const cardCx = narrow ? 90 : W / 2;
                const cardHalf = narrow ? 110 : 250;
                const cardTop = H - (narrow ? 90 : 170);
                // torii x-push first (vertical composition); card uses
                // least-penetration with upward bias inside the resolver.
                for (const L of lanterns) {
                    const m = CFG.LANTERN_EXCL;
                    const tExp = (torW / 2 + L.w / 2) * m;
                    if (Math.abs(L.x - tcx) < tExp && L.y - L.h < torBase && L.y > torY) {
                        L.x = tcx + (L.x < tcx ? -tExp : tExp);
                    }
                }
                resolveLanternOverlaps(PAD, { tcx, cardCx, cardHalf, cardTop });
            }
            // AABB relaxation in screen space: bodies must not intersect.
            // Sizes stay fixed (depth cue); only positions move. Deterministic
            // (no rng here) so a seed always yields the same layout.
            function resolveLanternOverlaps(PAD, obs) {
                const n = lanterns.length;
                if (n === 0) return;
                const hhOf = L => L.h * LAN_FEET;
                // allow drifting fully off-screen to relieve pressure on narrow
                // layouts; fully hidden lanterns are skipped below and cost nothing.
                const sync = L => {
                    L.x = clamp(L.x, -L.w, W + L.w);
                    L.y = clamp(L.y, HZ + 2, H);
                };
                const hidden = L => (L.x + L.w / 2 < 0 || L.x - L.w / 2 > W);
                for (const L of lanterns) sync(L);
                // first: card least-penetration with upward bias (replaces x-only)
                const { cardCx, cardHalf, cardTop } = obs;
                for (const L of lanterns) {
                    const hh = hhOf(L);
                    const lx0 = L.x - L.w / 2, lx1 = L.x + L.w / 2;
                    const ly0 = L.y - hh, ly1 = L.y;
                    const ox = Math.min(lx1, cardCx + cardHalf) - Math.max(lx0, cardCx - cardHalf) + PAD;
                    const oy = Math.min(ly1, H) - Math.max(ly0, cardTop) + PAD;
                    if (ox > 0 && oy > 0) {
                        if (ox < oy) {
                            L.x = cardCx + (L.x < cardCx ? -(cardHalf + L.w / 2 + PAD) : (cardHalf + L.w / 2 + PAD));
                        } else {
                            L.y = cardTop - PAD;   // hop above the card, never below
                        }
                        sync(L);
                    }
                }
                const MAX_IT = 120;
                for (let it = 0; it < MAX_IT; it++) {
                    for (let i = 0; i < n; i++) {
                        const A = lanterns[i];
                        if (hidden(A)) continue;
                        const ah = hhOf(A);
                        for (let j = i + 1; j < n; j++) {
                            const B = lanterns[j];
                            if (hidden(B)) continue;
                            const bh = hhOf(B);
                            const dx = B.x - A.x;
                            const ox = (A.w + B.w) / 2 + PAD - Math.abs(dx);
                            if (ox <= 0) continue;
                            const dcy = (B.y - bh / 2) - (A.y - ah / 2);
                            const oy = (ah + bh) / 2 + PAD - Math.abs(dcy);
                            if (oy <= 0) continue;
                            const aa = A.w * ah, bb = B.w * bh, tot = aa + bb || 1;
                            const wa = bb / tot, wb = aa / tot;
                            if (ox < oy) {
                                const s = dx >= 0 ? 1 : -1;
                                A.x -= s * ox * wa * 0.85;
                                B.x += s * ox * wb * 0.85;
                                sync(A); sync(B);
                            } else {
                                const s = dcy >= 0 ? 1 : -1;
                                A.y -= s * oy * wa * 0.85;
                                B.y += s * oy * wb * 0.85;
                                sync(A); sync(B);
                            }
                        }
                    }
                    // torii stays x-only (protects the vertical composition);
                    // card keeps least-penetration with upward bias.
                    const tcx = obs.tcx;
                    for (const L of lanterns) {
                        if (hidden(L)) continue;
                        const m = CFG.LANTERN_EXCL;
                        const tExp = (torW / 2 + L.w / 2) * m + PAD * 0.5;
                        if (Math.abs(L.x - tcx) < tExp && L.y - L.h < torBase && L.y > torY) {
                            L.x = tcx + (L.x < tcx ? -tExp : tExp);
                            sync(L);
                        }
                        const hh = hhOf(L);
                        const lx0 = L.x - L.w / 2, lx1 = L.x + L.w / 2;
                        const ly0 = L.y - hh, ly1 = L.y;
                        const ox = Math.min(lx1, cardCx + cardHalf) - Math.max(lx0, cardCx - cardHalf) + PAD;
                        const oy = Math.min(ly1, H) - Math.max(ly0, cardTop) + PAD;
                        if (ox > 0 && oy > 0) {
                            if (ox < oy) {
                                L.x = cardCx + (L.x < cardCx ? -(cardHalf + L.w / 2 + PAD) : (cardHalf + L.w / 2 + PAD));
                            } else {
                                L.y = cardTop - PAD;
                            }
                            sync(L);
                        }
                    }
                    // stop as soon as bodies no longer intersect
                    // (sub-PAD gaps are acceptable and often unavoidable)
                    let ok = true;
                    for (let i = 0; i < n && ok; i++) {
                        const A = lanterns[i];
                        if (hidden(A)) continue;
                        const ah = hhOf(A);
                        for (let j = i + 1; j < n; j++) {
                            const B = lanterns[j];
                            if (hidden(B)) continue;
                            const bh = hhOf(B);
                            if (Math.abs(B.x - A.x) < (A.w + B.w) / 2 &&
                                Math.abs((B.y - bh / 2) - (A.y - ah / 2)) < (ah + bh) / 2) {
                                ok = false; break;
                            }
                        }
                    }
                    if (ok) break;
                }
                lanterns.sort((a, b) => a.y - b.y);   // far-to-near painter order
            }
            function loadLanternSprite() {
                try {
                    lanImg = new Image();
                    lanImg.decoding = 'async';
                    lanImg.onload = () => {
                        try {
                            const nw = lanImg.naturalWidth || 416;
                            const nh = lanImg.naturalHeight || 509;
                            lanC.width = nw; lanC.height = nh;
                            LC.setTransform(1, 0, 0, 1, 0, 0);
                            LC.globalCompositeOperation = 'source-over';
                            LC.globalAlpha = 1;
                            LC.clearRect(0, 0, nw, nh);
                            LC.drawImage(lanImg, 0, 0, nw, nh);
                            lanCW = nw; lanCH = nh;
                            lanBodyH = nh * LAN_FEET;
                            lanReady = true;
                        } catch (e) { lanReady = false; }
                    };
                    lanImg.onerror = () => { lanReady = false; };
                    lanImg.src = 'lantern-front.svg';
                } catch (e) { lanReady = false; }
            }

            // ---------- stars and their trails ----------
            // Each trail runs from where the star was phiLen radians ago to where it is now.
            // It grows from the star's starting point until it reaches TRAIL_LEN, then keeps that length.
            function drawStars() {
                const a = starAlpha();
                if (a <= 0.003) return;
                const len = phiTail === null ? 0 : clamp(phi - phiTail, 0, CFG.TRAIL_LEN);
                S.globalCompositeOperation = 'lighter';
                S.lineCap = 'butt';
                for (let k = 0; k < 12; k++) {
                    const b = buckets[k];
                    if (!b.length) continue;
                    const L = LV[(k / 3) | 0];
                    const col = rgba(COLS[k % 3], L.al * a);
                    const rad = L.d / 2;
                    if (len > 0.0005) {
                        S.strokeStyle = col;
                        S.lineWidth = L.d;
                        S.beginPath();
                        for (const s of b) {
                            const r = s.rAbs ?? s.rn * R;
                            const head = s.th - phi, tail = head + len;   // decreasing angle = counter-clockwise on screen
                            S.moveTo(pole.x + r * Math.cos(tail), pole.y + r * Math.sin(tail));
                            S.arc(pole.x, pole.y, r, tail, head, true);
                        }
                        S.stroke();
                    }
                    S.fillStyle = col;
                    S.beginPath();
                    for (const s of b) {
                        const r = s.rAbs ?? s.rn * R;
                        const ang = s.th - phi;
                        const x = pole.x + r * Math.cos(ang), y = pole.y + r * Math.sin(ang);
                        if (x < -3 || x > W + 3 || y < -3 || y > HZ + 3) continue;
                        S.moveTo(x + rad, y);
                        S.arc(x, y, rad, 0, Math.PI * 2);
                    }
                    S.fill();
                }
                // faint halo so Polaris still reads as the centre
                const pg = S.createRadialGradient(pole.x, pole.y, 0, pole.x, pole.y, CFG.HALO_R);
                pg.addColorStop(0, `rgba(235,242,255,${CFG.HALO_A * a})`);
                pg.addColorStop(1, 'rgba(235,242,255,0)');
                S.fillStyle = pg;
                S.beginPath(); S.arc(pole.x, pole.y, CFG.HALO_R, 0, Math.PI * 2); S.fill();
                S.globalCompositeOperation = 'source-over';
            }

            // ---------- layout ----------
            // 모바일 레이아웃(CSS .dock 브레이크포인트와 동일)에서는 토리이/달을
            // 화면 정가운데(x=0.5)에 고정. PC 레이아웃에서는 CFG.TORII_X 그대로.
            function effToriiX() {
                try {
                    if (window.matchMedia('(max-width: 460px), (pointer: coarse) and (max-height: 500px)').matches) return 0.5;
                } catch (e) { /* matchMedia 미지원 시 PC 값으로 폴백 */ }
                return CFG.TORII_X;
            }
            function resize() {
                W = window.innerWidth; H = window.innerHeight;
                dpr = Math.min(CFG.DPR_MAX, window.devicePixelRatio || 1);
                if (W * H * dpr * dpr > CFG.PIX_BUDGET) dpr = Math.max(1, Math.sqrt(CFG.PIX_BUDGET / (W * H)));
                HZ = Math.round(H * CFG.HZ_RATIO);
                cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
                bandH = Math.round((H - HZ) * CFG.BAND_H);
                band.width = Math.ceil(W * dpr / BAND_SCALE);
                band.height = Math.ceil((bandH + CFG.BAND_PAD * 2) * dpr / BAND_SCALE);
                bandValid = false;   // 크기 변경 시 블러 캐시 무효
                for (const c of [sky, cloudLayer]) {
                    c.width = Math.round(W * dpr); c.height = Math.round(HZ * dpr);
                }
                pole = { x: W * CFG.POLE_X, y: HZ * CFG.POLE_Y };
                const m = Math.min(W, H);
                sunR = clamp(m * CFG.SUN_F, CFG.SUN_MIN, CFG.SUN_MAX);
                moonR = clamp(m * CFG.MOON_F, CFG.MOON_MIN, CFG.MOON_MAX);
                // torii: centred on the shared vertical line (CFG.TORII_X), standing on the flat with
                // its base three quarters of the way up from the bottom edge to the horizon
                torS = CFG.TORII_SCALE * Math.min(HZ * 0.30 / 356, W * 0.40 / 428);
                torW = TB.w * torS; torH = TB.h * torS;
                torBase = H - CFG.TORII_BASE * (H - HZ);
                torX = W * effToriiX() - (340 - TB.x) * torS;
                torY = torBase - (TB.base - TB.y) * torS;
                for (const c of [torC, torR]) {
                    c.width = Math.max(1, Math.ceil(torW * dpr));
                    c.height = Math.max(1, Math.ceil(torH * dpr));
                }
                fg.width = cv.width; fg.height = cv.height;
                resizeRipple();
                buildStars();
                projectLanterns();
            }

            // ---------- update ----------
            // 고속 회전 단계 없음: 별 궤적 길이는 달 상승 보간(mt)에 동기화되고,
            // 궤적 성장 중에도 꼬리가 W_SLOW로 항상 전진하므로 완료 시점에 멈춤이 없다.
            // 궤적 생성 시작(mt > 0) = 달이 뜨기 시작(p > MOON_A0),
            // 궤적 생성 완료(mt = 1) = 달이 최대 고도 도착(p >= MOON_A1).
            // 최종 궤적 길이는 TRAIL_LEN 그대로 유지된다.
            function update(dt) {
                if (debugPaused) return;
                clock += dt;
                if (!debugHold) {
                if (state === 'toNight') {
                    tState += dt;
                    const k = Math.min(1, tState / CFG.T_NIGHT);
                    p = transFrom + (1 - transFrom) * k;
                    nk = nkFrom + (1 - nkFrom) * k;
                    if (k >= 1) {
                        state = 'night'; tNight = 0; p = 1; nk = 1;
                    }
                } else if (state === 'night') {
                    tNight += dt;
                } else if (state === 'toDusk' || state === 'toDay') {
                    tState += dt;
                    const k = Math.min(1, tState / CFG.T_DAY);
                    const e = ss(0, 1, k);
                    p = transFrom + (transTo - transFrom) * e;
                    nk = nkFrom + (nkTo - nkFrom) * e;
                    omega *= Math.exp(-dt * 3);
                    if (k >= 1) {
                        if (transTo === 0) { state = 'day'; p = 0; }
                        else { state = 'dusk'; p = transTo; }
                        nk = nkTo;
                        phi = 0; phiTail = null; omega = 0;
                    }
                } else {
                    // 'day'(낮 idle) / 'dusk'(황혼 idle) 모두 정지 상태
                    omega = 0;
                }
                }

                // 별 회전 / 궤적: 궤적 성장 중에도 기본 회전(W_SLOW)은 항상 진행한다.
                // phiTail(꼬리)이 W_SLOW로 전진하면서 head = phiTail + TRAIL_LEN*mt로 성장하므로
                // 성장 완료 시점(mt=1)의 속도가 W_SLOW로 자연스럽게 이어지고 멈춤 구간이 없다.
                // hold(수동 스크럽) 중에는 꼬리를 고정해 p에 대한 결정성을 유지한다.
                if (state === 'toNight') {
                    const m = ss(CFG.MOON_A0, CFG.MOON_A1, p);
                    const mt = 1 - Math.pow(1 - m, 3);
                    if (m <= 0) {
                        phi = 0; phiTail = null; omega = 0;
                    } else if (m < 1) {
                        const prev = phi;
                        if (phiTail === null) phiTail = 0;
                        else if (!debugHold) phiTail += CFG.W_SLOW * dt;
                        phi = phiTail + CFG.TRAIL_LEN * mt;
                        omega = dt > 0 ? Math.max(0, (phi - prev) / dt) : 0;
                    } else {
                        if (phiTail === null) { phi = Math.max(phi, CFG.TRAIL_LEN); phiTail = phi - CFG.TRAIL_LEN; }
                        omega = CFG.W_SLOW;
                        phi += omega * dt;
                        phiTail = phi - CFG.TRAIL_LEN;
                    }
                } else if (state === 'night') {
                    if (phiTail === null) {
                        if (phi < CFG.TRAIL_LEN) phi = CFG.TRAIL_LEN;
                        phiTail = phi - CFG.TRAIL_LEN;
                    }
                    omega = CFG.W_SLOW;
                    phi += omega * dt;
                    phiTail = phi - CFG.TRAIL_LEN;
                } else if (state === 'toDusk' || state === 'toDay') {
                    // 복귀 시에는 궤적을 되감지 않고 고정 길이로 서서히 멈춘 뒤 페이드아웃
                    if (phiTail !== null && !debugHold) {
                        phi += omega * dt;
                        phiTail = phi - CFG.TRAIL_LEN;
                    }
                }

                if (!RM.matches) {
                    for (const c of clouds) {
                        c.xn += c.sp * dt;
                        if (c.xn > 1.25) c.xn = -0.4;
                    }
                }
            }

            // ---------- render ----------
            function drawSky() {
                S.setTransform(dpr, 0, 0, dpr, 0, 0);
                S.globalCompositeOperation = 'source-over';
                S.globalAlpha = 1;

                const [top, mid, hor] = keyed(SKY, p);
                const g = S.createLinearGradient(0, 0, 0, HZ);
                g.addColorStop(0, rgba(top)); g.addColorStop(0.58, rgba(mid)); g.addColorStop(1, rgba(hor));
                S.fillStyle = g; S.fillRect(0, 0, W, HZ);

                // sun path (낮/황혼 공통: 정규화 진행도 nk 기준이라 시작 고도가 동일)
                const nk = sunK();
                const sp = clamp(nk / CFG.SUN_PATH, 0, 1);
                const sx = lerp(W * CFG.SUN_X0, W * CFG.SUN_X1, sp);
                const sy0 = HZ * 0.3;
                const sy = lerp(sy0, HZ + sunR * CFG.SUN_DROP, sp * sp);

                // afterglow along the horizon (brief)
                const glowA = ss(CFG.SUN_G0, CFG.SUN_G1, nk) * (1 - ss(CFG.SUN_G2, CFG.SUN_G3, nk));
                if (glowA > 0.005) {
                    S.save();
                    S.translate(W * 0.32, HZ);
                    S.scale(3.2, 1);
                    const rg = S.createRadialGradient(0, 0, 0, 0, 0, HZ * 0.55);
                    rg.addColorStop(0, rgba(hex('#ff8f52'), 0.55 * glowA));
                    rg.addColorStop(0.45, rgba(hex('#ff6f6a'), 0.22 * glowA));
                    rg.addColorStop(1, 'rgba(255,110,100,0)');
                    S.fillStyle = rg;
                    S.fillRect(-W, -HZ, W * 2, HZ);
                    S.restore();
                }

                // sun (소멸도 nk 기준: 낮/황혼 동일한 타이밍)
                const sunFade = 1 - ss(CFG.SUN_F0, CFG.SUN_F1, nk);
                if (sy < HZ + sunR * 3 && sunFade > 0.001) {
                    const hgt = clamp((HZ - sy) / (HZ - sy0), 0, 1);
                    const sc = hgt > 0.35
                        ? mix(hex('#ffc070'), hex('#fffbef'), (hgt - 0.35) / 0.65)
                        : mix(hex('#ff5a2a'), hex('#ffc070'), hgt / 0.35);
                    const gr = sunR * (4 + 10 * (1 - hgt));
                    const sg = S.createRadialGradient(sx, sy, sunR * 0.6, sx, sy, gr);
                    sg.addColorStop(0, rgba(sc, (0.38 + 0.25 * (1 - hgt)) * sunFade));
                    sg.addColorStop(1, rgba(sc, 0));
                    S.fillStyle = sg;
                    S.beginPath(); S.arc(sx, sy, gr, 0, Math.PI * 2); S.fill();
                    S.fillStyle = rgba(sc, 1);
                    S.beginPath(); S.arc(sx, sy, sunR, 0, Math.PI * 2); S.fill();
                }

                // clouds
                const ca = 1 - ss(CFG.CLOUD_F0, CFG.CLOUD_F1, p);
                if (ca > 0.01) {
                    CL.setTransform(1, 0, 0, 1, 0, 0);
                    CL.globalCompositeOperation = 'source-over';
                    CL.clearRect(0, 0, cloudLayer.width, cloudLayer.height);
                    CL.setTransform(dpr, 0, 0, dpr, 0, 0);
                    const base = clamp(W / 1400, 0.5, 1.1);
                    for (const c of clouds) {
                        const k = base * lerp(1, 0.4, (c.yn - CFG.CLOUD_Y0) / CFG.CLOUD_YR);
                        const cw = 560 * k, ch = 220 * k;
                        CL.drawImage(c.spr, c.xn * W, c.yn * HZ - ch * 0.7, cw, ch);
                    }
                    const [tc, ta] = keyed(CLOUD_TINT, p);
                    if (ta > 0.01) {
                        CL.globalCompositeOperation = 'source-atop';
                        CL.fillStyle = rgba(tc, ta);
                        CL.fillRect(0, 0, W, HZ);
                        CL.globalCompositeOperation = 'source-over';
                    }
                    S.setTransform(1, 0, 0, 1, 0, 0);
                    S.globalAlpha = ca;
                    S.drawImage(cloudLayer, 0, 0);
                    S.globalAlpha = 1;
                    S.setTransform(dpr, 0, 0, dpr, 0, 0);
                }

                drawStars();

                // moon
                const m = ss(CFG.MOON_A0, CFG.MOON_A1, p);
                if (m > 0.001) {
                    const mt = 1 - Math.pow(1 - m, 3);
                    // 달은 토리이와 항상 같은 수직선상: x는 effToriiX() 공유, y만 MOON_Y로 조절
                    const mx = W * effToriiX();
                    const my = lerp(HZ + moonR * 2.2, HZ * CFG.MOON_Y, mt);
                    const mg = S.createRadialGradient(mx, my, moonR * 0.8, mx, my, moonR * CFG.MOON_GLOW);
                    mg.addColorStop(0, `rgba(200,215,255,${CFG.MOON_A * m})`);
                    mg.addColorStop(1, 'rgba(200,215,255,0)');
                    S.fillStyle = mg;
                    S.beginPath(); S.arc(mx, my, moonR * CFG.MOON_GLOW, 0, Math.PI * 2); S.fill();
                    const md = S.createRadialGradient(mx - moonR * 0.35, my - moonR * 0.35, moonR * 0.1, mx, my, moonR);
                    md.addColorStop(0, '#fbf8ec'); md.addColorStop(1, '#d6d3c6');
                    S.fillStyle = md;
                    S.beginPath(); S.arc(mx, my, moonR, 0, Math.PI * 2); S.fill();
                    S.fillStyle = 'rgba(140,140,128,0.14)';
                    for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.28], [-0.05, 0.42, 0.16], [0.38, -0.38, 0.12]]) {
                        S.beginPath(); S.arc(mx + cx * moonR, my + cy * moonR, cr * moonR, 0, Math.PI * 2); S.fill();
                    }
                }

                // horizon haze
                const hl = mix(hor, [255, 255, 255], CFG.HAZE_MIX);
                const hg = S.createLinearGradient(0, HZ * 0.86, 0, HZ);
                hg.addColorStop(0, rgba(hl, 0)); hg.addColorStop(1, rgba(hl, CFG.HAZE_A));
                S.fillStyle = hg; S.fillRect(0, HZ * 0.86, W, HZ * 0.14);

                // distant ranges on the horizon
                const mh = clamp(H * CFG.MTN_H, CFG.MTN_MIN, CFG.MTN_MAX);
                S.fillStyle = rgba(keyed(MOUNT, p)[0]);
                S.beginPath();
                S.moveTo(0, HZ);
                for (let i = 0; i < mtn.length; i++) S.lineTo((i / (mtn.length - 1)) * W, HZ - mtn[i] * mh);
                S.lineTo(W, HZ);
                S.closePath();
                S.fill();
            }

            // ---------- reflection adaptive step ----------
            // ROW_STEP=최소 간격(화질 하한), REFL_MAX_STEP=상한. 부하 시 상한까지 자동 증가.
            // 해상도 하한도 함께 적용: 키가 큰 화면에서도 반사 row 수가 ~220개를 넘지 않게.
            // 랜턴 스프라이트는 이 값과 별도로 2px 상한 (좁은 수직선 비틀림 방지).
            function effReflStep(reflHPx) {
                const base = Math.max(1, Math.round(CFG.ROW_STEP));
                if (reflLastBase !== base) { reflLastBase = base; reflStep = base; }
                const maxS = clamp(Math.round(CFG.REFL_MAX_STEP ?? 6), base, 8);
                reflStep = clamp(reflStep, base, maxS);
                const resFloor = Math.max(1, Math.ceil((reflHPx || 1) / 220));
                return Math.max(reflStep, resFloor);
            }
            function tickReflGovernor(costMs) {
                reflEMA = reflEMA * 0.92 + costMs * 0.08;
                reflCool++;
                if (!(CFG.REFL_AUTO ?? 1)) { reflCool = 0; return; }
                if (reflCool < 90) return;
                reflCool = 0;
                const base = Math.max(1, Math.round(CFG.ROW_STEP));
                const maxS = clamp(Math.round(CFG.REFL_MAX_STEP ?? 6), base, 8);
                if (reflEMA > 19 && reflStep < maxS) reflStep++;
                else if (reflEMA < 11 && reflStep > base) reflStep--;
            }

            // torii standing on the flat in front of the ranges, with its own mirror image
            // torC(본체)/torR(뒤집힌 반사체)은 색·크기가 바뀔 때만 재래스터 (idle 시 60fps 재빌드 제거)
            function drawTorii(r0, r1) {
                const [red, blk, gold] = keyed(TORII, p);
                const k = torS * dpr;
                const key = torC.width + 'x' + torC.height + '|' + k.toFixed(3) + '|' +
                    (red[0] | 0) + ',' + (red[1] | 0) + ',' + (red[2] | 0) + '|' +
                    (blk[0] | 0) + ',' + (blk[1] | 0) + ',' + (blk[2] | 0) + '|' +
                    (gold[0] | 0) + ',' + (gold[1] | 0) + ',' + (gold[2] | 0);
                if (key !== torKey) {
                    torKey = key; torRKey = ''; torBuilds++;
                    TC.setTransform(1, 0, 0, 1, 0, 0);
                    TC.clearRect(0, 0, torC.width, torC.height);
                    TC.setTransform(k, 0, 0, k, -TB.x * k, -TB.y * k);
                    TC.fillStyle = rgba(red); TC.fill(TORII_RED);
                    TC.fillStyle = rgba(blk); TC.fill(TORII_BLK);
                    TC.strokeStyle = rgba(gold);
                    TC.lineWidth = 2; TC.strokeRect(314, 134, 52, 46);
                    TC.lineWidth = 1; TC.strokeRect(322, 142, 36, 30);
                }

                // flipped copy, dimmed the same way as the rest of the reflection
                const reflH = H - HZ;
                const rd = lerp(r0, r1, clamp((torBase - HZ) / reflH + 0.15, 0, 1));
                const rkey = torR.width + 'x' + torR.height + '|' + rd.toFixed(3) + '|' + torKey;
                if (rkey !== torRKey) {
                    torRKey = rkey;
                    TR.setTransform(1, 0, 0, 1, 0, 0);
                    TR.globalCompositeOperation = 'source-over';
                    TR.clearRect(0, 0, torR.width, torR.height);
                    TR.setTransform(1, 0, 0, -1, 0, torR.height);
                    TR.drawImage(torC, 0, 0);
                    TR.setTransform(1, 0, 0, 1, 0, 0);
                    TR.globalCompositeOperation = 'source-atop';
                    TR.fillStyle = `rgba(10,18,32,${rd})`;
                    TR.fillRect(0, 0, torR.width, torR.height);
                    TR.globalCompositeOperation = 'source-over';
                }

                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                // row r of the flipped copy lands at torBase + r - pad, where pad is the
                // strip of empty sprite below the feet
                const pad = (TB.y + TB.h - TB.base) * torS;
                const top = torBase - pad;
                if (RM.matches) {
                    ctx.drawImage(torR, torX, top, torW, torH);
                } else {
                    const step = effReflStep(H - HZ);
                    for (let r = 0; r < torH; r += step) {
                        const sh = Math.min(step, torH - r);
                        const y = top + r;
                        if (y > H) break;
                        const d = y - HZ, kk = d / reflH;
                        const amp = CFG.REFL_AMP0 + CFG.REFL_AMP1 * kk * kk;
                        const dx = amp * (0.7 * Math.sin(d * CFG.SL_F0 + clock * CFG.SL_F1) + 0.3 * Math.sin(d * CFG.SL_F2 - clock * CFG.SL_F3));
                        ctx.drawImage(torR, 0, r * dpr, torR.width, sh * dpr, torX + dx, y, torW, sh + 0.5);
                    }
                }
                FG.setTransform(dpr, 0, 0, dpr, 0, 0);
                FG.drawImage(torC, torX, torY, torW, torH);
            }

            // lantern-front.svg sprites scattered on the flat, all facing the viewer.
            // Reflections ride on the scene canvas with the same ripple as the torii;
            // bodies + night glow ride on FG above the ripple copy.
            function drawLanterns(r0, r1) {
                if (!lanReady || !lanterns.length || !lanCW) return;
                const reflH = Math.max(1, H - HZ);
                const night = ss(CFG.MOON_A0, CFG.MOON_A1, p);
                const sw = lanCW, shFull = lanCH;
                const shBody = lanBodyH || shFull * LAN_FEET;
                // 랜턴 몸통이 좁아 ROW_STEP이 크면 행 경계마다
                // 수평 오프셋이 점프해 비틀려 보이므로 2px로 고정 + 중앙 샘플링.
                const step = Math.max(1, Math.min(effReflStep(reflH), 2));

                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
                // reflections, far-to-near
                for (const L of lanterns) {
                    if (L.w < 2 || L.h < 3) continue;
                    if (L.x + L.w / 2 < -20 || L.x - L.w / 2 > W + 20) continue;
                    if (L.y < HZ - 2) continue;
                    const dh = Math.min(L.h * LAN_FEET, H - L.y);
                    if (dh < 2) continue;
                    const rd = lerp(r0, r1, clamp((L.y - HZ) / reflH + 0.15, 0, 1));
                    if (RM.matches) {
                        ctx.save();
                        ctx.globalAlpha = (1 - rd) * 0.9;
                        ctx.translate(0, 2 * L.y);
                        ctx.scale(1, -1);
                        ctx.drawImage(lanC, 0, 0, sw, shBody, L.x - L.w / 2, L.y - dh, L.w, dh);
                        ctx.restore();
                    } else {
                        ctx.globalAlpha = (1 - rd) * 0.9;
                        for (let r = 0; r < dh; r += step) {
                            const shD = Math.min(step, dh - r);
                            const y = L.y + r;
                            if (y > H) break;
                            const dc = y + shD / 2 - HZ, kk = dc / reflH;
                            const amp = CFG.REFL_AMP0 + CFG.REFL_AMP1 * kk * kk;
                            const dx = amp * (0.7 * Math.sin(dc * CFG.SL_F0 + clock * CFG.SL_F1) + 0.3 * Math.sin(dc * CFG.SL_F2 - clock * CFG.SL_F3));
                            const srcH = shD / dh * shBody;
                            const srcY = shBody - (r + shD) / dh * shBody;
                            if (srcY < 0 || srcH <= 0) continue;
                            ctx.drawImage(lanC, 0, srcY, sw, srcH, L.x - L.w / 2 + dx, y, L.w, shD + 0.5);
                        }
                        ctx.globalAlpha = 1;
                    }
                }
                ctx.globalAlpha = 1;

                // bodies + night glow, far-to-near
                FG.setTransform(dpr, 0, 0, dpr, 0, 0);
                FG.globalCompositeOperation = 'source-over';
                FG.globalAlpha = 1;
                for (const L of lanterns) {
                    if (L.w < 2 || L.h < 3) continue;
                    if (L.x + L.w / 2 < -L.w || L.x - L.w / 2 > W + L.w) continue;
                    const top = L.y - L.h * LAN_FEET;
                    FG.drawImage(lanC, L.x - L.w / 2, top, L.w, L.h);
                    if (night > 0.01) {
                        const gx = L.x, gy = L.y - L.h * 0.52;
                        FG.globalCompositeOperation = 'lighter';
                        // halo behind the glass
                        const hr = L.h * 0.55;
                        if (hr > 1) {
                            const hg = FG.createRadialGradient(gx, gy, 0, gx, gy, hr);
                            hg.addColorStop(0, `rgba(255,190,110,${0.55 * night * CFG.LANTERN_GLOW})`);
                            hg.addColorStop(1, 'rgba(255,170,90,0)');
                            FG.fillStyle = hg;
                            FG.beginPath(); FG.arc(gx, gy, hr, 0, Math.PI * 2); FG.fill();
                        }
                        // lit glass
                        FG.fillStyle = `rgba(255,224,160,${0.28 * night * CFG.LANTERN_GLOW})`;
                        FG.fillRect(gx - L.w * 0.14, top + L.h * 0.157, L.w * 0.28, L.h * 0.667);
                        // warm pool on the floor
                        const pa = 0.35 * night * CFG.LANTERN_POOL;
                        if (pa > 0.005) {
                            FG.save();
                            FG.translate(gx, L.y + L.h * 0.02);
                            FG.scale(1, 0.25);
                            const pr = L.w * 0.95;
                            const pg = FG.createRadialGradient(0, 0, 0, 0, 0, pr);
                            pg.addColorStop(0, `rgba(255,174,64,${pa})`);
                            pg.addColorStop(1, 'rgba(255,138,26,0)');
                            FG.fillStyle = pg;
                            FG.beginPath(); FG.arc(0, 0, pr, 0, Math.PI * 2); FG.fill();
                            FG.restore();
                        }
                        FG.globalCompositeOperation = 'source-over';
                    }
                }
                FG.globalAlpha = 1;
            }

            function render() {
                drawSky();

                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
                ctx.drawImage(sky, 0, 0);

                // mirrored salt-flat reflection, sliced into rows for faint ripples
                const reflH = H - HZ;
                if (RM.matches) {
                    ctx.setTransform(dpr, 0, 0, -dpr, 0, (HZ * 2) * dpr);
                    ctx.drawImage(sky, 0, Math.max(0, HZ - reflH) * dpr, sky.width, Math.min(HZ, reflH) * dpr,
                        0, HZ - Math.min(HZ, reflH), W, Math.min(HZ, reflH));
                } else {
                    const step = effReflStep(reflH);
                    const scale = clamp(Number(CFG.REFL_SCALE ?? 0.5) || 0.5, 0.25, 1);
                    if (scale < 0.99 && reflH > 0) {
                        // downscale path: 작은 버퍼에 row-slice 후 1회 업스케일 합성
                        const rw = Math.max(1, Math.round(cv.width * scale));
                        const rh = Math.max(1, Math.round((cv.height - floorTop) * scale));
                        if (reflC.width !== rw || reflC.height !== rh) { reflC.width = rw; reflC.height = rh; }
                        RC.setTransform(1, 0, 0, 1, 0, 0);
                        RC.globalCompositeOperation = 'source-over';
                        RC.globalAlpha = 1;
                        RC.clearRect(0, 0, rw, rh);
                        const k2 = dpr * scale;
                        for (let d = 0; d < reflH; d += step) {
                            const sh = Math.min(step, reflH - d);
                            const srcY = HZ - d - sh;
                            if (srcY < 0) break;
                            const k = d / reflH;
                            const amp = CFG.REFL_AMP0 + CFG.REFL_AMP1 * k * k;
                            const dx = amp * (0.7 * Math.sin(d * CFG.SL_F0 + clock * CFG.SL_F1) + 0.3 * Math.sin(d * CFG.SL_F2 - clock * CFG.SL_F3));
                            RC.setTransform(k2, 0, 0, -k2, dx * k2, (d + sh) * k2);
                            RC.drawImage(sky, 0, srcY * dpr, sky.width, sh * dpr, -3, -0.5, W + 6, sh + 0.5);
                        }
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.globalAlpha = 1;
                        ctx.imageSmoothingEnabled = true;
                        ctx.drawImage(reflC, 0, 0, rw, rh, 0, floorTop, cv.width, cv.height - floorTop);
                    } else {
                    for (let d = 0; d < reflH; d += step) {
                        const sh = Math.min(step, reflH - d);
                        const srcY = HZ - d - sh;
                        if (srcY < 0) break;
                        const k = d / reflH;
                        const amp = CFG.REFL_AMP0 + CFG.REFL_AMP1 * k * k;
                        const dx = amp * (0.7 * Math.sin(d * CFG.SL_F0 + clock * CFG.SL_F1) + 0.3 * Math.sin(d * CFG.SL_F2 - clock * CFG.SL_F3));
                        ctx.setTransform(dpr, 0, 0, -dpr, dx * dpr, (HZ + d + sh) * dpr);
                        ctx.drawImage(sky, 0, srcY * dpr, sky.width, sh * dpr, -3, -0.5, W + 6, sh + 0.5);
                    }
                    }
                }

                // soften the reflection near the horizon; the real ranges above stay sharp
                // because only rows from the horizon downward are pasted back.
                // blur+복사는 BAND_EVERY 프레임마다만 갱신 (사이 프레임은 캐시 blit만).
                if (bandH > 0) {
                    const every = Math.max(1, Math.round(CFG.BAND_EVERY ?? 3));
                    const pMoved = Math.abs(p - bandLastP) > 0.004;
                    if (!bandValid || (bandTick % every) === 0 || pMoved) {
                        bandBuilds++;
                        bandLastP = p;
                        const srcY = (HZ - CFG.BAND_PAD) * dpr, srcH = (bandH + CFG.BAND_PAD * 2) * dpr;
                        BD.setTransform(1, 0, 0, 1, 0, 0);
                        BD.globalCompositeOperation = 'source-over';
                        BD.clearRect(0, 0, band.width, band.height);
                        if (FILTER_OK) BD.filter = `blur(${(CFG.BLUR_PX * dpr / BAND_SCALE).toFixed(2)}px)`;
                        BD.drawImage(cv, 0, srcY, cv.width, srcH, 0, 0, band.width, band.height);
                        BD.filter = 'none';
                        const y0 = CFG.BAND_PAD * dpr / BAND_SCALE, y1 = (CFG.BAND_PAD + bandH) * dpr / BAND_SCALE;
                        const mg = BD.createLinearGradient(0, y0, 0, y1);
                        mg.addColorStop(0, 'rgba(0,0,0,1)');
                        mg.addColorStop(0.35, 'rgba(0,0,0,0.6)');
                        mg.addColorStop(1, 'rgba(0,0,0,0)');
                        BD.globalCompositeOperation = 'destination-in';
                        BD.fillStyle = mg;
                        BD.fillRect(0, 0, band.width, band.height);
                        BD.globalCompositeOperation = 'source-over';
                        bandValid = true;
                    }
                    bandTick++;
                    const y0 = CFG.BAND_PAD * dpr / BAND_SCALE, y1 = (CFG.BAND_PAD + bandH) * dpr / BAND_SCALE;
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.drawImage(band, 0, y0, band.width, y1 - y0, 0, HZ * dpr, cv.width, bandH * dpr);
                }

                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                const [r0, r1] = keyed(REFL, p);
                const rg = ctx.createLinearGradient(0, HZ, 0, H);
                rg.addColorStop(0, `rgba(10,18,32,${r0})`);
                rg.addColorStop(1, `rgba(10,18,32,${r1})`);
                ctx.fillStyle = rg; ctx.fillRect(0, HZ, W, H - HZ);

                // seam glow where sky meets its mirror
                const hor = keyed(SKY, p)[2];
                const hl = mix(hor, [255, 255, 255], 0.3);
                const sg = ctx.createLinearGradient(0, HZ - 6, 0, HZ + 14);
                sg.addColorStop(0, rgba(hl, 0)); sg.addColorStop(0.3, rgba(hl, CFG.SEAM_A)); sg.addColorStop(1, rgba(hl, 0));
                ctx.fillStyle = sg; ctx.fillRect(0, HZ - 6, W, 20);

                FG.setTransform(1, 0, 0, 1, 0, 0);
                FG.clearRect(0, 0, fg.width, fg.height);
                drawTorii(r0, r1);
                drawLanterns(r0, r1);
                FG.setTransform(dpr, 0, 0, dpr, 0, 0);

                const v = keyed(VIG, p)[0];
                const vg = FG.createRadialGradient(W / 2, HZ, Math.min(W, H) * 0.35, W / 2, HZ, Math.hypot(W, H) * 0.72);
                vg.addColorStop(0, 'rgba(0,0,0,0)');
                vg.addColorStop(1, `rgba(0,0,0,${v})`);
                FG.fillStyle = vg; FG.fillRect(0, 0, W, H);
            }

            // ---------- click ripples on the flat (WebGL) ----------
            // The 2D canvas keeps drawing the scene. While a ripple is alive, the floor rows
            // are copied into a texture and redrawn through a shader on #ripple, which sits
            // between the scene and the foreground layer. Ripples are modelled on the ground
            // plane, so rings flatten and shrink toward the horizon. Each ring is capped at
            // RIP_MAX_R: its amplitude has faded to zero by then and it is removed.
            const glc = document.getElementById('ripple');
            const floorC = document.createElement('canvas');
            const FL = floorC.getContext('2d');
            const RIP_SLOTS = 8;    // 셰이더 슬롯 고정값 (CFG.RIP_MAX는 1..RIP_SLOTS 범위에서 동작)
            const ripples = [];
            const ripU = new Float32Array(RIP_SLOTS * 4);
            let gl = null, glU = null, glTex = null, glOn = false;
            let floorTop = 0, floorH = 1, texW = 0, texH = 0;

            const RIP_VS = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}';
            const RIP_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform vec2 uRes;       // floor size, device px
uniform float uDpr;
uniform float uCx;       // horizontal centre, css px
uniform float uF;        // focal length, css px
uniform float uStr;
uniform float uK;
uniform int uN;
uniform vec4 uRip[${RIP_SLOTS}];   // ground x, ground z, ring radius, amplitude
void main() {
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = fc / uDpr;                       // css px; p.y = depth below the horizon
  float s = max(p.y, 0.5);
  vec2 g = vec2((p.x - uCx) / s, uF / s);   // position on the ground plane
  vec2 slope = vec2(0.0);
  float glint = 0.0;
  for (int i = 0; i < ${RIP_SLOTS}; i++) {
    if (i >= uN) break;
    vec4 r = uRip[i];
    vec2 d = g - r.xy;
    if (max(abs(d.x), abs(d.y)) > 1.5) continue;
    float dist = length(d);
    vec2 dir = d / max(dist, 1e-4);
    float e = dist - r.z;                   // > 0 ahead of the ring, < 0 behind it
    float w = e > 0.0 ? 0.02 : 0.1;         // sharp front, a few trailing crests
    // crest spacing on screen; fade where it would alias (thin rings near the horizon)
    float px = 6.2832 / uK / length(vec2(dir.x / s, dir.y * uF / (s * s)));
    float env = exp(-(e * e) / (w * w)) * r.w * smoothstep(2.0, 5.0, px) * smoothstep(0.0, 0.03, dist);
    slope += cos(uK * e) * env * dir;
    glint += max(0.0, sin(uK * e)) * env;
  }
  vec2 o = vec2(slope.x * s, -slope.y * s * s / uF) * uStr;
  vec2 uv = (fc + o * uDpr) / uRes;
  uv.y = max(uv.y, 0.5 / uRes.y);
  vec3 col = texture2D(uTex, uv).rgb;
  float shade = clamp(slope.y, -1.0, 1.0);  // tilt toward / away from the viewer
  col *= 1.0 + 0.16 * shade;
  glint = min(glint, 1.0);
  col += glint * (0.08 * vec3(0.8, 0.86, 1.0) + 0.12 * col);   // faint crest highlight, visible at night too
  gl_FragColor = vec4(col, 1.0);
}`;

            function initGL() {
                gl = null;
                let g = null;
                try {
                    g = glc.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
                } catch (e) { g = null; }
                if (!g) return;
                try {
                    const sh = (type, src) => {
                        const o = g.createShader(type);
                        g.shaderSource(o, src);
                        g.compileShader(o);
                        if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o));
                        return o;
                    };
                    const prog = g.createProgram();
                    g.attachShader(prog, sh(g.VERTEX_SHADER, RIP_VS));
                    g.attachShader(prog, sh(g.FRAGMENT_SHADER, RIP_FS));
                    g.linkProgram(prog);
                    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog));
                    g.useProgram(prog);
                    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
                    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
                    const aPos = g.getAttribLocation(prog, 'aPos');
                    g.enableVertexAttribArray(aPos);
                    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0);
                    glTex = g.createTexture();
                    g.activeTexture(g.TEXTURE0);
                    g.bindTexture(g.TEXTURE_2D, glTex);
                    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
                    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
                    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
                    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
                    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
                    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                    glU = {};
                    for (const k of ['uTex', 'uRes', 'uDpr', 'uCx', 'uF', 'uStr', 'uK', 'uN']) glU[k] = g.getUniformLocation(prog, k);
                    glU.uRip = g.getUniformLocation(prog, 'uRip[0]');
                    g.uniform1i(glU.uTex, 0);
                    g.uniform1f(glU.uStr, CFG.RIP_STR);
                    g.uniform1f(glU.uK, CFG.RIP_K);
                    texW = texH = 0;
                    gl = g;
                } catch (e) {
                    console.warn('ripple effect disabled:', e);
                }
            }
            glc.addEventListener('webglcontextlost', e => { e.preventDefault(); gl = null; });
            glc.addEventListener('webglcontextrestored', initGL);

            // the ripple layer covers exactly the device-pixel rows below the horizon
            function resizeRipple() {
                floorTop = Math.round(HZ * dpr);
                floorH = Math.max(1, cv.height - floorTop);
                floorC.width = cv.width; floorC.height = floorH;
                glc.width = cv.width; glc.height = floorH;
                glc.style.top = (floorTop / dpr) + 'px';
                glc.style.height = (floorH / dpr) + 'px';
            }

            window.addEventListener('pointerdown', e => {
                if (!gl || RM.matches || e.button > 0) return;
                if (e.target instanceof Element && e.target.closest('.panel,.tsd-panel,#tsdFab')) return;
                const fh = floorH / dpr;
                const s = e.clientY - floorTop / dpr;
                if (s < 6 || s > fh) return;
                if (ripples.length >= Math.min(RIP_SLOTS, Math.max(1, Math.round(CFG.RIP_MAX)))) ripples.shift();
                ripples.push({ xn: e.clientX / W, sn: s / fh, t: 0 });
            });

            function stepRipples(dt) {
                if (debugPaused) return;
                for (let i = ripples.length - 1; i >= 0; i--) {
                    ripples[i].t += dt;
                    if (CFG.RIP_V * ripples[i].t >= CFG.RIP_MAX_R) ripples.splice(i, 1);
                }
            }

            function drawRipples() {
                const on = gl !== null && ripples.length > 0;
                if (on !== glOn) { glOn = on; glc.style.display = on ? 'block' : 'none'; }
                if (!on) return;
                FL.setTransform(1, 0, 0, 1, 0, 0);
                FL.drawImage(cv, 0, floorTop, cv.width, floorH, 0, 0, floorC.width, floorC.height);
                gl.bindTexture(gl.TEXTURE_2D, glTex);
                if (texW !== floorC.width || texH !== floorC.height) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, floorC);
                    texW = floorC.width; texH = floorC.height;
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, floorC);
                }
                const foc = CFG.FOCAL * H, fh = floorH / dpr;
                ripU.fill(0);
                ripples.forEach((r, i) => {
                    const s = Math.max(1, r.sn * fh);
                    const R = CFG.RIP_V * r.t;
                    // quick attack, steady decay, and a fade that reaches zero at the radius cap
                    const a = ss(0, 0.06, r.t) * Math.exp(-0.8 * r.t) * (1 - ss(0.45 * CFG.RIP_MAX_R, CFG.RIP_MAX_R, R));
                    ripU[i * 4] = (r.xn * W - W / 2) / s;
                    ripU[i * 4 + 1] = foc / s;
                    ripU[i * 4 + 2] = R;
                    ripU[i * 4 + 3] = a;
                });
                gl.viewport(0, 0, glc.width, glc.height);
                gl.uniform2f(glU.uRes, glc.width, glc.height);
                gl.uniform1f(glU.uDpr, dpr);
                gl.uniform1f(glU.uCx, W / 2);
                gl.uniform1f(glU.uF, foc);
                gl.uniform1f(glU.uStr, CFG.RIP_STR);
                gl.uniform1f(glU.uK, CFG.RIP_K);
                gl.uniform1i(glU.uN, ripples.length);
                gl.uniform4fv(glU.uRip, ripU);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }

            // ---------- UI ----------
            let uiKey = '', lastNight = null, lastActive = '';
            // 상태가 향하는 목표: 'day' | 'dusk' | 'night'
            const targetOf = s => (s === 'day' || s === 'toDay' ? 'day' : s === 'dusk' || s === 'toDusk' ? 'dusk' : 'night');
            // 아이콘 클릭 → 현재 p에서 목표까지 자연스럽게 전환 (전환 중 재클릭도 현재 p에서 다시 시작)
            function goTo(target) {
                if (target !== 'day' && target !== 'dusk' && target !== 'night') return;
                if (targetOf(state) === target) return;
                transFrom = p;
                nkFrom = nk;
                if (target === 'night') {
                    transTo = 1;
                    state = 'toNight'; tState = 0;
                    nkTo = 1;
                    phi = 0; phiTail = null; omega = 0;
                } else {
                    transTo = target === 'day' ? 0 : CFG.P_DUSK;
                    state = target === 'day' ? 'toDay' : 'toDusk'; tState = 0;
                    nkTo = 0;
                }
            }
            function updateUI() {
                let status;
                const active = targetOf(state);
                if (state === 'day') status = '낮';
                else if (state === 'dusk') status = '황혼';
                else if (state === 'toNight') status = '밤으로 전환 중';
                else if (state === 'night') status = '밤';
                else status = state === 'toDay' ? '낮으로 전환 중' : '황혼으로 전환 중';
                const key = status;
                if (key !== uiKey) {
                    uiKey = key;
                    elStatus.textContent = status;
                }
                // card switches to its night palette once the sky has gone dark
                const night = p >= 0.5;
                if (night !== lastNight) { lastNight = night; elPanel.classList.toggle('is-night', night); }
                if (active !== lastActive) {
                    lastActive = active;
                    for (const [el, m] of [[elDay, 'day'], [elDusk, 'dusk'], [elNight, 'night']]) {
                        if (!el) continue;
                        const on = active === m;
                        el.classList.toggle('on', on);
                        el.setAttribute('aria-pressed', on ? 'true' : 'false');
                    }
                }
            }

            if (elDay) elDay.addEventListener('click', () => goTo('day'));
            if (elDusk) elDusk.addEventListener('click', () => goTo('dusk'));
            if (elNight) elNight.addEventListener('click', () => goTo('night'));

            // ---------- debug bridge (F12 패널용) ----------
            // tsukuyomi.debug.js가 이 객체를 통해 모든 파라미터를 수동 조절한다.
            // CFG(수치) + 팔레트(색) + 상태(p/phi/state) + 재빌드 액션을 노출.
            window.__TSUKUYOMI__ = {
                cfg: CFG,
                defaults: CFG_DEFAULTS,
                get state() { return state; },
                set state(v) {
                    state = v;
                    if (v === 'day') { p = 0; transFrom = 0; transTo = 0; nk = 0; nkFrom = 0; nkTo = 0; phi = 0; phiTail = null; omega = 0; }
                    else if (v === 'dusk') { p = CFG.P_DUSK; transFrom = p; transTo = p; nk = 0; nkFrom = 0; nkTo = 0; phi = 0; phiTail = null; omega = 0; }
                    else if (v === 'night') { p = 1; transFrom = 1; transTo = 1; nk = 1; nkFrom = 1; nkTo = 1; }
                    else if (v === 'toNight') {
                        if (!(p < 1)) p = CFG.P_DUSK;
                        transFrom = p; transTo = 1; nkFrom = nk; nkTo = 1; tState = 0;
                        phi = 0; phiTail = null; omega = 0;
                    }
                    else if (v === 'toDay' || v === 'toDusk') {
                        transTo = v === 'toDay' ? 0 : CFG.P_DUSK;
                        if (!(p >= 0 && p <= 1)) p = 1;
                        transFrom = p; nkFrom = nk; nkTo = 0; tState = 0;
                    }
                },
                get mode() { return targetOf(state); }, set mode(v) { goTo(v); },
                get sunK() { return sunK(); },
                get nk() { return nk; }, set nk(v) { nk = clamp(Number(v) || 0, 0, 1); },
                get p() { return p; }, set p(v) { p = clamp(Number(v) || 0, 0, 1); },
                get phi() { return phi; }, set phi(v) { phi = Number(v) || 0; },
                get phiTail() { return phiTail; }, set phiTail(v) { phiTail = v; },
                get moonMT() { return moonMT(p); },
                get omega() { return omega; }, set omega(v) { omega = Number(v) || 0; },
                get clock() { return clock; },
                get tState() { return tState; }, set tState(v) { tState = Number(v) || 0; },
                get tNight() { return tNight; }, set tNight(v) { tNight = Number(v) || 0; },
                get hold() { return debugHold; }, set hold(v) { debugHold = !!v; },
                get paused() { return debugPaused; }, set paused(v) { debugPaused = !!v; },
                get lanterns() { return lanterns; },
                get lanReady() { return lanReady; },
                get lanCached() { return lanCW > 0 && lanCH > 0; },
                get reflStep() { return reflStep; },
                get reflCost() { return reflEMA; },
                get torBuilds() { return torBuilds; },
                get bandBuilds() { return bandBuilds; },
                get palettes() {
                    return { SKY: SKY_RAW, MOUNT: MOUNT_RAW, TORII: TORII_RAW, CLOUD_TINT: CLOUD_TINT_RAW, REFL, VIG, LV, COLS: COLS_RAW };
                },
                setPalette(name, raw) {
                    const parsed = JSON.parse(JSON.stringify(raw));
                    if (name === 'SKY') { SKY_RAW = parsed; SKY = prep(SKY_RAW); }
                    else if (name === 'MOUNT') { MOUNT_RAW = parsed; MOUNT = prep(MOUNT_RAW); }
                    else if (name === 'TORII') { TORII_RAW = parsed; TORII = prep(TORII_RAW); }
                    else if (name === 'CLOUD_TINT') { CLOUD_TINT_RAW = parsed; CLOUD_TINT = prep(CLOUD_TINT_RAW); }
                    else if (name === 'REFL') { REFL = parsed; }
                    else if (name === 'VIG') { VIG = parsed; }
                    else if (name === 'LV') { LV = parsed; }
                    else if (name === 'COLS') { COLS_RAW = parsed; COLS = COLS_RAW.map(hex); }
                    else throw new Error('unknown palette: ' + name);
                },
                resetPalette(name, defaults) { this.setPalette(name, defaults); },
                actions: {
                    resize, buildStars, buildMountains, buildClouds, buildLanterns,
                    goTo,
                    toNight() { goTo('night'); },
                    toDay() { goTo('day'); },
                    toDusk() { goTo('dusk'); },
                    reset() {
                        Object.assign(CFG, JSON.parse(JSON.stringify(CFG_DEFAULTS)));
                        // 구버전 스냅샷(MOON_X0/MOON_X1, W_FAST/DECAY/FAST_HOLD)으로 가져온 잔여 키 제거
                        delete CFG.MOON_X0; delete CFG.MOON_X1;
                        delete CFG.W_FAST; delete CFG.DECAY; delete CFG.FAST_HOLD;
                        reflStep = Math.max(1, Math.round(CFG.ROW_STEP)); reflLastBase = reflStep; reflEMA = 16; reflCool = 0;
                        torKey = ''; torRKey = ''; torBuilds = 0;
                        bandValid = false; bandTick = 0; bandLastP = -1; bandBuilds = 0;
                        transFrom = CFG.P_DUSK; transTo = CFG.P_DUSK; nk = 0; nkFrom = 0; nkTo = 0;
                        state = 'dusk'; p = CFG.P_DUSK; tState = 0; tNight = 0;
                        phi = 0; phiTail = null; omega = 0; debugHold = false; debugPaused = false;
                        buildMountains(); buildClouds(); buildLanterns(); resize();
                    },
                    ripple(xn = 0.5, sn = 0.5) {
                        const cap = Math.min(RIP_SLOTS, Math.max(1, Math.round(CFG.RIP_MAX)));
                        if (ripples.length >= cap) ripples.shift();
                        ripples.push({ xn: clamp(xn, 0, 1), sn: clamp(sn, 0.02, 1), t: 0 });
                    },
                    clearRipples() { ripples.length = 0; },
                },
            };

            // ---------- loop ----------
            let lastT = performance.now();
            function frame(now) {
                const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
                lastT = now;
                update(dt);
                stepRipples(dt);
                const t0 = performance.now();
                render();
                drawRipples();
                tickReflGovernor(performance.now() - t0);
                updateUI();
                requestAnimationFrame(frame);
            }

            let rt = 0;
            window.addEventListener('resize', () => {
                clearTimeout(rt);
                rt = setTimeout(resize, 120);
            });

            initGL();
            buildMountains();
            buildClouds();
            buildLanterns();
            loadLanternSprite();
            resize();
            requestAnimationFrame(t => { lastT = t; frame(t); });
        })();
    
