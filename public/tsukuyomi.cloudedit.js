/* 브러시 구름 편집기 (디버그 패널 › 구름 › 브러시 구름 편집).
 * 장면 하늘 위에 직접 그린다. 편집 모드에서는 편집기가 그린 라이브 캔버스가 그 장면의 구름 레이어를 대신하므로
 * (window.__TSUKUYOMI__.cloudEdit.setLive) 수면 반사·밤 틴트까지 실제 장면 그대로 보인다.
 * 셰이더·프리셋·문서 형식은 cloud-doc.js(window.CloudDoc) 공용.
 *   ① 밀도 맵: 엔벨로프(큰 형태). 잔 혹은 빌로우 노이즈, 거대 형태 음영은 이 맵을 광원 쪽으로 적분.
 *   ② 투과율 보정 맵: 자기 그림자(거대 형태 투과율)에 더하는 부호 있는 보정값.
 * 장면(황혼/낮)마다 작업본이 따로 자동 저장되고, "장면에 적용"하면 장면이 그 문서를 구워 기본으로 쓴다.
 * window.TsukuyomiCloudEdit.mount(host, bridge) 로 디버그 패널이 붙인다.
 */
(() => {
    'use strict';
    const CD = window.CloudDoc;
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const fract = x => x - Math.floor(x);
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* 저장소 차단 */ } },
    };
    const el = (tag, props, ...kids) => {
        const e = document.createElement(tag);
        if (props) for (const k in props) {
            if (k === 'class') e.className = props[k];
            else if (k in e) e[k] = props[k];
            else e.setAttribute(k, props[k]);
        }
        for (const c of kids) e.append(c);
        return e;
    };

    const LAY = { den: { name: '밀도', ...CD.RANGE.den }, tr: { name: '투과율', ...CD.RANGE.tr } };
    const DOC_H = 288;   // 새 문서 세로 해상도(텍셀). 두 장면 × 작업본/적용본이 localStorage에 들어가는 크기
    const LIVE_S = 0.75; // 라이브 캔버스 배율(CSS px당). 적용하면 장면이 더 높은 해상도로 다시 굽는다
    const TOOLS = {
        den: [
            { id: 'puff', name: '퍼프', hint: '원뿔 덩어리를 겹쳐 찍어 큰 형태를 쌓는다. 원 테두리 ≈ 구름 경계, 세기 = 덩어리 높이. 반대: 깎기' },
            { id: 'add', name: '쌓기', hint: '밀도를 서서히 더해 경계를 밖으로 민다. 반대: 깎기' },
            { id: 'sub', name: '깎기', hint: '밀도를 서서히 덜어 형태를 파낸다. 반대: 쌓기' },
            { id: 'erase', name: '지우개', hint: '칠한 곳을 빈 하늘(엔벨로프 최소값)로 바로 지운다. 깎기보다 빠르고 깔끔하게. 반대: 쌓기' },
            { id: 'smooth', name: '문지르기', hint: '형태를 부드럽게 뭉갠다. 퍼프 사이 골을 메울 때.' },
        ],
        tr: [
            { id: 'light', name: '밝게', hint: '투과율을 올려 빛이 더 들게 한다("자기 그림자" 보기에서 확인). 반대: 어둡게' },
            { id: 'dark', name: '어둡게', hint: '투과율을 낮춰 자기 그림자를 깊게 한다. 반대: 밝게' },
            { id: 'reset', name: '되돌리기', hint: '보정을 계산값(0)으로 되돌린다.' },
            { id: 'smooth', name: '문지르기', hint: '보정 경계를 부드럽게 푼다.' },
        ],
    };
    const INV = { puff: 'sub', add: 'sub', sub: 'add', erase: 'add', light: 'dark', dark: 'light' };
    const PARAM_UI = [
        ['cov', '덮임 정도', 0.2, 0.8, 0.01], ['sharp', '윗면 경계', 0.01, 0.3, 0.005], ['soft', '아랫면 흐림', 0.05, 0.6, 0.01],
        ['scale', '덩어리 크기', 2, 12, 0.1], ['absorb', '그림자 깊이', 0.2, 4, 0.05], ['sun', '빛 방향(°)', 20, 160, 1],
    ];
    const VIEWS = ['최종 합성', '밀도(형태)', '자기 그림자(투과율)', '빌로우 노이즈 원본', '편집 맵: 밀도(엔벨로프)', '편집 맵: 투과율 보정'];
    // 화면 비율 가이드: 장면을 그 화면 크기로 열면 보이는 문서 범위
    const GUIDES = [{ name: '휴대폰', w: 390, h: 844 }, { name: '16:9', w: 1920, h: 1080 }];

    function mount(host, b) {
        if (!CD) { host.append(el('div', { class: 'tsd-err', textContent: 'cloud-doc.js가 없어 편집기를 열 수 없다.' })); return; }
        const R = CD.createRenderer(document.createElement('canvas'), { alpha: true });
        if (!R.ok) { host.append(el('div', { class: 'tsd-err', textContent: R.error })); return; }
        const live = R.canvas;

        // ---------- 상태 ----------
        let scene = 'dusk', doc = null, editing = false, animate = false, view = 0, overlay = true, guides = true;
        let staleApply = false, quotaWarn = false;
        const dirtyL = { den: true, tr: true };
        let dirty = true;
        const brush = { layer: 'den', tool: { den: 'puff', tr: 'dark' }, size: 0.07, str: 0.6, hard: 0.3 };
        const undoS = [], redoS = [], UNDO_MAX = 30;
        let geo = { W: 1, HZ: 1, k: 1, ox: 0 };   // 문서 → 화면 배치 (CloudDoc.fit)

        // ---------- 레퍼런스 오버레이 (트레이싱용, png 3종) ----------
        // public/reference-images/*.png (repo 루트 reference-images/와 동일본, svg 제외).
        // 조작 모드(manip)가 켜져 있을 때만 이미지를 클릭/드래그/모서리 리사이즈할 수 있고,
        // 그 외에는 pointer-events:none으로 보이기만 한다 (브러시·장면에 영향 없음).
        const REF_IMGS = [
            ['none', '없음'],
            ['twilight-ref1.png', '황혼 정면 (twilight-ref1)'],
            ['twilight-ref2.png', '황혼 측면 (twilight-ref2)'],
            ['day-empty-ref.png', '낮 (day-empty-ref)'],
        ];
        const REF_BASE = 'reference-images/';
        const REF_LS = 'tsukuyomi.cloudEdit.ref.v1';
        const ref = { name: 'none', opacity: 0.5, show: true, manip: false, placed: false, loaded: false, x: 0, y: 0, w: 0, imgW: 0, imgH: 0 };

        // ---------- 하늘 위 입력 패드 + 커서/가이드 ----------
        const pad = el('div', { class: 'tsce-pad', 'aria-label': '구름 브러시 편집 영역' });
        const cur = el('canvas', { class: 'tsce-cur', 'aria-hidden': 'true' });
        pad.append(cur);
        document.body.append(pad);
        const CG = cur.getContext('2d');

        // ----- 레퍼런스 오버레이 DOM + 조작 (장면 전체 덮음, 디버그 패널 z 9999 아래) -----
        const refWrap = el('div', { class: 'tsce-ref', 'aria-label': '레퍼런스 오버레이' });
        const refImg = el('img', { class: 'tsce-ref-img', alt: '', draggable: false });
        refImg.draggable = false;
        refWrap.append(refImg);
        for (const pos of ['nw', 'ne', 'sw', 'se']) refWrap.append(el('div', { class: 'tsce-ref-handle', 'data-handle': pos }));
        refWrap.style.display = 'none';
        document.body.append(refWrap);
        function refH() { return ref.imgW > 0 ? ref.w * ref.imgH / ref.imgW : 0; }
        function refApply() {
            if (ref.name === 'none' || !ref.show || !ref.loaded) { refWrap.style.display = 'none'; return; }
            refWrap.style.display = 'block';
            refWrap.style.transform = `translate(${Math.round(ref.x)}px, ${Math.round(ref.y)}px)`;
            refWrap.style.width = Math.round(ref.w) + 'px';
            refWrap.style.height = Math.round(refH()) + 'px';
            refImg.style.opacity = String(ref.opacity);
            refWrap.classList.toggle('manip', ref.manip);
        }
        function refSave() {
            const W = window.innerWidth || 1, H = window.innerHeight || 1;
            store.set(REF_LS, JSON.stringify({
                name: ref.name, opacity: ref.opacity, show: ref.show,
                xr: ref.x / W, yr: ref.y / H, wr: ref.w / W, placed: ref.placed,
            }));
        }
        function refFit() {
            const W = window.innerWidth, H = window.innerHeight;
            if (!ref.imgW || !ref.imgH) { ref.x = 0; ref.y = 0; ref.w = W; ref.placed = true; refApply(); return; }
            const s = Math.max(W / ref.imgW, H / ref.imgH);   // 화면 전체 덮기(cover) → 수평선 근처 구름 바로 비교
            ref.w = Math.max(1, Math.round(ref.imgW * s));
            ref.x = Math.round((W - ref.w) / 2);
            ref.y = Math.round((H - ref.imgH * s) / 2);
            ref.placed = true;
            refSave(); refApply();
        }
        function refCenter() {
            const W = window.innerWidth, H = window.innerHeight, h = refH();
            if (!ref.w) return;
            ref.x = Math.round((W - ref.w) / 2); ref.y = Math.round((H - h) / 2);
            ref.placed = true; refSave(); refApply();
        }
        function refSetSource(name, geom) {
            ref.name = name; ref.loaded = false; ref.placed = false;
            if (ui.refSel) ui.refSel.value = name;
            if (ui.refStat) ui.refStat.textContent = '';
            if (name === 'none') { refImg.removeAttribute('src'); refApply(); refSave(); return; }
            if (ui.refStat) ui.refStat.textContent = name + ' 불러오는 중…';
            const probe = new Image();
            probe.onload = () => {
                ref.imgW = probe.naturalWidth; ref.imgH = probe.naturalHeight;
                ref.loaded = true;
                refImg.src = REF_BASE + name;
                if (geom && geom.wr > 0) {   // 저장된 배치 복원(화면 비율 기준)
                    const W = window.innerWidth, H = window.innerHeight;
                    ref.w = Math.max(40, geom.wr * W);
                    ref.x = (geom.xr || 0) * W; ref.y = (geom.yr || 0) * H;
                    ref.placed = true; refApply();
                } else refFit();
                if (ui.refStat) ui.refStat.textContent = `${name} · ${ref.imgW}×${ref.imgH} · 화면에 맞춤됨 (드래그·모서리로 조정)`;
                refSave();
            };
            probe.onerror = () => {
                ref.loaded = false; refApply();
                if (ui.refStat) ui.refStat.textContent = name + ' 을 불러오지 못했다. public/reference-images/에 png가 있는지 확인.';
            };
            probe.src = REF_BASE + name;
        }
        function setRefManip(on) {
            ref.manip = on;
            if (ui.refManip) ui.refManip.checked = on;
            refWrap.classList.toggle('manip', on);
            pad.classList.toggle('refmanip', on);
            pad.style.pointerEvents = on ? 'none' : '';   // 조작 모드에서는 브러시 입력 완전 차단
            if (on && (ref.name === 'none' || !ref.loaded) && ui.refStat)
                ui.refStat.textContent = '먼저 레퍼런스 이미지 3종 중 하나를 선택한다 (png만, svg 제외).';
            if (ui.refHint) ui.refHint.textContent = on
                ? '오버레이 조작 중 — 이미지를 드래그해서 이동, 모서리를 잡고 크기 조절. 브러시는 잠시 멈춤.'
                : '반투명 비교용. 위치·크기를 바꾸려면 "오버레이 조작"을 켠다 (켠 동안 브러시 입력 멈춤).';
            drawCursor();
        }
        let refDrag = null;
        refWrap.addEventListener('pointerdown', e => {
            if (!ref.manip || !ref.loaded) return;
            e.preventDefault(); e.stopPropagation();
            try { refWrap.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
            const hd = (e.target && e.target.dataset && e.target.dataset.handle) || null;
            const h = refH();
            if (hd) {
                const corners = { nw: [ref.x, ref.y], ne: [ref.x + ref.w, ref.y], sw: [ref.x, ref.y + h], se: [ref.x + ref.w, ref.y + h] };
                const opp = { nw: 'se', se: 'nw', ne: 'sw', sw: 'ne' }[hd];
                const [ox, oy] = corners[opp];
                const d0 = Math.max(20, Math.hypot(e.clientX - ox, e.clientY - oy));
                refDrag = { id: e.pointerId, type: 'resize', ox, oy, opp, w0: ref.w, d0 };
            } else {
                refDrag = { id: e.pointerId, type: 'move', sx: e.clientX, sy: e.clientY, x0: ref.x, y0: ref.y };
            }
        });
        refWrap.addEventListener('pointermove', e => {
            if (!refDrag || e.pointerId !== refDrag.id) return;
            e.preventDefault();
            if (refDrag.type === 'move') {
                const W = window.innerWidth, H = window.innerHeight, h = refH();
                ref.x = Math.min(W - 40, Math.max(40 - ref.w, refDrag.x0 + e.clientX - refDrag.sx));
                ref.y = Math.min(H - 40, Math.max(40 - h, refDrag.y0 + e.clientY - refDrag.sy));
            } else {
                const d = Math.max(10, Math.hypot(e.clientX - refDrag.ox, e.clientY - refDrag.oy));
                const w = Math.max(40, Math.min(window.innerWidth * 4, refDrag.w0 * d / refDrag.d0));
                const h = w * ref.imgH / ref.imgW, { ox, oy, opp } = refDrag;
                ref.w = w;
                if (opp === 'nw') { ref.x = ox; ref.y = oy; }
                else if (opp === 'se') { ref.x = ox - w; ref.y = oy - h; }
                else if (opp === 'sw') { ref.x = ox; ref.y = oy - h; }
                else { ref.x = ox - w; ref.y = oy; }   // opp ne
            }
            ref.placed = true;
            refApply();
        });
        const refEnd = e => {
            if (!refDrag || (e && e.pointerId !== refDrag.id)) return;
            refDrag = null; refSave();
        };
        refWrap.addEventListener('pointerup', refEnd);
        refWrap.addEventListener('pointercancel', refEnd);
        window.addEventListener('resize', () => {
            if (ref.name === 'none' || !ref.loaded) return;
            try {   // 화면 비율 기준으로 저장된 배치를 새 화면에 투영
                const o = JSON.parse(store.get(REF_LS));
                if (o && o.wr > 0) {
                    const W = window.innerWidth, H = window.innerHeight;
                    ref.w = Math.max(40, o.wr * W); ref.x = (o.xr || 0) * W; ref.y = (o.yr || 0) * H;
                    refApply(); return;
                }
            } catch (err) { /* 저장값이 없으면 맞춤으로 */ }
            refFit();
        });

        function layout() {
            const W = b.W, HZ = b.HZ;
            if (!W || !HZ || !doc) return;
            const f = CD.fit(doc, W, HZ);
            geo = { W, HZ, k: f.k, ox: f.ox };
            live.width = Math.max(1, Math.round(W * LIVE_S)); live.height = Math.max(1, Math.round(HZ * LIVE_S));
            pad.style.width = W + 'px'; pad.style.height = HZ + 'px';
            const dpr = window.devicePixelRatio || 1;
            cur.width = Math.round(W * dpr); cur.height = Math.round(HZ * dpr);
            CG.setTransform(dpr, 0, 0, dpr, 0, 0);
            dirty = true; drawCursor();
        }
        let rzT = 0;
        window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(layout, 200); });   // 장면 resize(120ms) 뒤
        // 화면 px(하늘 기준) ↔ 문서 텍셀(아래 기준)
        const toTex = (px, py) => ({ x: (px - geo.ox) / geo.k * doc.h, y: (doc.horizon + (geo.HZ - py) / geo.k) * doc.h });
        const docToScreen = (x, y) => [geo.ox + x * geo.k, geo.HZ - (y - doc.horizon) * geo.k];

        let hover = null;
        function drawGuides() {
            if (!guides) return;
            CG.save(); CG.font = '11px system-ui,sans-serif'; CG.lineWidth = 1;
            const hzR = b.cfg.HZ_RATIO ?? CD.SCENE_HZ_RATIO;
            for (const g of GUIDES) {
                const HZg = g.h * hzR, f = CD.fit(doc, g.w, HZg);
                const [x0, yT] = docToScreen((0 - f.ox) / f.k, doc.horizon + HZg / f.k);
                const [x1, yB] = docToScreen((g.w - f.ox) / f.k, doc.horizon);
                CG.setLineDash([6, 5]); CG.strokeStyle = 'rgba(20,10,30,.5)'; CG.strokeRect(x0 + 1, yT + 1, x1 - x0, yB - yT);
                CG.strokeStyle = 'rgba(255,245,235,.75)'; CG.strokeRect(x0, yT, x1 - x0, yB - yT);
                CG.setLineDash([]); CG.fillStyle = 'rgba(255,245,235,.9)';
                CG.fillText(g.name, Math.max(0, x0) + 6, Math.max(0, yT) + 14);
            }
            CG.restore();
        }
        function drawCursor() {
            CG.clearRect(0, 0, geo.W, geo.HZ);
            if (!editing || ref.manip || !doc) return;
            drawGuides();
            if (!hover) return;
            const r = brush.size * geo.k;
            CG.lineWidth = 1.5; CG.strokeStyle = 'rgba(20,10,30,.55)'; CG.beginPath(); CG.arc(hover.px, hover.py, r + 1, 0, Math.PI * 2); CG.stroke();
            CG.lineWidth = 1; CG.strokeStyle = 'rgba(255,245,235,.9)'; CG.beginPath(); CG.arc(hover.px, hover.py, r, 0, Math.PI * 2); CG.stroke();
            if (brush.hard > 0.05) {
                CG.setLineDash([3, 4]); CG.strokeStyle = 'rgba(255,245,235,.45)';
                CG.beginPath(); CG.arc(hover.px, hover.py, r * brush.hard, 0, Math.PI * 2); CG.stroke(); CG.setLineDash([]);
            }
        }

        // ---------- 문서 ----------
        function newDocFor(sc) {
            const A = clamp(window.innerWidth / window.innerHeight, 0.5, 3.5);
            const hz = b.cfg.HZ_RATIO ?? CD.SCENE_HZ_RATIO;
            const d = CD.blank(sc, Math.round(DOC_H * A), DOC_H, 1 - hz);
            if (sc === 'dusk') fillDraft(d);
            return d;
        }
        function loadWork(sc) {
            const s = store.get(CD.KEY.work(sc));
            if (s) { try { return CD.parse(JSON.parse(s), sc); } catch (e) { console.warn('작업본 복원 실패', e); } }
            const ap = store.get(CD.KEY.applied(sc));   // 작업본이 없으면 적용본에서 이어 편집
            if (ap) { try { return CD.parse(JSON.parse(ap), sc); } catch (e) { /* 무시 */ } }
            if (sc === 'dusk') {   // 첫 판(v1) 자동 저장본
                const old = store.get(CD.KEY.legacy);
                if (old) { try { return CD.parse(JSON.parse(old), 'dusk'); } catch (e) { /* 무시 */ } }
            }
            return newDocFor(sc);
        }
        function useDoc(d) {
            doc = d; R.alloc(doc.w, doc.h); dirtyL.den = dirtyL.tr = true;
            undoS.length = 0; redoS.length = 0; syncUndo();
            for (const [id] of PARAM_UI) ui.param[id].set(doc.params[id]);
            layout(); showStat(null);
        }
        // 셰이더 초안의 절차적 엔벨로프(수평선 구름띠 + 적란운 탑 + 왼쪽 무리). 초안은 수평선 0.12·하늘 0.88 기준이라
        // 문서 하늘 높이에 맞춰 수평선 기준으로 균일하게 줄여 넣는다.
        function hash12(x, y) {
            let a = fract(x * .1031), c = fract(y * .1031), e = fract(x * .1031);
            const d = a * (c + 33.33) + c * (e + 33.33) + e * (a + 33.33); a += d; c += d; e += d; return fract((a + c) * e);
        }
        function vnoise(x, y) {
            const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
            const a = hash12(ix, iy), c = hash12(ix + 1, iy), e = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
            return (a + (c - a) * ux) + ((e + (d - e) * ux) - (a + (c - a) * ux)) * uy;
        }
        function vfbm(x, y) { let n = 0, a = .5; for (let i = 0; i < 3; i++) { n += a * vnoise(x, y); x *= 2.1; y *= 2.1; a *= .5; } return n / .875; }
        function draftEnv(x, y, A) {
            const sdE = (cx, cy, rx, ry) => 1 - Math.hypot((x - cx) / rx, (y - cy) / ry);
            const h = .12, bankTop = h + .13 + .07 * vfbm(x * 1.6, 3), bank = (bankTop - y) / .10;
            let t = sdE(A * .66, .40, .26, .24);
            t = Math.max(t, sdE(A * .62, .56, .14, .15), sdE(A * .74, .50, .15, .14), sdE(A * .86, .36, .20, .13));
            const l = Math.max(sdE(A * .10, .34, .20, .11), sdE(A * .20, .29, .18, .09));
            return Math.max(bank, t * 1.9, l * 1.6);
        }
        function fillDraft(d) {
            const A = d.w / d.h, s = (1 - d.horizon) / .88, A0 = A / s, L = LAY.den;
            for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
                const ux = ((x + .5) / d.h - A / 2) / s + A0 / 2, uy = .12 + ((y + .5) / d.h - d.horizon) / s;
                d.den[y * d.w + x] = clamp(draftEnv(ux, uy, A0), L.min, L.max);
            }
        }

        // ---------- 실행 취소 ----------
        function pushUndo(k) { undoS.push({ k, d: doc[k].slice() }); if (undoS.length > UNDO_MAX) undoS.shift(); redoS.length = 0; syncUndo(); }
        function swapHist(from, to) {
            const s = from.pop(); if (!s) return;
            to.push({ k: s.k, d: doc[s.k].slice() }); doc[s.k].set(s.d); dirtyL[s.k] = true; syncUndo(); edited();
        }
        function syncUndo() { if (ui.undo) { ui.undo.disabled = !undoS.length; ui.redo.disabled = !redoS.length; } }

        // ---------- 브러시 ----------
        function boxBlur(src, x0, y0, x1, y1, k) {
            const DW = doc.w, w = x1 - x0 + 1, h = y1 - y0 + 1, tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * k + 1;
            for (let y = 0; y < h; y++) {
                const row = (y + y0) * DW; let s = 0;
                for (let i = -k; i <= k; i++) s += src[row + clamp(x0 + i, 0, DW - 1)];
                for (let x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[row + clamp(x0 + x + k + 1, 0, DW - 1)] - src[row + clamp(x0 + x - k, 0, DW - 1)]; }
            }
            for (let x = 0; x < w; x++) {
                let s = 0;
                for (let i = -k; i <= k; i++) s += tmp[clamp(i, 0, h - 1) * w + x];
                for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[clamp(y + k + 1, 0, h - 1) * w + x] - tmp[clamp(y - k, 0, h - 1) * w + x]; }
            }
            return out;
        }
        // 한 번 찍기. fx, fy: 텍셀 좌표(연속, 아래 기준), p: 펜 압력(0..1)
        function stamp(k, tool, fx, fy, p) {
            const L = LAY[k], D = doc[k], DW = doc.w, DH = doc.h;
            const r = Math.max(1, brush.size * DH), s = brush.str * p, hard = brush.hard;
            const ext = tool === 'puff' ? 2.2 : 1;   // 퍼프는 원 밖으로도 기울기를 이어 빈 하늘과 매끄럽게 만난다
            const Rr = r * ext;
            const x0 = Math.max(0, Math.floor(fx - Rr)), x1 = Math.min(DW - 1, Math.ceil(fx + Rr));
            const y0 = Math.max(0, Math.floor(fy - Rr)), y1 = Math.min(DH - 1, Math.ceil(fy + Rr));
            if (x0 > x1 || y0 > y1) return;
            const w = x1 - x0 + 1;
            const blur = tool === 'smooth' ? boxBlur(D, x0, y0, x1, y1, Math.max(2, Math.round(r * .18))) : null;
            const pk = 1.9 * s;   // 퍼프 꼭대기 높이(초안 탑 덩어리 = 1.9)
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const dx = x + .5 - fx, dy = y + .5 - fy, d = Math.sqrt(dx * dx + dy * dy) / r;
                if (d >= ext) continue;
                const i = y * DW + x, f = d >= 1 ? 0 : 1 - ss(hard, 1, d);
                let v = D[i];
                switch (tool) {
                    case 'puff': { const cone = d < 1 ? pk * (1 - d) : -1.9 * (d - 1); if (cone > v) v = cone; break; }
                    case 'add': v += s * .18 * f; break;
                    case 'sub': v -= s * .18 * f; break;
                    case 'erase': v += (L.empty - v) * Math.min(1, s * .5 * f); break;
                    case 'smooth': v += (blur[(y - y0) * w + x - x0] - v) * Math.min(1, s * .6 * f); break;
                    case 'light': v += s * .06 * f; break;
                    case 'dark': v -= s * .06 * f; break;
                    case 'reset': v -= v * Math.min(1, s * .35 * f); break;
                }
                D[i] = clamp(v, L.min, L.max);
            }
            dirtyL[k] = true;
        }

        // ---------- 그리기 입력 ----------
        let stroke = null;
        const local = e => { const r = pad.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
        const pressure = e => e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1;
        pad.addEventListener('contextmenu', e => e.preventDefault());
        pad.addEventListener('pointerdown', e => {
            if (ref.manip) return;   // 오버레이 조작 모드에서는 브러시 입력 차단
            if (e.button !== 0 && e.button !== 2) return;
            e.preventDefault(); pad.setPointerCapture(e.pointerId);
            const k = brush.layer, base = brush.tool[k], inv = e.altKey || e.button === 2;
            const p = local(e), t = toTex(p.px, p.py);
            stroke = { id: e.pointerId, k, tool: inv && INV[base] ? INV[base] : base, last: t };
            pushUndo(k);
            stamp(k, stroke.tool, t.x, t.y, pressure(e));
            hover = p; drawCursor(); showStat(t);
        });
        pad.addEventListener('pointermove', e => {
            if (ref.manip) return;   // 조작 모드에서는 커서·획 모두 멈춤
            const p = local(e), t = toTex(p.px, p.py);
            hover = p; drawCursor(); showStat(t);
            if (!stroke || e.pointerId !== stroke.id) return;
            const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
            const step = Math.max(.75, brush.size * doc.h * .18);
            for (const ev of (evs.length ? evs : [e])) {
                const q0 = local(ev), q = toTex(q0.px, q0.py), a = stroke.last, dist = Math.hypot(q.x - a.x, q.y - a.y);
                if (dist < step) continue;
                const n = Math.floor(dist / step), pr = pressure(ev);
                for (let j = 1; j <= n; j++) { const u = j * step / dist; stamp(stroke.k, stroke.tool, a.x + (q.x - a.x) * u, a.y + (q.y - a.y) * u, pr); }
                stroke.last = { x: a.x + (q.x - a.x) * n * step / dist, y: a.y + (q.y - a.y) * n * step / dist };
            }
        });
        const endStroke = e => { if (!stroke || e.pointerId !== stroke.id) return; stroke = null; edited(); };
        pad.addEventListener('pointerup', endStroke);
        pad.addEventListener('pointercancel', endStroke);
        pad.addEventListener('pointerleave', () => { if (stroke) return; hover = null; drawCursor(); showStat(null); });
        window.addEventListener('keydown', e => {
            if (!editing || ref.manip) {   // 조작 모드에서는 브러시 단축키 멈춤 (Esc로 조작 모드 해제)
                if (ref.manip && e.key === 'Escape' && !(e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]'))) setRefManip(false);
                return;
            }
            if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
            const mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
            if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? swapHist(redoS, undoS) : swapHist(undoS, redoS); return; }
            if (mod && k === 'y') { e.preventDefault(); swapHist(redoS, undoS); return; }
            if (mod || e.altKey) return;
            if (e.key === '[') setSize(brush.size / 1.15);
            else if (e.key === ']') setSize(brush.size * 1.15);
            else if (e.key === '1') setLayer('den');
            else if (e.key === '2') setLayer('tr');
        });

        // ---------- 저장 / 적용 ----------
        let saveT = 0;
        function edited() { staleApply = true; showApply(); clearTimeout(saveT); saveT = setTimeout(saveWork, 500); }
        function saveWork() {
            clearTimeout(saveT); if (!doc) return;
            quotaWarn = !store.set(CD.KEY.work(scene), JSON.stringify(CD.serialize(doc))); showApply();
        }
        window.addEventListener('pagehide', saveWork);
        function apply() {
            if (!store.set(CD.KEY.applied(scene), JSON.stringify(CD.serialize(doc)))) {
                ui.applyStat.textContent = '브라우저 저장 공간이 부족해 적용하지 못했다. 다른 장면의 적용을 해제하거나 JSON으로 저장해 public/clouds/에 넣을 것.';
                return;
            }
            b.cloudEdit.reload(scene); staleApply = false; showApply();
        }
        function unapply() { store.del(CD.KEY.applied(scene)); b.cloudEdit.reload(scene); staleApply = true; showApply(); }
        function showApply() {
            const has = !!store.get(CD.KEY.applied(scene)), nm = CD.PRESETS[scene].name;
            ui.applyStat.textContent = `${nm} 장면: ` + (!has ? '적용 안 됨(편집 모드를 끄면 기본 구름)' : staleApply ? '적용 후 수정됨' : '적용됨') +
                (quotaWarn ? ' · 저장 공간 부족으로 자동 저장 실패, JSON으로 저장해 둘 것' : '');
            ui.applyStat.style.color = !has ? '' : staleApply ? '#fbbf24' : '#4ade80';
            ui.unapply.disabled = !has;
        }
        function saveFile() {
            const blob = new Blob([JSON.stringify(CD.serialize(doc))], { type: 'application/json' });
            const a = el('a', { href: URL.createObjectURL(blob), download: `${scene}.json` });
            document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }
        async function loadFile(f) {
            try {
                const d = CD.parse(JSON.parse(await f.text()), scene);
                if (d.scene !== scene) setScene(d.scene);
                useDoc(d); edited();
            } catch (err) { ui.applyStat.textContent = '불러오기 실패: ' + err.message; ui.applyStat.style.color = '#f87171'; }
        }

        // ---------- 장면 / 모드 ----------
        function setScene(sc) {
            if (doc) saveWork();
            if (editing && scene !== sc) b.cloudEdit.setLive(scene, null);
            scene = sc;
            for (const bt of ui.scene) bt.setAttribute('aria-pressed', String(bt.dataset.v === sc));
            staleApply = false;
            useDoc(loadWork(sc));
            showApply();
            if (editing) { b.state = sc; b.hold = false; b.cloudEdit.setLive(sc, live); }
        }
        function setEditing(on) {
            editing = on;
            ui.edit.checked = on;
            pad.classList.toggle('on', on);
            if (on) {
                if (Number(b.cfg.CLOUD_DOC) < 0.5) b.cfg.CLOUD_DOC = 1;   // 문서 구름이 꺼져 있으면 켠다
                b.state = scene; b.hold = false;   // 편집하는 장면으로 바로 전환
                layout(); b.cloudEdit.setLive(scene, live); dirty = true;
                loop();
            } else {
                saveWork(); b.cloudEdit.setLive(scene, null); hover = null; drawCursor();
            }
        }
        function setLayer(k) {
            brush.layer = k;
            for (const bt of ui.layer) bt.setAttribute('aria-pressed', String(bt.dataset.v === k));
            ui.tools.textContent = '';
            for (const t of TOOLS[k]) {
                const bt = el('button', { type: 'button', textContent: t.name });
                bt.dataset.v = t.id; bt.onclick = () => setTool(t.id);
                ui.tools.append(bt);
            }
            setTool(brush.tool[k]); dirty = true;
        }
        function setTool(id) {
            brush.tool[brush.layer] = id;
            for (const bt of ui.tools.children) bt.setAttribute('aria-pressed', String(bt.dataset.v === id));
            ui.toolHint.textContent = TOOLS[brush.layer].find(t => t.id === id).hint;
        }
        function setSize(v) { ui.brush.size.set(clamp(v, 0.01, 0.3), true); }
        function showStat(t) {
            if (!doc) return;
            if (!t) { ui.stat.textContent = `${CD.PRESETS[scene].name} 문서 ${doc.w}×${doc.h} · 화면비 ${(doc.w / doc.h).toFixed(2)} · 수평선 ${doc.horizon.toFixed(2)}`; return; }
            const x = Math.floor(t.x), y = Math.floor(t.y);
            if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) { ui.stat.textContent = '문서 밖'; return; }
            const i = y * doc.w + x, tv = doc.tr[i];
            ui.stat.textContent = `밀도 ${doc.den[i].toFixed(2)} · 투과율 보정 ${tv >= 0 ? '+' : ''}${tv.toFixed(2)} · (${x}, ${y})`;
        }

        // ---------- 렌더 루프(편집 모드에서만) ----------
        let looping = false, last = 0;
        function loop() {
            if (looping) return;
            looping = true; last = performance.now();
            const tick = now => {
                if (!editing) { looping = false; return; }
                const dt = (now - last) / 1000; last = now;
                if (animate) { doc.time += dt; dirty = true; }
                if (dirtyL.den) { dirtyL.den = false; R.upload('den', doc.den); dirty = true; }
                if (dirtyL.tr) { dirtyL.tr = false; R.upload('tr', doc.tr); dirty = true; }
                if (dirty && geo.W > 1) {
                    dirty = false;
                    const A = doc.w / doc.h, s = live.width / geo.W;
                    // 최종 합성은 장면용 투명 모드(구름만), 분석 보기는 하늘 영역을 덮는 불투명 모드
                    R.render({
                        rect: [geo.ox * s, -doc.horizon * geo.k * s, A * geo.k * s, geo.k * s], doc, preset: CD.PRESETS[scene],
                        mode: view === 0 ? 1 : 0, view, overlay, layer: brush.layer,
                    });
                    b.cloudEdit.touch();
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }

        // ---------- 패널 UI ----------
        const ui = {};
        const btn = (text, fn, title) => { const e = el('button', { type: 'button', textContent: text }); if (title) e.title = title; e.onclick = fn; return e; };
        const seg = (items, fn) => items.map(([v, text]) => { const e = btn(text, () => fn(v)); e.dataset.v = v; e.setAttribute('aria-pressed', 'false'); return e; });
        const check = (text, on, fn) => {
            const c = el('input', { type: 'checkbox', checked: on });
            c.addEventListener('change', () => fn(c.checked));
            return [el('label', { class: 'tsd-check' }, c, text), c];
        };
        // 슬라이더 행(tsd-row: 라벨 · range · number)
        const slider = (label, min, max, step, val, fn) => {
            const range = el('input', { type: 'range', min, max, step, value: val });
            const num = el('input', { type: 'number', min, max, step, value: val });
            const set = (v, fire) => { range.value = v; num.value = String(+(+v).toFixed(4)); if (fire) fn(+v); };
            range.addEventListener('input', () => set(range.value, true));
            num.addEventListener('change', () => set(clamp(+num.value, min, max), true));
            return { row: el('div', { class: 'tsd-row' }, el('label', { textContent: label }), range, num), set };
        };

        const [editLbl, editChk] = check('편집 모드 — 하늘에 직접 그리기', false, setEditing);
        ui.edit = editChk;
        ui.scene = seg([['dusk', '황혼'], ['day', '낮']], v => { if (v !== scene) setScene(v); });
        ui.layer = seg([['den', '밀도(형태)'], ['tr', '자기 그림자 투과율']], setLayer);
        ui.tools = el('div', { class: 'tsd-btnrow tsce-seg' });
        ui.toolHint = el('div', { class: 'tsd-hint' });
        ui.brush = {
            size: slider('크기', 0.01, 0.3, 0.005, brush.size, v => { brush.size = v; drawCursor(); }),
            str: slider('세기', 0.05, 1, 0.01, brush.str, v => { brush.str = v; }),
            hard: slider('경도', 0, 0.95, 0.01, brush.hard, v => { brush.hard = v; drawCursor(); }),
        };
        const viewSel = el('select', { class: 'tsce-select' }, ...VIEWS.map((t, i) => el('option', { value: String(i), textContent: t })));
        viewSel.addEventListener('change', () => { view = +viewSel.value; dirty = true; });
        // ----- 레퍼런스 오버레이 UI (png 3종 · 반투명 트레이싱) -----
        try {
            const o = JSON.parse(store.get(REF_LS));
            if (o) {
                if (REF_IMGS.some(([v]) => v === o.name)) ref.name = o.name;
                if (isFinite(+o.opacity)) ref.opacity = clamp(+o.opacity, 0.05, 1);
                if (typeof o.show === 'boolean') ref.show = o.show;
            }
        } catch (err) { /* 저장값이 없으면 기본값 */ }
        ui.refSel = el('select', { class: 'tsce-select' }, ...REF_IMGS.map(([v, t]) => el('option', { value: v, textContent: t })));
        ui.refSel.value = ref.name;
        ui.refSel.addEventListener('change', () => {
            let geom = null;
            try { const o = JSON.parse(store.get(REF_LS)); if (o && o.name === ui.refSel.value && o.wr > 0) geom = o; } catch (err) { /* 무시 */ }
            refSetSource(ui.refSel.value, geom);
        });
        const [refShowLbl, refShowChk] = check('표시 (반투명 비교)', ref.show, v => { ref.show = v; refApply(); refSave(); });
        ui.refShow = refShowChk;
        const [refManipLbl, refManipChk] = check('오버레이 조작 — 드래그 이동 · 모서리 크기 조절', false, v => setRefManip(v));
        ui.refManip = refManipChk;
        ui.refOpacity = slider('투명도', 0.05, 1, 0.01, ref.opacity, v => { ref.opacity = v; refApply(); refSave(); });
        ui.refStat = el('div', { class: 'tsd-hint', 'aria-live': 'polite' });
        ui.refHint = el('div', { class: 'tsd-hint' });
        ui.refHint.textContent = '반투명 비교용. 위치·크기를 바꾸려면 "오버레이 조작"을 켠다 (켠 동안 브러시 입력 멈춤).';
        const [ovlLbl] = check('편집 레이어 겹쳐 보기(경계선 · 보정 색조)', overlay, v => { overlay = v; dirty = true; });
        const [gdLbl] = check('화면 비율 가이드(휴대폰 · 16:9)', guides, v => { guides = v; drawCursor(); });
        const [anLbl] = check('흐름 재생(적용 시 그 순간 모양으로 고정)', animate, v => { animate = v; dirty = true; if (!v) edited(); });
        ui.param = {};
        const paramRows = PARAM_UI.map(([id, label, min, max, step]) => {
            const s = slider(label, min, max, step, CD.PRESETS.dusk.params[id], v => { doc.params[id] = v; dirty = true; edited(); });
            ui.param[id] = s; return s.row;
        });
        ui.undo = btn('실행 취소', () => swapHist(undoS, redoS), 'Ctrl+Z');
        ui.redo = btn('다시 실행', () => swapHist(redoS, undoS), 'Ctrl+Shift+Z');
        const fileIn = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
        fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) loadFile(f); });
        ui.unapply = btn('적용 해제', unapply);
        ui.applyStat = el('div', { class: 'tsd-hint', 'aria-live': 'polite' });
        ui.stat = el('div', { class: 'tsd-hint tsce-stat' });

        host.append(
            el('div', { class: 'tsd-hint', textContent: '편집 모드를 켜면 하늘(수평선 위)에 바로 그린다. 그리는 동안 이 장면의 구름은 편집 중인 문서로 바뀌고, "장면에 적용"해야 편집 모드를 꺼도 남는다. 패널이 하늘을 가리면 머리의 "접기"로 접는다.' }),
            editLbl,
            el('div', { class: 'tsd-btnrow tsce-seg' }, ...ui.scene),
            el('div', { class: 'tsd-btnrow' }, btn('장면에 적용', apply), ui.unapply, btn('저장(JSON)', saveFile), btn('불러오기', () => fileIn.click()), fileIn),
            ui.applyStat,
            el('div', { class: 'tsd-btnrow tsce-seg' }, ...ui.layer),
            ui.tools, ui.toolHint,
            ui.brush.size.row, ui.brush.str.row, ui.brush.hard.row,
            el('div', { class: 'tsd-btnrow' }, ui.undo, ui.redo,
                btn('레이어 비우기', () => { const k = brush.layer; pushUndo(k); doc[k].fill(LAY[k].empty); dirtyL[k] = true; edited(); }),
                btn('초안 형태로', () => { pushUndo('den'); fillDraft(doc); dirtyL.den = true; edited(); }),
                btn('새 캔버스', () => {
                    if (!confirm(`${CD.PRESETS[scene].name} 작업본을 현재 화면 비율로 새로 만든다. 두 레이어와 실행 취소 기록이 비워진다(적용본은 그대로).`)) return;
                    useDoc(newDocFor(scene)); edited();
                })),
            el('div', { class: 'tsd-hint', textContent: 'Alt/우클릭 반대 동작 · [ ] 크기 · 1 2 레이어 · Ctrl+Z 취소 (편집 모드에서)' }),
            el('div', { class: 'tsd-hint', textContent: '레퍼런스 오버레이 — 구름 모양 트레이싱·색감 조정용 (png 3종, svg 제외). 조작 모드에서만 이동·리사이즈, 그 외에는 보이기만.' }),
            el('div', { class: 'tsd-row tsce-viewrow' }, el('label', { textContent: '레퍼런스' }), ui.refSel),
            refShowLbl, refManipLbl,
            ui.refOpacity.row,
            el('div', { class: 'tsd-btnrow' }, btn('화면에 맞춤', () => refFit()), btn('가운데', () => refCenter())),
            ui.refHint, ui.refStat,
            ui.stat,
            el('div', { class: 'tsd-row tsce-viewrow' }, el('label', { textContent: '보기' }), viewSel),
            ovlLbl, gdLbl, anLbl,
            ...paramRows,
            el('div', { class: 'tsd-hint', textContent: '모두 퍼블릭 기본값으로 쓰려면 저장한 JSON을 public/clouds/에 넣고 clouds/index.json에 파일명을 등록한다.' }),
        );

        setLayer('den');
        setScene('dusk');
        // 저장된 레퍼런스 선택 복원 (이미지 로드 + 화면 비율 기준 배치)
        try {
            const o = JSON.parse(store.get(REF_LS));
            if (o && o.name && o.name !== 'none') {
                ui.refSel.value = o.name;
                ref.opacity = clamp(isFinite(+o.opacity) ? +o.opacity : ref.opacity, 0.05, 1);
                ui.refOpacity.set(ref.opacity, false);
                ref.show = o.show !== false;
                ui.refShow.checked = ref.show;
                refSetSource(o.name, o.wr > 0 ? o : null);
            }
        } catch (err) { /* 복원 실패 시 없음으로 */ }
    }

    window.TsukuyomiCloudEdit = { mount };
})();
