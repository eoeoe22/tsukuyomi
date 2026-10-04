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
            // torii sprite and its flipped, darkened copy for the reflection
            const torC = document.createElement('canvas');
            const TC = torC.getContext('2d');
            const torR = document.createElement('canvas');
            const TR = torR.getContext('2d');
            let torS = 1, torX = 0, torY = 0, torW = 0, torH = 0, torBase = 0;
            const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
            // real torii and vignette live on their own layer above the ripple copy,
            // so only the mirror image bends
            const fg = document.getElementById('fg');
            const FG = fg.getContext('2d');

            const elPanel = document.getElementById('panel');
            const elStatus = document.getElementById('status');
            const elBtn = document.getElementById('go');
            const elFill = document.getElementById('fill');
            const elMeter = document.getElementById('meter');

            // ---------- tunable params (F12 debug UI에서 수동 조절) ----------
            // 모든 수치 파라미터는 CFG 하나로 모음. 기본값 = 기존 하드코딩 값과 동일.
            // debug 패널(tsukuyomi.debug.js)이 window.__TSUKUYOMI__ 를 통해 live로 읽고 쓴다.
            const CFG = {
                T_NIGHT: 9.5, T_DAY: 2.4, W_FAST: 0.28, W_SLOW: 0.009, TRAIL_LEN: 0.6, DECAY: 0.45, FAST_HOLD: 2.0,
                P_DUSK: 0.32,
                HZ_RATIO: 0.56, DPR_MAX: 2, PIX_BUDGET: 5e6,
                BAND_PAD: 12, BLUR_PX: 3, BAND_H: 0.3,
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
                SL_F0: 0.11, SL_F1: 1.1, SL_F2: 0.037, SL_F3: 0.7, ROW_STEP: 3,
                RIP_MAX: 8, RIP_V: 0.42, RIP_MAX_R: 0.95, RIP_K: 80, RIP_STR: 0.04, FOCAL: 0.9,
                LANTERN_N: 64, LANTERN_GX: 0.48, LANTERN_SN0: 0.02, LANTERN_SN1: 1,
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

            // ---------- palettes keyed by scene progress p (0 = noon dummy, P_DUSK = dusk idle, 1 = night) ----------
            // NOTE(더미): p = 0 완전 낮 장면은 현재 초기값으로 쓰지 않지만 삭제하지 않고 남겨둠.
            const P_NOON_DUMMY = 0;  // 더미: 완전 낮 (미사용, 팔레트 하위 키 유지용)
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
            let phi = 0, phiTail = null, omega = 0, clock = 0;   // phiTail: rotation angle at the trail's tail
            let trailTState = null;   // tState at which the trail first reached full length (early-decay 기준점)
            let nightBase = 0;   // night 진입 시점의 감속 경과량 (점프 방지용 오프셋)
            let stars = [], buckets = [];
            let mtn = [], clouds = [];
            // stone lanterns on the flat (lantern-front.svg, all facing the viewer)
            let lanterns = [], lanImg = null, lanReady = false;

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
                for (let i = 0; i < n; i++) {
                    const sn = lerp(sn0, sn1, rng());
                    // ux: -1..1 uniform; x spread narrows toward the horizon (perspective)
                    const ux = rng() * 2 - 1;
                    lanterns.push({ sn, ux, x: 0, y: 0, w: 0, h: 0, s: 0 });
                }
                lanterns.sort((a, b) => a.sn - b.sn);   // far-to-near painter order
                projectLanterns();
            }
            function projectLanterns() {
                if (!W || !H) return;
                const reflH = Math.max(1, H - HZ);
                const minS = Math.max(2, 0.03 * reflH);
                const halfW = W * clamp(CFG.LANTERN_GX, 0.05, 0.6);
                for (const L of lanterns) {
                    const s = clamp(L.sn * reflH, minS, reflH);
                    L.s = s;
                    L.x = W / 2 + L.ux * halfW * (0.22 + 0.78 * L.sn);
                    L.y = HZ + s;
                    L.h = Math.max(2, CFG.LANTERN_H * s);
                    L.w = L.h * LAN_WHR;
                }
                // keep clear of the torii and the bottom control card
                const tcx = torX + torW / 2;
                for (const L of lanterns) {
                    const m = CFG.LANTERN_EXCL;
                    const lx0 = L.x - L.w / 2, lx1 = L.x + L.w / 2;
                    const tExp = (torW / 2 + L.w / 2) * m;
                    if (Math.abs(L.x - tcx) < tExp && L.y - L.h < torBase && L.y > torY) {
                        L.x = tcx + (L.x < tcx ? -tExp : tExp);
                    }
                    if (lx1 < -L.w || lx0 > W + L.w) continue;
                    // bottom control: desktop card (centre) vs mobile button (bottom-left)
                    const narrow = W <= 460;
                    const cardCx = narrow ? 90 : W / 2;
                    const cardHalf = narrow ? 110 : 250;
                    const cardTop = H - (narrow ? 90 : 170);
                    if (L.y > cardTop && Math.abs(L.x - cardCx) < cardHalf + L.w / 2) {
                        L.x = cardCx + (L.x < cardCx ? -(cardHalf + L.w / 2) : (cardHalf + L.w / 2));
                    }
                }
            }
            function loadLanternSprite() {
                try {
                    lanImg = new Image();
                    lanImg.decoding = 'async';
                    lanImg.onload = () => { lanReady = true; };
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
            function resize() {
                W = window.innerWidth; H = window.innerHeight;
                dpr = Math.min(CFG.DPR_MAX, window.devicePixelRatio || 1);
                if (W * H * dpr * dpr > CFG.PIX_BUDGET) dpr = Math.max(1, Math.sqrt(CFG.PIX_BUDGET / (W * H)));
                HZ = Math.round(H * CFG.HZ_RATIO);
                cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
                bandH = Math.round((H - HZ) * CFG.BAND_H);
                band.width = Math.ceil(W * dpr / BAND_SCALE);
                band.height = Math.ceil((bandH + CFG.BAND_PAD * 2) * dpr / BAND_SCALE);
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
                torX = W * CFG.TORII_X - (340 - TB.x) * torS;
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
            function update(dt) {
                if (debugPaused) return;
                clock += dt;
                if (!debugHold) {
                if (state === 'toNight') {
                    tState += dt;
                    const k = Math.min(1, tState / CFG.T_NIGHT);
                    p = CFG.P_DUSK + (1 - CFG.P_DUSK) * k;
                    // 감속 곡선: FAST_HOLD 뒤 DECAY*4 구간을 smoothstep으로 감속.
                    // 양끝 기울기가 0이라 유지-감속, 감속-완료 경계에서 끊기는 느낌이 없다.
                    const dur = Math.max(0.05, CFG.DECAY * 4);
                    if (trailTState === null) {
                        omega = CFG.W_FAST * ss(0.46, 0.56, p);
                    } else {
                        const e = tState - trailTState - CFG.FAST_HOLD;
                        omega = lerp(CFG.W_FAST, CFG.W_SLOW, ss(0, dur, e));
                    }
                    // 감속 완료(e >= dur) 시점을 전환 완료로 취급 (k>=1은 트레일 미완성 시 폴백)
                    const eNow = trailTState === null ? -1 : tState - trailTState - CFG.FAST_HOLD;
                    const decelDone = eNow >= Math.max(0.05, CFG.DECAY * 4);
                    if (decelDone || k >= 1) {
                        nightBase = trailTState !== null ? Math.max(0, tState - trailTState - CFG.FAST_HOLD) : 0;
                        state = 'night'; tNight = 0; p = 1;
                    }
                } else if (state === 'night') {
                    tNight += dt;
                    // 진입 시점의 감속 곡선을 그대로 이어감 (값·기울기 모두 연속)
                    const dur = Math.max(0.05, CFG.DECAY * 4);
                    if (trailTState === null) {
                        omega = lerp(CFG.W_FAST, CFG.W_SLOW, ss(0, dur, tNight));
                    } else {
                        // toNight에서 이미 감속이 시작됐다면 이어서 감속 (점프 방지)
                        omega = lerp(CFG.W_FAST, CFG.W_SLOW, ss(0, dur, nightBase + tNight));
                    }
                } else if (state === 'toDusk' || state === 'toDay') {
                    // 'toDay' 분기는 더미 호환용으로 남겨둠 (완전 낮 p=0으로는 복귀하지 않고 노을로 복귀)
                    tState += dt;
                    const k = Math.min(1, tState / CFG.T_DAY);
                    p = 1 - (1 - CFG.P_DUSK) * ss(0, 1, k);
                    omega *= Math.exp(-dt * 3);
                    if (k >= 1) {
                        state = 'dusk'; p = CFG.P_DUSK; phi = 0; phiTail = null; trailTState = null; nightBase = 0; omega = 0;
                    }
                } else {
                    // 'day'(완전 낮, 더미) / 'dusk'(노을 idle) 모두 정지 상태
                    // p가 P_NOON_DUMMY(0) 근처에 머물러도 렌더 경로는 그대로 유지됨
                    omega = 0;
                }
                }

                if (phiTail === null && omega > 0) { phiTail = phi; trailTState = null; }
                phi += omega * dt;
                if (phiTail !== null) {
                    // The tail holds still until the trail is ~80% grown, then eases into motion,
                    // so the move from "growing" to "fixed length" has no sudden jump in speed.
                    // (0.2 -> 0.8: 트레일 완성 시점을 앞당겨 빠른 회전 시간을 단축)
                    const g = ss(0.8 * CFG.TRAIL_LEN, 1.05 * CFG.TRAIL_LEN, phi - phiTail);
                    phiTail += omega * g * dt;
                    if (phi - phiTail > CFG.TRAIL_LEN) phiTail = phi - CFG.TRAIL_LEN;
                    // 트레일 완성 시점을 기록: 이후 omega는 DECAY(~0.45)로 2초 이내 최저속도까지 감속
                    if (trailTState === null && (phi - phiTail) >= CFG.TRAIL_LEN - 1e-6) trailTState = tState;
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

                // sun path
                const sp = clamp(p / CFG.SUN_PATH, 0, 1);
                const sx = lerp(W * CFG.SUN_X0, W * CFG.SUN_X1, sp);
                const sy0 = HZ * 0.3;
                const sy = lerp(sy0, HZ + sunR * CFG.SUN_DROP, sp * sp);

                // afterglow along the horizon (brief)
                const glowA = ss(CFG.SUN_G0, CFG.SUN_G1, p) * (1 - ss(CFG.SUN_G2, CFG.SUN_G3, p));
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

                // sun
                const sunFade = 1 - ss(CFG.SUN_F0, CFG.SUN_F1, p);
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
                    // 달은 토리이와 항상 같은 수직선상: x는 TORII_X 공유, y만 MOON_Y로 조절
                    const mx = W * CFG.TORII_X;
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

            // torii standing on the flat in front of the ranges, with its own mirror image
            function drawTorii(r0, r1) {
                const [red, blk, gold] = keyed(TORII, p);
                const k = torS * dpr;
                TC.setTransform(1, 0, 0, 1, 0, 0);
                TC.clearRect(0, 0, torC.width, torC.height);
                TC.setTransform(k, 0, 0, k, -TB.x * k, -TB.y * k);
                TC.fillStyle = rgba(red); TC.fill(TORII_RED);
                TC.fillStyle = rgba(blk); TC.fill(TORII_BLK);
                TC.strokeStyle = rgba(gold);
                TC.lineWidth = 2; TC.strokeRect(314, 134, 52, 46);
                TC.lineWidth = 1; TC.strokeRect(322, 142, 36, 30);

                // flipped copy, dimmed the same way as the rest of the reflection
                const reflH = H - HZ;
                const rd = lerp(r0, r1, clamp((torBase - HZ) / reflH + 0.15, 0, 1));
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

                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                // row r of the flipped copy lands at torBase + r - pad, where pad is the
                // strip of empty sprite below the feet
                const pad = (TB.y + TB.h - TB.base) * torS;
                const top = torBase - pad;
                if (RM.matches) {
                    ctx.drawImage(torR, torX, top, torW, torH);
                } else {
                    const step = CFG.ROW_STEP;
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
                if (!lanReady || !lanterns.length || !lanImg.naturalWidth) return;
                const reflH = Math.max(1, H - HZ);
                const night = ss(CFG.MOON_A0, CFG.MOON_A1, p);
                const sw = lanImg.naturalWidth, shFull = lanImg.naturalHeight;
                const shBody = shFull * LAN_FEET;
                const step = Math.max(1, Math.round(CFG.ROW_STEP));

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
                        ctx.drawImage(lanImg, 0, 0, sw, shBody, L.x - L.w / 2, L.y - dh, L.w, dh);
                        ctx.restore();
                    } else {
                        ctx.globalAlpha = (1 - rd) * 0.9;
                        for (let r = 0; r < dh; r += step) {
                            const shD = Math.min(step, dh - r);
                            const y = L.y + r;
                            if (y > H) break;
                            const d = y - HZ, kk = d / reflH;
                            const amp = CFG.REFL_AMP0 + CFG.REFL_AMP1 * kk * kk;
                            const dx = amp * (0.7 * Math.sin(d * CFG.SL_F0 + clock * CFG.SL_F1) + 0.3 * Math.sin(d * CFG.SL_F2 - clock * CFG.SL_F3));
                            const srcH = shD / dh * shBody;
                            const srcY = shBody - (r + shD) / dh * shBody;
                            if (srcY < 0 || srcH <= 0) continue;
                            ctx.drawImage(lanImg, 0, srcY, sw, srcH, L.x - L.w / 2 + dx, y, L.w, shD + 0.5);
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
                    FG.drawImage(lanImg, L.x - L.w / 2, top, L.w, L.h);
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
                    const step = CFG.ROW_STEP;
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

                // soften the reflection near the horizon; the real ranges above stay sharp
                // because only rows from the horizon downward are pasted back
                {
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
            let uiKey = '', lastPct = -1, lastNight = null;
            const progOf = v => clamp((v - CFG.P_DUSK) / (1 - CFG.P_DUSK), 0, 1);
            function updateUI() {
                let status, label, disabled = false, prog = 0;
                if (state === 'day') {
                    // 더미 분기: 완전 낮 idle (현재 진입 불가, 기존 문자열 호환용)
                    status = '낮'; label = '해 지게 하기'; prog = 0;
                } else if (state === 'dusk') {
                    status = '노을'; label = '해 지게 하기';
                } else if (state === 'toNight') {
                    status = '밤으로 전환 중'; label = '전환 중'; disabled = true; prog = progOf(p);
                } else if (state === 'night') {
                    status = '밤'; label = '노을로 돌아가기'; prog = 1;
                } else {
                    // 'toDusk' + 더미 'toDay'
                    status = '노을로 전환 중'; label = '전환 중'; disabled = true; prog = progOf(p);
                }
                const key = status + '|' + label;
                if (key !== uiKey) {
                    uiKey = key;
                    elStatus.textContent = status;
                    elBtn.textContent = label;
                    elBtn.disabled = disabled;
                }
                // card switches to its night palette once the sky has gone dark
                const night = p >= 0.5;
                if (night !== lastNight) { lastNight = night; elPanel.classList.toggle('is-night', night); }
                elFill.style.transform = `scaleX(${prog})`;
                const pct = Math.round(prog * 100);
                if (pct !== lastPct) { lastPct = pct; elMeter.setAttribute('aria-valuenow', String(pct)); }
            }

            elBtn.addEventListener('click', () => {
                if (state === 'dusk' || state === 'day') {
                    // 'day'는 더미 호환: 실제 시작점은 항상 노을(P_DUSK)
                    state = 'toNight'; tState = 0; p = CFG.P_DUSK;
                    phi = 0; phiTail = null; trailTState = null; nightBase = 0;
                } else if (state === 'night') {
                    state = 'toDusk'; tState = 0;
                }
            });

            // ---------- debug bridge (F12 패널용) ----------
            // tsukuyomi.debug.js가 이 객체를 통해 모든 파라미터를 수동 조절한다.
            // CFG(수치) + 팔레트(색) + 상태(p/phi/state) + 재빌드 액션을 노출.
            window.__TSUKUYOMI__ = {
                cfg: CFG,
                defaults: CFG_DEFAULTS,
                get state() { return state; }, set state(v) { state = v; },
                get p() { return p; }, set p(v) { p = clamp(Number(v) || 0, 0, 1); },
                get phi() { return phi; }, set phi(v) { phi = Number(v) || 0; },
                get phiTail() { return phiTail; }, set phiTail(v) { phiTail = v; if (v === null) trailTState = null; },
                get trailTState() { return trailTState; },
                get omega() { return omega; }, set omega(v) { omega = Number(v) || 0; },
                get clock() { return clock; },
                get tState() { return tState; }, set tState(v) { tState = Number(v) || 0; },
                get tNight() { return tNight; }, set tNight(v) { tNight = Number(v) || 0; },
                get hold() { return debugHold; }, set hold(v) { debugHold = !!v; },
                get paused() { return debugPaused; }, set paused(v) { debugPaused = !!v; },
                get lanterns() { return lanterns; },
                get lanReady() { return lanReady; },
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
                    toNight() { state = 'toNight'; tState = 0; p = CFG.P_DUSK; phi = 0; phiTail = null; trailTState = null; nightBase = 0; },
                    toDusk() { state = 'toDusk'; tState = 0; },
                    reset() {
                        Object.assign(CFG, JSON.parse(JSON.stringify(CFG_DEFAULTS)));
                        // 구버전 스냅샷(MOON_X0/MOON_X1)으로 가져온 잔여 키 제거
                        delete CFG.MOON_X0; delete CFG.MOON_X1;
                        state = 'dusk'; p = CFG.P_DUSK; tState = 0; tNight = 0;
                        phi = 0; phiTail = null; trailTState = null; nightBase = 0; omega = 0; debugHold = false; debugPaused = false;
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
                render();
                drawRipples();
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
    
