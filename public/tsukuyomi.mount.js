/* 산정 토리이 장면 (reference-images/mount.mp4, mount.html). 카메라 고정, 움직이는 건 구름뿐이다.
 * 두 버전을 하단 아이콘 그룹으로 전환한다(tsukuyomi.css의 dock/icongroup 재사용, 스냅샷 크로스페이드):
 *   - dusk(구버전, 미통합): 영상 후반 숏. 땅거미 하늘 + 뒤쪽 운해 벽 + 바위 능선 + 토리이.
 *   - sunset(통합): 영상 두 숏을 한 장면으로. 운해 수평선에 걸린 노을 태양 + 원근 운해 + 역광 능선·토리이.
 *     수평선 위 높은 구름(권운~권적운)과 수평선까지 깔린 운해 융단은 원근 평면 셰이더(makePlaneGL)가 그리고,
 *     가운데·앞쪽 뭉게 봉우리 줄은 같은 바닥 평면 원근으로 CloudLive 스프라이트를 얹는다.
 * 공통:
 *   - 구름: 빌로우 띠 스프라이트를 여러 줄로 쌓아 옆으로 흘린다(줄마다 속도가 달라 시차).
 *     엔벨로프는 tsukuyomi.js duskRender와 같은 퍼프 방식으로 CPU에서 만들고, 혹 끓음·음영·착색은
 *     cloud-live.js(GPU)가 계속 다시 그린다(타임랩스).
 *   - 능선 바위 음영·태양 플레어는 리사이즈 때 한 번 굽는다.
 * 처음 보이는 장면만 즉시 만들고, 나머지 장면의 구름은 유휴 시간에 조금씩 만든다.
 * WebGL2가 없으면 구름 없이 나머지만 그린다.
 */
(() => {
    'use strict';

    const cv = document.getElementById('scene');
    const ctx = cv.getContext('2d');
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    function mulberry32(a) {
        return () => {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    const hash = (x, y, s) => {
        let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(s, 0x9e3779b1);
        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    function vnoise(x, y, s) {
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
        return a + (b - a) * ux + (c - a + (d - c - b + a) * ux) * uy;
    }
    // F1 워리 거리 (tsukuyomi.js duskWorley와 같음)
    function worley(x, y, s) {
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        let d = 8;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
            const ox = 0.5 + 0.38 * Math.sin(0.8 + 6.2831 * hash(xi + i, yi + j, s));
            const oy = 0.5 + 0.38 * Math.sin(0.8 + 6.2831 * hash(xi + i, yi + j, s + 7919));
            const rx = i + ox - fx, ry = j + oy - fy, q = rx * rx + ry * ry;
            if (q < d) d = q;
        }
        return Math.sqrt(d);
    }
    const fbm1 = (x, s) => { let n = 0, a = 0.5; for (let i = 0; i < 4; i++) { n += a * vnoise(x, 0.5, s + i * 31); x *= 2.03; a *= 0.5; } return n / 0.9375; };
    const FILTER_OK = (() => { const t = document.createElement('canvas').getContext('2d'); t.filter = 'blur(1px)'; return t.filter === 'blur(1px)'; })();

    // ---------- 공통 튜닝 값 ----------
    const CL = { CL_RATE: 0.9, CL_BOIL: 1, CL_WARP: 1, CL_RAND: 1, CL_HZ: 8, CL_UP: 0.9 };
    const FADE_S = 1.2;   // 장면 전환 크로스페이드(초)

    // ---------- 구름 스프라이트 (엔벨로프만 CPU, 나머지는 CloudLive) ----------
    const cloudLive = window.CloudLive ? window.CloudLive.create() : null;
    const LIVE_OK = !!(cloudLive && cloudLive.ok);
    const DUSK_UV = 660;   // tsukuyomi.js와 같은 스프라이트 px → 노이즈 uv 환산
    function envelope(m, P, RS) {
        const W = Math.ceil(m.width * RS), H = Math.ceil(m.height * RS);
        const EXT = 2.4, EOUT = 1.7 * (1 - EXT);
        const E = new Float32Array(W * H).fill(EOUT - 1);
        for (const [x, y, r, a, ex, ey] of P) {
            const cx = x * RS, cy = y * RS, rx = r * ex * RS, ry = r * ey * RS;
            const g = 1.7 * clamp(a, 0.8, 1.15);
            const xa = Math.max(0, (cx - rx * EXT) | 0), xb = Math.min(W - 1, Math.ceil(cx + rx * EXT));
            const ya = Math.max(0, (cy - ry * EXT) | 0), yb = Math.min(H - 1, Math.ceil(cy + ry * EXT));
            for (let py = ya; py <= yb; py++) {
                const dy = (py - cy) / ry, dy2 = dy * dy, o_ = py * W;
                for (let px = xa; px <= xb; px++) {
                    const dx = (px - cx) / rx, d = Math.sqrt(dx * dx + dy2);
                    if (d >= EXT) continue;
                    const v = g * (1 - d);
                    if (v > E[o_ + px]) E[o_ + px] = v;
                }
            }
        }
        return { E, W, H };
    }
    const puff = (P, x, y, r, a, ex, ey) => P.push([x, y, r, a, ex, ey]);
    // 큰 뭉게 덩어리 + 윗둘레 중간 덩어리 (tsukuyomi.js duskBillow와 같음)
    function billow(P, lr, x, y, R, ex, ey, nSub) {
        puff(P, x, y, R, 0.9 + lr() * 0.2, ex, ey);
        for (let k = 0; k < nSub; k++) {
            const an = -Math.PI * (0.06 + 0.88 * (k + 0.2 + lr() * 0.6) / nSub);
            const d = 0.55 + lr() * 0.25, r = R * (0.32 + lr() * 0.2);
            puff(P, x + Math.cos(an) * R * ex * d, y + Math.sin(an) * R * ey * d, r,
                0.85 + lr() * 0.25, 0.9 + lr() * 0.3, 0.85 + lr() * 0.25);
        }
    }
    function liveSprite(m, P, o, seed, tex) {
        const RS = 0.5, { E, W, H } = envelope(m, P, RS), UV = 1 / (DUSK_UV * RS);
        return cloudLive.add({
            m, E, HL: null, W, H, RS, top: m.pad * RS, hh: m.h0 * RS,
            COV: tex.cov, SHARP: 0.105, SOFT: 0.15, SC: tex.sc, ABS: tex.abs, UV, UX: UV * tex.ax,
            seed, o, sunDeg: tex.sun, t0: 0,
        });
    }
    // 운해 띠 조각의 퍼프: 납작한 데크 위로 크고 작은 뭉게 봉우리가 솟는다. hk(lr) = 봉우리 높이
    function rowPuffs(lr, seed, hk) {
        const w0 = 1400, h0 = 330, PAD = 170;
        const m = { width: w0 + PAD * 2, height: h0 + PAD * 2, w0, h0, pad: PAD };
        const P = [];
        const humps = Array.from({ length: 4 + ((lr() * 3) | 0) }, () => ({
            u: 0.04 + lr() * 0.92, w: 0.04 + lr() * 0.08, h: hk(lr)
        }));
        const top = u => {
            let v = 0.18 + 0.08 * Math.sin(u * 23 + seed);
            for (const hp of humps) v = Math.max(v, hp.h * Math.exp(-((u - hp.u) ** 2) / (2 * hp.w * hp.w)));
            return 0.66 - 0.62 * Math.min(1, v);
        };
        for (let i = 0; i < 26; i++) {
            const x = PAD + w0 * (-0.02 + 1.04 * (i + lr()) / 26);
            puff(P, x, PAD + h0 * (0.74 + lr() * 0.12), 40 + lr() * 20, 0.85 + lr() * 0.25, 1.9 + lr() * 0.8, 0.5 + lr() * 0.15);
        }
        for (let i = 0; i < 22; i++) {
            const u = -0.01 + 1.02 * (i + lr()) / 22, tp = top(u);
            puff(P, PAD + w0 * u, PAD + h0 * lerp(tp + 0.2, 0.72, 0.5), 60 + lr() * 25, 0.95 + lr() * 0.2, 1.5 + lr() * 0.5, 0.75 + lr() * 0.2);
        }
        for (let i = 0; i < 34; i++) {
            const u = -0.01 + 1.02 * (i + lr()) / 34;
            const tp = top(u);
            const R = 30 + (0.66 - tp) * 95 + lr() * 14;
            const x = PAD + w0 * u, y = PAD + h0 * tp + R * 0.75;
            billow(P, lr, x, y, R, 1.1 + lr() * 0.35, 0.8 + lr() * 0.2, 2 + ((lr() * 3) | 0));
            if (tp < 0.42) billow(P, lr, x + (lr() - 0.5) * R, lerp(y, PAD + h0 * 0.72, 0.6), R * 1.1, 1.3, 0.8, 1);
        }
        return { m, P };
    }

    // ---------- 토리이 (torii.svg 680×450 공간, 발 y = 420; tsukuyomi.js와 같은 도형) ----------
    const TORII_RED = new Path2D(
        'M216 110H244L247 410H213Z M436 110H464L467 410H433Z ' +
        'M331 118h18v76h-18Z M168 192h344v20h-344Z ' +
        'M146 86Q340 124 534 86L532 108Q340 146 148 108Z');
    const TORII_BLK = new Path2D(
        'M210 392h40v28h-40Z M430 392h40v28h-40Z ' +
        'M126 64Q340 108 554 64L548 85Q340 126 132 85Z');
    const TORII_ALL = new Path2D(); TORII_ALL.addPath(TORII_RED); TORII_ALL.addPath(TORII_BLK);
    const TB = { x: 124, y: 62, w: 432, h: 360, cx: 340, base: 420 };

    // ---------- 공통 레이아웃 ----------
    let W = 0, H = 0, dpr = 1, U = 1;
    const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fogBlob = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        return c;
    })();

    // 능선: 높이(토리이 바닥 위, 토리이 너비 단위)를 토리이 기준 가로 좌표 x' = (x - tx) / tw로 정의한다.
    // 화면 비율이 바뀌어도 토리이 주변 지형이 같게 남는다. 토리이 발밑은 평평하게 두고 바깥쪽만 바위 요철을 준다
    function makeRidge(pts, L, calmX) {
        const ridgeH = xp => {
            let i = 1;
            while (i < pts.length - 1 && pts[i][0] < xp) i++;
            const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
            const t = clamp((xp - x0) / (x1 - x0), 0, 1);
            return lerp(y0, y1, t * t * (3 - 2 * t));
        };
        return x => {
            const xp = (x - L.tx) / L.tw;
            const calm = ss(0.25, 0.7, Math.abs(xp - calmX));
            const bump = (fbm1(x / (L.tw * 0.16), 11) - 0.5) * 0.09 + (fbm1(x / (L.tw * 0.04), 23) - 0.5) * 0.035 + (fbm1(x / (L.tw * 0.009), 37) - 0.5) * 0.008;
            return L.floorY - L.tw * (ridgeH(xp) + bump * lerp(0.25, 1, calm));
        };
    }
    // 바위 음영: 반해상도로 높이장(워리 혹 = 바위 덩어리)을 만들고 명암. 윗변 근처만 하늘빛(rimAt)을 받는다
    // P: { dark, mid, lit, rimAt(x), shX, shY, nearK, litBase, litK, rimK, fallMin }
    function bakeRidge(ridgeY, tw, P) {
        const p = new Path2D();
        p.moveTo(-4, H + 4);
        for (let x = -4; x <= W + 4; x += 2) p.lineTo(x, ridgeY(x));
        p.lineTo(W + 4, H + 4); p.closePath();
        const S = 0.5, w = Math.ceil(W * S);
        let minY = H;
        for (let x = 0; x <= W; x += 8) minY = Math.min(minY, ridgeY(x));
        const top = Math.max(0, Math.floor(minY * S) - 4);
        const h = Math.max(1, Math.ceil(H * S) - top);
        const hf = new Float32Array(w * h);
        const sc = 1 / (tw * 0.24 * S);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const qx = x * sc, qy = (y + top) * sc * 1.6;   // 세로로 눌러 가로 층리가 보이게
            let n = 0.6 * (1 - worley(qx, qy, 71)) + 0.25 * (1 - worley(qx * 2.6, qy * 2.6, 84)), s = 0.85, a = 0.6, f = 1;
            for (let o = 0; o < 3; o++) { n += a * 0.35 * vnoise(qx * f * 4, qy * f * 4, 97 + o); s += a * 0.35; f *= 2.2; a *= 0.5; }
            hf[y * w + x] = n / s;
        }
        const img = new ImageData(w, h), D = img.data;
        for (let x = 0; x < w; x++) {
            const ry = ridgeY(x / S), rim = P.rimAt(x / S);
            for (let y = 0; y < h; y++) {
                const i = y * w + x;
                const e = hf[i];
                const ex = hf[y * w + Math.min(w - 1, x + 1)], ey = hf[Math.max(0, y - 1) * w + x];
                const sh = clamp(0.45 + (e - ex) * P.shX + (e - ey) * P.shY, 0, 1);
                const depth = ((y + top) / S - ry) / (tw * 0.9);         // 윗변에서 내려온 거리
                const near = Math.exp(-Math.max(0, depth) * P.nearK);
                let c = mixC(P.dark, P.mid, ss(0.25, 0.75, e));
                c = mixC(c, P.lit, sh * sh * (P.litBase + (1 - P.litBase) * near) * P.litK);
                c = mixC(c, rim, near * P.rimK * (0.4 + 0.6 * sh));
                const fall = lerp(1, P.fallMin, ss(0, 0.8, depth));      // 화면 앞쪽(아래)은 더 어둡게
                const j = i * 4;
                D[j] = c[0] * fall; D[j + 1] = c[1] * fall; D[j + 2] = c[2] * fall; D[j + 3] = 255;
            }
        }
        const lo = document.createElement('canvas');
        lo.width = w; lo.height = h; lo.getContext('2d').putImageData(img, 0, 0);
        return { path: p, c: lo, y: top / S, h: h / S };
    }
    function drawRidgeImg(R) {
        ctx.save();
        ctx.clip(R.path);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(R.c, 0, R.y, W, R.h);
        ctx.restore();
    }
    // 반복 타일 한 줄: 같은 스프라이트 묶음을 옆으로 흘린다. 타일 정체성(j - base)은 흐름을 따라가므로 갈아끼움이 보이지 않는다
    // sq: 세로 눌림(내려다보는 원근, 기본 1)
    function drawTiles(g, r, ri, s, yTop, v, t, now, gap, jitY, alpha, sq = 1) {
        const spr0 = r.spr[0];
        const pad = spr0.pad * s, spacing = spr0.w0 * s * gap;
        const shift = t * v + r.off;
        const base = Math.floor(shift / spacing), frac = shift - base * spacing;
        const n = r.spr.length;
        g.globalAlpha = alpha;
        for (let j = -2; j * spacing + frac - pad < W; j++) {
            const id = j - base;
            const c = r.spr[((id % n) + n) % n];
            const x = j * spacing + frac;
            if (x + c.w0 * s + pad < 0) continue;
            const dy = (hash(id, ri, r.seed) - 0.5) * jitY;
            cloudLive.touch(c, now);
            g.drawImage(c, x - pad, yTop + dy - pad * sq, c.width * s, c.height * s * sq);
        }
        g.globalAlpha = 1;
    }
    // 구름 줄 생성 작업 목록: 스프라이트 하나 = 한 단계(유휴 시간에 나눠 실행할 수 있게).
    // 줄은 스프라이트가 다 만들어진 뒤에 목록(into)에 들어가므로 그리는 쪽은 미완성 줄을 보지 않는다
    function rowJobs(seed, specs) {
        const rng = mulberry32(seed), jobs = [];
        for (const sp of specs) {
            const seeds = Array.from({ length: 3 }, () => (rng() * 1e6) | 0);
            const r = { k: sp.k, spr: [], off: rng() * 5000, seed: (rng() * 1e6) | 0 };
            for (const s of seeds) jobs.push(() => {
                try { const c = sp.make(mulberry32(s), s); if (c) r.spr.push(c); }
                catch (e) { console.warn('구름 생성 실패', e); }
            });
            jobs.push(() => { if (r.spr.length) sp.into.push(r); });
        }
        return jobs;
    }

    // =====================================================================
    // 장면 1: dusk (구버전, 미통합) — 땅거미 운해 벽 + 산정 토리이
    // =====================================================================
    function sceneDusk() {
        const CFG = {
            ROWS: 6, ROW_Y0: -0.16, ROW_DY: 0.11, ROW_S0: 1.0, ROW_S1: 2.1, SP0: 3, SP1: 11,
            SUN: 52,            // 빛 방향(°, y-up): 오른쪽 위
            TORII_X: 0.515, FLOOR_Y: 0.7,
        };
        const L = { tw: 0, tx: 0, floorY: 0 };
        const rows = [];
        // 땅거미: 윗면은 오른쪽 위 노을빛을 받아 장밋빛, 몸통·아랫면은 푸른 남색 그늘. 앞줄일수록 어둡다
        function makeRowSprite(lr, k, seed) {
            const { m, P } = rowPuffs(lr, seed, lr => 0.35 + lr() * 0.65);
            const kl = Math.pow(k, 0.6);   // 장밋빛은 맨 윗줄에만: 아래 줄로 갈수록 빠르게 그늘로
            const lit = [
                [0, mixC([244, 178, 176], [104, 98, 124], kl)], [0.22, mixC([150, 120, 142], [70, 78, 108], kl)],
                [0.6, mixC([74, 82, 112], [52, 64, 94], kl)], [1, mixC([58, 68, 98], [42, 54, 82], kl)]];
            const shade = [
                [0, mixC([74, 78, 106], [56, 62, 88], k)], [0.4, mixC([52, 60, 88], [42, 52, 78], k)],
                [1, mixC([42, 52, 80], [34, 44, 70], k)]];
            return liveSprite(m, P, {
                lit, shade, glow: null, fade: 0.9, lx: 0.95, ly: 0, gd: [1.1, 0.8],
                rimC: [255, 192, 186], rimK: lerp(0.95, 0.3, kl),
                skyBot: 0.5, vLift: 0.15, upK: 1.15, lobeMin: 0.4, crease: 0.5, lobeW: 0.75,
            }, seed, { cov: 0.37, sc: 6.2, abs: 1.1, ax: 1.15, sun: CFG.SUN });
        }
        const jobs = LIVE_OK ? rowJobs(4127, Array.from({ length: CFG.ROWS }, (_, i) => {
            const k = i / Math.max(1, CFG.ROWS - 1);
            return { k, make: (lr, s) => makeRowSprite(lr, k, s), into: rows };
        })) : [];
        const RIDGE = [[-3, 0.78], [-1.72, 0.56], [-1.45, 0.5], [-1.18, 0.42], [-0.88, 0.32], [-0.62, 0.2], [-0.4, 0.1],
            [-0.24, 0.035], [-0.08, 0], [0.22, -0.008], [0.42, 0.03], [0.68, 0.06], [0.95, 0.085], [1.15, 0.14],
            [1.38, 0.18], [1.62, 0.21], [3, 0.36]];
        const ridgeY = makeRidge(RIDGE, L, 0.07);
        let ridge = null;
        function layout() {
            L.tw = Math.min(Math.max(W * 0.3, Math.min(W * 0.62, H * 0.38)), H * 0.5);
            L.tx = W * CFG.TORII_X;
            L.floorY = H * (W >= H ? CFG.FLOOR_Y : CFG.FLOOR_Y + 0.03);
            ridge = bakeRidge(ridgeY, L.tw, {
                dark: [11, 10, 14], mid: [28, 25, 31], lit: [70, 63, 72], rimAt: () => [84, 96, 132],
                shX: 14, shY: 18, nearK: 4, litBase: 0.12, litK: 0.85, rimK: 0.22, fallMin: 0.3,
            });
        }
        function draw(t, now) {
            const { tw, tx, floorY } = L;
            // 하늘
            let g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, 'rgb(30,36,62)'); g.addColorStop(0.35, 'rgb(40,50,78)'); g.addColorStop(0.7, 'rgb(48,60,90)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            // 운해 줄
            rows.forEach((r, i) => {
                const s = U * lerp(CFG.ROW_S0, CFG.ROW_S1, r.k);
                const yTop = H * (CFG.ROW_Y0 + CFG.ROW_DY * i);
                const v = RM.matches ? 0 : U * lerp(CFG.SP0, CFG.SP1, r.k);
                drawTiles(ctx, r, i, s, yTop, v, t, now, 0.76, H * 0.035, 1);
                // 줄 아래 옅은 대기: 다음(앞) 줄과 거리감을 띄운다
                const hh = r.spr[0].h0 * s, ha = lerp(0.34, 0.18, r.k);
                g = ctx.createLinearGradient(0, yTop + hh * 0.3, 0, yTop + hh * 1.3);
                g.addColorStop(0, 'rgba(52,64,94,0)'); g.addColorStop(0.6, `rgba(52,64,94,${ha})`); g.addColorStop(1, 'rgba(52,64,94,0)');
                ctx.fillStyle = g; ctx.fillRect(0, yTop + hh * 0.3, W, hh);
            });
            // 오른쪽 위 노을빛이 운해 윗면에 번지고, 왼쪽 아래는 푸른 그늘로 가라앉는다
            ctx.globalCompositeOperation = 'screen';
            g = ctx.createRadialGradient(W * 0.86, -H * 0.1, 0, W * 0.86, -H * 0.1, Math.max(W, H) * 0.6);
            g.addColorStop(0, 'rgba(190,120,128,0.4)'); g.addColorStop(0.5, 'rgba(120,80,110,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'multiply';
            g = ctx.createRadialGradient(W * 0.05, H * 0.75, 0, W * 0.05, H * 0.75, Math.max(W, H) * 0.7);
            g.addColorStop(0, 'rgba(120,128,170,1)'); g.addColorStop(1, 'rgba(255,255,255,1)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'source-over';
            // 능선 뒤 안개 띠 + 토리이 기둥 사이로 비치는 밝은 운무 + 흐르는 안개 덩어리
            const y0 = floorY - tw * 0.75, y1 = floorY + tw * 0.05;
            g = ctx.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, 'rgba(44,58,88,0)'); g.addColorStop(0.6, 'rgba(44,58,88,0.5)'); g.addColorStop(1, 'rgba(50,64,96,0.65)');
            ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
            g = ctx.createRadialGradient(tx, floorY - tw * 0.18, 0, tx, floorY - tw * 0.18, tw * 0.9);
            g.addColorStop(0, 'rgba(70,86,120,0.14)'); g.addColorStop(1, 'rgba(70,86,120,0)');
            ctx.fillStyle = g; ctx.fillRect(tx - tw, floorY - tw * 1.1, tw * 2, tw * 1.2);
            const fv = RM.matches ? 0 : 6 * U;
            ctx.globalAlpha = 0.08;
            for (let i = 0; i < 9; i++) {
                const bw = tw * (1.4 + hash(i, 1, 5) * 1.4), bh = bw * 0.22, span = W + bw * 2;
                const x = ((hash(i, 2, 5) * span + t * fv * (0.6 + hash(i, 3, 5))) % span) - bw;
                ctx.drawImage(fogBlob, x, floorY - tw * (0.15 + hash(i, 4, 5) * 0.5) - bh / 2, bw, bh);
            }
            ctx.globalAlpha = 1;
            // 토리이: 해를 등진 땅거미 역광, 채도 낮은 짙은 주홍
            const k = tw / TB.w;
            ctx.save();
            ctx.translate(tx - TB.cx * k, floorY + tw * 0.012 - TB.base * k);
            ctx.scale(k, k);
            g = ctx.createLinearGradient(0, TB.y, 0, TB.base);
            g.addColorStop(0, '#4e2219'); g.addColorStop(0.35, '#421c16'); g.addColorStop(1, '#2a1012');
            ctx.fillStyle = g; ctx.fill(TORII_RED);
            ctx.fillStyle = '#1a0f12'; ctx.fill(TORII_BLK);
            ctx.clip(TORII_ALL);
            ctx.globalAlpha = 0.1; ctx.fillStyle = '#e0a29a';   // 오른쪽 면 노을 반사광
            ctx.fillRect(236, 110, 8, 300); ctx.fillRect(456, 110, 8, 300);
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#1a0c10';   // 기둥 왼쪽 그늘 면
            ctx.fillRect(213, 110, 10, 300); ctx.fillRect(433, 110, 10, 300);
            ctx.fillRect(140, 100, 400, 14);
            ctx.globalAlpha = 0.14; ctx.fillStyle = '#3a4668';    // 땅거미 대기
            ctx.fillRect(TB.x, TB.y, TB.w, TB.h);
            ctx.globalAlpha = 1;
            ctx.restore();
            // 능선 + 윗변 푸른 림
            drawRidgeImg(ridge);
            ctx.save();
            ctx.clip(ridge.path);
            ctx.strokeStyle = 'rgba(120,134,178,0.35)'; ctx.lineWidth = 2;
            ctx.stroke(ridge.path);
            ctx.restore();
            // 비네트
            g = ctx.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
            g.addColorStop(0, 'rgba(8,10,22,0)'); g.addColorStop(1, 'rgba(8,10,22,0.4)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
        return { id: 'dusk', night: true, bg: '#1b2038', jobs, layout, draw };
    }

    // =====================================================================
    // 원근 평면 구름 (WebGL2 전체 화면 셰이더): 노을 장면 전용
    //   - 수평선 위: 머리 위 높은 구름층(천장 평면)을 올려다본다. 권적운 알갱이 + 권운 결.
    //     원근으로 수평선에 가까울수록 작아지고 납작한 줄무늬로 눌린다.
    //   - 수평선 아래: 발밑 운해(바닥 평면)를 내려다본다. 수평선까지 빈틈없이 깔린 융단이고,
    //     가운데·앞쪽 뭉게 봉우리는 그 위에 CloudLive 줄을 얹는다.
    // 평면 좌표 P = (가로, 깊이 Z). 픽셀 하나가 덮는 깊이(Z²/F)보다 잘은 옥타브는 평균값으로 녹여 수평선 근처 지글거림을 막는다.
    // =====================================================================
    const PLANE_VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
    const PLANE_FS = `#version 300 es
precision highp float;
uniform vec2 uRes;            // 버퍼 크기(px)
uniform float uHZ;            // 수평선 y(버퍼 px, 위 = 0)
uniform float uFs, uFc;       // 바닥(운해) / 천장(높은 구름) 초점 거리(버퍼 px)
uniform vec2 uSun;            // 태양(버퍼 px, 위 = 0)
uniform float uSeaX, uSkyX;   // 바람에 밀린 거리(평면 단위)
uniform float uT;
uniform vec3 uHaze;
out vec4 o;
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
const mat2 RT = mat2(1.6, 1.2, -1.2, 1.6);
// oc = 풀 수 있는 옥타브 수(소수 = 마지막 옥타브를 평균 쪽으로 반쯤)
float fbm(vec2 p, float oc){ float n = 0., a = .5;
  for(int i = 0; i < 6; i++){ float w = clamp(oc - float(i), 0., 1.); n += a * (w > 0. ? mix(.5, vn(p), w) : .5); p = RT * p + 17.1; a *= .5; }
  return n / .984375; }
float wor(vec2 p){ vec2 i = floor(p), f = fract(p); float d = 8.;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){ vec2 g = vec2(x, y), r = g + .12 + .76 * vec2(h21(i + g), h21(i + g + 41.7)) - f; d = min(d, dot(r, r)); }
  return sqrt(d); }
float FP;   // 이 픽셀이 덮는 평면 폭(깊이·가로 중 큰 쪽)
float oct(float k){ return log2(.5 / max(k * FP, 1e-5)); }
// 깊이 좌표 압축: Zk까지는 그대로, 그 너머는 화면 y에 비례(1/Z 선형)하게 바꿔 픽셀당 깊이 폭을 Zk²/F로 묶는다.
// 가로도 Zk에서 멈춰(무늬가 소실점으로 부채꼴로 모이지 않게) 수평선 쪽 무늬는 일정한 크기의 납작한 가로 결로 남는다
float zComp(float Z, float Zk){ return Z < Zk ? Z : 2. * Zk - Zk * Zk / Z; }
float zFoot(float Z, float Zk, float F){ return Z < Zk ? Z * Z / F : Zk * Zk / F; }

vec4 sky(vec2 px){
  float dy = (uHZ - px.y) / uFc, Z = 1. / dy;
  FP = zFoot(Z, 3.5, uFc);
  vec2 P = vec2((px.x - uSun.x) / uFc * min(Z, 3.5) - uSkyX, zComp(Z, 3.5));
  vec2 w = vec2(fbm(P * .22 + vec2(3.1, 1.7), oct(.22)), fbm(P * .22 + vec2(8.3, 2.9), oct(.22))) - .5;
  vec2 Q = P + w * 1.6;
  float patchA = fbm(Q * vec2(.32, .55), oct(.55));          // 권적운 무리
  float patchB = fbm(Q * vec2(.18, .4) + 9.7, oct(.4));      // 권운 띠
  // 권적운: 비늘 같은 잔 알갱이. 깊이 방향으로 조금 길쭉한 칸 → 원근에서 가로 물결 줄
  // 덩어리 결(fbm) + 비늘 칸(워리)을 섞어 문턱으로 자르면 크기가 제각각인 알갱이가 뭉쳐 나온다
  float kc = 9., cA = clamp(oct(kc * 1.3), 0., 1.);
  float cell = mix(.5, 1. - wor(Q * vec2(kc, kc * 1.3)), cA);
  float grain = fbm(Q * vec2(2.4, 3.2) + 3.3, oct(3.2)) * .7 + cell * .3;
  float cc = smoothstep(.44, .66, grain) * smoothstep(.5, .74, patchA);
  // 권운: 바람 방향(가로)으로 길게 끌린 결, 끝이 갈고리처럼 휜다
  vec2 S = vec2(Q.x * .5 + Q.y * .35, Q.y * 3.2 + w.x * 2.5);
  float fib = fbm(S, oct(3.2));
  float ci = smoothstep(.5, .74, fib) * smoothstep(.42, .62, patchB);
  float d = clamp(max(cc * 1.15, ci * .85) + .25 * cc * ci, 0., 1.);
  // 빛: 수평선의 태양이 밑면을 비춘다. 태양 쪽·수평선 쪽은 살구빛, 멀어질수록(위) 라벤더 → 푸른 그늘
  vec2 sd = (px - uSun) / uRes.y;
  float sunK = exp(-length(sd * vec2(.55, 1.)) * 2.6);
  float up = clamp((uHZ - px.y) / uHZ, 0., 1.);
  vec3 shade = mix(vec3(.76, .58, .64), mix(vec3(.50, .42, .60), vec3(.31, .27, .48), smoothstep(.45, 1., up)), smoothstep(0., .5, up));
  vec3 lit = mix(vec3(.93, .76, .76), vec3(1., .88, .78), sunK);
  // 역광: 얇은 가장자리는 빛이 비쳐 밝고, 두꺼운 몸통은 그늘색으로 가라앉는다
  // 덩어리 단위(저주파)로만 명암을 준다. 알갱이 하나하나에 테두리·속 명암을 주면 도넛처럼 보인다
  float body = smoothstep(.55, .85, patchA);
  float L = clamp(sunK * 1.2 * mix(1., .3, up) + pow(1. - up, 1.2) * .6 + .07 - body * .25 * up, 0., 1.);   // 높이 뜬 구름은 해가 비추지 못해 하늘보다 어둡다
  vec3 col = mix(shade, lit, L);
  float a = smoothstep(.0, .6, d) * (.7 + .3 * fbm(Q * 7. + 1.9, oct(7.)));
  a *= 1. - smoothstep(9., 30., Z);                           // 수평선 가까이는 대기에 묻힌다
  a *= 1. - .6 * exp(-pow(length(sd * vec2(.7, 1.)) / .2, 2.)); // 태양 바로 곁은 빛에 씻긴다
  return vec4(col * a, a);
}

// far: 0 가까이 → 1 수평선 쪽. 멀리서는 뭉게 혹(능선 결)이 등고선 물결처럼 보이므로 부드러운 결만 남긴다
float seaH(vec2 P, float o1, float o2, float far){
  float b = fbm(P * .75, o1);
  float c = mix(1. - abs(2. * fbm(P * 2.1 + 5.3, o2) - 1.), fbm(P * 2.1 + 5.3, o2), far);   // 뭉게 혹
  return b * .62 + c * .38;
}
vec4 sea(vec2 px){
  float dy = (px.y - uHZ) / uFs, Z = 1. / max(dy, 1e-4);
  FP = zFoot(Z, 4., uFs) * 1.3;
  vec2 P = vec2((px.x - uSun.x) / uFs * min(Z, 4.) - uSeaX, zComp(Z, 4.) * 1.3);
  float o1 = oct(.75 * 1.3), o2 = oct(2.1 * 1.3);
  float far = smoothstep(2.5, 7., Z);
  float h = seaH(P, o1, o2, far);
  float e = max(.05, FP * 1.5);
  float hb = seaH(P + vec2(0., e), o1, o2, far);                  // 태양 쪽(먼 쪽)으로 한 걸음
  float slope = clamp((hb - h) / e * .35, -1., 1.);         // + = 이쪽을 향한 그늘 면, - = 태양을 향한 면
  vec2 sd = (px - uSun) / uRes.y;
  float sunK = exp(-length(sd * vec2(.42, 1.)) * 2.4);
  float near = clamp(dy * uFs / (uRes.y - uHZ), 0., 1.);    // 0 수평선 → 1 화면 아래
  float top = smoothstep(.42, .78, h);
  float L = clamp(top * .85 - slope * .6 * (1. - far * .6) + .1, 0., 1.);
  vec3 trough = mix(vec3(.62, .48, .52), vec3(.30, .27, .38), smoothstep(.1, .9, near));
  vec3 crest = mix(mix(vec3(.90, .71, .67), vec3(.66, .52, .58), smoothstep(.2, 1., near)), vec3(1., .86, .76), sunK);
  vec3 col = mix(trough, crest, L);
  col += vec3(1., .82, .7) * pow(top, 3.) * sunK * .35;       // 태양 쪽 봉우리 가장자리 빛
  float fog = 1. - exp(-Z * .075);
  col = mix(col, mix(uHaze, vec3(1., .92, .84), sunK), fog);
  return vec4(col, 1.);
}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  o = px.y < uHZ ? sky(px) : sea(px);
}`;
    function makePlaneGL() {
        try {
            const c = document.createElement('canvas');
            const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
            if (!gl) return null;
            const sh = (type, src) => {
                const s = gl.createShader(type);
                gl.shaderSource(s, src); gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
                return s;
            };
            const pr = gl.createProgram();
            gl.attachShader(pr, sh(gl.VERTEX_SHADER, PLANE_VS));
            gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, PLANE_FS));
            gl.linkProgram(pr);
            if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
            const U_ = {};
            for (const n of ['uRes', 'uHZ', 'uFs', 'uFc', 'uSun', 'uSeaX', 'uSkyX', 'uT', 'uHaze']) U_[n] = gl.getUniformLocation(pr, n);
            return {
                c,
                // p: 버퍼 크기·수평선·초점·태양은 버퍼 px, 흐름은 평면 단위
                render(p) {
                    if (c.width !== p.w || c.height !== p.h) { c.width = p.w; c.height = p.h; }
                    gl.viewport(0, 0, p.w, p.h);
                    gl.useProgram(pr);
                    gl.uniform2f(U_.uRes, p.w, p.h); gl.uniform1f(U_.uHZ, p.hz);
                    gl.uniform1f(U_.uFs, p.fs); gl.uniform1f(U_.uFc, p.fc);
                    gl.uniform2f(U_.uSun, p.sx, p.sy);
                    gl.uniform1f(U_.uSeaX, p.seaX); gl.uniform1f(U_.uSkyX, p.skyX); gl.uniform1f(U_.uT, p.t);
                    gl.uniform3f(U_.uHaze, p.haze[0] / 255, p.haze[1] / 255, p.haze[2] / 255);
                    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                },
            };
        } catch (e) { console.warn('평면 구름 셰이더 실패', e); return null; }
    }

    // =====================================================================
    // 장면 2: sunset (통합) — 운해 수평선 위 노을 태양 + 원근 운해 + 역광 능선·토리이
    // 모든 빛은 태양 하나에서: 구름 블룸·빛살·림 색이 태양 위치(SUN_X, HZ)를 따른다.
    // 원근은 하나: 바닥 평면(운해 융단·CloudLive 봉우리 줄)과 천장 평면(높은 구름)이 같은 수평선·초점을 쓴다.
    // =====================================================================
    function sceneSunset() {
        const CFG = {
            HZ: 0.42,           // 운해 수평선(화면 높이 비율, 세로 화면은 +0.04)
            SUN_X: 0.56,        // 태양 중심(화면 너비 비율)
            SUN_R: 0.022,       // 태양 원반 반지름(화면 높이 비율)
            ROWS: 11,           // 운해 봉우리 줄 수 (먼 쪽 → 앞)
            Z_FAR: 12, Z_NEAR: 1.15,   // 봉우리 줄 깊이 범위(바닥 평면 단위). 그보다 먼 곳은 융단만
            ROW_POW: 1.25,      // 줄 깊이 배분(1/Z 기준, 클수록 먼 쪽에 촘촘)
            ROW_S: 2.2,         // 깊이 1에서의 스프라이트 배율
            SQ0: 0.5, SQ1: 0.85,   // 먼 줄 / 앞줄 세로 눌림(내려다보는 각도)
            SP1: 12,            // 맨 앞줄 흐름 속도(px/s, 기준 화면). 깊이에 반비례
            SKY_SP: 5,          // 천장 구름 흐름(화면 맨 위 기준 px/s)
            CEIL: 1.0,          // 천장 초점 배율(클수록 높은 구름이 크고 가깝다)
            GL_SCALE: 0.6,      // 평면 셰이더 해상도(CSS px 비율)
            TORII_X: 0.5, FLOOR_Y: 0.83,
            FLARE_BLUR: 0.0045,  // 플레어 번짐 반경(화면 대각선 비율)
        };
        const L = { tw: 0, tx: 0, floorY: 0 };
        let HZ = 0, sx = 0, sy = 0, sr = 0, F = 1;
        const rows = [];
        let plane = null, planeTried = false;
        // 줄 k(0 먼 쪽 → 1 앞)의 바닥 평면 깊이
        const rowZ = k => 1 / lerp(1 / CFG.Z_FAR, 1 / CFG.Z_NEAR, Math.pow(k, CFG.ROW_POW));
        // 태양이 수평선 너머(뒤)에 있어 빛은 위에서 넘어온다: 봉우리 윗면은 살구빛, 화면을 향한 몸통은 라벤더 그늘
        function makeRowSprite(lr, k, seed) {
            const { m, P } = rowPuffs(lr, seed, lr => (0.25 + lr() * 0.55) * lerp(0.5, 1, k));
            const lit = [
                [0, mixC([255, 230, 208], [255, 210, 186], k)], [0.35, mixC([246, 204, 192], [220, 166, 164], k)],
                [0.7, mixC([220, 176, 176], [156, 118, 136], k)], [1, mixC([196, 156, 164], [100, 84, 112], k)]];
            const shade = [
                [0, mixC([212, 168, 172], [136, 104, 128], k)], [0.45, mixC([190, 148, 160], [96, 78, 104], k)],
                [1, mixC([166, 132, 150], [58, 56, 84], k)]];
            return liveSprite(m, P, {
                lit, shade, glow: null, fade: 0.9, lx: 0.5, ly: 0, gd: [1, 1],
                rimC: [255, 228, 204], rimK: lerp(0.75, 0.55, k),
                skyBot: 0.45, vLift: 0.15, upK: 1.2, lobeMin: 0.3, crease: 0.42, lobeW: 0.7,
            }, seed, { cov: 0.37, sc: 6.2, abs: 1.1, ax: 1.15, sun: 90 });
        }
        const jobs = LIVE_OK ? rowJobs(4127, Array.from({ length: CFG.ROWS }, (_, i) => {
            const k = i / Math.max(1, CFG.ROWS - 1);
            return { k, make: (lr, s) => makeRowSprite(lr, k, s), into: rows };
        })) : [];
        const RIDGE = [[-3.5, 0.75], [-2.3, 0.62], [-1.9, 0.52], [-1.5, 0.38], [-1.1, 0.24], [-0.75, 0.12], [-0.45, 0.04],
            [-0.2, 0], [0.25, -0.005], [0.5, 0.03], [0.9, 0.07], [1.4, 0.13], [1.9, 0.22], [2.4, 0.3], [3.5, 0.42]];
        const ridgeY = makeRidge(RIDGE, L, 0.03);
        // 태양 쪽일수록 1: 역광 림 세기
        const sunNear = x => Math.exp(-(((x - sx) / (W * 0.32)) ** 2));
        let ridge = null;
        // 플레어(빛살·수평 줄기·세로 기둥): 태양이 고정이라 리사이즈 때 1/4 해상도로 굽고 흐려서 부드럽게 늘려 그린다.
        // filter 미지원 브라우저는 1/4 해상도 확대 자체가 흐림 역할을 한다
        const flare = document.createElement('canvas'), FL = flare.getContext('2d');
        const FS = 0.25;
        const rays = (() => {
            const lr = mulberry32(907), out = [];
            for (let i = 0; i < 16; i++) out.push({ a: lr() * Math.PI * 2, len: 0.07 + lr() * 0.22, w: 0.0028 + lr() * 0.004, al: 0.12 + lr() * 0.16 });
            return out;
        })();
        function bakeFlare() {
            flare.width = Math.max(1, Math.ceil(W * FS)); flare.height = Math.max(1, Math.ceil(H * FS));
            const g = FL, Ld = Math.hypot(W, H);
            g.setTransform(FS, 0, 0, FS, 0, 0);
            g.clearRect(0, 0, W, H);
            const blur = Math.max(1, CFG.FLARE_BLUR * Ld * FS);
            if (FILTER_OK) g.filter = `blur(${blur.toFixed(1)}px)`;
            g.globalCompositeOperation = 'lighter';
            // 빛살: 뿌리가 넓고 끝으로 갈수록 가늘고 옅어지는 쐐기
            for (const r of rays) {
                const len = r.len * Ld, hw = r.w * Ld;
                const ca = Math.cos(r.a), sa = Math.sin(r.a);
                const gr = g.createRadialGradient(sx, sy, 0, sx, sy, len);
                gr.addColorStop(0, `rgba(255,232,200,${r.al})`); gr.addColorStop(0.4, `rgba(255,214,186,${r.al * 0.35})`); gr.addColorStop(1, 'rgba(255,200,170,0)');
                g.fillStyle = gr;
                g.beginPath();
                g.moveTo(sx - sa * hw, sy + ca * hw);
                g.lineTo(sx + ca * len, sy + sa * len);
                g.lineTo(sx + sa * hw, sy - ca * hw);
                g.closePath(); g.fill();
            }
            // 수평 줄기: 태양 양옆으로 얇게 퍼지는 빛
            g.save();
            g.translate(sx, sy); g.scale(1, 0.018);
            let gr = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.4);
            gr.addColorStop(0, 'rgba(255,230,200,0.4)'); gr.addColorStop(1, 'rgba(255,210,180,0)');
            g.fillStyle = gr; g.fillRect(-W * 0.4, -W * 0.4, W * 0.8, W * 0.8);
            g.restore();
            // 세로 기둥: 태양 아래로 떨어지는 빛(영상 첫 숏). 가로도 가운데가 가장 밝게
            g.save();
            g.translate(sx, sy); g.scale(0.03, 1);
            gr = g.createRadialGradient(0, 0, 0, 0, 0, H * 0.32);
            gr.addColorStop(0, 'rgba(255,236,210,0.45)'); gr.addColorStop(1, 'rgba(255,220,190,0)');
            g.fillStyle = gr; g.fillRect(-H * 0.32, 0, H * 0.64, H * 0.32);
            g.restore();
            g.filter = 'none';
            g.globalCompositeOperation = 'source-over';
        }
        function layout() {
            const land = W >= H;
            L.tw = Math.min(Math.max(W * 0.22, Math.min(W * 0.55, H * 0.3)), H * 0.4);
            L.tx = W * CFG.TORII_X;
            L.floorY = H * (land ? CFG.FLOOR_Y : CFG.FLOOR_Y - 0.03);
            HZ = H * (land ? CFG.HZ : CFG.HZ + 0.04);
            // 바닥 초점: 맨 앞줄 데크가 능선 발치 조금 아래에 오도록
            F = (L.floorY + H * 0.04 - HZ) * CFG.Z_NEAR;
            sr = H * CFG.SUN_R;
            sx = W * CFG.SUN_X; sy = HZ - sr * 0.35;
            if (!planeTried) { planeTried = true; plane = makePlaneGL(); }
            ridge = bakeRidge(ridgeY, L.tw, {
                dark: [10, 8, 12], mid: [24, 19, 25], lit: [58, 46, 54],
                rimAt: x => mixC([78, 78, 116], [168, 110, 98], sunNear(x)),
                shX: 10, shY: 18, nearK: 5, litBase: 0.1, litK: 0.8, rimK: 0.28, fallMin: 0.32,
            });
            bakeFlare();
        }
        const HAZE = [246, 206, 188];   // 수평선 대기색: 하늘 아랫단·먼 운해 안개가 같은 색으로 이어진다
        function drawSky() {
            // 영상 첫 프레임: 위는 맑은 하늘색, 가운데 라벤더, 수평선 쪽은 분홍 살구
            const g = ctx.createLinearGradient(0, 0, 0, HZ);
            g.addColorStop(0, 'rgb(86,126,188)'); g.addColorStop(0.3, 'rgb(138,146,204)');
            g.addColorStop(0.62, 'rgb(206,176,198)'); g.addColorStop(0.85, 'rgb(238,200,194)'); g.addColorStop(1, rgba(HAZE));
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, HZ + 1);
            const g2 = ctx.createLinearGradient(0, HZ, 0, H);
            g2.addColorStop(0, rgba(HAZE)); g2.addColorStop(0.12, 'rgb(214,164,160)'); g2.addColorStop(0.5, 'rgb(150,112,126)'); g2.addColorStop(1, 'rgb(64,60,90)');
            ctx.fillStyle = g2; ctx.fillRect(0, HZ, W, H - HZ);
        }
        // 구름 뒤 태양: 원반 + 좁은 후광 + 수평선 띠 (넓은 블룸은 구름 위에서 따로)
        function drawSunBack() {
            ctx.globalCompositeOperation = 'lighter';
            let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.5);
            g.addColorStop(0, 'rgba(255,214,170,0.45)'); g.addColorStop(0.25, 'rgba(250,170,150,0.14)'); g.addColorStop(1, 'rgba(240,150,160,0)');
            ctx.fillStyle = g; ctx.fillRect(sx - H * 0.5, sy - H * 0.5, H, H);
            ctx.save();
            ctx.translate(sx, HZ); ctx.scale(1, 0.09);
            g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.6);
            g.addColorStop(0, 'rgba(255,204,150,0.3)'); g.addColorStop(0.6, 'rgba(255,196,150,0.12)'); g.addColorStop(1, 'rgba(255,190,150,0)');
            ctx.fillStyle = g; ctx.fillRect(-W * 0.6, -W * 0.6, W * 1.2, W * 1.2);
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
        }
        // 원반: 가장자리를 넓게 풀어 번지듯 (딱 떨어지는 원 경계 없이). 융단 위에 그려 수평선에 반쯤 걸친다
        function drawSunDisc() {
            ctx.save();
            ctx.beginPath(); ctx.rect(0, 0, W, HZ + sr * 0.25); ctx.clip();
            const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 1.8);
            g.addColorStop(0, 'rgba(255,253,244,1)'); g.addColorStop(0.35, 'rgba(255,246,222,0.95)');
            g.addColorStop(0.6, 'rgba(255,232,196,0.45)'); g.addColorStop(1, 'rgba(255,220,190,0)');
            ctx.fillStyle = g; ctx.fillRect(sx - sr * 2, sy - sr * 2, sr * 4, sr * 4);
            ctx.restore();
        }
        // 평면 구름(높은 구름층 + 운해 융단). 셰이더가 없으면 하늘 그라데이션만 남는다
        function drawPlanes(t) {
            if (!plane) return;
            const ps = CFG.GL_SCALE * Math.min(1.5, dpr);
            const tt = RM.matches ? 0 : t;
            plane.render({
                w: Math.max(1, Math.round(W * ps)), h: Math.max(1, Math.round(H * ps)),
                hz: HZ * ps, fs: F * ps, fc: F * CFG.CEIL * ps, sx: sx * ps, sy: sy * ps,
                // 맨 앞줄(Z_NEAR)이 SP1로 흐르게: 화면 속도 = 평면 속도 × F / Z
                seaX: tt * U * CFG.SP1 * CFG.Z_NEAR / F,
                // 천장 맨 위(Z = Fc / HZ)가 SKY_SP로 흐르게: 평면 속도 = SKY_SP / HZ
                skyX: tt * U * CFG.SKY_SP / HZ,
                t: tt, haze: HAZE,
            });
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(plane.c, 0, 0, W, H);
        }
        // 운해 봉우리 줄: 융단과 같은 바닥 평면 위. 깊이 Z의 줄은 데크가 HZ + F/Z, 크기·속도가 1/Z
        function drawSea(t, now) {
            rows.forEach((r, i) => {
                const k = r.k, Z = rowZ(k);
                const s = U * CFG.ROW_S / Z, sq = lerp(CFG.SQ0, CFG.SQ1, k);
                const hh = r.spr[0].h0 * s * sq;
                const deckY = HZ + F / Z;
                const yTop = deckY - hh * 0.7;
                const v = RM.matches ? 0 : U * CFG.SP1 * CFG.Z_NEAR / Z;
                // 맨 먼 줄들은 융단에서 서서히 솟아나게(줄이 시작되는 경계가 보이지 않게)
                drawTiles(ctx, r, i, s, yTop, v, t, now, 0.72, hh * 0.15, ss(0, 0.3, k) * 0.75 + 0.25, sq);
                // 먼 줄은 융단과 같은 대기(1 - e^(-0.075·Z))에 묻히고, 가까운 줄 사이 골은 그늘
                const fog = 1 - Math.exp(-Z * 0.075);
                const hc = mixC(HAZE, [104, 80, 108], ss(0.25, 0.8, k));
                const a1 = Math.max(fog * 0.7, lerp(0.26, 0.18, k));
                const top0 = yTop + hh * 0.05;
                const g = ctx.createLinearGradient(0, top0, 0, yTop + hh * 1.25);
                g.addColorStop(0, rgba(hc, 0)); g.addColorStop(0.45, rgba(hc, a1 * 0.7)); g.addColorStop(0.75, rgba(hc, a1));
                g.addColorStop(1, rgba(hc, 0));
                ctx.fillStyle = g; ctx.fillRect(0, top0, W, hh * 1.35);
            });
        }
        // 구름 위 빛: 태양 블룸(구름 윗면을 씻어 낸다) + 구운 플레어 + 앞쪽 그늘
        function drawSunFront() {
            ctx.globalCompositeOperation = 'screen';
            let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.5);
            g.addColorStop(0, 'rgba(255,230,196,0.8)'); g.addColorStop(0.05, 'rgba(255,210,170,0.45)');
            g.addColorStop(0.2, 'rgba(240,170,160,0.16)'); g.addColorStop(0.5, 'rgba(160,110,140,0.04)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(flare, 0, 0, flare.width / FS, flare.height / FS);
            // 화면 앞쪽(아래) 구름은 해를 등져 푸른 그늘로 가라앉는다
            ctx.globalCompositeOperation = 'multiply';
            g = ctx.createLinearGradient(0, HZ, 0, H);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(232,212,218,1)'); g.addColorStop(1, 'rgba(164,146,178,1)');
            ctx.fillStyle = g; ctx.fillRect(0, HZ, W, H - HZ);
            ctx.globalCompositeOperation = 'source-over';
        }
        function drawFog(t) {
            // 능선 발치에서 피어오르는 운무: 태양 쪽은 따뜻하게
            const { tw, floorY } = L;
            const y0 = floorY - tw * 0.6, y1 = floorY + tw * 0.05;
            const g = ctx.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, 'rgba(150,134,170,0)'); g.addColorStop(0.65, 'rgba(150,134,170,0.32)'); g.addColorStop(1, 'rgba(150,134,170,0.5)');
            ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
            const v = RM.matches ? 0 : 6 * U;
            for (let i = 0; i < 9; i++) {
                const bw = tw * (1.4 + hash(i, 1, 5) * 1.4), bh = bw * 0.22, span = W + bw * 2;
                const x = ((hash(i, 2, 5) * span + t * v * (0.6 + hash(i, 3, 5))) % span) - bw;
                ctx.globalAlpha = 0.1 + 0.14 * sunNear(x + bw / 2);
                ctx.drawImage(fogBlob, x, floorY - tw * (0.1 + hash(i, 4, 5) * 0.4) - bh / 2, bw, bh);
            }
            ctx.globalAlpha = 1;
        }
        function drawTorii() {
            const { tw, tx, floorY } = L, k = tw / TB.w;
            const ox = tx - TB.cx * k, oy = floorY + tw * 0.012 - TB.base * k;
            ctx.save();
            ctx.translate(ox, oy);
            ctx.scale(k, k);
            // 역광 실루엣: 주홍이 겨우 남은 짙은 적갈색
            const g = ctx.createLinearGradient(0, TB.y, 0, TB.base);
            g.addColorStop(0, '#5e2a24'); g.addColorStop(0.4, '#4a1f1c'); g.addColorStop(1, '#2c1416');
            ctx.fillStyle = g; ctx.fill(TORII_RED);
            ctx.fillStyle = '#1c0f12'; ctx.fill(TORII_BLK);
            // 림: 윤곽 안쪽을 태양 쪽일수록 밝게(태양 좌표를 SVG 공간으로)
            ctx.clip(TORII_ALL);
            const lx = (sx - ox) / k, ly = (sy - oy) / k;
            const rg = ctx.createRadialGradient(lx, ly, 0, lx, ly, TB.w * 0.75);
            rg.addColorStop(0, 'rgba(255,214,170,0.9)'); rg.addColorStop(0.3, 'rgba(255,170,140,0.35)'); rg.addColorStop(1, 'rgba(220,130,130,0)');
            ctx.strokeStyle = rg; ctx.lineWidth = 3 / k;
            ctx.stroke(TORII_ALL);
            // 지붕 윗면은 하늘을 향해 조금 더 밝다
            ctx.globalAlpha = 0.35; ctx.fillStyle = rg;
            ctx.fillRect(TB.x, 62, TB.w, 14);
            ctx.globalAlpha = 1;
            ctx.restore();
        }
        function drawRidge() {
            drawRidgeImg(ridge);
            // 윗변 림: 태양 쪽은 따뜻하게 빛나고 먼 쪽은 푸르게 식는다
            ctx.save();
            ctx.clip(ridge.path);
            const g = ctx.createLinearGradient(0, 0, W, 0);
            for (let i = 0; i <= 8; i++) {
                const x = i / 8, n = sunNear(x * W);
                g.addColorStop(x, rgba(mixC([110, 118, 166], [255, 196, 160], n), 0.3 + 0.45 * n));
            }
            ctx.strokeStyle = g; ctx.lineWidth = 2.5;
            ctx.stroke(ridge.path);
            ctx.restore();
        }
        function draw(t, now) {
            drawSky();
            drawSunBack();
            drawPlanes(t);
            drawSunDisc();
            drawSea(t, now);
            drawSunFront();
            drawFog(t);
            drawTorii();
            drawRidge();
            // 실루엣 윤곽을 태양 빛이 살짝 먹어 들어간다(번짐)
            ctx.globalCompositeOperation = 'screen';
            let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.16);
            g.addColorStop(0, 'rgba(255,236,206,0.5)'); g.addColorStop(1, 'rgba(255,200,170,0)');
            ctx.fillStyle = g; ctx.fillRect(sx - H * 0.16, sy - H * 0.16, H * 0.32, H * 0.32);
            ctx.globalCompositeOperation = 'source-over';
            // 비네트
            g = ctx.createRadialGradient(sx, H * 0.45, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
            g.addColorStop(0, 'rgba(14,12,30,0)'); g.addColorStop(1, 'rgba(14,12,30,0.26)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
        return { id: 'sunset', night: false, bg: '#8a7aa8', jobs, layout, draw };
    }

    // =====================================================================
    // 장면 관리: 레이아웃, 유휴 생성, 크로스페이드 전환, UI
    // =====================================================================
    const SCENES = { dusk: sceneDusk(), sunset: sceneSunset() };
    const KEY = 'tsukuyomi.mount.scene';
    const store = {
        get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
        set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* 저장소 차단 */ } },
    };
    const qs = (() => { try { return new URLSearchParams(location.search).get('scene'); } catch (e) { return null; } })();
    let cur = SCENES[qs] || SCENES[store.get()] || SCENES.sunset;
    const laidOut = new Set();
    function ensureLayout(sc) { if (!laidOut.has(sc)) { sc.layout(); laidOut.add(sc); } }
    // 남은 생성 단계를 즉시 끝낸다(처음 보이는 장면, 또는 유휴 생성이 덜 된 장면으로 전환할 때)
    function finish(sc) { while (sc.jobs.length) sc.jobs.shift()(); }
    // 보이지 않는 장면의 구름은 유휴 시간에 한 장씩
    const idle = window.requestIdleCallback ? cb => window.requestIdleCallback(cb, { timeout: 400 }) : cb => setTimeout(cb, 30);
    let pumping = false;
    function pump() {
        const sc = Object.values(SCENES).find(s => s !== cur && s.jobs.length);
        if (!sc) { pumping = false; return; }
        pumping = true;
        sc.jobs.shift()();
        idle(pump);
    }
    const startPump = () => { if (!pumping) idle(pump); };

    // 크로스페이드: 전환 순간의 화면을 떠 두고 새 장면 위에 덮어 서서히 걷는다
    const snap = document.createElement('canvas'), SN = snap.getContext('2d');
    let fadeT = 0;
    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        U = Math.max(W / 1700, H / 960);
        laidOut.clear();       // 보이지 않는 장면은 전환할 때 다시 배치한다
        ensureLayout(cur);
        fadeT = 0;             // 크기가 바뀌면 스냅샷이 맞지 않으므로 전환을 끝낸다
    }
    let rzT = 0;
    window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(resize, 120); });

    function setScene(id) {
        const sc = SCENES[id];
        if (!sc || sc === cur) return;
        snap.width = cv.width; snap.height = cv.height;
        SN.drawImage(cv, 0, 0);
        fadeT = RM.matches ? 0 : 1;
        cur = sc;
        finish(cur);
        ensureLayout(cur);
        store.set(id);
        syncUI();
        startPump();
    }

    // ---------- UI (tsukuyomi.css의 .panel / .icongroup 재사용) ----------
    const elPanel = document.getElementById('panel');
    const elThumb = document.getElementById('thumb');
    const btns = Array.from(document.querySelectorAll('#icongroup button[data-scene]'));
    const HOVER_OK = (() => { try { return window.matchMedia('(hover: hover)').matches; } catch (e) { return true; } })();
    const TOUCH_UI = (() => { try { return window.matchMedia('(hover: none)').matches; } catch (e) { return false; } })();
    function isExpanded() {
        if (!elPanel) return false;
        if (elPanel.classList.contains('expanded')) return true;
        try {
            if (elPanel.matches(':focus-within')) return true;
            if (HOVER_OK && elPanel.matches(':hover')) return true;
        } catch (e) { /* matches 미지원 */ }
        return false;
    }
    let thumbInit = false;
    function moveThumb(animate = true) {
        if (!elThumb || !btns.length) return;
        const idx = Math.max(0, btns.findIndex(b => b.classList.contains('on')));
        // 버튼은 정원형: width는 펼침/접힘·'on' 전환 중 transition 도중 값이 읽힐 수 있어
        // transition이 없는 height를 기준으로 가로세로를 맞춘다.
        const b = btns[idx], fh = b.offsetHeight || 46, fw = fh;
        elThumb.style.width = fw + 'px'; elThumb.style.height = fh + 'px';
        const x = isExpanded() ? idx * (fw + 4) : 0;   // 4 = .icongroup gap
        if (!thumbInit || !animate) {
            const prev = elThumb.style.transition;
            elThumb.style.transition = 'none';
            elThumb.style.transform = `translateX(${x}px)`;
            void elThumb.offsetWidth;
            elThumb.style.transition = prev;
            thumbInit = true;
        } else elThumb.style.transform = `translateX(${x}px)`;
    }
    function syncUI() {
        for (const b of btns) {
            const on = b.dataset.scene === cur.id;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        if (elPanel) elPanel.classList.toggle('is-night', cur.night);
        document.body.style.background = cur.bg;
        moveThumb();
    }
    let collapseTimer = 0;
    for (const b of btns) b.addEventListener('click', () => {
        // 터치: 접힌 상태에서 현재 아이콘을 누르면 펼치기만 한다
        if (TOUCH_UI && elPanel && !elPanel.classList.contains('expanded') && b.dataset.scene === cur.id) {
            elPanel.classList.add('expanded');
            moveThumb();
            return;
        }
        setScene(b.dataset.scene);
        if (TOUCH_UI && elPanel) {
            clearTimeout(collapseTimer);
            collapseTimer = setTimeout(() => { elPanel.classList.remove('expanded'); moveThumb(); }, 1400);
        }
    });
    if (elPanel) {
        for (const ev of ['mouseenter', 'mouseleave', 'focusin']) elPanel.addEventListener(ev, () => moveThumb());
        elPanel.addEventListener('focusout', () => setTimeout(() => moveThumb(), 0));
        window.addEventListener('resize', () => moveThumb(false));
    }

    // ---------- 시작 ----------
    resize();
    finish(cur);
    // 초기 'on' 지정 시 버튼이 width 0→46으로 늘어나는 transition을 건너뛴다
    for (const el of btns) el.style.transition = 'none';
    syncUI();
    if (btns.length) void btns[0].offsetWidth;
    for (const el of btns) el.style.transition = '';
    requestAnimationFrame(() => moveThumb(false));
    startPump();

    const t0 = performance.now();
    let last = t0;
    function frame(now) {
        const t = (now - t0) / 1000, dt = Math.min(0.1, Math.max(0, now - last) / 1000);
        last = now;
        if (LIVE_OK) cloudLive.tick(t, now, RM.matches ? Object.assign({}, CL, { CL_RATE: 0.15 }) : CL);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cur.draw(t, now);
        if (fadeT > 0) {
            const a = fadeT * fadeT * (3 - 2 * fadeT);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = a;
            ctx.drawImage(snap, 0, 0);
            ctx.globalAlpha = 1;
            fadeT = Math.max(0, fadeT - dt / FADE_S);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    window.__MOUNT__ = { SCENES, setScene, get scene() { return cur.id; }, cloudLive };
})();
