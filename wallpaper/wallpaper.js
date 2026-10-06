/* Tsukuyomi Wallpaper Engine 브릿지 (wallpaper/ 전용).
 *
 * 역할:
 *  - 하단 시간대 UI 숨김 -> WE 옵션 `a00_scene` 콤보로 장면 선택 (기본값: 밤)
 *  - 디버그 패널 미포함 -> WE 고급 옵션(12개 그룹 + `aNN_*` 슬라이더/체크)이
 *    window.__TSUKUYOMI__ 브릿지로 위임
 *  - 초기 진입 연출(황혼→밤)은 밤 선택 시에만, `a01_intro` 체크로 켜고 끈다 (기본값 켜짐)
 *
 * 코어(vendor/tsukuyomi.js)는 수정하지 않고, 이미 노출된 브릿지만 호출한다.
 * 웹 정적 배포(public/)에는 영향을 주지 않는다.
 */
(() => {
    'use strict';

    // 반드시 전역에 즉시 설치: WE는 문서 로드 직후 applyUserProperties를 1회 호출하므로
    // 어떤 이벤트 안에 넣으면 초기값을 놓친다.
    window.wallpaperPropertyListener = { applyUserProperties, applyGeneralProperties };

    // WE 콤보값은 정수(1/2/3)로 정의하지만, 문자열("1"/"day" 등)로 와도 동작한다.
    function sceneOf(v) {        if (v === 1 || v === '1' || v === 'day') return 'day';
        if (v === 2 || v === '2' || v === 'dusk') return 'dusk';
        if (v === 3 || v === '3' || v === 'night') return 'night';
        if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            if (s === 'day' || s === 'dusk' || s === 'night') return s;
            const n = Number(s);
            if (n === 1) return 'day';
            if (n === 2) return 'dusk';
            if (n === 3) return 'night';
        }
        return null;
    }
    // project.json 키 규칙 (tools/generate-project-json.py):
    //   a00_scene, a01_intro, a02_show_advanced, a03_snapshot_json (그룹 미소속)
    //   a04~a15 그룹 헤더(type=group, 값 없음), 멤버 aNN_<CFG키> (예: a04_T_NIGHT)
    // 키는 반드시 식별자 형태(문자 시작) — WE 조건식이 숫자 시작 키를 해석하지 못한다.
    // 구 규칙(scene/intro/cfg_<CFG키>/snapshot_json, 00_scene 등 숫자 시작)도 계속 받는다.
    const KEY_SCENE = 'a00_scene';
    const KEY_INTRO = 'a01_intro';
    const KEY_SNAPSHOT = 'a03_snapshot_json';
    const MEMBER_RE = /^(?:[A-Za-z]\d\d_|\d\d_|cfg_)(.+)$/;
    const desired = { scene: 'night', intro: true };
    const pendingCfg = new Map(); // CFG키 -> 마지막 값 (브릿지 대기분)
    let pendingSnapshot = null;   // snapshot_json 원문 (브릿지 대기분)
    let initialized = false;      // 첫 장면 적용 여부
    let weFps = 0;

    // GROUPS rebuild 플래그와 1:1 (wallpaper/tools/rebuild-map.json 생성 시점과 대조).
    // verify-wallpaper.ps1이两者의 일치를 검사한다.
    const REBUILD = {
        HZ_RATIO: 'resize', DPR_MAX: 'resize', PIX_BUDGET: 'resize',
        POLE_X: 'resize', POLE_Y: 'resize',
        SUN_F: 'resize', SUN_MIN: 'resize', SUN_MAX: 'resize',
        MOON_F: 'resize', MOON_MIN: 'resize', MOON_MAX: 'resize',
        TORII_X: 'resize', TORII_BASE: 'resize', TORII_SCALE: 'resize',
        BAND_PAD: 'resize', BAND_H: 'resize',
        STAR_DENS: 'stars', STAR_MAX: 'stars',
        MTN_SHOW: 'mountains', MTN_TH: 'mountains', MTN_POW: 'mountains',
        MTN_W0: 'mountains', MTN_W1: 'mountains', MTN_W2: 'mountains',
        CLOUD_N: 'clouds', CLOUD_SP0: 'clouds', CLOUD_SP1: 'clouds',
        CLOUD_Y0: 'clouds', CLOUD_YR: 'clouds', CLOUD_X0: 'clouds', CLOUD_SPREAD: 'clouds',
        DC_SEED: 'clouds', DC_N: 'clouds', DC_Y0: 'clouds', DC_YR: 'clouds',
        DC_CB_N: 'clouds', DC_CB_S0: 'clouds', DC_CB_S1: 'clouds', DC_CB_SP: 'clouds',
        CL_LIVE: 'clouds',
        DC_COV: 'clouds', DC_SHARP: 'clouds', DC_SOFT: 'clouds',
        DC_SCALE: 'clouds', DC_ABSORB: 'clouds', DC_SUN: 'clouds',
        DC_VLIFT: 'clouds', DC_SKYBOT: 'clouds', DC_UPK: 'clouds',
        DC_LOBE: 'clouds', DC_CREASE: 'clouds', DC_LOBE_W: 'clouds', DC_BAND_LOBE: 'clouds',
        DC_CB_SUN: 'clouds', DC_CB_SCALE: 'clouds', DC_CB_ABSORB: 'clouds',
        DC_CB_RIMK: 'clouds', DC_CB_RS: 'clouds',
        DY_SEED: 'clouds', DY_BAND_N: 'clouds', DY_SP: 'clouds',
        DY_COV: 'clouds', DY_SCALE: 'clouds', DY_ABSORB: 'clouds',
        DY_VLIFT: 'clouds', DY_SKYBOT: 'clouds', DY_UPK: 'clouds',
        DY_GLINT_N: 'clouds',
        DY_HOLE: 'clouds', DY_HOLE_S: 'clouds', DY_HOLE_N: 'clouds',
        DY_HOLE_EDGE: 'clouds', DY_HOLE_RIM: 'clouds', DY_HOLE_SKY: 'clouds',
        LANTERN_N: 'lanterns', LANTERN_SEED: 'lanterns',
        LANTERN_GX: 'lanterns', LANTERN_TX: 'lanterns',
        LANTERN_SN0: 'lanterns', LANTERN_SN1: 'lanterns', LANTERN_H: 'lanterns',
        LANTERN_PAD: 'lanterns', LANTERN_CARD_AVOID: 'lanterns', LANTERN_DEPTH_K: 'lanterns',
        LANTERN_FAR_MUL: 'lanterns', LANTERN_FAR_Y0: 'lanterns', LANTERN_FAR_MAX: 'lanterns',
    };

    const bridge = () => window.__TSUKUYOMI__ || null;

    // rebuild는 debounce: WE 슬라이더 드래그 중 60Hz input이 와도 무거운 재계산은 뒤로 미룬다.
    let rebuildTimer = 0;
    const pendingKinds = new Set();
    function queueRebuild(kind) {
        if (!kind) return;
        pendingKinds.add(kind);
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
            const b = bridge();
            const kinds = [...pendingKinds];
            pendingKinds.clear();
            if (!b) return;
            try {
                // resize가 stars를 포함하므로 stars는 중복 실행하지 않는다 (debug 패널과 동일).
                if (kinds.includes('resize')) b.actions.resize();
                else if (kinds.includes('stars')) b.actions.buildStars();
                if (kinds.includes('mountains')) b.actions.buildMountains();
                if (kinds.includes('clouds')) b.actions.buildClouds();
                if (kinds.includes('lanterns')) b.actions.buildLanterns();
            } catch (e) { /* 브릿지 경합 시 현상 유지 */ }
        }, 120);
    }

    function applyCfgValue(b, key, value) {
        if (!b || !(key in b.cfg)) return;
        const num = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
        if (!isFinite(num)) return;
        b.cfg[key] = num;
        queueRebuild(REBUILD[key]);
    }

    // 스냅샷(JSON): 웹 디버그 패널의 "내보내기" 결과를 그대로 붙여넣는 탈출구.
    // cfg + palettes만 반영하고, 장면(p/state)은 WE의 scene/intro 옵션을 따른다.
    function applySnapshot(b, text) {
        if (!b || !text || !text.trim()) return;
        let snap = null;
        try { snap = JSON.parse(text); } catch (e) { return; }
        if (snap.cfg) {
            if (snap.cfg.MOON_X1 !== undefined && snap.cfg.TORII_X === undefined) {
                snap.cfg.TORII_X = snap.cfg.MOON_X1;
            }
            for (const k of Object.keys(snap.cfg)) {
                if (k in b.cfg) {
                    const n = Number(snap.cfg[k]);
                    if (isFinite(n)) b.cfg[k] = n;
                }
            }
            delete b.cfg.MOON_X0; delete b.cfg.MOON_X1;
            delete b.cfg.W_FAST; delete b.cfg.DECAY; delete b.cfg.FAST_HOLD;
        }
        if (snap.palettes) {
            for (const k of Object.keys(snap.palettes)) {
                try { b.setPalette(k, snap.palettes[k]); } catch (e) { /* 개별 실패 무시 */ }
            }
        }
        try {
            b.actions.resize();
            b.actions.buildMountains();
            b.actions.buildClouds();
            b.actions.buildLanterns();
        } catch (e) { /* 브릿지 경합 시 현상 유지 */ }
    }

    function applyScene(b, first) {
        if (desired.scene === 'night') {
            if (desired.intro) {
                if (first) {
                    // 코어 기본값 자체가 황혼→밤 인트로이므로, 이미 인트로 중이거나
                    // 밤에 안착했다면 그대로 둔다. 다른 장면에 머물 때만 밤으로 전환.
                    const st = b.state;
                    if (st === 'day' || st === 'dusk' || st === 'toDay' || st === 'toDusk') {
                        b.actions.toNight();
                    }
                } else {
                    b.actions.toNight();
                }
            } else {
                b.state = 'night'; // 인트로 스킵: 즉시 밤 idle
            }
        } else if (desired.scene === 'day') {
            if (first) b.state = 'day';
            else b.actions.toDay();
        } else {
            if (first) b.state = 'dusk';
            else b.actions.toDusk();
        }
        // UI 숨김 상태에서는 컨트롤 패널 회피가 무의미하므로 WE 전용으로 끈다.
        // (웹 기본값 1은 그대로 두고, 월페이퍼에서만 호출로 덮는다.)
        if (b.cfg.LANTERN_CARD_AVOID !== 0) {
            b.cfg.LANTERN_CARD_AVOID = 0;
            queueRebuild('lanterns');
        }
    }

    function applyPending(b, first) {
        for (const [key, value] of pendingCfg) applyCfgValue(b, key, value);
        pendingCfg.clear();
        if (pendingSnapshot) {
            const s = pendingSnapshot;
            pendingSnapshot = null;
            applySnapshot(b, s);
        }
        applyScene(b, first);
    }

    function applyUserProperties(properties) {
        if (!properties) return;
        const sc = properties[KEY_SCENE] || properties.scene;
        if (sc && sc.value !== undefined) {
            const s = sceneOf(sc.value);
            if (s) desired.scene = s;
        }
        const it = properties[KEY_INTRO] || properties.intro;
        if (it && it.value !== undefined) {
            desired.intro = !!it.value;
        }
        for (const name of Object.keys(properties)) {
            const m = MEMBER_RE.exec(name);
            if (!m) continue;
            const entry = properties[name];
            if (!entry || entry.value === undefined || entry.value === '') continue;
            pendingCfg.set(m[1], entry.value);
        }
        const snap = properties[KEY_SNAPSHOT] || properties.snapshot_json;
        if (snap && snap.value !== undefined) {
            const text = String(snap.value || '');
            pendingSnapshot = text.trim() ? text : null;
            // 스냅샷을 비우면 되돌리지 않는다 (이미 적용된 값 유지, WE 동작과 동일).
        }
        const b = bridge();
        if (!b) return; // 브릿지 대기분은 applyPending에서 처리
        const first = !initialized;
        initialized = true;
        applyPending(b, first);
    }

    function applyGeneralProperties(properties) {
        // WE의 FPS 제한은 CEF rAF 스로틀로 네이티브 적용되므로, 여기서는 기록만 한다.
        // 코어 루프를 건드리지 않는다 (웹 경험 불변).
        if (properties && properties.fps !== undefined) weFps = Number(properties.fps) || 0;
    }

    function waitBridge() {
        let n = 0;
        const t = setInterval(() => {
            const b = bridge();
            if (b || ++n > 200) {
                clearInterval(t);
                if (!b) return;
                const first = !initialized;
                initialized = true;
                applyPending(b, first);
            }
        }, 50);
    }

    // WE가 없을 때(일반 브라우저 미리보기) 테스트용 쿼리: ?scene=day&dusk&night&intro=0
    // 예: wallpaper.html?scene=day , wallpaper.html?scene=night&intro=0
    function applyQueryOverride() {
        try {
            const q = new URLSearchParams(location.search);
            const s = (q.get('scene') || '').toLowerCase();
            if (s === 'day' || s === 'dusk' || s === 'night') desired.scene = s;
            const intro = q.get('intro');
            if (intro === '0' || intro === 'false' || intro === 'off') desired.intro = false;
            if (intro === '1' || intro === 'true' || intro === 'on') desired.intro = true;
        } catch (e) { /* file:// 등 파서 미지원 시 무시 */ }
    }

    applyQueryOverride();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitBridge);
    } else {
        waitBridge();
    }

    // 콘솔 테스트용 (WE 아님): __WALLPAPER__.desired 등 읽기 전용에 가깝게 제공한다.
    window.__WALLPAPER__ = {
        get scene() { return desired.scene; },
        get intro() { return desired.intro; },
        get fps() { return weFps; },
        get ready() { return !!bridge(); },
    };
})();
