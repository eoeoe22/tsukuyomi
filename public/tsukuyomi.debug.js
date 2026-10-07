/* Tsukuyomi F12 debug panel.
 * 개발자도구(F12) 활성화 감지 시 모든 파라미터를 수동 조절하는 테스트 UI.
 * window.__TSUKUYOMI__ 브릿지(tsukuyomi.js)가 있어야 동작한다.
 */
(() => {
    'use strict';

    // ---------- DevTools 감지 + 패널 표시 ----------
    // 항상 숨김 정책: 어떤 자동 표시도 하지 않고 ` 또는 F12로만 호출한다.
    // (?debug=1 / localStorage / DevTools 도크 감지 / FAB에 의한 자동 표시 없음)
    let detectSrc = '';
    let panelVisible = false;

    // ---------- CFG 슬라이더 스키마 ----------
    // rebuild: 변경 후 호출할 액션 (resize는 별/구름/밴드까지 재계산)
    const GROUPS = [
        { title: '전환 타이밍', keys: [
            ['T_NIGHT', 1, 40, 0.1], ['T_DAY', 0.5, 10, 0.1], ['T_SUNSET', 1, 40, 0.1], ['TN_GAMMA', 0.5, 2.5, 0.05],
            ['TRAIL_LEN', 0, 2, 0.01],
            ['P_DAY', 0, 0.9, 0.005], ['P_DUSK', 0, 0.9, 0.005],
        ]},
        { title: '레이아웃', keys: [
            ['HZ_RATIO', 0.3, 0.8, 0.005, 'resize'], ['DPR_MAX', 1, 2, 0.25, 'resize'],
            ['PIX_BUDGET', 1000000, 12000000, 250000, 'resize'],
            ['POLE_X', 0, 1, 0.005, 'resize'], ['POLE_Y', 0, 1, 0.005, 'resize'],
            ['SUN_F', 0.005, 0.08, 0.001, 'resize'], ['SUN_MIN', 4, 30, 1, 'resize'], ['SUN_MAX', 10, 60, 1, 'resize'],
            ['MOON_F', 0.005, 0.07, 0.001, 'resize'], ['MOON_MIN', 4, 30, 1, 'resize'], ['MOON_MAX', 10, 60, 1, 'resize'],
        ]},
        { title: '토리이 / 달 (동일 수직선)', keys: [
            ['TORII_X', 0, 1, 0.005, 'resize'], ['TORII_BASE', 0, 1, 0.01, 'resize'],
            ['MOON_Y', 0, 1, 0.005], ['TORII_SCALE', 0.2, 2, 0.01, 'resize'],
        ]},
        { title: '별', keys: [
            ['W_SLOW', 0, 0.05, 0.0005],
            ['TRAIL_A0', 0, 1, 0.005], ['TRAIL_A1', 0, 1, 0.005],
            ['STAR_DENS', 500, 8000, 50, 'stars'], ['STAR_MAX', 100, 3000, 10, 'stars'],
            ['STAR_A0', 0, 1, 0.01], ['STAR_A1', 0, 1, 0.01],
        ]},
        { title: '산', keys: [
            ['MTN_SHOW', 0, 1, 1, 'mountains'],
            ['MTN_H', 0, 0.06, 0.001], ['MTN_MIN', 0, 20, 0.5], ['MTN_MAX', 4, 40, 0.5],
            ['MTN_TH', 0, 0.8, 0.005, 'mountains'], ['MTN_POW', 0.3, 3, 0.01, 'mountains'],
            ['MTN_W0', 0, 1, 0.01, 'mountains'], ['MTN_W1', 0, 1, 0.01, 'mountains'], ['MTN_W2', 0, 1, 0.01, 'mountains'],
        ]},
        { title: '구름', keys: [
            ['CLOUD_N', 0, 14, 1, 'clouds'], ['CLOUD_SP0', 0, 0.02, 0.0005, 'clouds'], ['CLOUD_SP1', 0, 0.02, 0.0005, 'clouds'],
            ['CLOUD_Y0', 0, 1, 0.01, 'clouds'], ['CLOUD_YR', 0, 0.6, 0.01, 'clouds'],
            ['CLOUD_X0', -1, 0.5, 0.01, 'clouds'], ['CLOUD_SPREAD', 0, 2.5, 0.01, 'clouds'],
            ['CLOUD_F0', 0, 1, 0.01], ['CLOUD_F1', 0, 1, 0.01],
            ['DC_SEED', 0, 50, 1, 'clouds'], ['DC_N', 0, 16, 1, 'clouds'],
            ['DC_Y0', 0.6, 1.1, 0.01, 'clouds'], ['DC_YR', 0, 0.3, 0.01, 'clouds'],
            ['DC_CB_N', 0, 6, 1, 'clouds'], ['DC_CB_S0', 0.3, 2.5, 0.01, 'clouds'], ['DC_CB_S1', 0.3, 2.5, 0.01, 'clouds'], ['DC_CB_SP', 0, 1.5, 0.05, 'clouds'],
            ['CLOUD_DOC', 0, 1, 1],
            ['CL_LIVE', 0, 1, 1, 'clouds'], ['CL_RATE', 0, 6, 0.05], ['CL_BOIL', 0, 4, 0.05], ['CL_WARP', 0, 3, 0.05], ['CL_RAND', 0, 3, 0.05], ['CL_HZ', 2, 30, 1], ['CL_UP', 0, 2, 0.05],
            ['BLOOM', 0, 2, 0.01], ['BLOOM_POW', 1, 16, 1], ['BLOOM_R', 0.002, 0.08, 0.001], ['BLOOM_WIDE', 0, 2, 0.01],
            ['DC_F0', 0.3, 1, 0.01], ['DC_F1', 0.3, 1, 0.01],
            ['DC_LX', -0.3, 1.2, 0.01], ['DC_LY', -0.6, 0.6, 0.01], ['DC_LIGHT', 0, 1.5, 0.01],
            ['DC_COV', 0.2, 0.8, 0.01, 'clouds'], ['DC_SHARP', 0.01, 0.3, 0.005, 'clouds'], ['DC_SOFT', 0.05, 0.6, 0.01, 'clouds'],
            ['DC_SCALE', 2, 12, 0.1, 'clouds'], ['DC_ABSORB', 0.2, 4, 0.05, 'clouds'], ['DC_SUN', 20, 160, 1, 'clouds'],
            ['DC_VLIFT', 0, 0.4, 0.01, 'clouds'], ['DC_SKYBOT', 0.3, 1, 0.01, 'clouds'], ['DC_UPK', 0, 2, 0.05, 'clouds'],
            ['DC_LOBE', 0, 1, 0.01, 'clouds'], ['DC_CREASE', 0.2, 1, 0.01, 'clouds'], ['DC_LOBE_W', 0.3, 1.5, 0.01, 'clouds'], ['DC_BAND_LOBE', 0, 1, 0.01, 'clouds'],
            ['DC_CB_SUN', 20, 160, 1, 'clouds'], ['DC_CB_SCALE', 2, 12, 0.1, 'clouds'], ['DC_CB_ABSORB', 0.2, 4, 0.05, 'clouds'],
            ['DC_CB_RIMK', 0, 1.2, 0.01, 'clouds'], ['DC_CB_RS', 0.5, 1, 0.05, 'clouds'],
        ]},
        { title: '새 낮 (day-empty-ref)', keys: [
            ['DAY_SCENE', 0, 1, 1],
            ['DY_SEED', 0, 50, 1, 'clouds'], ['DY_BAND_N', 0, 14, 1, 'clouds'], ['DY_SP', 0, 0.02, 0.0005, 'clouds'],
            ['DY_COV', 0.2, 0.8, 0.01, 'clouds'], ['DY_SCALE', 2, 12, 0.1, 'clouds'], ['DY_ABSORB', 0.2, 4, 0.05, 'clouds'],
            ['DY_VLIFT', 0, 0.35, 0.01, 'clouds'], ['DY_SKYBOT', 0.5, 1, 0.01, 'clouds'], ['DY_UPK', 0, 2, 0.05, 'clouds'],
            ['DY_SWAY', 0, 0.05, 0.001],
            ['DY_LX', 0, 1, 0.005], ['DY_LY', -0.2, 1, 0.005], ['DY_LIGHT', 0, 1.5, 0.01], ['DY_RIMBOT', 0.35, 0.9, 0.01],
            ['DY_GLOW_R', 0.2, 2.5, 0.01], ['DY_GLOW_CORE', 0, 2.5, 0.01], ['DY_GLOW_A', 0, 2, 0.01],
            ['DY_F0', 0, 1, 0.01], ['DY_F1', 0, 1, 0.01],
            ['DY_STAR_A', 0, 1.5, 0.01], ['DY_GLINT_N', 0, 1200, 10, 'clouds'], ['DY_GLINT_A', 0, 2, 0.01],
            ['DY_WATER', 0, 1, 0.01], ['DY_COLUMN', 0, 2, 0.01],
            ['DY_HOLE', 0, 1, 0.05, 'clouds'], ['DY_HOLE_S', 0.3, 2.5, 0.05, 'clouds'], ['DY_HOLE_N', 0, 8, 1, 'clouds'],
            ['DY_HOLE_EDGE', 0, 2, 0.05, 'clouds'], ['DY_HOLE_RIM', 0, 1.5, 0.05, 'clouds'], ['DY_HOLE_SKY', 0, 1.5, 0.05, 'clouds'],
        ]},
        { title: '태양', keys: [
            ['SUN_PATH', 0.1, 1, 0.005], ['SUN_X0', 0, 1, 0.005], ['SUN_X1', 0, 1, 0.005],
            ['SUN_DROP', 0, 5, 0.05], ['SUN_F0', 0, 1, 0.005], ['SUN_F1', 0, 1, 0.005],
            ['SUN_G0', 0, 1, 0.005], ['SUN_G1', 0, 1, 0.005], ['SUN_G2', 0, 1, 0.005], ['SUN_G3', 0, 1, 0.005],
        ]},
        { title: '달 / 안개', keys: [
            ['MOON_A0', 0, 1, 0.005], ['MOON_A1', 0, 1, 0.005],
            ['MOON_GLOW', 2, 16, 0.1], ['MOON_A', 0, 1, 0.005],
            ['MOON_SIZE', 0.2, 3, 0.05, 'resize'],
            ['HAZE_MIX', 0, 1, 0.005], ['HAZE_A', 0, 1, 0.005],
        ]},
        { title: '반사', keys: [
            ['BAND_PAD', 0, 40, 1, 'resize'], ['BLUR_PX', 0, 10, 0.1], ['BAND_H', 0, 0.6, 0.01, 'resize'],
            ['REFL_AMP0', 0, 1, 0.01], ['REFL_AMP1', 0, 6, 0.05],
            ['SL_F0', 0, 0.5, 0.001], ['SL_F1', 0, 3, 0.01], ['SL_F2', 0, 0.2, 0.001], ['SL_F3', 0, 3, 0.01],
            ['ROW_STEP', 1, 8, 1], ['SEAM_A', 0, 1, 0.005],
            ['REFL_SCALE', 0.25, 1, 0.05], ['REFL_MAX_STEP', 2, 8, 1], ['REFL_AUTO', 0, 1, 1],
            ['BAND_EVERY', 1, 8, 1],
        ]},
        { title: '물결', keys: [
            ['RIP_MAX', 1, 8, 1], ['RIP_V', 0.05, 1.5, 0.005],
            ['RIP_MAX_R', 0.2, 2, 0.005], ['RIP_K', 10, 200, 1],
            ['RIP_STR', 0, 0.15, 0.001], ['FOCAL', 0.3, 2, 0.01],
        ]},
        { title: '랜턴', keys: [
            ['LANTERN_N', 0, 400, 1, 'lanterns'], ['LANTERN_SEED', 0, 99, 1, 'lanterns'],
            ['LANTERN_GX', 0.05, 0.6, 0.01, 'lanterns'], ['LANTERN_TX', 0.15, 1, 0.01, 'lanterns'],
            ['LANTERN_SN0', 0.02, 0.5, 0.01, 'lanterns'],
            ['LANTERN_SN1', 0.4, 1, 0.01, 'lanterns'], ['LANTERN_H', 0.15, 1.2, 0.01, 'lanterns'],
            ['LANTERN_PAD', 0, 6, 0.5, 'lanterns'],
            ['LANTERN_CARD_AVOID', 0, 1, 1, 'lanterns'],
            ['LANTERN_DEPTH_K', 0, 3.5, 0.05, 'lanterns'],
            ['LANTERN_FAR_MUL', 0, 4, 0.05, 'lanterns'], ['LANTERN_FAR_Y0', 0.5, 12, 0.5, 'lanterns'],
            ['LANTERN_FAR_MAX', 0, 8000, 100, 'lanterns'],
            ['LANTERN_GLOW', 0, 1.5, 0.01], ['LANTERN_POOL', 0, 1, 0.01],
            ['LANTERN_DUSK_GLOW', 0, 1, 0.01], ['LANTERN_HALO', 0, 3, 0.05],
            ['LANTERN_FAR_BLOOM', 0, 3, 0.05],
        ]},
    ];
    const PALETTES = ['SKY', 'SKY_DAY', 'SKY_DAY2', 'MOUNT', 'MOUNT_DAY2', 'TORII', 'TORII_DAY2', 'CLOUD_TINT', 'DCLOUD_TINT', 'DAY2_TINT', 'REFL', 'REFL_DAY2', 'VIG', 'VIG_DAY2', 'LV', 'COLS'];

    const fmt = v => {
        if (!isFinite(v)) return String(v);
        const s = Number(v).toFixed(4);
        return s.replace(/\.?0+$/, '') || '0';
    };

    function bridge() { return window.__TSUKUYOMI__ || null; }
    function waitBridge(cb) {
        let n = 0;
        const t = setInterval(() => {
            if (bridge() || ++n > 100) { clearInterval(t); cb(bridge()); }
        }, 50);
    }

    // ---------- DOM ----------
    const panel = document.createElement('div');
    panel.id = 'tsd';
    panel.className = 'tsd-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Tsukuyomi 파라미터 테스트 패널');
    panel.innerHTML =
        '<div class="tsd-head">' +
        '<span class="tsd-dot off" id="tsdDot"></span>' +
        '<strong>TSUKUYOMI DEBUG</strong>' +
        '<span class="tsd-src" id="tsdSrc"></span>' +
        '<button type="button" data-act="collapse" title="접기/펼치기">접기</button>' +
        '<button type="button" data-act="close" title="패널 닫기">닫기</button>' +
        '</div>' +
        '<div class="tsd-body" id="tsdBody">' +
        '<div class="tsd-status" id="tsdStatus">bridge 대기 중…</div>' +
        '<details open><summary>장면 상태 (수동 스크럽)</summary><div class="tsd-sec" id="tsdScene"></div></details>' +
        '<details><summary>미러볼 (달)</summary><div class="tsd-sec" id="tsdMirror"></div></details>' +
        '<div id="tsdGroups"></div>' +
        '<details><summary>팔레트 (색/레벨 JSON)</summary><div class="tsd-sec" id="tsdPal"></div></details>' +
        '<details><summary>가져오기 / 내보내기</summary><div class="tsd-sec" id="tsdIO"></div></details>' +
        '</div>';

    const fab = document.createElement('button');
    fab.id = 'tsdFab';
    fab.type = 'button';
    fab.textContent = 'DEBUG';
    fab.title = '디버그 패널 열기 (` 또는 ?debug=1 로 항상 표시 가능)';
    fab.hidden = true;

    function show(src) {
        if (src) detectSrc = src;
        panel.hidden = false;
        // 항상 숨김 정책: 닫은 뒤에도 FAB을 띄우지 않는다 (`/F12로만 호출).
        fab.hidden = true;
        panelVisible = true;
        renderSrc();
    }
    function hide() {
        panel.hidden = true;
        // 항상 숨김 정책: FAB도 함께 숨긴다.
        fab.hidden = true;
        panelVisible = false;
        detectSrc = '';
        renderSrc();
    }

    function renderSrc() {
        const el = document.getElementById('tsdSrc');
        const dot = document.getElementById('tsdDot');
        if (!el || !dot) return;
        el.textContent = detectSrc ? ('감지: ' + detectSrc) : '숨김 상태 (`/F12)';
        dot.className = 'tsd-dot off';
    }

    // ---------- 장면 상태 섹션 ----------
    function buildScene(b) {
        const host = document.getElementById('tsdScene');
        host.innerHTML = '';
        const hint = document.createElement('div');
        hint.className = 'tsd-hint';
        hint.textContent = 'p 슬라이더를 움직이면 자동 진행이 멈춤(hold) 상태가 된다. 되돌리려면 hold를 끄거나 장면 버튼을 누른다.';
        host.appendChild(hint);

        // p scrub
        const pRow = document.createElement('div');
        pRow.className = 'tsd-row';
        pRow.innerHTML = '<label title="scene progress 0..1">p (장면진행)</label>';
        const pRange = document.createElement('input');
        pRange.type = 'range'; pRange.min = '0'; pRange.max = '1'; pRange.step = '0.001'; pRange.value = String(b.p);
        const pNum = document.createElement('input');
        pNum.type = 'number'; pNum.min = '0'; pNum.max = '1'; pNum.step = '0.001'; pNum.value = String(b.p);
        pRow.appendChild(pRange); pRow.appendChild(pNum);
        host.appendChild(pRow);
        const setP = v => {
            v = Math.min(1, Math.max(0, Number(v) || 0));
            b.p = v; b.hold = true;
            syncHoldChk();
            pRange.value = String(v); pNum.value = String(v);
        };
        pRange.addEventListener('input', () => setP(pRange.value));
        pNum.addEventListener('change', () => setP(pNum.value));
        host._pRange = pRange; host._pNum = pNum;

        // hold / paused
        const holdLbl = document.createElement('label');
        holdLbl.className = 'tsd-check';
        const holdChk = document.createElement('input');
        holdChk.type = 'checkbox'; holdChk.checked = !!b.hold;
        holdLbl.appendChild(holdChk);
        holdLbl.appendChild(document.createTextNode('hold — p 자동 진행 멈춤 (수동 스크럽용)'));
        host.appendChild(holdLbl);
        holdChk.addEventListener('change', () => { b.hold = holdChk.checked; });
        const pauseLbl = document.createElement('label');
        pauseLbl.className = 'tsd-check';
        const pauseChk = document.createElement('input');
        pauseChk.type = 'checkbox'; pauseChk.checked = !!b.paused;
        pauseLbl.appendChild(pauseChk);
        pauseLbl.appendChild(document.createTextNode('paused — 시간 전체 정지 (렌더는 계속)'));
        host.appendChild(pauseLbl);
        pauseChk.addEventListener('change', () => { b.paused = pauseChk.checked; });
        function syncHoldChk() { holdChk.checked = !!b.hold; }
        host._syncHold = syncHoldChk;
        host._syncPaused = () => { pauseChk.checked = !!b.paused; };

        // state buttons
        const btns = document.createElement('div');
        btns.className = 'tsd-btnrow';
        const states = ['day', 'dusk', 'toNight', 'night', 'toDay', 'toDusk'];
        for (const s of states) {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.textContent = s; btn.dataset.state = s;
            btn.addEventListener('click', () => {
                b.state = s; b.hold = false;
                syncHoldChk(); syncSceneUI();
            });
            btns.appendChild(btn);
        }
        const goNight = document.createElement('button');
        goNight.type = 'button'; goNight.textContent = '해 지게 하기 ▶';
        goNight.addEventListener('click', () => { b.actions.toNight(); b.hold = false; syncHoldChk(); });
        btns.appendChild(goNight);
        const goDusk = document.createElement('button');
        goDusk.type = 'button'; goDusk.textContent = '◀ 황혼으로';
        goDusk.addEventListener('click', () => { b.actions.toDusk(); b.hold = false; syncHoldChk(); });
        btns.appendChild(goDusk);
        const goDay = document.createElement('button');
        goDay.type = 'button'; goDay.textContent = '◀ 낮으로';
        goDay.addEventListener('click', () => { b.actions.toDay(); b.hold = false; syncHoldChk(); });
        btns.appendChild(goDay);
        host.appendChild(btns);

        // phi
        const phiRow = document.createElement('div');
        phiRow.className = 'tsd-row';
        phiRow.innerHTML = '<label title="star rotation angle (rad)">phi (회전각)</label>';
        const phiNum = document.createElement('input');
        phiNum.type = 'number'; phiNum.step = '0.01'; phiNum.value = fmt(b.phi);
        phiRow.appendChild(phiNum);
        const phiZero = document.createElement('button');
        phiZero.type = 'button'; phiZero.textContent = '0으로';
        phiZero.addEventListener('click', () => { b.phi = 0; b.phiTail = null; phiNum.value = '0'; });
        const phiWrap = document.createElement('div');
        phiWrap.appendChild(phiNum);
        phiRow.appendChild(phiZero);
        host.appendChild(phiRow);
        phiNum.addEventListener('change', () => { b.phi = Number(phiNum.value) || 0; });
        host._phiNum = phiNum;

        // ripple test
        const ripRow = document.createElement('div');
        ripRow.className = 'tsd-btnrow';
        const mkRip = (label, fn) => {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.textContent = label;
            btn.addEventListener('click', fn);
            ripRow.appendChild(btn);
        };
        mkRip('물결: 중앙', () => b.actions.ripple(0.5, 0.55));
        mkRip('물결: 랜덤 3개', () => {
            for (let i = 0; i < 3; i++) b.actions.ripple(0.2 + Math.random() * 0.6, 0.3 + Math.random() * 0.6);
        });
        mkRip('물결 지우기', () => b.actions.clearRipples());
        mkRip('별 재생성', () => b.actions.buildStars());
        mkRip('산 재생성', () => b.actions.buildMountains());
        mkRip('구름 재생성', () => b.actions.buildClouds());
        mkRip('랜턴 재생성', () => b.actions.buildLanterns());
        mkRip('리사이즈', () => b.actions.resize());
        mkRip('전체 리셋', () => {
            b.actions.reset();
            refreshAll();
        });
        host.appendChild(ripRow);
    }

    function syncSceneUI() {
        const b = bridge(); if (!b) return;
        const host = document.getElementById('tsdScene'); if (!host) return;
        if (host._pRange && document.activeElement !== host._pRange) host._pRange.value = String(b.p);
        if (host._pNum && document.activeElement !== host._pNum) host._pNum.value = String(b.p);
        if (host._phiNum && document.activeElement !== host._phiNum) host._phiNum.value = fmt(b.phi);
        if (host._syncHold) host._syncHold();
        if (host._syncPaused) host._syncPaused();
    }

    // ---------- CFG 그룹 ----------
    const rowRefs = [];
    // 슬라이더 드래그 중 input 이벤트가 60Hz로 들어오면 rebuild(resize/stars/clouds 등)가
    // 매 틱마다 동기 실행되어 프레임이 끊긴다. trailing debounce로 합친다.
    function makeRebuildScheduler(b) {
        let t = 0;
        const pending = new Set();
        return (kind) => {
            if (!kind) return;
            pending.add(kind);
            clearTimeout(t);
            t = setTimeout(() => {
                const kinds = [...pending];
                pending.clear();
                // resize가 stars/projectLanterns를 포함하므로 stars는 중복 실행하지 않음
                if (kinds.includes('resize')) b.actions.resize();
                else if (kinds.includes('stars')) b.actions.buildStars();
                if (kinds.includes('mountains')) b.actions.buildMountains();
                if (kinds.includes('clouds')) b.actions.buildClouds();
                if (kinds.includes('lanterns')) b.actions.buildLanterns();
            }, 120);
        };
    }
    let scheduleRebuild = null;
    function buildGroups(b) {
        scheduleRebuild = makeRebuildScheduler(b);
        const host = document.getElementById('tsdGroups');
        host.innerHTML = '';
        rowRefs.length = 0;
        for (const g of GROUPS) {
            const det = document.createElement('details');
            const sum = document.createElement('summary');
            sum.textContent = g.title;
            det.appendChild(sum);
            const sec = document.createElement('div');
            sec.className = 'tsd-sec';
            // 구름 탭 맨 위: 브러시 구름 편집기(tsukuyomi.cloudedit.js)
            if (g.title === '구름' && window.TsukuyomiCloudEdit) {
                const ed = document.createElement('details');
                ed.className = 'tsce';
                const es = document.createElement('summary');
                es.textContent = '브러시 구름 편집 (황혼 / 낮)';
                const eh = document.createElement('div');
                eh.className = 'tsd-sec';
                ed.appendChild(es); ed.appendChild(eh);
                sec.appendChild(ed);
                try { window.TsukuyomiCloudEdit.mount(eh, b); }
                catch (e) { console.error(e); eh.textContent = '편집기 초기화 실패: ' + e.message; }
            }
            for (const [key, min, max, step, rebuild] of g.keys) {
                if (!(key in b.cfg)) continue;
                const row = document.createElement('div');
                row.className = 'tsd-row';
                const lab = document.createElement('label');
                lab.textContent = key === 'W_SLOW' ? 'W_SLOW (전환완료 후 저속)' : key;
                lab.title = key === 'W_SLOW'
                    ? '전환 완료(night) 후 별 회전각속도 rad/s — 기본값 ' + fmt(b.defaults[key])
                    : '기본값 ' + fmt(b.defaults[key]);
                const range = document.createElement('input');
                range.type = 'range';
                range.min = String(min); range.max = String(max); range.step = String(step);
                range.value = String(b.cfg[key]);
                const num = document.createElement('input');
                num.type = 'number';
                num.min = String(min); num.max = String(max); num.step = String(step);
                num.value = String(b.cfg[key]);
                const apply = (v, from) => {
                    let n = Number(v);
                    if (!isFinite(n)) return;
                    b.cfg[key] = n;
                    if (from !== range) range.value = String(Math.min(max, Math.max(min, n)));
                    if (from !== num) num.value = String(n);
                    // rebuild는 debounce: 드래그 중에는 CFG만 바꾸고 무거운 재계산은 뒤로 미룸
                    if (rebuild) scheduleRebuild(rebuild);
                };
                range.addEventListener('input', () => apply(range.value, range));
                num.addEventListener('change', () => apply(num.value, num));
                row.appendChild(lab); row.appendChild(range); row.appendChild(num);
                sec.appendChild(row);
                rowRefs.push({ key, range, num, min, max });
            }
            det.appendChild(sec);
            host.appendChild(det);
        }
    }

    function refreshAll() {
        const b = bridge(); if (!b) return;
        for (const r of rowRefs) {
            r.range.value = String(b.cfg[r.key]);
            r.num.value = String(b.cfg[r.key]);
        }
        syncSceneUI();
        refreshMirror(b);
        buildPaletteEditors(b, true);
    }

    // ---------- 미러볼 (미러볼 SVG 생성기 파라미터 이식) ----------
    // rebuild 'build' = 타일 토폴로지 재생성(mbBuild), 그 외는 본체 캐시 무효화(mbTouch).
    const MB_GROUPS = [
        { title: '타일 배치', keys: [
            ['tilt', -90, 90, 1], ['step', 3, 15, 0.5, 'build'], ['gap', 0.02, 0.4, 0.01],
            ['jit', 0, 0.2, 0.005, 'build'], ['off', 0, 1, 0.05, 'build'],
        ]},
        { title: '반사·발광', keys: [
            ['pole', 0, 3, 0.05], ['poleR', 0, 90, 1], ['veil', 0, 1.5, 0.05],
            ['veilR', 0.05, 1, 0.01], ['haze', 0, 0.6, 0.01], ['bloom', 0, 1, 0.05],
        ]},
        { title: '상부 타일 질감', keys: [
            ['teal', 0, 1, 0.01], ['tjit', 0, 0.5, 0.01], ['sheen', 0, 1.5, 0.05],
        ]},
        { title: '줄눈 빛줄기', keys: [
            ['glint', 0, 2, 0.05], ['gcount', 1, 12, 1], ['gturn', 0, 1, 0.01],
            ['gspd', 0.3, 2.5, 0.05], ['ghold', 0, 1.5, 0.01], ['gacc', 0, 0.6, 0.01], ['gwhite', 0.3, 1, 0.01],
        ]},
    ];
    const MB_COLORS = [
        ['tile', '타일'], ['grout', '줄눈'], ['dark', '반사 어둠'], ['light', '반사 밝음'], ['glowC', '발광'],
    ];
    const mbRowRefs = [];
    function mbNumRow(host, b, key, min, max, step, rebuild) {
        const row = document.createElement('div');
        row.className = 'tsd-row';
        const lab = document.createElement('label');
        lab.textContent = key;
        lab.title = '기본값 ' + fmt(b.mbDefaults[key]);
        const range = document.createElement('input');
        range.type = 'range';
        range.min = String(min); range.max = String(max); range.step = String(step);
        range.value = String(b.mb[key]);
        const num = document.createElement('input');
        num.type = 'number';
        num.min = String(min); num.max = String(max); num.step = String(step);
        num.value = String(b.mb[key]);
        const apply = (v, from) => {
            const n = Number(v);
            if (!isFinite(n)) return;
            b.mb[key] = n;
            if (from !== range) range.value = String(Math.min(max, Math.max(min, n)));
            if (from !== num) num.value = String(n);
            if (rebuild) b.actions.mbBuild(); else b.actions.mbTouch();
        };
        range.addEventListener('input', () => apply(range.value, range));
        num.addEventListener('change', () => apply(num.value, num));
        row.appendChild(lab); row.appendChild(range); row.appendChild(num);
        host.appendChild(row);
        mbRowRefs.push({ key, range, num, kind: 'num' });
    }
    function buildMirror(b) {
        if (!b.mb) return;
        const host = document.getElementById('tsdMirror');
        host.innerHTML = '';
        mbRowRefs.length = 0;
        for (const g of MB_GROUPS) {
            const sub = document.createElement('div');
            sub.className = 'tsd-sub';
            sub.textContent = g.title;
            host.appendChild(sub);
            for (const [key, min, max, step, rebuild] of g.keys) mbNumRow(host, b, key, min, max, step, rebuild);
        }
        // 색상 5종 (생성기와 동일)
        const csub = document.createElement('div');
        csub.className = 'tsd-sub';
        csub.textContent = '색상';
        host.appendChild(csub);
        for (const [key, label] of MB_COLORS) {
            const row = document.createElement('div');
            row.className = 'tsd-row';
            const lab = document.createElement('label');
            lab.textContent = label + ' (' + key + ')';
            lab.title = '기본값 ' + b.mbDefaults[key];
            const col = document.createElement('input');
            col.type = 'color';
            col.value = b.mb[key];
            const hex = document.createElement('input');
            hex.type = 'text';
            hex.value = b.mb[key];
            hex.spellcheck = false;
            col.addEventListener('input', () => {
                b.mb[key] = col.value; hex.value = col.value;
                b.actions.mbTouch();
            });
            hex.addEventListener('change', () => {
                let v = hex.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    b.mb[key] = v.toLowerCase(); col.value = b.mb[key];
                    b.actions.mbTouch();
                } else hex.value = b.mb[key];
            });
            row.appendChild(lab); row.appendChild(col); row.appendChild(hex);
            host.appendChild(row);
            mbRowRefs.push({ key, range: col, num: hex, kind: 'color' });
        }
        // 시드
        const ssub = document.createElement('div');
        ssub.className = 'tsd-sub';
        ssub.textContent = '시드·회전·발사';
        host.appendChild(ssub);
        const srow = document.createElement('div');
        srow.className = 'tsd-row';
        const slab = document.createElement('label');
        slab.textContent = 'seed';
        slab.title = '기본값 ' + fmt(b.mbDefaults.seed);
        const snum = document.createElement('input');
        snum.type = 'number';
        snum.min = '0'; snum.max = '999999'; snum.step = '1';
        snum.value = String(b.mb.seed);
        const reroll = document.createElement('button');
        reroll.type = 'button'; reroll.textContent = '다시 생성';
        const applySeed = v => {
            const n = Math.max(0, Math.round(Number(v) || 0));
            b.mb.seed = n; snum.value = String(n);
            b.actions.mbBuild();
        };
        snum.addEventListener('change', () => applySeed(snum.value));
        reroll.addEventListener('click', () => applySeed(Math.floor(Math.random() * 100000)));
        srow.appendChild(slab); srow.appendChild(snum); srow.appendChild(reroll);
        host.appendChild(srow);
        mbRowRefs.push({ key: 'seed', range: snum, num: snum, kind: 'seed' });
        // 회전각 + 자전 토글
        const rrow = document.createElement('div');
        rrow.className = 'tsd-row';
        const rlab = document.createElement('label');
        rlab.textContent = '회전각 (rot)';
        rlab.title = '현재 자전 각도 0..359';
        const rrange = document.createElement('input');
        rrange.type = 'range';
        rrange.min = '0'; rrange.max = '359'; rrange.step = '1';
        rrange.value = String(Math.round(b.mbRot || 0));
        const rnum = document.createElement('input');
        rnum.type = 'number';
        rnum.min = '0'; rnum.max = '359'; rnum.step = '1';
        rnum.value = String(Math.round(b.mbRot || 0));
        const applyRot = v => {
            b.mbRot = v;
            rrange.value = String(Math.round(b.mbRot)); rnum.value = String(Math.round(b.mbRot));
        };
        rrange.addEventListener('input', () => applyRot(rrange.value));
        rnum.addEventListener('change', () => applyRot(rnum.value));
        rrow.appendChild(rlab); rrow.appendChild(rrange); rrow.appendChild(rnum);
        host.appendChild(rrow);
        mbRowRefs.push({ key: '__rot', range: rrange, num: rnum, kind: 'rot' });
        const spinLbl = document.createElement('label');
        spinLbl.className = 'tsd-check';
        const spinChk = document.createElement('input');
        spinChk.type = 'checkbox'; spinChk.checked = !!b.mbSpin;
        spinLbl.appendChild(spinChk);
        spinLbl.appendChild(document.createTextNode('자전 (40초/회)'));
        host.appendChild(spinLbl);
        spinChk.addEventListener('change', () => { b.mbSpin = spinChk.checked; });
        host._spinChk = spinChk;
        // 발사 / 리셋
        const brow = document.createElement('div');
        brow.className = 'tsd-btnrow';
        const mkBtn = (label, fn) => {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.textContent = label;
            btn.addEventListener('click', fn);
            brow.appendChild(btn);
        };
        mkBtn('빛줄기 발사', () => b.actions.mirrorburst());
        mkBtn('미러볼 리셋', () => {
            Object.assign(b.mb, JSON.parse(JSON.stringify(b.mbDefaults)));
            b.mbSpin = true;
            b.actions.mbBuild();
            refreshMirror(b);
        });
        host.appendChild(brow);
    }
    function refreshMirror(b) {
        if (!b.mb) return;
        const host = document.getElementById('tsdMirror');
        if (!host || !host.firstChild) return;
        for (const r of mbRowRefs) {
            if (r.kind === 'rot') {
                // 자전 중에는 슬라이더를 덮어쓰지 않는다 (드래그와 충돌)
                continue;
            }
            if (r.kind === 'color') {
                if (document.activeElement !== r.num) r.num.value = b.mb[r.key];
                if (document.activeElement !== r.range) r.range.value = b.mb[r.key];
                continue;
            }
            if (document.activeElement !== r.range) r.range.value = String(b.mb[r.key]);
            if (r.num !== r.range && document.activeElement !== r.num) r.num.value = String(b.mb[r.key]);
        }
        if (host._spinChk) host._spinChk.checked = !!b.mbSpin;
    }

    // ---------- 팔레트 ----------
    let palDefaults = null;
    function buildPaletteEditors(b, refreshOnly) {
        const host = document.getElementById('tsdPal');
        if (!palDefaults) palDefaults = JSON.parse(JSON.stringify(b.palettes));
        if (refreshOnly && host.dataset.built === '1') {
            for (const name of PALETTES) {
                const ta = host.querySelector('textarea[data-pal="' + name + '"]');
                if (ta && document.activeElement !== ta) ta.value = JSON.stringify(b.palettes[name]);
            }
            return;
        }
        host.innerHTML = '';
        host.dataset.built = '1';
        const hint = document.createElement('div');
        hint.className = 'tsd-hint';
        hint.textContent = 'JSON 배열로 직접 수정 후 적용. 잘못된 JSON은 적용되지 않는다.';
        host.appendChild(hint);
        for (const name of PALETTES) {
            const det = document.createElement('details');
            const sum = document.createElement('summary');
            sum.textContent = name;
            det.appendChild(sum);
            const ta = document.createElement('textarea');
            ta.dataset.pal = name;
            ta.value = JSON.stringify(b.palettes[name]);
            ta.spellcheck = false;
            const err = document.createElement('div');
            err.className = 'tsd-err';
            const row = document.createElement('div');
            row.className = 'tsd-btnrow';
            const ap = document.createElement('button');
            ap.type = 'button'; ap.textContent = '적용';
            ap.addEventListener('click', () => {
                try {
                    const v = JSON.parse(ta.value);
                    b.setPalette(name, v);
                    err.textContent = '';
                } catch (e) { err.textContent = 'JSON 오류: ' + e.message; }
            });
            const rs = document.createElement('button');
            rs.type = 'button'; rs.textContent = '리셋';
            rs.addEventListener('click', () => {
                b.setPalette(name, palDefaults[name]);
                ta.value = JSON.stringify(palDefaults[name]);
                err.textContent = '';
            });
            row.appendChild(ap); row.appendChild(rs);
            det.appendChild(ta); det.appendChild(err); det.appendChild(row);
            host.appendChild(det);
        }
    }

    // ---------- IO ----------
    function buildIO(b) {
        const host = document.getElementById('tsdIO');
        host.innerHTML = '';
        const ta = document.createElement('textarea');
        ta.id = 'tsdIOText';
        ta.placeholder = '내보내기 결과가 여기에 표시된다. JSON을 붙여넣고 가져오기로 적용.';
        ta.spellcheck = false;
        const err = document.createElement('div');
        err.className = 'tsd-err';
        const row = document.createElement('div');
        row.className = 'tsd-btnrow';
        const exp = document.createElement('button');
        exp.type = 'button'; exp.textContent = '내보내기';
        exp.addEventListener('click', () => {
            const snap = {
                cfg: b.cfg,
                mb: b.mb ? JSON.parse(JSON.stringify(b.mb)) : undefined,
                palettes: b.palettes,
                scene: { state: b.state, mode: b.mode, p: b.p, phi: b.phi, hold: b.hold, paused: b.paused, nk: b.sunK },
            };
            ta.value = JSON.stringify(snap, null, 1);
            err.textContent = '';
            try {
                if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
            } catch (e) { /* clipboard는 보조 수단 */ }
        });
        const imp = document.createElement('button');
        imp.type = 'button'; imp.textContent = '가져오기(적용)';
        imp.addEventListener('click', () => {
            try {
                const snap = JSON.parse(ta.value);
                if (snap.cfg) {
                    // 구버전 키 호환: MOON_X1이 있으면 공유축 TORII_X로 이관 후 제거
                    if (snap.cfg.MOON_X1 !== undefined && snap.cfg.TORII_X === undefined) snap.cfg.TORII_X = snap.cfg.MOON_X1;
                    Object.assign(b.cfg, snap.cfg);
                    delete b.cfg.MOON_X0; delete b.cfg.MOON_X1;
                    delete b.cfg.W_FAST; delete b.cfg.DECAY; delete b.cfg.FAST_HOLD;
                }
                if (snap.palettes) for (const k of Object.keys(snap.palettes)) {
                    try { b.setPalette(k, snap.palettes[k]); } catch (e) { /* 개별 실패 무시 */ }
                }
                if (snap.mb && b.mb) {
                    Object.assign(b.mb, snap.mb);
                    b.actions.mbBuild();
                }
                if (snap.scene) {
                    // p/nk를 state보다 먼저 복원: 전이 상태 세터가 transFrom/nkFrom을 올바르게 캡처한다.
                    // (idle/night 세터는 p/nk를 덮어쓰므로 순서 무관)
                    if (isFinite(snap.scene.p)) b.p = snap.scene.p;
                    if (isFinite(snap.scene.nk)) b.nk = snap.scene.nk;
                    if (typeof snap.scene.state === 'string') b.state = snap.scene.state;
                    if (isFinite(snap.scene.phi)) b.phi = snap.scene.phi;
                    if (typeof snap.scene.hold === 'boolean') b.hold = snap.scene.hold;
                    if (typeof snap.scene.paused === 'boolean') b.paused = snap.scene.paused;
                }
                b.actions.resize();
                refreshAll();
                err.textContent = '';
            } catch (e) { err.textContent = 'JSON 오류: ' + e.message; }
        });
        row.appendChild(exp); row.appendChild(imp);
        host.appendChild(ta); host.appendChild(err); host.appendChild(row);
    }

    // ---------- 상태 읽기 ----------
    function tickStatus() {
        const b = bridge();
        const el = document.getElementById('tsdStatus');
        if (!el) return;
        if (!b) { el.textContent = 'bridge 없음: tsukuyomi.js가 먼저 로드되어야 한다.'; return; }
        el.textContent =
            'state=' + b.state + '  mode=' + b.mode + '  p=' + fmt(b.p) +
            (b.q !== undefined ? '  q=' + fmt(b.q) : '') +
            (b.duskW !== undefined ? '  duskW=' + fmt(b.duskW) : '') +
            '\nphi=' + fmt(b.phi) + '  omega=' + fmt(b.omega) +
            '  clock=' + fmt(b.clock) +
            '\nhold=' + (b.hold ? 'on' : 'off') + '  paused=' + (b.paused ? 'on' : 'off') +
            '\nlanterns=' + (b.lanterns ? b.lanterns.length : 0) + '  lanReady=' + (b.lanReady ? 'yes' : 'no') +
            '  lanCached=' + (b.lanCached ? 'yes' : 'no') +
            '\nreflStep=' + b.reflStep + '  reflCost=' + fmt(b.reflCost) + 'ms' +
            '  tor=' + b.torBuilds + '  band=' + b.bandBuilds +
            (b.mb ? '\nmbRot=' + fmt(b.mbRot) + '  streaks=' + b.mbStreaks : '');
    }

    // ---------- 감지 ----------
    // 항상 숨김 정책: DevTools 도크 감지로 자동 표시하지 않는다.

    function isTypingTarget(t) {
        return t instanceof Element && t.closest('input,textarea,select,[contenteditable="true"]') !== null;
    }

    window.addEventListener('keydown', e => {
        // ` 단축키: 패널 토글. DevTools를 열지 않고도 패널을 쓸 수 있게 한다.
        // (입력 필드에서는 문자 입력 우선, 수식어키 조합은 브라우저에 양보)
        if ((e.code === 'Backquote' || e.key === '`' || e.key === '~') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (e.repeat) return;
            if (isTypingTarget(e.target)) return;
            e.preventDefault();
            if (panel.hidden) show('단축키(`)');
            else hide();
            return;
        }
        // F12만 패널을 연다. 다른 DevTools 단축키로는 자동 표시하지 않는다.
        if ((e.key || '') === 'F12') show('단축키(F12)');
    });

    // ---------- 배선 ----------
    document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(panel);
        document.body.appendChild(fab);
        // 항상 숨김: FAB은 어떤 경우에도 표시하지 않는다.
        fab.hidden = true;
        fab.style.display = 'none';
        panel.querySelector('[data-act="close"]').addEventListener('click', hide);
        fab.addEventListener('click', () => show('수동(FAB)'));
        panel.querySelector('[data-act="collapse"]').addEventListener('click', ev => {
            const body = document.getElementById('tsdBody');
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            ev.target.textContent = hidden ? '접기' : '펼치기';
        });
        // 항상 숨김 정책: 자동 표시 없음. (`/F12 키로만 show)
        renderSrc();
        waitBridge(b => {
            if (!b) return;
            buildScene(b);
            buildGroups(b);
            buildMirror(b);
            buildPaletteEditors(b, false);
            buildIO(b);
            renderSrc();
            // 패널이 닫혀 있을 때는 DOM 쓰기를 생략: DevTools를 닫은 상태의 백그라운드 비용 제거.
            // 패널이 열려 있을 때(DevTools 도크 포함) 300ms마다 상태 텍스트+슬라이더 동기화만 수행.
            setInterval(() => { if (panel.hidden) return; tickStatus(); syncSceneUI(); }, 300);
            tickStatus();
        });
    });

    window.__TSUKUYOMI_DEBUG__ = {
        show: (src) => show(src || '수동(console)'),
        hide, toggle: () => (panel.hidden ? show('수동(toggle)') : hide()),
        get visible() { return panelVisible; },
        get detectSource() { return detectSrc; },
    };
})();
