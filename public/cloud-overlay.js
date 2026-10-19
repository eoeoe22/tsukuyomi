/* 공백 장면 구름 오버레이 (window.CloudOverlay).
 * 기존 절차적 구름(tsukuyomi.js day2Clouds)은 그대로 두고, 그 위에 손으로 그린 구름 레이어를 얹는다.
 * 편집 UI는 tsukuyomi.cloudlayers.js, 여기는 장면에 그리는 런타임(배포본에도 들어간다).
 *
 * 레이어 하나 = 편집 맵 세 장(0..1) + 배치·질감 설정
 *   s 형태: 엔벨로프로 바꿔 duskRender(→ cloud-live GPU)에 넘긴다 → 기존 구름과 같은 빌로우 혹·음영·끓음
 *   l 빛 비침 / d 음영: 구름층에 screen / multiply(레이어별로 overlay·soft-light 등)로 얹되 이미 그려진 구름 알파 안에서만 보인다(source-atop).
 *     scope 'below' = 이 레이어 + 그 아래 먼저 그려진 구름 전체(기존 구름 포함), 'self' = 이 레이어 구름만
 * 단(stage): 'back' 기존 뒷층 다음(틈 림라이트를 같이 받는다) / 'front' 기존 앞층 다음 / 'top' 하부 그늘까지 끝난 맨 위
 *
 * 좌표: 수평선 높이(HZ) 단위. v 0 = 화면 위, 1 = 수평선. u = 기준점(왼쪽 끝 / 가운데 / 오른쪽 끝)에서의 가로 거리.
 *   화면 비율이 바뀌어도 형태가 찌그러지지 않고 기준점 쪽에 붙어 남는다(좁은 화면에선 반대쪽이 잘린다).
 *   기준 화면비(CFG.DY_REF_AR)보다 넓은 화면에서는 배치만 host.stretch() 배만큼 가로로 넓힌다(u도 같은 배율).
 *   구름 질감은 늘리지 않는다: 손으로 그린 레이어는 셰이더 격자를 가로로 그만큼 넓혀 굽고, 기본 레이어는 host가 덩어리를
 *   넓게 구우므로(혹 크기 그대로) 맵만 덩어리를 따라 넓어진다. 문서(JSON)는 그대로 둔다.
 * 문서(JSON): 레이어마다 맵 세 장을 PNG 한 장(R 형태, G 빛, B 음영)으로 담는다.
 * 출처 우선순위: 이 브라우저의 작업본(localStorage) → public/clouds/day-overlay.json
 *
 * 기본 레이어(v2, L.base = 기존 덩어리 id | 'band'): 기존 절차적 구름도 덩어리 하나씩 문서에 들어가 같은 순서·단·보이기를 따른다.
 *   그리는 건 host.base.draw(퍼프로 구운 원래 스프라이트). 편집 맵은 덩어리에 붙어(흔들림·좁은 화면 축소를 같이 따라) 움직이고,
 *   형태 맵 s는 0.5 = 그대로, 위 = 더하기, 아래 = 덜기 → 덩어리 엔벨로프를 고쳐 같은 셰이더로 다시 굽는다(host.base.setMod).
 *   수평선 띠 묶음은 형태를 고치지 않고 빛·음영만.
 */
(() => {
    'use strict';

    const FORMAT = 'tsukuyomi-cloud-overlay', VERSION = 2;
    const RES = 200;                 // 맵 텍셀 / HZ
    const MW = 720, MH = 230;        // 맵 크기: 가로 3.6 HZ, 세로 1.15 HZ
    const V0 = -0.12;                // 맵 위쪽 끝(v). 화면 위로 조금 넘쳐 꼭대기 혹이 잘려 보이지 않게
    const U0 = { l: -0.3, c: -1.8, r: -3.3 };   // 기준점별 맵 왼쪽 끝(u)
    const GK = 1.5;                  // 셰이더 격자 / 맵 텍셀. 격자 1칸 ≈ HZ/300 (기존 덩어리와 비슷한 혹 밀도)
    const GR = RES * GK;
    const EMIN = -3;                 // 빈 하늘 엔벨로프(cloud-live의 생략 문턱 -1.96보다 낮게)
    const BASE_BOT = 12;             // 기본 레이어 맵: 덩어리 밑변 아래 여유(텍셀). 맵 가로 가운데 = 덩어리 가운데
    const S0_BASE = 0.5;             // 기본 레이어 형태 맵의 '그대로' 값
    const LS_KEY = 'tsukuyomi.cloudOverlay.day.v1';
    const FILE = 'clouds/day-overlay.json';
    const STAGES = ['back', 'front', 'top'];
    const TONES = ['back', 'front', 'mid', 'dark', 'ledge'];
    // 빛 비침·음영 섞기(캔버스 합성 모드). screen/multiply는 고르게, overlay·soft-light는 혹 명암(질감)을 살린다
    const LIGHT_MODES = ['screen', 'overlay', 'soft-light', 'color-dodge'];
    const SHADE_MODES = ['multiply', 'soft-light', 'color-burn'];

    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const hexRGB = h => {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ''));
        const n = m ? parseInt(m[1], 16) : 0xffffff;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const fitCanvas = (c, w, h) => { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } };
    const uid = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const num = (v, d) => (v === null || v === undefined || v === '' || !Number.isFinite(+v)) ? d : +v;

    function blankMaps(base) {
        const s = new Float32Array(MW * MH);
        if (base) s.fill(S0_BASE);
        return { s, l: new Float32Array(MW * MH), d: new Float32Array(MW * MH) };
    }
    // 설정 기본값. null = 장면 CFG / 톤 프리셋 값을 따른다
    function newLayer(props) {
        const L = Object.assign({
            id: uid(), name: '레이어', visible: true, opacity: 1,
            stage: 'front', anchor: 'c', tone: 'back', scope: 'below',
            cov: null, scale: null, absorb: null, rimK: null, sun: null, sway: 0,
            light: { color: '#eef6ff', k: 0.85, mode: 'screen' }, shade: { color: '#26365e', k: 0.75, mode: 'multiply' },
            seed: (Math.random() * 1e6) | 0,
        }, props || {});
        L.light = Object.assign({ color: '#eef6ff', k: 0.85, mode: 'screen' }, L.light);
        L.shade = Object.assign({ color: '#26365e', k: 0.75, mode: 'multiply' }, L.shade);
        if (!LIGHT_MODES.includes(L.light.mode)) L.light.mode = 'screen';
        if (!SHADE_MODES.includes(L.shade.mode)) L.shade.mode = 'multiply';
        if (!STAGES.includes(L.stage)) L.stage = 'front';
        if (!(L.anchor in U0)) L.anchor = 'c';
        if (!TONES.includes(L.tone)) L.tone = 'back';
        if (L.scope !== 'self') L.scope = 'below';
        if (!L.base) delete L.base;
        L.maps = L.maps || blankMaps(!!L.base);
        L._dirty = { s: true, l: true, d: true };
        return L;
    }
    function newDoc() { return { format: FORMAT, version: VERSION, scene: 'day', layers: [] }; }

    // ---------- 직렬화 ----------
    const SAVE_KEYS = ['id', 'base', 'name', 'visible', 'opacity', 'stage', 'anchor', 'tone', 'scope', 'cov', 'scale', 'absorb', 'rimK', 'sun', 'sway', 'seed'];
    // 편집 흔적이 있는가(기본 레이어는 s ≠ 0.5)
    function edited(L) {
        const s0 = L.base ? S0_BASE : 0, { s, l, d } = L.maps;
        for (let i = 0; i < s.length; i++) if (Math.abs(s[i] - s0) > 0.004 || l[i] > 0.004 || d[i] > 0.004) return true;
        return false;
    }
    function mapsToPNG(maps) {
        const c = document.createElement('canvas');
        c.width = MW; c.height = MH;
        const g = c.getContext('2d');
        const img = g.createImageData(MW, MH), D = img.data;
        for (let i = 0, j = 0; i < MW * MH; i++, j += 4) {
            D[j] = Math.round(clamp(maps.s[i], 0, 1) * 255);
            D[j + 1] = Math.round(clamp(maps.l[i], 0, 1) * 255);
            D[j + 2] = Math.round(clamp(maps.d[i], 0, 1) * 255);
            D[j + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
    }
    function pngToMaps(url) {
        return new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => {
                const c = document.createElement('canvas');
                c.width = MW; c.height = MH;
                const g = c.getContext('2d', { willReadFrequently: true });
                g.drawImage(im, 0, 0, MW, MH);
                const D = g.getImageData(0, 0, MW, MH).data, M = blankMaps();
                for (let i = 0, j = 0; i < MW * MH; i++, j += 4) {
                    M.s[i] = D[j] / 255; M.l[i] = D[j + 1] / 255; M.d[i] = D[j + 2] / 255;
                }
                resolve(M);
            };
            im.onerror = () => reject(new Error('맵 이미지를 읽지 못함'));
            im.src = url;
        });
    }
    function serialize(doc) {
        return {
            format: FORMAT, version: VERSION, scene: 'day',
            grid: { res: RES, w: MW, h: MH, v0: V0, u0: U0 },
            layers: doc.layers.map(L => {
                const o = {};
                for (const k of SAVE_KEYS) if (k in L) o[k] = L[k];
                o.light = { color: L.light.color, k: L.light.k, mode: L.light.mode };
                o.shade = { color: L.shade.color, k: L.shade.k, mode: L.shade.mode };
                // 손대지 않은 기본 레이어는 맵 없이(순서·보이기만)
                o.maps = L.base && !edited(L) ? null : mapsToPNG(L.maps);
                return o;
            }),
        };
    }
    async function parse(json) {
        const j = typeof json === 'string' ? JSON.parse(json) : json;
        if (!j || j.format !== FORMAT) throw new Error('구름 오버레이 문서가 아님 (format ≠ ' + FORMAT + ')');
        if ((j.version | 0) > VERSION) throw new Error('더 새 버전 문서 (v' + j.version + ')');
        const doc = newDoc();
        for (const src of Array.isArray(j.layers) ? j.layers : []) {
            const p = {};
            for (const k of SAVE_KEYS) if (k in src) p[k] = src[k];
            p.light = src.light; p.shade = src.shade;
            p.visible = src.visible !== false;
            p.opacity = clamp(num(src.opacity, 1), 0, 1);
            p.maps = src.maps ? await pngToMaps(src.maps) : blankMaps(!!src.base);
            doc.layers.push(newLayer(p));
        }
        return doc;
    }

    // 맵에서 |값 - c|가 th를 넘는 텍셀의 경계 상자 [x0, y0, x1, y1) | null
    function bbox(a, th, c) {
        c = c || 0;
        let x0 = MW, y0 = MH, x1 = -1, y1 = -1;
        for (let y = 0; y < MH; y++) {
            const o = y * MW;
            for (let x = 0; x < MW; x++) {
                if (Math.abs(a[o + x] - c) > th) {
                    if (x < x0) x0 = x;
                    if (x > x1) x1 = x;
                    if (y < y0) y0 = y;
                    y1 = y;
                }
            }
        }
        return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
    }

    // 정수 격자 해시 값 노이즈(0..1): 칠한 형태 속에 큰 덩어리 요철을 넣는다
    function vnoise(x, y, s) {
        const h = (i, j) => {
            let v = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(s, 0x9e3779b1);
            v = Math.imul(v ^ (v >>> 15), 0x85ebca6b);
            v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35);
            return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
        };
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
        return a + (b - a) * ux + (c - a + (d - c - b + a) * ux) * uy;
    }
    // 칠한 형태 → 엔벨로프(맵 해상도). 붓 자국을 그대로 쓰면 경계가 퍼프 원뿔보다 훨씬 가팔라
    // 혹 노이즈가 윤곽을 못 흔들고(매끈한 알약), 속이 포화돼 거대 형태 그림자가 혹 음영을 덮는다.
    // ① 3회 박스 블러로 경계를 0.1 HZ 남짓 완만하게 ② 0.5 = 경계, 속은 1.1 안팎에서 멈추게
    // ③ 저주파 노이즈로 속을 울퉁불퉁하게 → 덩어리마다 두께가 달라 큰 명암이 갈린다
    // 3회 박스 블러(≈ 가우스) — bb 둘레만. 반환 { a, x0, y0, w, h }
    function blurRegion(S, bb, R) {
        const PADT = 3 * R + 2;
        const x0 = Math.max(0, bb.x0 - PADT), x1 = Math.min(MW, bb.x1 + PADT);
        const y0 = Math.max(0, bb.y0 - PADT), y1 = Math.min(MH, bb.y1 + PADT);
        const w = x1 - x0, h = y1 - y0;
        const a = new Float32Array(w * h), b = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = S[(y + y0) * MW + x + x0];
        const inv = 1 / (2 * R + 1);
        for (let k = 0; k < 3; k++) {
            for (let y = 0; y < h; y++) {
                const o = y * w;
                let acc = 0;
                for (let i = -R; i <= R; i++) acc += a[o + clamp(i, 0, w - 1)];
                for (let x = 0; x < w; x++) { b[o + x] = acc * inv; acc += a[o + clamp(x + R + 1, 0, w - 1)] - a[o + clamp(x - R, 0, w - 1)]; }
            }
            for (let x = 0; x < w; x++) {
                let acc = 0;
                for (let i = -R; i <= R; i++) acc += b[clamp(i, 0, h - 1) * w + x];
                for (let y = 0; y < h; y++) { a[y * w + x] = acc * inv; acc += b[clamp(y + R + 1, 0, h - 1) * w + x] - b[clamp(y - R, 0, h - 1) * w + x]; }
            }
        }
        return { a, x0, y0, w, h };
    }
    function shapeField(S, bb, seed) {
        const { a, x0, y0, w, h } = blurRegion(S, bb, 7);
        const out = new Float32Array(MW * MH).fill(EMIN);
        const F = 1 / 26;   // 덩어리 요철 크기 ≈ 0.13 HZ
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const s = a[y * w + x];
            if (s <= 0.004) continue;
            const gx = x + x0, gy = y + y0;
            const lump = (vnoise(gx * F, gy * F, seed) * 0.65 + vnoise(gx * F * 2.3, gy * F * 2.3, seed + 7) * 0.35 - 0.5) * 0.9;
            out[gy * MW + gx] = Math.max(EMIN, (s - 0.5) * 2.3 + lump * clamp((s - 0.35) * 3, 0, 1));
        }
        return out;
    }

    // 기본 레이어 형태 맵(0.5 = 그대로) → 덩어리 엔벨로프 고치기 함수 | null(고친 데 없음).
    // 더한 곳은 shapeField(손으로 그린 레이어와 같은 식)와 max로 합치고, 덜어 낸 곳은 빈 하늘 값으로 끌어내린다.
    // G: host.base.geom — 스프라이트 px ↔ 맵 텍셀: 텍셀 = px × q + o (q = RES × hh / h0, 화면 크기와 무관)
    // 넓은 화면에서 덩어리를 여백까지 sx배 넓게 구우면(host) 가로는 스프라이트 가운데를 기준으로 1/sx배. sx는 격자 너비에서 구한다
    function baseMod(L, G) {
        const s = L.maps.s;
        if (!bbox(s, 0.02, S0_BASE)) return null;
        const P = new Float32Array(MW * MH), Q = new Float32Array(MW * MH);
        for (let i = 0; i < s.length; i++) {
            const d = (s[i] - S0_BASE) * 2;
            if (d > 0) P[i] = d; else Q[i] = -d;
        }
        const bbP = bbox(P, 0.02), bbQ = bbox(Q, 0.02);
        const add = bbP ? shapeField(P, bbP, L.seed | 0) : null;
        // 덜기도 더하기처럼 완만하게: 엔벨로프를 한 번에 빈 하늘로 꺾으면 혹 노이즈가 경계를 못 흔들어 둥근 구멍 윤곽이 드러난다
        const er = bbQ ? blurRegion(Q, bbQ, 7) : null, seed = (L.seed | 0) + 17;
        const q = RES * G.hh / G.h0;
        const ox = MW / 2 - (G.pad + G.w0 / 2) * q, oy = (MH - BASE_BOT) - (G.pad + G.h0) * q;
        // 고칠 범위(텍셀)
        let tx0 = MW, ty0 = MH, tx1 = 0, ty1 = 0;
        if (bbP) { tx0 = bbP.x0 - 24; ty0 = bbP.y0 - 24; tx1 = bbP.x1 + 24; ty1 = bbP.y1 + 24; }
        if (er) { tx0 = Math.min(tx0, er.x0); ty0 = Math.min(ty0, er.y0); tx1 = Math.max(tx1, er.x0 + er.w); ty1 = Math.max(ty1, er.y0 + er.h); }
        const bil = (A, w, h, x, y, out) => {
            if (x < 0 || y < 0 || x > w - 1.001 || y > h - 1.001) return out;
            const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
            const a = A[i] + (A[i + 1] - A[i]) * fx, b = A[i + w] + (A[i + w + 1] - A[i + w]) * fx;
            return a + (b - a) * fy;
        };
        return (E, W, H, RS) => {
            const k = q / RS;   // 텍셀 / 격자 px
            const sx = Math.max(1, W / RS / (G.w0 + 2 * G.pad));
            const kx = k / sx, oxs = MW / 2 - W / (2 * RS) * q / sx;
            const gx0 = Math.max(0, Math.floor((tx0 - oxs) / kx)), gx1 = Math.min(W, Math.ceil((tx1 - oxs) / kx));
            const gy0 = Math.max(0, Math.floor((ty0 - oy) / k)), gy1 = Math.min(H, Math.ceil((ty1 - oy) / k));
            for (let gy = gy0; gy < gy1; gy++) {
                const ty = gy * k + oy;
                for (let gx = gx0; gx < gx1; gx++) {
                    const tx = gx * kx + oxs, i = gy * W + gx;
                    if (add) { const a = bil(add, MW, MH, tx, ty, EMIN); if (a > E[i]) E[i] = a; }
                    if (er) {
                        const e = bil(er.a, er.w, er.h, tx - er.x0, ty - er.y0, 0);
                        if (e > 0.003) {
                            const lump = vnoise(tx / 26, ty / 26, seed) * 0.65 + vnoise(tx / 11, ty / 11, seed + 7) * 0.35 - 0.5;
                            E[i] = Math.min(E[i], Math.max(EMIN, E[i] - e * 4.8 - lump * 1.6 * ss(0.1, 0.6, e)));
                        }
                    }
                }
            }
        };
    }

    // host: { cfg, cloudLive, render(m, E, o) → 캔버스(duskRender), tones, assetUrl(rel), rm(MediaQueryList), stretch() → 가로 배율(≥ 1),
    //         base: { list(), geom(ref), place(ref), draw(ref, ctx), rect(ref), setMod(ref, fn), hasMod(ref) } }
    function create(host) {
        const CFG = host.cfg, B = host.base || null;
        const ov = {
            doc: newDoc(),
            source: 'none',       // 'none' | 'file' | 'local' | 'import'
            hideBase: false,      // 편집기 전용: 기본 레이어(기존 구름) 전부 감추기
            solo: null,           // 편집기 전용: 이 id 레이어만 보기
            editing: false,       // 편집 중에는 흔들림을 끈다(그린 자리 그대로 보이게)
            W: 0, HZ: 0, clock: 0,
        };
        const listeners = new Set();
        const emit = what => { for (const f of listeners) { try { f(what); } catch (e) { console.error(e); } } };

        // 스크래치: 'self' 범위 레이어 합성 버퍼 / 빛·음영 블렌드 버퍼. 썸네일·이미지 내보내기는 따로(장면 버퍼 크기를 흔들지 않게)
        const mkScr = () => {
            const selfC = document.createElement('canvas'), modC = document.createElement('canvas');
            return { selfC, SG: selfC.getContext('2d'), modC, MG: modC.getContext('2d') };
        };
        const mainScr = mkScr(), sideScr = mkScr();

        const gpu = () => !!(host.cloudLive && host.cloudLive.ok && CFG.CL_LIVE >= 0.5);
        const anchorX = L => L.anchor === 'l' ? 0 : L.anchor === 'r' ? ov.W : ov.W * 0.5;
        const swayOff = L => {
            if (ov.editing || !L.sway || (host.rm && host.rm.matches)) return 0;
            return ov.W * (CFG.DY_SWAY ?? 0) * L.sway * Math.sin(ov.clock * 0.04 + (L.seed % 628) / 100);
        };
        const baseGeom = L => (L.base && B && B.geom(L.base)) || null;
        // 넓은 화면 가로 늘림 배율(host가 큰 덩어리에 쓰는 값과 같다)
        const stretchX = () => { const v = host.stretch ? +host.stretch() : 1; return Number.isFinite(v) && v > 1 ? v : 1; };
        // 굽기용 배율(0.1 단위): 격자를 이만큼 가로로 넓혀 구워 그릴 때 늘어나도 혹이 둥글게 남는다
        const stretchQ = () => Math.max(1, Math.round(stretchX() * 10) / 10);
        // 맵 텍셀 (0, 0)의 월드 좌표(css px)와 텍셀당 px(ppt 가로, ppy 세로. 넓은 화면에선 ppt만 늘어난다).
        // 기존 덩어리 레이어는 덩어리에 붙는다: 맵 가로 가운데 = 덩어리 가운데, 맵 밑변 BASE_BOT 위 = 덩어리 밑변
        function frame(L) {
            const G = baseGeom(L), P = G && B.place(L.base);
            if (P) {
                // P.sx: 덩어리 스프라이트를 넓게 구운 배율 → 맵도 덩어리 가운데 기준으로 가로만 그만큼 늘어난다
                const bs = P.sx || 1, ky = P.ky || P.k, ppt = P.k * bs * G.h0 / (RES * G.hh), ppy = ky * G.h0 / (RES * G.hh);
                const cx = P.cx ?? P.dx + (G.pad + G.w0 / 2) * P.k;
                return { x0: cx - MW / 2 * ppt, y0: P.dy + (G.pad + G.h0) * ky - (MH - BASE_BOT) * ppy, ppt, ppy };
            }
            const sx = stretchX(), ppy = ov.HZ / RES;
            return { x0: anchorX(L) + U0[L.anchor] * ov.HZ * sx + swayOff(L), y0: V0 * ov.HZ, ppt: ppy * sx, ppy };
        }
        // 형태 도구를 쓸 수 있는 레이어인가(수평선 띠 묶음은 빛·음영만)
        const canShape = L => !L.base || !!baseGeom(L);

        // ---------- 형태 → 구름 스프라이트 ----------
        function dropSprite(L) {
            if (L._spr && host.cloudLive && host.cloudLive.remove) host.cloudLive.remove(L._spr);
            L._spr = null;
        }
        function buildSprite(L) {
            const bb = bbox(L.maps.s, 0.02);
            L._bbS = bb;
            L._dirty.s = false;
            L._builtAt = performance.now();
            if (!bb) { dropSprite(L); return; }
            // 격자는 맵 전체(고정 원점): 그리는 중에 경계 상자가 커져도 혹 무늬가 미끄러지지 않는다. 값은 shapeField가 만든 엔벨로프
            // 넓은 화면(sq > 1): 가로 격자만 sq배 → 맵 텍셀 하나가 가로 격자 GK × sq칸. 혹 노이즈는 격자 단위라 비율이 유지된다
            const sq = stretchQ(), GKX = GK * sq;
            L._sq = sq;
            const gw = Math.ceil(MW * GKX), gh = Math.ceil(MH * GK), S = shapeField(L.maps.s, bb, L.seed | 0);
            const E = new Float32Array(gw * gh).fill(EMIN);
            const gx0 = Math.max(0, Math.floor((bb.x0 - 24) * GKX)), gx1 = Math.min(gw, Math.ceil((bb.x1 + 24) * GKX));
            const gy0 = Math.max(0, Math.floor((bb.y0 - 24) * GK)), gy1 = Math.min(gh, Math.ceil((bb.y1 + 24) * GK));
            for (let gy = gy0; gy < gy1; gy++) {
                const sy = clamp((gy + 0.5) / GK - 0.5, 0, MH - 1.001), y0 = sy | 0, ty = sy - y0;
                for (let gx = gx0; gx < gx1; gx++) {
                    const sx = clamp((gx + 0.5) / GKX - 0.5, 0, MW - 1.001), x0 = sx | 0, tx = sx - x0, i = y0 * MW + x0;
                    const a = S[i] + (S[i + 1] - S[i]) * tx, b = S[i + MW] + (S[i + MW + 1] - S[i + MW]) * tx;
                    E[gy * gw + gx] = a + (b - a) * ty;
                }
            }
            const T = host.tones[L.tone] || host.tones.back;
            const ub0 = U0[L.anchor];
            // duskRender의 높이 램프(hy)를 화면 높이(v: 0 위 → 1 수평선)에 맞춘다: top = pad, hh = h0
            const pad = -V0 * GR, h0 = GR;
            // 광원 쪽 밝기 분포(gd) 정규화 거리 ≈ 1.2 HZ가 되도록 w0를 잡는다(ldiag = hypot(w0, h0))
            const w0 = GR * Math.sqrt(1.44 - 1);
            // 광원 = 장면의 구름 틈 빛(DY_LX/DY_LY) → 레이어 격자 좌표
            const lu = (ov.W * CFG.DY_LX - anchorX(L)) / ((ov.HZ || 1) * stretchX()), lv = CFG.DY_LY;
            const lgx = (lu - ub0) * GR * sq;
            let sun = L.sun;
            if (sun === null || sun === undefined || !Number.isFinite(+sun)) {
                // 자동: 형태 중심에서 광원을 향하는 방향(y-up 각도)
                const cu = ub0 + (bb.x0 + bb.x1) / 2 / RES, cv = V0 + (bb.y0 + bb.y1) / 2 / RES;
                // 화면에서는 가로가 sq배 벌어져 보이므로 방향도 그 비율로
                sun = Math.atan2(-(lv - cv), (lu - cu) * sq) * 180 / Math.PI;
                // 광원보다 위에 있는 구름도 빛은 위쪽 반원에서 오게(아래에서 비추면 혹 명암이 뒤집힌다)
                sun = sun < 0 ? (sun > -90 ? 15 : 165) : clamp(sun, 15, 165);
            }
            const o = {
                rs: 1, uv: 1 / GR, seed: L.seed | 0, t0: ov.clock,
                lit: T.lit, shade: T.shade, rimC: T.rimC, glow: null, fade: 1, ax: 1,
                rimK: num(L.rimK, T.rimK),
                cov: num(L.cov, CFG.DY_COV + (T.covD || 0)),
                scale: num(L.scale, CFG.DY_SCALE),
                absorb: num(L.absorb, CFG.DY_ABSORB + (T.absorbD || 0)),
                skyBot: CFG.DY_SKYBOT, vLift: CFG.DY_VLIFT, upK: T.upK ?? CFG.DY_UPK,
                lobeMin: T.lobeMin, crease: T.crease, gd: T.gd || [1.15, 0.75],
                sun: +sun, lx: (lgx - pad) / w0, ly: lv,
            };
            const m = { width: gw, height: gh, w0, h0, pad };
            const old = L._spr;
            let spr = null;
            try { spr = host.render(m, E, o); }
            catch (e) { console.warn('구름 오버레이 굽기 실패', L.name, e); }
            if (old && old !== spr && host.cloudLive && host.cloudLive.remove) host.cloudLive.remove(old);
            L._spr = spr;
        }
        // 그리는 중에는 GPU면 ms마다, CPU 굽기면 획이 끝날 때만
        function throttled(L, ms) {
            if (!L._live) return false;
            if (!gpu()) return true;
            return performance.now() - (L._builtAt || 0) < ms;
        }
        function ensureSprite(L) {
            if (L._spr && L._sq !== stretchQ()) L._dirty.s = true;   // 화면비 단계가 바뀌면(기준 화면비 조정 포함) 다시 굽는다
            if (!L._dirty.s || throttled(L, 120)) return;
            buildSprite(L);
        }
        // 기본 레이어: 형태 맵을 덩어리 엔벨로프 고치기로 넘겨 그 덩어리만 다시 굽는다(퍼프 엔벨로프는 host가 캐시)
        function ensureBase(L) {
            if (!L._dirty.s) return;
            const G = baseGeom(L);
            if (!G) { L._dirty.s = false; return; }
            if (throttled(L, 200)) return;
            L._dirty.s = false;
            L._builtAt = performance.now();
            try { B.setMod(L.base, baseMod(L, G)); }
            catch (e) { console.warn('기존 구름 형태 고치기 실패', L.base, e); }
        }

        // ---------- 빛 비침 / 음영 마스크 ----------
        function buildMask(L, ch) {
            const key = ch === 'l' ? '_mL' : '_mD', set = ch === 'l' ? L.light : L.shade;
            const a = L.maps[ch];
            L._dirty[ch] = false;
            const bb = bbox(a, 0.004);
            L[ch === 'l' ? '_bbL' : '_bbD'] = bb;
            if (!bb) { L[key] = null; return; }
            const c = L[key] || document.createElement('canvas');
            fitCanvas(c, MW, MH);
            const g = c.getContext('2d');
            const img = g.createImageData(MW, MH), D = img.data;
            const [r, gg, b] = hexRGB(set.color), k = clamp(num(set.k, 0.8), 0, 1);
            for (let i = 0, j = 0; i < MW * MH; i++, j += 4) {
                const v = a[i];
                if (v <= 0.004) continue;
                D[j] = r; D[j + 1] = gg; D[j + 2] = b; D[j + 3] = Math.round(clamp(v, 0, 1) * k * 255);
            }
            g.putImageData(img, 0, 0);
            L[key] = c;
        }
        // T(타깃 캔버스)의 이미 그려진 알파 안에서만 mode로 마스크를 섞는다. T의 현재 변환 = 월드 → 장치 px
        function applyMod(T, Tc, mask, mode, F, bb, scr) {
            const M = T.getTransform(), modC = scr.modC, MG = scr.MG;
            const wx0 = F.x0 + bb.x0 * F.ppt, wy0 = F.y0 + bb.y0 * F.ppy;
            const wx1 = F.x0 + bb.x1 * F.ppt, wy1 = F.y0 + bb.y1 * F.ppy;
            const p0 = M.transformPoint({ x: wx0, y: wy0 }), p1 = M.transformPoint({ x: wx1, y: wy1 });
            const rx = Math.max(0, Math.floor(Math.min(p0.x, p1.x)) - 2), ry = Math.max(0, Math.floor(Math.min(p0.y, p1.y)) - 2);
            const rx1 = Math.min(Tc.width, Math.ceil(Math.max(p0.x, p1.x)) + 2), ry1 = Math.min(Tc.height, Math.ceil(Math.max(p0.y, p1.y)) + 2);
            const rw = rx1 - rx, rh = ry1 - ry;
            if (rw <= 0 || rh <= 0) return;
            fitCanvas(modC, Tc.width, Tc.height);
            MG.setTransform(1, 0, 0, 1, 0, 0);
            MG.globalAlpha = 1;
            MG.globalCompositeOperation = 'copy';
            MG.drawImage(Tc, rx, ry, rw, rh, rx, ry, rw, rh);
            MG.globalCompositeOperation = mode;
            MG.setTransform(M);
            MG.imageSmoothingEnabled = true;
            MG.drawImage(mask, F.x0, F.y0, MW * F.ppt, MH * F.ppy);
            MG.globalCompositeOperation = 'source-over';
            T.save();
            T.setTransform(1, 0, 0, 1, 0, 0);
            T.globalAlpha = 1;
            T.globalCompositeOperation = 'source-atop';
            T.drawImage(modC, rx, ry, rw, rh, rx, ry, rw, rh);
            T.restore();
        }

        // ---------- 그리기 ----------
        let cfgSig = '';
        function checkCfg() {
            // 손으로 그린 레이어가 따르는 장면 값이 바뀌면(디버그 패널 등) 다시 굽는다. 기본 레이어는 host가 다시 굽는다
            const sig = [CFG.DY_COV, CFG.DY_SCALE, CFG.DY_ABSORB, CFG.DY_SKYBOT, CFG.DY_VLIFT, CFG.DY_UPK, CFG.DY_LX, CFG.DY_LY, CFG.CL_LIVE, CFG.CL_UP].join(',');
            if (sig !== cfgSig) { cfgSig = sig; for (const L of ov.doc.layers) if (!L.base) L._dirty.s = true; }
        }
        // 선택 강조: 고른 레이어 구름을 0.5초 동안 노랗게 두 번 깜빡인다. 레이어 자기 픽셀에만 칠하고 그 뒤에 그리는 구름이
        // 덮으므로, 앞 구름에 가려진 부분은 강조도 가려진다
        const FLASH_MS = 500, FLASH_N = 2, FLASH_A = 0.6, FLASH_C = '255,214,40';
        let flash = null;
        function flashLayer(id) { flash = id ? { id, t0: performance.now() } : null; }
        function flashAlpha(L) {
            if (!flash || flash.id !== L.id) return 0;
            const t = (performance.now() - flash.t0) / FLASH_MS;
            if (t >= 1) { flash = null; return 0; }
            return FLASH_A * Math.abs(Math.sin(Math.PI * FLASH_N * t));
        }
        function shown(L) { return L.visible && (!ov.solo || ov.solo === L.id) && !(L.base && ov.hideBase); }

        // env: { CL, cloudLayer, W, HZ, camSetBuf(ctx), clock, scr? }. CL은 camSetBuf 변환·source-over 상태로 들어오고 그대로 돌려준다
        function drawLayer(L, env) {
            const isBase = !!L.base;
            if (isBase) ensureBase(L); else ensureSprite(L);
            if (L._dirty.l) buildMask(L, 'l');
            if (L._dirty.d) buildMask(L, 'd');
            const hasL = L._mL && L._bbL && L.light.k > 0.001, hasD = L._mD && L._bbD && L.shade.k > 0.001;
            const body = isBase ? !!B : !!L._spr;
            if (!body && !hasL && !hasD) return;
            const scr = env.scr || mainScr;
            const F = frame(L);
            const scopeSelf = L.scope === 'self' && (hasL || hasD);
            // 깜빡이는 동안은 몸통을 따로 그려 강조색이 아래 구름에 번지지 않게
            const fa = env.noFlash ? 0 : flashAlpha(L);
            const self = scopeSelf || fa > 0.001;
            let T = env.CL, Tc = env.cloudLayer;
            if (self) {
                const SG = scr.SG;
                fitCanvas(scr.selfC, Tc.width, Tc.height);
                SG.setTransform(1, 0, 0, 1, 0, 0);
                SG.globalCompositeOperation = 'source-over';
                SG.clearRect(0, 0, scr.selfC.width, scr.selfC.height);
                env.camSetBuf(SG);
                T = SG; Tc = scr.selfC;
            }
            if (body) {
                T.globalAlpha = self ? 1 : clamp(L.opacity, 0, 1);
                if (isBase) B.draw(L.base, T);
                else {
                    if (host.cloudLive) host.cloudLive.touch(L._spr, performance.now());
                    T.drawImage(L._spr, F.x0, F.y0, MW * F.ppt, MH * F.ppy);
                }
                T.globalAlpha = 1;
            }
            const mods = (T2, Tc2) => {
                if (hasL) applyMod(T2, Tc2, L._mL, L.light.mode, F, L._bbL, scr);
                if (hasD) applyMod(T2, Tc2, L._mD, L.shade.mode, F, L._bbD, scr);
            };
            if (!self || scopeSelf) mods(T, Tc);
            if (self) {
                if (fa > 0.001) {
                    T.save();
                    T.setTransform(1, 0, 0, 1, 0, 0);
                    T.globalAlpha = 1;
                    T.globalCompositeOperation = 'source-atop';
                    T.fillStyle = `rgba(${FLASH_C},${fa.toFixed(3)})`;
                    T.fillRect(0, 0, Tc.width, Tc.height);
                    T.restore();
                }
                const C = env.CL;
                C.save();
                C.setTransform(1, 0, 0, 1, 0, 0);
                C.globalAlpha = clamp(L.opacity, 0, 1);
                C.drawImage(scr.selfC, 0, 0);
                C.restore();
                // 'below' 범위 빛·음영은 합친 뒤 장면 버퍼에(아래 구름까지)
                if (!scopeSelf) mods(env.CL, env.cloudLayer);
            }
        }
        // skipBase: 기본 레이어(기존 구름)는 빼고
        function draw(stage, env, skipBase) {
            ov.W = env.W; ov.HZ = env.HZ; ov.clock = env.clock || 0;
            if (!ov.doc.layers.length) return;
            checkCfg();
            const g = env.CL;
            g.save();
            g.globalCompositeOperation = 'source-over';
            for (const L of ov.doc.layers) {
                if (L.stage !== stage || !shown(L) || (skipBase && L.base)) continue;
                drawLayer(L, env);
            }
            g.restore();
        }

        // 투명 이미지(W × HZ, 배율 k). opt.skipBase = 손으로 그린 레이어만. 틈 림라이트·하부 그늘은 장면 쪽 효과라 빠진다
        function renderImage(k, opt) {
            k = k || 1;
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(ov.W * k)); c.height = Math.max(1, Math.round(ov.HZ * k));
            const g = c.getContext('2d');
            const W = ov.W, HZ = ov.HZ, clock = ov.clock;
            const env = { CL: g, cloudLayer: c, W, HZ, clock, camSetBuf: x => x.setTransform(k, 0, 0, k, 0, 0), scr: sideScr, noFlash: true };
            env.camSetBuf(g);
            for (const st of STAGES) draw(st, env, opt && opt.skipBase);
            return c;
        }

        // 레이어가 차지하는 화면 영역(css px) | null
        function layerRect(L) {
            if (L.base) {
                const r = B && B.rect(L.base);
                if (!r) return null;
                // 화면 안쪽만(덩어리 스프라이트는 위·옆으로 화면 밖까지 크다)
                const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(ov.W, r.x + r.w), y1 = Math.min(ov.HZ, r.y + r.h);
                return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : r;
            }
            let u = null;
            for (const [ch, th] of [['s', 0.02], ['l', 0.004], ['d', 0.004]]) {
                const b = bbox(L.maps[ch], th);
                if (!b) continue;
                u = u ? { x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) } : b;
            }
            if (!u) return null;
            const F = frame(L), m = 8;
            return { x: F.x0 + (u.x0 - m) * F.ppt, y: F.y0 + (u.y0 - m) * F.ppy, w: (u.x1 - u.x0 + 2 * m) * F.ppt, h: (u.y1 - u.y0 + 2 * m) * F.ppy };
        }
        // 썸네일: 레이어 하나만(보이기·단·불투명도와 무관하게) 캔버스 c에 맞춰 그린다. 비었으면 false
        function thumb(L, c) {
            const g = c.getContext('2d');
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.globalCompositeOperation = 'source-over';
            g.globalAlpha = 1;
            g.clearRect(0, 0, c.width, c.height);
            if (!ov.W || !ov.HZ) return false;
            const r = layerRect(L);
            if (!r || r.w <= 0 || r.h <= 0) return false;
            const sc = Math.min(c.width / r.w, c.height / r.h);
            const tx = (c.width - r.w * sc) / 2 - r.x * sc, ty = (c.height - r.h * sc) / 2 - r.y * sc;
            const env = { CL: g, cloudLayer: c, W: ov.W, HZ: ov.HZ, clock: ov.clock, camSetBuf: x => x.setTransform(sc, 0, 0, sc, tx, ty), scr: sideScr, noFlash: true };
            env.camSetBuf(g);
            const op = L.opacity;
            L.opacity = 1;
            try { drawLayer(L, env); } finally { L.opacity = op; }
            g.setTransform(1, 0, 0, 1, 0, 0);
            return true;
        }

        // ---------- 문서 ----------
        // 기본 레이어 맞추기: 없는 덩어리는 넣고(기본 순서 = host 목록 순서, 앞서 있는 기본 레이어 바로 뒤), 모르는 것·중복은 뺀다
        function mergeBase(doc) {
            const list = B ? B.list() : [];
            const refs = new Set(list.map(d => d.ref)), seen = new Set();
            doc.layers = doc.layers.filter(L => !L.base || (refs.has(L.base) && !seen.has(L.base) && seen.add(L.base)));
            let at = 0;
            for (const d of list) {
                const i = doc.layers.findIndex(L => L.base === d.ref);
                if (i >= 0) { at = i + 1; continue; }
                doc.layers.splice(at++, 0, newLayer({ id: 'base:' + d.ref, base: d.ref, name: d.name, stage: d.stage, scope: 'self' }));
            }
            return doc;
        }
        function setDoc(doc, source) {
            mergeBase(doc);
            for (const L of ov.doc.layers) if (doc.layers.indexOf(L) < 0) dropSprite(L);
            ov.doc = doc;
            ov.source = source || 'none';
            for (const L of doc.layers) L._dirty = { s: true, l: true, d: true };
            emit('doc');
        }
        // 편집기가 맵을 고친 뒤 부른다. live = 획이 이어지는 중(스로틀), 획이 끝나면 live 없이 한 번 더
        function invalidate(L, chs, live) {
            for (const ch of chs || 'sld') L._dirty[ch] = true;
            L._live = !!live;
        }
        function removeLayer(L) { dropSprite(L); }
        function resize() { for (const L of ov.doc.layers) if (!L.base) L._dirty.s = true; }

        function saveLocal() {
            try { localStorage.setItem(LS_KEY, JSON.stringify(serialize(ov.doc))); ov.source = 'local'; return true; }
            catch (e) { console.warn('구름 오버레이 작업본 저장 실패', e); return false; }
        }
        function hasLocal() { try { return !!localStorage.getItem(LS_KEY); } catch (e) { return false; } }
        function clearLocal() { try { localStorage.removeItem(LS_KEY); } catch (e) { /* 저장소 차단 */ } }
        async function loadFile() {
            const url = host.assetUrl ? host.assetUrl(FILE) : FILE;
            const r = await fetch(url, { cache: 'no-cache' });
            if (!r.ok) throw new Error(FILE + ' ' + r.status);
            return parse(await r.json());
        }
        async function load() {
            let raw = null;
            try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* 저장소 차단 */ }
            if (raw) {
                try { setDoc(await parse(raw), 'local'); return; }
                catch (e) { console.warn('구름 오버레이 작업본 읽기 실패 → 파일본', e); }
            }
            try { setDoc(await loadFile(), 'file'); }
            catch (e) { /* 파일 없음 = 기본 레이어만 */ }
        }
        // 다른 탭(편집기)에서 작업본을 저장하면 바로 반영
        window.addEventListener('storage', e => { if (e.key === LS_KEY) load(); });

        mergeBase(ov.doc);
        Object.assign(ov, {
            draw, renderImage, thumb, flashLayer, setDoc, invalidate, removeLayer, resize, load, loadFile,
            saveLocal, hasLocal, clearLocal, frame, newLayer, canShape, edited,
            newBaseDoc: () => mergeBase(newDoc()),
            serialize: () => serialize(ov.doc),
            has: () => ov.doc.layers.length > 0,
            on: f => { listeners.add(f); return () => listeners.delete(f); },
            emit,
        });
        return ov;
    }

    window.CloudOverlay = {
        create, parse, serialize, newLayer, newDoc,
        FORMAT, VERSION, RES, LIGHT_MODES, SHADE_MODES, MW, MH, V0, U0, STAGES, TONES, LS_KEY, FILE, S0_BASE,
    };
})();
