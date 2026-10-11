/* 공백 장면 구름 레이어 편집기 (window.TsukuyomiCloudLayers).
 * 기존 절차적 구름은 그대로 두고, 그 위에 레이어 단위로 구름을 더 그린다. 렌더·문서 형식은 cloud-overlay.js 공용이고
 * 편집기는 장면이 그리는 바로 그 문서(__TSUKUYOMI__.cloudOverlay.doc)를 직접 고친다 → 반사·블룸·밤 틴트까지 실제 장면 그대로.
 *   도구: 그리기 / 지우기(형태) · 빛 비침 / 음영 · 이동. Alt 또는 우클릭 = 반대 동작(그리기↔지우기, 빛·음영 덜기)
 *   단축키(편집 중): B 그리기, E 지우기, L 빛, S 음영, M 이동, [ ] 크기, V 마스크, H 기존 구름, Ctrl+Z / Ctrl+Shift+Z, Esc 편집 끝
 * 레이어 목록은 기존 구름(덩어리마다 하나 + 수평선 띠)과 그린 레이어를 한 줄로: 썸네일, 눈(보이기, Alt+클릭 = 이것만), 끌어 순서·단 바꾸기,
 *   이름 두 번 클릭 = 이름 바꾸기. 기존 구름도 형태를 더하고 덜 수 있다(원래 덩어리 셰이더로 다시 구움). 지우기·복제는 그린 레이어만.
 * 작업본은 고칠 때마다 이 브라우저(localStorage)에 자동 저장되고, 장면은 작업본 → public/clouds/day-overlay.json 순으로 읽는다.
 * 여는 법: 디버그 패널 › 구름 탭 맨 위 토글 버튼, 또는 콘솔 TsukuyomiCloudLayers.open()
 */
(() => {
    'use strict';
    const CO = window.CloudOverlay;
    const bridge = () => window.__TSUKUYOMI__ || null;
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const el = (tag, props, ...kids) => {
        const e = document.createElement(tag);
        if (props) for (const k in props) {
            if (k === 'class') e.className = props[k];
            else if (k === 'on') for (const ev in props.on) e.addEventListener(ev, props.on[ev]);
            else if (k in e) e[k] = props[k];
            else e.setAttribute(k, props[k]);
        }
        for (const c of kids) if (c !== null && c !== undefined) e.append(c);
        return e;
    };
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장소 차단 */ } },
    };
    const UI_KEY = 'tsukuyomi.cloudLayers.ui.v1';

    const TOOLS = [
        { id: 'draw', key: 'b', name: '그리기', ch: 's', hint: '형태를 쌓는다. 진하게 칠할수록 속이 차고, 가장자리는 혹 노이즈가 깎아 낸다. Alt = 지우기' },
        { id: 'erase', key: 'e', name: '지우기', ch: 's', hint: '형태를 덜어 낸다. Alt = 그리기' },
        { id: 'light', key: 'l', name: '빛 비침', ch: 'l', hint: '구름이 있는 곳만 밝힌다(screen). 범위가 "아래 구름 전체"면 기존 구름에도 칠할 수 있다. Alt = 덜기' },
        { id: 'shade', key: 's', name: '음영', ch: 'd', hint: '구름이 있는 곳만 어둡힌다(multiply). 범위가 "아래 구름 전체"면 기존 구름에도. Alt = 덜기' },
        { id: 'move', key: 'm', name: '이동', ch: null, hint: '레이어 전체(형태·빛·음영)를 끌어 옮긴다.' },
    ];
    const STAGE_HEAD = { top: '맨 위 — 하부 그늘 위', front: '앞층', back: '뒷층 — 틈 림라이트를 받음' };
    const ANCHOR_NAME = { l: '왼쪽 끝', c: '가운데', r: '오른쪽 끝' };
    const TONE_NAME = { back: '밝은 뒷층(흰 윗면)', front: '앞층(옅은 청백)', mid: '중간톤 몸통', dark: '짙은 덩어리', ledge: '수평선 앞턱(가장 어두움)' };

    let ui = null;            // 첫 open 때 만든다
    let ov = null;
    // mask: 칠한 영역(편집 맵) 겹쳐 보기 — 기본 꺼짐, 열 때마다 꺼진 채로 시작(V로 켠다)
    const st = {
        tool: 'draw', size: 0.07, flow: 0.45, hard: 0.3,
        editing: false, mask: false, activeId: null, open: false,
    };
    try { Object.assign(st, JSON.parse(store.get(UI_KEY) || '{}'), { editing: false, open: false, mask: false }); } catch (e) { /* 무시 */ }
    const saveUI = () => store.set(UI_KEY, JSON.stringify({ tool: st.tool, size: st.size, flow: st.flow, hard: st.hard, activeId: st.activeId }));
    const undoS = [], redoS = [], UNDO_MAX = 40;

    const layers = () => ov ? ov.doc.layers : [];
    const active = () => layers().find(L => L.id === st.activeId) || null;
    const tool = () => TOOLS.find(t => t.id === st.tool) || TOOLS[0];

    // ---------- 저장 ----------
    let saveT = 0, saveMsg = '';
    function scheduleSave() {
        clearTimeout(saveT);
        saveMsg = '저장 대기…';
        renderStatus();
        saveT = setTimeout(() => {
            const ok = ov.saveLocal();
            saveMsg = ok ? '작업본 저장됨 ' + new Date().toLocaleTimeString() : '작업본 저장 실패(저장소 용량/차단) — JSON으로 내보내 두세요';
            renderStatus();
        }, 700);
    }

    // ---------- 실행 취소 ----------
    function snapMaps(L, chs) { const o = {}; for (const ch of chs) o[ch] = L.maps[ch].slice(); return o; }
    function pushUndo(entry) {
        undoS.push(entry);
        if (undoS.length > UNDO_MAX) undoS.shift();
        redoS.length = 0;
        renderHistory();
    }
    function applyEntry(e) {
        // 현재 상태를 돌려받아 반대 스택에 넣을 항목으로 만든다
        if (e.type === 'maps') {
            const cur = snapMaps(e.L, Object.keys(e.maps));
            for (const ch in e.maps) e.L.maps[ch].set(e.maps[ch]);
            ov.invalidate(e.L, Object.keys(e.maps).join(''), false);
            return { type: 'maps', L: e.L, maps: cur };
        }
        const cur = { type: 'layers', list: layers().slice(), activeId: st.activeId };
        for (const L of layers()) if (e.list.indexOf(L) < 0) ov.removeLayer(L);
        ov.doc.layers = e.list.slice();
        for (const L of ov.doc.layers) ov.invalidate(L, 'sld', false);
        st.activeId = e.activeId;
        return cur;
    }
    function undo() { const e = undoS.pop(); if (!e) return; redoS.push(applyEntry(e)); afterChange(true); }
    function redo() { const e = redoS.pop(); if (!e) return; undoS.push(applyEntry(e)); afterChange(true); }
    const structural = () => pushUndo({ type: 'layers', list: layers().slice(), activeId: st.activeId });

    function afterChange(rebuildList) {
        prevDirty = true;
        thumbsDirty = true;
        if (rebuildList) renderLayers();
        renderProps();
        renderHistory();
        scheduleSave();
    }

    // ---------- 레이어 조작 ----------
    // 새 레이어는 선택한 레이어 바로 위(같은 단)에. 선택이 없으면 앞층 맨 위
    function addLayer() {
        structural();
        const A = active();
        const n = layers().filter(L => !L.base).length + 1;
        const L = ov.newLayer({ name: '구름 ' + n, stage: A ? A.stage : 'front' });
        const arr = ov.doc.layers;
        if (A) arr.splice(arr.indexOf(A) + 1, 0, L); else arr.push(L);
        st.activeId = L.id;
        afterChange(true);
        return L;
    }
    function dupLayer() {
        const A = active(); if (!A || A.base) return;
        structural();
        const copy = {};
        for (const k of ['visible', 'opacity', 'stage', 'anchor', 'tone', 'scope', 'cov', 'scale', 'absorb', 'rimK', 'sun', 'sway']) copy[k] = A[k];
        const L = ov.newLayer(Object.assign(copy, {
            name: A.name + ' 사본', light: Object.assign({}, A.light), shade: Object.assign({}, A.shade),
            maps: { s: A.maps.s.slice(), l: A.maps.l.slice(), d: A.maps.d.slice() },
        }));
        ov.doc.layers.splice(ov.doc.layers.indexOf(A) + 1, 0, L);
        st.activeId = L.id;
        afterChange(true);
    }
    function delLayer() {
        const A = active(); if (!A || A.base) return;
        structural();
        const i = ov.doc.layers.indexOf(A);
        ov.doc.layers.splice(i, 1);
        ov.removeLayer(A);
        const rest = ov.doc.layers;
        st.activeId = rest.length ? rest[Math.min(i, rest.length - 1)].id : null;
        afterChange(true);
    }
    // 같은 단(stage) 안에서 한 칸 앞(+1)/뒤(-1)로. 단이 다르면 그리는 순서가 단으로 이미 갈린다
    function moveLayer(dir) {
        const A = active(); if (!A) return;
        const arr = ov.doc.layers, i = arr.indexOf(A);
        let j = i + dir;
        while (j >= 0 && j < arr.length && arr[j].stage !== A.stage) j += dir;
        if (j < 0 || j >= arr.length) return;
        structural();
        arr[i] = arr[j]; arr[j] = A;
        afterChange(true);
    }
    function clearLayer() {
        const A = active(); if (!A) return;
        pushUndo({ type: 'maps', L: A, maps: snapMaps(A, 'sld') });
        for (const ch of 'sld') A.maps[ch].fill(ch === 's' && A.base ? CO.S0_BASE : 0);
        ov.invalidate(A, 'sld', false);
        afterChange(false);
    }
    // 끌어 놓기: L을 단 stage로, 목록에서 ref 바로 위(above) 또는 아래에. ref가 없으면 그 단 맨 위
    function placeLayer(L, stage, ref, above) {
        if (ref === L) return;
        structural();
        const arr = ov.doc.layers;
        arr.splice(arr.indexOf(L), 1);
        L.stage = stage;
        // 목록 위 = 나중에 그림 = 배열 뒤쪽
        if (ref) { const j = arr.indexOf(ref); arr.splice(above ? j + 1 : j, 0, L); }
        else arr.push(L);
        st.activeId = L.id;
        afterChange(true);
    }
    // 맵 전체를 (dx, dy) 텍셀만큼 민다. 밖으로 나간 부분은 버린다(기존 구름 형태 맵은 '그대로' 값으로 채운다)
    function shiftMaps(L, src, dx, dy) {
        const { MW, MH } = CO;
        for (const ch of 'sld') {
            const a = L.maps[ch], s = src[ch];
            a.fill(ch === 's' && L.base ? CO.S0_BASE : 0);
            for (let y = Math.max(0, dy); y < Math.min(MH, MH + dy); y++) {
                const so = (y - dy) * MW, o = y * MW;
                for (let x = Math.max(0, dx); x < Math.min(MW, MW + dx); x++) a[o + x] = s[so + x - dx];
            }
        }
    }
    // 기준점을 바꿔도 지금 화면에서 제자리에 남도록 맵을 민다
    function setAnchor(L, an) {
        if (L.anchor === an) return;
        syncGeom();
        const F0 = ov.frame(L);
        const prev = L.anchor;
        L.anchor = an;
        const F1 = ov.frame(L);
        const dx = Math.round((F0.x0 - F1.x0) / F1.ppt);
        pushUndo({ type: 'maps', L, maps: snapMaps(L, 'sld') });
        // 맵 이동과 기준점 변경을 한 번에 되돌리진 않는다(기준점은 속성) → 되돌리면 형태만 원래 텍셀로
        shiftMaps(L, snapMaps(L, 'sld'), dx, 0);
        ov.invalidate(L, 'sld', false);
        if (prev !== an) afterChange(true);
    }

    // ---------- 브러시 ----------
    const fall = (d, h) => h >= 0.999 ? 1 : 1 - ss(h, 1, d);
    function dab(L, ch, cx, cy, r, amt, sign) {
        const { MW, MH } = CO, a = L.maps[ch];
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(MW - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(MH - 1, Math.ceil(cy + r));
        if (x1 < x0 || y1 < y0) return;
        const ir = 1 / r, h = st.hard;
        for (let y = y0; y <= y1; y++) {
            const dy = (y - cy) * ir, o = y * MW;
            for (let x = x0; x <= x1; x++) {
                const dx = (x - cx) * ir, d = Math.sqrt(dx * dx + dy * dy);
                if (d >= 1) continue;
                const w = amt * fall(d, h), v = a[o + x];
                a[o + x] = sign > 0 ? v + (1 - v) * w : v - v * w;
            }
        }
    }

    let stroke = null;
    function syncGeom() {
        const b = bridge();
        if (b) { ov.W = b.W; ov.HZ = b.HZ; }
    }
    function toTex(L, x, y) {
        const F = ov.frame(L);
        return { x: (x - F.x0) / F.ppt, y: (y - F.y0) / F.ppt, ppt: F.ppt };
    }
    function strokeBegin(ev) {
        const b = bridge();
        if (!b || b.camOn) { flash('확대 보기 중에는 편집할 수 없다 — 먼저 처음 화면으로 돌아가기'); return; }
        syncGeom();
        let L = active();
        if (!L) L = addLayer();
        if (!L.visible) { flash('숨긴 레이어 — 눈 아이콘을 켜고 칠하세요'); return; }
        const T = tool();
        if (T.ch === 's' && !ov.canShape(L)) { flash('수평선 띠는 형태를 고치지 않는다 — 빛 비침·음영·이동만'); return; }
        const inv = ev.altKey || ev.button === 2;
        const p = toTex(L, ev.clientX, ev.clientY);
        if (T.id === 'move') {
            stroke = { L, move: true, x0: p.x, y0: p.y, src: snapMaps(L, 'sld'), dx: 0, dy: 0 };
            return;
        }
        const sign = T.id === 'erase' ? (inv ? 1 : -1) : (inv ? -1 : 1);
        stroke = { L, ch: T.ch, sign, last: p, before: snapMaps(L, T.ch) };
        stamp(p);
    }
    function stamp(p) {
        const s = stroke, r = Math.max(1, st.size * CO.RES);
        // 지우기·덜기는 조금 더 세게(같은 세기로 쌓은 것을 한두 번에 걷어 낼 수 있게)
        const amt = clamp(st.flow * (s.sign < 0 ? 0.5 : 0.3), 0.005, 1);
        dab(s.L, s.ch, p.x, p.y, r, amt, s.sign);
    }
    function strokeMove(ev) {
        const s = stroke; if (!s) return;
        const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
        for (const e of (evs.length ? evs : [ev])) {
            const p = toTex(s.L, e.clientX, e.clientY);
            if (s.move) {
                const dx = Math.round(p.x - s.x0), dy = Math.round(p.y - s.y0);
                if (dx !== s.dx || dy !== s.dy) { s.dx = dx; s.dy = dy; shiftMaps(s.L, s.src, dx, dy); }
                continue;
            }
            // 붓 간격: 반지름의 18% 마다 한 번 찍는다(속도와 무관하게 같은 농도)
            const r = Math.max(1, st.size * CO.RES), step = Math.max(0.75, r * 0.18);
            const dx = p.x - s.last.x, dy = p.y - s.last.y, dist = Math.hypot(dx, dy);
            if (dist < step) continue;
            const n = Math.floor(dist / step);
            for (let k = 1; k <= n; k++) stamp({ x: s.last.x + dx * k / n, y: s.last.y + dy * k / n });
            s.last = p;
        }
        ov.invalidate(s.L, s.move ? 'sld' : s.ch, true);
        prevDirty = true;
        thumbsDirty = true;
    }
    function strokeEnd() {
        const s = stroke; if (!s) return;
        stroke = null;
        if (s.move) {
            if (!s.dx && !s.dy) return;
            pushUndo({ type: 'maps', L: s.L, maps: s.src });
            ov.invalidate(s.L, 'sld', false);
        } else {
            pushUndo({ type: 'maps', L: s.L, maps: s.before });
            ov.invalidate(s.L, s.ch, false);
        }
        afterChange(false);
        // 편집됨 표시가 바뀌었을 수 있다
        if (s.L.base) setTimeout(renderLayers, 0);
    }

    // ---------- 편집 패드 + 마스크 미리보기 ----------
    let pad, cur, CG, prevC, PG, prevDirty = true, prevFor = null, pointer = null, raf = 0;
    function buildPad() {
        pad = el('div', { class: 'tcl-pad', 'aria-label': '구름 레이어 그리기 영역' });
        cur = el('canvas', { class: 'tcl-cur', 'aria-hidden': 'true' });
        pad.append(cur);
        document.body.append(pad);
        CG = cur.getContext('2d');
        prevC = document.createElement('canvas');
        prevC.width = CO.MW; prevC.height = CO.MH;
        PG = prevC.getContext('2d');
        pad.addEventListener('contextmenu', e => e.preventDefault());
        pad.addEventListener('pointerdown', e => {
            if (e.button !== 0 && e.button !== 2) return;
            e.preventDefault();
            pad.setPointerCapture(e.pointerId);
            strokeBegin(e);
        });
        pad.addEventListener('pointermove', e => {
            pointer = { x: e.clientX, y: e.clientY, alt: e.altKey };
            if (stroke) strokeMove(e);
        });
        pad.addEventListener('pointerleave', () => { if (!stroke) pointer = null; });
        const end = e => { if (pad.hasPointerCapture && pad.hasPointerCapture(e.pointerId)) pad.releasePointerCapture(e.pointerId); strokeEnd(); };
        pad.addEventListener('pointerup', end);
        pad.addEventListener('pointercancel', end);
        // 휠 = 붓 크기, Shift+휠 = 세기
        pad.addEventListener('wheel', e => {
            e.preventDefault();
            const k = Math.pow(1.1, -Math.sign(e.deltaY || e.deltaX));
            if (e.shiftKey) st.flow = clamp(st.flow * k, 0.02, 1);
            else st.size = clamp(st.size * k, 0.005, 0.6);
            renderBrush(); saveUI();
        }, { passive: false });
    }
    function buildPreview(L) {
        const { MW, MH } = CO;
        const img = PG.createImageData(MW, MH), D = img.data;
        const S = L.maps.s, Lm = L.maps.l, Dm = L.maps.d, isB = !!L.base;
        // 흰색 = 형태(기존 구름은 더한 곳), 빨강 = 기존 구름에서 덜어 낸 곳, 노랑 = 빛 비침, 파랑 = 음영
        for (let i = 0, j = 0; i < MW * MH; i++, j += 4) {
            const as = isB ? Math.max(0, S[i] - 0.5) * 0.7 : S[i] * 0.3, ae = isB ? Math.max(0, 0.5 - S[i]) * 0.9 : 0;
            const al = Lm[i] * 0.5, ad = Dm[i] * 0.5, sum = as + ae + al + ad;
            if (sum < 0.004) continue;
            D[j] = (255 * as + 255 * ae + 255 * al + 90 * ad) / sum;
            D[j + 1] = (255 * as + 70 * ae + 205 * al + 140 * ad) / sum;
            D[j + 2] = (255 * as + 70 * ae + 100 * al + 255 * ad) / sum;
            D[j + 3] = (1 - (1 - as) * (1 - ae) * (1 - al) * (1 - ad)) * 255;
        }
        PG.putImageData(img, 0, 0);
        prevDirty = false; prevFor = L;
    }
    function loop() {
        raf = 0;
        if (!st.editing) return;
        raf = requestAnimationFrame(loop);
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
        if (cur.width !== w || cur.height !== h) { cur.width = w; cur.height = h; }
        CG.setTransform(1, 0, 0, 1, 0, 0);
        CG.clearRect(0, 0, w, h);
        CG.setTransform(dpr, 0, 0, dpr, 0, 0);
        syncGeom();
        const L = active();
        if (L && st.mask && L.visible) {
            if (prevDirty || prevFor !== L) buildPreview(L);
            const F = ov.frame(L);
            CG.imageSmoothingEnabled = true;
            CG.drawImage(prevC, F.x0, F.y0, CO.MW * F.ppt, CO.MH * F.ppt);
            // 맵 범위(이 밖은 칠해지지 않는다)
            CG.setLineDash([6, 6]);
            CG.strokeStyle = 'rgba(255,255,255,0.25)';
            CG.lineWidth = 1;
            CG.strokeRect(F.x0 + 0.5, F.y0 + 0.5, CO.MW * F.ppt - 1, CO.MH * F.ppt - 1);
            CG.setLineDash([]);
        }
        // 수평선
        const b = bridge();
        if (b) {
            CG.strokeStyle = 'rgba(255,255,255,0.18)';
            CG.beginPath(); CG.moveTo(0, b.HZ + 0.5); CG.lineTo(b.W, b.HZ + 0.5); CG.stroke();
        }
        if (pointer) {
            const T = tool(), r = st.size * (ov.HZ || 1);
            const inv = pointer.alt;
            const col = T.id === 'light' ? '255,214,120' : T.id === 'shade' ? '120,160,255' : '255,255,255';
            CG.lineWidth = 1.5;
            CG.strokeStyle = `rgba(${col},0.9)`;
            if (T.id === 'move') {
                CG.beginPath();
                CG.moveTo(pointer.x - 10, pointer.y); CG.lineTo(pointer.x + 10, pointer.y);
                CG.moveTo(pointer.x, pointer.y - 10); CG.lineTo(pointer.x, pointer.y + 10);
                CG.stroke();
            } else {
                if (inv || T.id === 'erase') CG.setLineDash([4, 4]);
                CG.beginPath(); CG.arc(pointer.x, pointer.y, r, 0, Math.PI * 2); CG.stroke();
                if (st.hard < 0.999) {
                    CG.strokeStyle = `rgba(${col},0.35)`;
                    CG.beginPath(); CG.arc(pointer.x, pointer.y, Math.max(1, r * st.hard), 0, Math.PI * 2); CG.stroke();
                }
                CG.setLineDash([]);
            }
        }
    }

    function setEditing(on) {
        const b = bridge();
        st.editing = !!on;
        if (ov) ov.editing = st.editing;
        if (st.editing && b) {
            // 공백 장면으로 바로 고정(전환 애니메이션 없이)
            if (b.state !== 'day' || b.sunVis < 1) b.state = 'day';
            if (b.cfg.DAY_SCENE < 0.5) flash('DAY_SCENE = 0(기존 낮)이라 공백 구름이 그려지지 않는다');
        }
        pad.classList.toggle('on', st.editing);
        ui.edit.classList.toggle('on', st.editing);
        ui.edit.textContent = st.editing ? '편집 끝내기 (Esc)' : '편집 시작';
        ui.edit.setAttribute('aria-pressed', String(st.editing));
        if (st.editing && !raf) raf = requestAnimationFrame(loop);
        if (!st.editing) { stroke = null; pointer = null; }
        renderStatus();
    }

    // ---------- UI ----------
    let flashT = 0, flashMsg = '';
    function flash(msg) {
        flashMsg = msg;
        clearTimeout(flashT);
        flashT = setTimeout(() => { flashMsg = ''; renderStatus(); }, 3500);
        renderStatus();
    }
    function renderStatus() {
        if (!ui) return;
        const b = bridge();
        const src = { local: '이 브라우저 작업본', file: 'clouds/day-overlay.json', import: '가져온 파일', none: '없음(새 문서)' }[ov.source] || ov.source;
        const gpu = !!(b && b.cfg.CL_LIVE >= 0.5 && window.CloudLive);
        const nb = layers().filter(L => L.base).length;
        const lines = [
            `출처: ${src} · 기존 ${nb} + 그린 ${layers().length - nb}${gpu ? '' : ' · CPU 굽기(획이 끝나야 갱신)'}`,
        ];
        if (saveMsg) lines.push(saveMsg);
        if (b && b.camOn) lines.push('⚠ 확대 보기 중 — 편집하려면 처음 화면으로');
        if (ov.hideBase) lines.push('기존 구름 전부 숨김 (H)');
        if (flashMsg) lines.push('› ' + flashMsg);
        ui.status.textContent = lines.join('\n');
    }
    function renderHistory() {
        if (!ui) return;
        ui.undo.disabled = !undoS.length;
        ui.redo.disabled = !redoS.length;
    }
    function renderTools() {
        for (const b of ui.toolBtns) {
            const on = b.dataset.tool === st.tool;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
        }
        ui.toolHint.textContent = tool().hint;
    }
    function renderBrush() {
        if (!ui) return;
        ui.size.set(st.size); ui.flow.set(st.flow); ui.hard.set(st.hard);
    }
    // ---------- 레이어 목록 (포토샵식: 위 = 앞) ----------
    const SVG_NS = 'http://www.w3.org/2000/svg';
    function eyeIcon(on) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', on ? 'M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12zm10.5 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z' : 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10.5 7 10.5 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 1.5 12S5.5 19 12 19a10 10 0 0 0 5.4-1.6');
        path.setAttribute('fill', on ? 'currentColor' : 'none');
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', on ? '0' : '1.8'); path.setAttribute('stroke-linecap', 'round');
        svg.append(path);
        return svg;
    }
    let thumbsDirty = true, rowThumbs = [];
    function renderThumbs() {
        if (!ui || !st.open || ui.body.hidden) return;
        thumbsDirty = false;
        syncGeom();
        for (const { L, c, empty } of rowThumbs) empty.hidden = ov.thumb(L, c);
    }
    let drag = null;
    function clearDrop() { for (const x of ui.list.querySelectorAll('.drop-above, .drop-below, .drop-into')) x.classList.remove('drop-above', 'drop-below', 'drop-into'); }
    function renderLayers() {
        const host = ui.list;
        host.textContent = '';
        rowThumbs = [];
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const row = L => {
            const on = L.id === st.activeId;
            const eye = el('button', { type: 'button', class: 'tcl-eye' + (L.visible ? '' : ' off'), title: '보이기/숨기기 (Alt+클릭 = 이 레이어만 보기)', 'aria-pressed': String(L.visible), 'aria-label': L.name + ' 보이기' });
            eye.append(eyeIcon(L.visible));
            eye.addEventListener('click', e => {
                e.stopPropagation();
                if (e.altKey) {
                    ov.solo = ov.solo === L.id ? null : L.id;
                    st.activeId = L.id; saveUI();
                    ui.soloI.checked = !!ov.solo;
                } else { L.visible = !L.visible; scheduleSave(); }
                prevDirty = true;
                renderLayers(); renderProps();
            });
            const c = el('canvas', { class: 'tcl-thumb-c', width: Math.round(56 * dpr), height: Math.round(34 * dpr) });
            const empty = el('span', { class: 'tcl-thumb-e', textContent: '비어 있음' });
            const th = el('div', { class: 'tcl-thumb' }, c, empty);
            rowThumbs.push({ L, c, empty });
            const name = el('span', { class: 'tcl-lname', textContent: L.name, title: '두 번 클릭 = 이름 바꾸기' });
            const tags = [];
            if (L.base) tags.push(el('span', { class: 'tcl-tag', textContent: '기존' }));
            if (L.base && ov.edited(L)) tags.push(el('span', { class: 'tcl-tag ed', textContent: '편집됨', title: '형태·빛·음영을 고쳤다' }));
            if (ov.solo === L.id) tags.push(el('span', { class: 'tcl-tag solo', textContent: '단독' }));
            const sub = [];
            if (L.opacity < 0.999) sub.push(Math.round(L.opacity * 100) + '%');
            if (!L.base) sub.push(TONE_NAME[L.tone].split('(')[0].trim());
            if (L.base && !ov.canShape(L)) sub.push('빛·음영만');
            const meta = el('div', { class: 'tcl-meta' }, el('div', { class: 'tcl-ltop' }, name, ...tags), el('span', { class: 'tcl-lsub', textContent: sub.join(' · ') }));
            const r = el('div', {
                class: 'tcl-layer' + (on ? ' on' : '') + (L.visible ? '' : ' hid') + (L.base ? ' base' : ''),
                role: 'option', 'aria-selected': String(on), draggable: true, tabIndex: on ? 0 : -1,
            }, eye, th, meta);
            r.addEventListener('click', () => {
                ov.flashLayer(L.id);
                if (st.activeId === L.id) return;
                st.activeId = L.id; saveUI(); prevDirty = true;
                if (ov.solo) ov.solo = L.id;
                renderLayers(); renderProps();
            });
            name.addEventListener('dblclick', e => {
                e.stopPropagation();
                const inp = el('input', { type: 'text', class: 'tcl-name tcl-rename', value: L.name, maxLength: 40 });
                r.draggable = false;
                name.replaceWith(inp);
                inp.focus(); inp.select();
                let done = false;
                const fin = ok => {
                    if (done) return;
                    done = true;
                    if (ok && inp.value.trim()) { L.name = inp.value.trim(); scheduleSave(); }
                    renderLayers(); renderProps();
                };
                inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); else if (ev.key === 'Escape') fin(false); });
                inp.addEventListener('blur', () => fin(true));
            });
            // 끌어 순서 바꾸기: 다른 단의 레이어 위·아래에 놓으면 그 단으로 옮겨진다
            r.addEventListener('dragstart', e => { drag = L; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', L.id); });
            r.addEventListener('dragend', () => { drag = null; r.classList.remove('dragging'); clearDrop(); });
            const half = e => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; };
            r.addEventListener('dragover', e => {
                if (!drag || drag === L) return;
                e.preventDefault();
                clearDrop();
                r.classList.add(half(e) ? 'drop-above' : 'drop-below');
            });
            r.addEventListener('drop', e => {
                if (!drag || drag === L) return;
                e.preventDefault();
                const D = drag, above = half(e);
                drag = null; clearDrop();
                placeLayer(D, L.stage, L, above);
            });
            r.addEventListener('keydown', e => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                const rows = [...host.querySelectorAll('.tcl-layer')], i = rows.indexOf(r);
                const nx = rows[i + (e.key === 'ArrowUp' ? -1 : 1)];
                if (!nx) return;
                nx.click();
                const f = host.querySelector('.tcl-layer.on');
                if (f) f.focus();
            });
            return r;
        };
        const head = stg => {
            const h = el('div', { class: 'tcl-stage', textContent: STAGE_HEAD[stg] });
            h.addEventListener('dragover', e => { if (!drag) return; e.preventDefault(); clearDrop(); h.classList.add('drop-into'); });
            h.addEventListener('dragleave', () => h.classList.remove('drop-into'));
            h.addEventListener('drop', e => { if (!drag) return; e.preventDefault(); const D = drag; drag = null; clearDrop(); placeLayer(D, stg, null); });
            return h;
        };
        // 화면 앞에 보이는 것이 위로: 단(맨 위 > 앞층 > 뒷층) → 같은 단 안에서 나중에 그리는 것
        const all = layers();
        for (const stg of ['top', 'front', 'back']) {
            host.append(head(stg));
            const inStage = all.filter(L => L.stage === stg).reverse();
            if (!inStage.length) host.append(el('div', { class: 'tcl-empty', textContent: '비어 있음 — 단 이름 위로 끌어 놓기' }));
            for (const L of inStage) host.append(row(L));
        }
        const A = active();
        ui.dupB.disabled = ui.delB.disabled = !A || !!A.base;
        for (const b of [ui.upB, ui.dnB, ui.clrB]) b.disabled = !A;
        ui.clrB.textContent = A && A.base ? '편집 지우기' : '비우기';
        ui.clrB.title = A && A.base ? '기존 구름에 더하고 덜어 낸 형태·빛·음영을 모두 지워 원래대로(되돌리기 가능)' : '형태·빛·음영을 모두 지운다(되돌리기 가능)';
        renderThumbs();
        renderStatus();
    }

    // 슬라이더 + 숫자. nullable이면 "자동" 체크(null = 장면/톤 기본값을 따른다)
    function slider(label, min, max, step, get, set, opt) {
        opt = opt || {};
        const range = el('input', { type: 'range', min, max, step });
        const numI = el('input', { type: 'number', min, max, step });
        const auto = opt.nullable ? el('input', { type: 'checkbox', title: '자동(장면·톤 기본값)' }) : null;
        const row = el('div', { class: 'tcl-row' }, el('label', { textContent: label, title: opt.title || '' }), range, numI,
            auto ? el('label', { class: 'tcl-auto' }, auto, '자동') : null);
        const show = () => {
            const v = get();
            const isAuto = auto && (v === null || v === undefined);
            const shownV = isAuto ? (opt.autoVal ? opt.autoVal() : min) : v;
            range.value = String(shownV);
            numI.value = String(Math.round(shownV * 1000) / 1000);
            if (auto) { auto.checked = isAuto; range.disabled = numI.disabled = isAuto; }
        };
        const put = v => { const n = Number(v); if (!Number.isFinite(n)) return; set(n); show(); };
        range.addEventListener('input', () => put(range.value));
        numI.addEventListener('change', () => put(numI.value));
        range.addEventListener('change', () => opt.commit && opt.commit());
        numI.addEventListener('change', () => opt.commit && opt.commit());
        if (auto) auto.addEventListener('change', () => {
            set(auto.checked ? null : Number(range.value));
            show();
            opt.commit && opt.commit();
        });
        return { row, set: show, show };
    }
    function select(label, options, get, set) {
        const s = el('select');
        for (const [v, t] of options) s.append(el('option', { value: v, textContent: t }));
        s.addEventListener('change', () => set(s.value));
        const row = el('div', { class: 'tcl-row sel' }, el('label', { textContent: label }), s);
        return { row, show: () => { s.value = get(); } };
    }
    function colorRow(label, getC, setC, getK, setK) {
        const c = el('input', { type: 'color' });
        const k = el('input', { type: 'range', min: 0, max: 1, step: 0.01 });
        const n = el('input', { type: 'number', min: 0, max: 1, step: 0.01 });
        c.addEventListener('input', () => setC(c.value));
        k.addEventListener('input', () => { setK(+k.value); n.value = k.value; });
        n.addEventListener('change', () => { setK(clamp(+n.value || 0, 0, 1)); k.value = n.value; });
        for (const x of [c, k, n]) x.addEventListener('change', scheduleSave);
        const row = el('div', { class: 'tcl-row col' }, el('label', { textContent: label }), c, k, n);
        return { row, show: () => { c.value = getC(); k.value = String(getK()); n.value = String(getK()); } };
    }

    let propCtl = [];
    function buildProps(host) {
        const b = bridge();
        const A = () => active();
        const touchS = () => { const L = A(); if (L) ov.invalidate(L, 's', false); };
        const touchM = () => { const L = A(); if (L) ov.invalidate(L, 'ld', false); };
        const tone = () => { const L = A(); return L ? L.tone : 'back'; };
        const nameI = el('input', { type: 'text', class: 'tcl-name', maxLength: 40 });
        nameI.addEventListener('input', () => { const L = A(); if (L) { L.name = nameI.value || '레이어'; } });
        nameI.addEventListener('change', () => { renderLayers(); scheduleSave(); });
        const nameRow = el('div', { class: 'tcl-row sel' }, el('label', { textContent: '이름' }), nameI);
        const TONE_DEF = { back: { rimK: 0.85, absorbD: -0.25 }, front: { rimK: 0.5, absorbD: 0.1, covD: 0.02 }, mid: { rimK: 0.4 }, dark: { rimK: 0.12, absorbD: 0.1 }, ledge: { rimK: 0.08 } };
        const commitS = () => { touchS(); scheduleSave(); };
        // paint: 손으로 그린 레이어만(기존 구름은 원래 덩어리 설정을 그대로 쓴다)
        const paint = c => Object.assign(c, { paint: true });
        propCtl = [
            { row: nameRow, show: () => { const L = A(); nameI.value = L ? L.name : ''; } },
            select('그리는 단', [['back', '뒷층 (틈 림라이트를 같이 받음)'], ['front', '앞층'], ['top', '맨 위 (하부 그늘도 안 받음)']],
                () => A() ? A().stage : 'front', v => { const L = A(); if (!L) return; L.stage = v; renderLayers(); scheduleSave(); }),
            paint(select('기준점', [['l', '왼쪽 끝에 붙음'], ['c', '가운데에 붙음'], ['r', '오른쪽 끝에 붙음']],
                () => A() ? A().anchor : 'c', v => { const L = A(); if (L) setAnchor(L, v); })),
            paint(select('톤', Object.entries(TONE_NAME), tone, v => { const L = A(); if (!L) return; L.tone = v; commitS(); renderLayers(); renderProps(); })),
            slider('불투명도', 0, 1, 0.01, () => A() ? A().opacity : 1, v => { const L = A(); if (L) L.opacity = clamp(v, 0, 1); }, { commit: () => { scheduleSave(); renderLayers(); } }),
            paint(slider('덮임', 0.2, 0.8, 0.01, () => A() ? A().cov : null, v => { const L = A(); if (L) { L.cov = v; ov.invalidate(L, 's', true); } },
                { nullable: true, autoVal: () => b.cfg.DY_COV + (TONE_DEF[tone()].covD || 0), commit: commitS, title: '높을수록 구름이 성기고 경계가 안쪽으로' })),
            paint(slider('혹 크기', 2, 12, 0.1, () => A() ? A().scale : null, v => { const L = A(); if (L) { L.scale = v; ov.invalidate(L, 's', true); } },
                { nullable: true, autoVal: () => b.cfg.DY_SCALE, commit: commitS, title: '클수록 혹이 잘다' })),
            paint(slider('그림자 깊이', 0.2, 4, 0.05, () => A() ? A().absorb : null, v => { const L = A(); if (L) { L.absorb = v; ov.invalidate(L, 's', true); } },
                { nullable: true, autoVal: () => b.cfg.DY_ABSORB + (TONE_DEF[tone()].absorbD || 0), commit: commitS })),
            paint(slider('실버 라이닝', 0, 1.2, 0.01, () => A() ? A().rimK : null, v => { const L = A(); if (L) { L.rimK = v; ov.invalidate(L, 's', true); } },
                { nullable: true, autoVal: () => TONE_DEF[tone()].rimK, commit: commitS })),
            paint(slider('빛 방향°', 0, 180, 1, () => A() ? A().sun : null, v => { const L = A(); if (L) { L.sun = v; ov.invalidate(L, 's', true); } },
                { nullable: true, autoVal: () => 90, commit: commitS, title: '자동 = 형태 중심에서 구름 틈 광원을 향함' })),
            paint(slider('흔들림', 0, 2, 0.05, () => A() ? A().sway : 0, v => { const L = A(); if (L) L.sway = v; },
                { commit: scheduleSave, title: '기존 덩어리처럼 좌우로 천천히(DY_SWAY 배). 편집 중에는 멈춘다' })),
            select('빛·음영 범위', [['below', '이 레이어 + 먼저 그린 구름 전체'], ['self', '이 레이어 구름만']],
                () => A() ? A().scope : 'below', v => { const L = A(); if (!L) return; L.scope = v; scheduleSave(); }),
            colorRow('빛 비침', () => A() ? A().light.color : '#eef6ff', v => { const L = A(); if (L) { L.light.color = v; touchM(); } },
                () => A() ? A().light.k : 0.85, v => { const L = A(); if (L) { L.light.k = v; touchM(); } }),
            select('빛 섞기', [['screen', '스크린 (고르게 밝힘)'], ['overlay', '오버레이 (혹 질감 유지)'], ['soft-light', '소프트 라이트 (은은하게)'], ['color-dodge', '닷지 (강한 빛)']],
                () => A() ? A().light.mode : 'screen', v => { const L = A(); if (!L) return; L.light.mode = v; scheduleSave(); }),
            colorRow('음영', () => A() ? A().shade.color : '#26365e', v => { const L = A(); if (L) { L.shade.color = v; touchM(); } },
                () => A() ? A().shade.k : 0.75, v => { const L = A(); if (L) { L.shade.k = v; touchM(); } }),
            select('음영 섞기', [['multiply', '곱하기 (고르게 어둡게)'], ['soft-light', '소프트 라이트 (질감 유지)'], ['color-burn', '번 (깊게)']],
                () => A() ? A().shade.mode : 'multiply', v => { const L = A(); if (!L) return; L.shade.mode = v; scheduleSave(); }),
        ];
        const baseNote = el('div', { class: 'tcl-hint', textContent: '기존 구름: 그리기·지우기는 원래 덩어리에 더하고 덜어 낸다(같은 셰이더로 다시 구움). 색·질감은 원래 덩어리 설정 그대로.' });
        propCtl.splice(1, 0, { row: baseNote, show: () => { const L = A(); baseNote.hidden = !(L && L.base); } });
        for (const c of propCtl) host.append(c.row);
    }
    function renderProps() {
        if (!ui) return;
        const has = !!active();
        ui.props.classList.toggle('off', !has);
        ui.propsEmpty.hidden = has;
        const L = active();
        for (const c of propCtl) {
            c.show();
            if (c.paint) c.row.hidden = !!(L && L.base);
        }
    }

    // ---------- 파일 ----------
    function download(name, blob) {
        const a = el('a', { href: URL.createObjectURL(blob), download: name });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    function exportJSON() {
        const j = ov.serialize();
        download(CO.FILE.split('/').pop(), new Blob([JSON.stringify(j)], { type: 'application/json' }));
        flash('내려받은 파일을 public/' + CO.FILE + ' 에 덮어쓰면 배포본에 들어간다');
    }
    // skipBase: 그린 레이어만. 아니면 보이는 구름 레이어 전부(틈 림라이트·하부 그늘·하늘은 빠진 투명 배경)
    function exportOverlayPNG(skipBase) {
        const b = bridge();
        syncGeom();
        const c = ov.renderImage(b ? b.dpr : 1, { skipBase });
        c.toBlob(bl => bl && download(skipBase ? 'cloud-overlay.png' : 'cloud-layers.png', bl), 'image/png');
    }
    function exportScenePNG() {
        const ids = ['scene', 'ripple', 'fg'].map(id => document.getElementById(id)).filter(Boolean);
        const base = ids[0];
        const c = document.createElement('canvas');
        c.width = base.width; c.height = base.height;
        const g = c.getContext('2d');
        for (const x of ids) g.drawImage(x, 0, 0, c.width, c.height);
        c.toBlob(bl => bl && download('tsukuyomi-day.png', bl), 'image/png');
    }
    function importJSON(file) {
        file.text().then(t => CO.parse(t)).then(doc => {
            structural();
            ov.setDoc(doc, 'import');
            st.activeId = doc.layers.length ? doc.layers[doc.layers.length - 1].id : null;
            afterChange(true);
            flash('가져옴: 레이어 ' + doc.layers.length + '개 (작업본으로 저장)');
        }).catch(e => flash('가져오기 실패: ' + e.message));
    }
    function reloadFile() {
        if (!confirm('이 브라우저의 작업본을 버리고 public/' + CO.FILE + ' 를 다시 읽을까요?')) return;
        clearTimeout(saveT);
        ov.clearLocal();
        undoS.length = redoS.length = 0;
        ov.loadFile().then(doc => ov.setDoc(doc, 'file')).catch(() => ov.setDoc(CO.newDoc(), 'none')).then(() => {
            st.activeId = layers().length ? layers()[layers().length - 1].id : null;
            saveMsg = '작업본 버림';
            prevDirty = true;
            renderLayers(); renderProps(); renderHistory();
        });
    }

    // ---------- 패널 ----------
    function build() {
        const b = bridge();
        ov = b && b.cloudOverlay;
        if (!ov) return false;
        const panel = el('div', { class: 'tcl-panel', role: 'dialog', 'aria-label': '구름 레이어 편집 (공백)' });
        const head = el('div', { class: 'tcl-head' }, el('strong', { textContent: '구름 레이어 · 공백' }));
        const edit = el('button', { type: 'button', class: 'tcl-edit', textContent: '편집 시작', 'aria-pressed': 'false' });
        const fold = el('button', { type: 'button', textContent: '접기' });
        const close = el('button', { type: 'button', textContent: '닫기' });
        head.append(edit, fold, close);
        const body = el('div', { class: 'tcl-body' });
        const status = el('div', { class: 'tcl-status' });

        // 도구
        const toolRow = el('div', { class: 'tcl-tools' });
        const toolBtns = TOOLS.map(t => {
            const bt = el('button', { type: 'button', textContent: t.name, title: t.hint + ' [' + t.key.toUpperCase() + ']' });
            bt.dataset.tool = t.id;
            bt.addEventListener('click', () => { st.tool = t.id; saveUI(); renderTools(); });
            toolRow.append(bt);
            return bt;
        });
        const toolHint = el('div', { class: 'tcl-hint' });
        const size = slider('크기', 0.005, 0.6, 0.005, () => st.size, v => { st.size = clamp(v, 0.005, 0.6); }, { commit: saveUI, title: '붓 반지름(수평선 높이 비율). 휠로도' });
        const flow = slider('세기', 0.02, 1, 0.01, () => st.flow, v => { st.flow = clamp(v, 0.02, 1); }, { commit: saveUI, title: '한 번 지날 때 쌓이는 양. Shift+휠로도' });
        const hard = slider('경도', 0, 1, 0.01, () => st.hard, v => { st.hard = clamp(v, 0, 1); }, { commit: saveUI, title: '0 = 가장자리까지 부드럽게, 1 = 딱딱한 원' });
        const maskI = el('input', { type: 'checkbox', checked: st.mask });
        maskI.addEventListener('change', () => { st.mask = maskI.checked; saveUI(); });
        const soloI = el('input', { type: 'checkbox' });
        soloI.addEventListener('change', () => { ov.solo = soloI.checked ? st.activeId : null; renderLayers(); });
        const viewRow = el('div', { class: 'tcl-checks' },
            el('label', { title: '칠한 영역을 색으로 겹쳐 보기(흰 형태 · 빨강 덜어 냄 · 노랑 빛 · 파랑 음영)' }, maskI, ' 칠한 영역 표시 (V)'),
            el('label', { title: '선택한 레이어만 보이기(다른 오버레이 레이어 숨김)' }, soloI, ' 선택 레이어만'));

        // 레이어
        const list = el('div', { class: 'tcl-list', role: 'listbox', 'aria-label': '레이어' });
        const addB = el('button', { type: 'button', textContent: '+ 새 레이어' });
        const dupB = el('button', { type: 'button', textContent: '복제' });
        const delB = el('button', { type: 'button', textContent: '삭제' });
        const upB = el('button', { type: 'button', textContent: '▲', title: '같은 단 안에서 앞으로 (목록에서 끌어도 된다)' });
        const dnB = el('button', { type: 'button', textContent: '▼', title: '같은 단 안에서 뒤로' });
        const clrB = el('button', { type: 'button', textContent: '비우기', title: '형태·빛·음영을 모두 지운다(되돌리기 가능)' });
        addB.addEventListener('click', addLayer);
        dupB.addEventListener('click', dupLayer);
        delB.addEventListener('click', delLayer);
        upB.addEventListener('click', () => moveLayer(1));
        dnB.addEventListener('click', () => moveLayer(-1));
        clrB.addEventListener('click', clearLayer);
        const props = el('div', { class: 'tcl-props' });
        const propsEmpty = el('div', { class: 'tcl-hint', textContent: '레이어를 고르거나 새로 만드세요. 편집 중 빈 곳에 칠하면 자동으로 만든다.' });

        // 기록·파일
        const undoB = el('button', { type: 'button', textContent: '되돌리기', title: 'Ctrl+Z' });
        const redoB = el('button', { type: 'button', textContent: '다시 하기', title: 'Ctrl+Shift+Z / Ctrl+Y' });
        undoB.addEventListener('click', undo);
        redoB.addEventListener('click', redo);
        const fileI = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
        fileI.addEventListener('change', () => { if (fileI.files[0]) importJSON(fileI.files[0]); fileI.value = ''; });
        const btn = (t, f, title) => { const x = el('button', { type: 'button', textContent: t, title: title || '' }); x.addEventListener('click', f); return x; };

        const sec = (title, ...kids) => el('details', { open: true }, el('summary', { textContent: title }), el('div', { class: 'tcl-sec' }, ...kids));
        body.append(
            status,
            sec('도구', toolRow, toolHint, size.row, flow.row, hard.row, viewRow),
            sec('레이어', list, el('div', { class: 'tcl-btns' }, addB, dupB, delB, upB, dnB, clrB),
                el('div', { class: 'tcl-hint', textContent: '위 = 앞. 끌어 순서·단 바꾸기, 이름 두 번 클릭 = 이름 바꾸기, 눈 Alt+클릭 = 이것만 보기' })),
            sec('선택 레이어', propsEmpty, props),
            sec('기록 · 내보내기',
                el('div', { class: 'tcl-btns' }, undoB, redoB),
                el('div', { class: 'tcl-btns' },
                    btn('JSON 내보내기', exportJSON, '레이어 문서(day-overlay.json). public/clouds/에 두면 배포본이 읽는다'),
                    btn('JSON 가져오기', () => fileI.click()),
                    fileI),
                el('div', { class: 'tcl-btns' },
                    btn('PNG: 구름 전체', () => exportOverlayPNG(false), '보이는 구름 레이어 전부(기존 포함)를 투명 배경으로(현재 화면 크기 × dpr, 하늘 영역)'),
                    btn('PNG: 그린 레이어만', () => exportOverlayPNG(true), '손으로 그린 레이어만 투명 배경으로'),
                    btn('PNG: 장면 전체', exportScenePNG, '지금 보이는 장면 그대로')),
                el('div', { class: 'tcl-btns' },
                    btn('작업본 버리고 파일본 읽기', reloadFile, '이 브라우저 작업본(localStorage)을 지우고 public/' + CO.FILE + '로')),
                el('div', { class: 'tcl-hint', textContent: '고칠 때마다 이 브라우저에 자동 저장된다. 배포하려면 JSON을 내보내 public/' + CO.FILE + '에 덮어쓴다.' })),
        );
        panel.append(head, body);
        document.body.append(panel);
        buildProps(props);

        ui = { panel, body, edit, status, toolBtns, toolHint, size, flow, hard, list, props, propsEmpty, undo: undoB, redo: redoB, soloI, maskI, dupB, delB, upB, dnB, clrB };
        buildPad();

        edit.addEventListener('click', () => setEditing(!st.editing));
        close.addEventListener('click', closeP);
        fold.addEventListener('click', () => {
            const h = body.hidden = !body.hidden;
            fold.textContent = h ? '펼치기' : '접기';
            if (!h) renderThumbs();
        });
        dragPanel(panel, head);
        document.addEventListener('keydown', onKey, true);
        ov.on(what => { if (what === 'doc' && ui) { prevDirty = true; renderLayers(); renderProps(); renderStatus(); } });
        setInterval(() => { if (st.open) renderStatus(); }, 1500);
        // 썸네일: 구름이 끓으며 계속 바뀌므로 열려 있는 동안 1초마다, 칠하는 중엔 바뀐 것만 조금 더 자주
        setInterval(() => { if (st.open && (thumbsDirty || !stroke)) renderThumbs(); }, 1000);
        return true;
    }
    function dragPanel(panel, head) {
        let d = null;
        head.addEventListener('pointerdown', e => {
            if (e.target.closest('button')) return;
            const r = panel.getBoundingClientRect();
            d = { x: e.clientX - r.left, y: e.clientY - r.top };
            head.setPointerCapture(e.pointerId);
        });
        head.addEventListener('pointermove', e => {
            if (!d) return;
            panel.style.left = clamp(e.clientX - d.x, 0, window.innerWidth - 80) + 'px';
            panel.style.top = clamp(e.clientY - d.y, 0, window.innerHeight - 40) + 'px';
        });
        const up = () => { d = null; };
        head.addEventListener('pointerup', up);
        head.addEventListener('pointercancel', up);
    }
    function onKey(e) {
        if (!st.open) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && t.type !== 'checkbox' && t.type !== 'range') return;
        const k = e.key.toLowerCase();
        const mod = e.ctrlKey || e.metaKey;
        if (t && t.closest && t.closest('.tcl-list') && (k === 'arrowup' || k === 'arrowdown')) return;
        if (mod && k === 'z') { e.preventDefault(); e.stopPropagation(); (e.shiftKey ? redo : undo)(); return; }
        if (mod && k === 'y') { e.preventDefault(); e.stopPropagation(); redo(); return; }
        if (!st.editing || mod || e.altKey) return;
        if (k === 'escape') { setEditing(false); e.preventDefault(); return; }
        const T = TOOLS.find(x => x.key === k);
        if (T) { st.tool = T.id; saveUI(); renderTools(); e.preventDefault(); return; }
        if (k === '[' || k === ']') { st.size = clamp(st.size * (k === ']' ? 1.15 : 1 / 1.15), 0.005, 0.6); renderBrush(); saveUI(); e.preventDefault(); return; }
        if (k === 'v') { st.mask = !st.mask; ui.maskI.checked = st.mask; saveUI(); e.preventDefault(); return; }
        if (k === 'h') { ov.hideBase = !ov.hideBase; renderLayers(); e.preventDefault(); }
        if (k === 'n' && e.shiftKey) { addLayer(); e.preventDefault(); }
    }

    function openP() {
        if (!CO) { console.warn('cloud-overlay.js가 없어 구름 레이어 편집기를 열 수 없다'); return false; }
        if (!ui && !build()) { console.warn('장면 브리지(__TSUKUYOMI__.cloudOverlay)가 아직 없다'); return false; }
        st.open = true;
        ui.panel.hidden = false;
        if (!active() && layers().length) st.activeId = layers()[layers().length - 1].id;
        renderTools(); renderBrush(); renderLayers(); renderProps(); renderHistory(); renderStatus();
        return true;
    }
    function closeP() {
        if (!ui) return;
        setEditing(false);
        ov.solo = null; ov.hideBase = false;
        ui.soloI.checked = false;
        st.open = false;
        ui.panel.hidden = true;
    }

    window.TsukuyomiCloudLayers = {
        open: openP, close: closeP,
        toggle: () => (st.open ? closeP() : openP()),
        get isOpen() { return st.open; },
        get editing() { return st.editing; }, set editing(v) { if (ui) setEditing(v); },
    };
})();
