/* Tsukuyomi Wallpaper Engine 브릿지 (wallpaper/ 전용).
 *
 * 역할:
 *  - 하단 시간대 UI 숨김 -> WE 옵션 `a00_scene` 콤보로 장면 선택 (기본값: 밤)
 *    (표시 순서: 산 5 / 산(노을) 6 / 공백 1 / 황혼 2 / 밤 3 / 밤(미러볼) 4 / 지구 7 / 야치요의 방 8 / 뉴스 9.
 *     1~4는 웹 하단 UI 4버튼, 5·6은 웹 산 세계(#mount)의 땅거미/노을 2버튼,
 *     7~9는 웹 地(#earth)/八(#room)/犬(#news)와 동일)
 *  - 月 바깥(山·地·八·犬)은 각 엔진(vendor/tsukuyomi.{mount,earth,room,news}.js, 처음 필요할 때 로드)으로
 *    단순 페이드 전환한다 (웹 tsukuyomi.worlds.js와 같은 방식). 月 바깥에 있는 동안 月 루프는 멈춘다.
 *    八은 components/(랜턴 iframe 2종 + yachiroom.umd.js)를 쓴다.
 *  - 물고기 (토리이 수면 상승) 고급 그룹 `a16_fish_*` -> __TSUKUYOMI__.fish 위임
 *    (토리이 반사광 켜기 `a16_fish_tlOn` 체크 포함, 웹 디버그 패널 물고기 섹션과 동일)
 *  - 디버그 패널 미포함 -> WE 고급 옵션(12개 그룹 + `aNN_*` 슬라이더/체크)이
 *    window.__TSUKUYOMI__ 브릿지로 위임
 *  - 공백 장면 토글 3종은 일반 옵션으로 공백 선택 시 노출 (고급 표시와 무관):
 *    `a01_daystars` (별 궤적, 웹 btnStars와 동일), `a01_daytone` (파스텔 색조),
 *    `a01_daydark` (공백 밤, 웹 btnDark와 동일).
 *    셋 다 공백 장면에서만 그려지고, 다른 장면에서는 값을 유지한 채 효과가 없다 (웹과 동일).
 *    색조·밤은 웹과 같이 둘 중 하나만 고른다 (둘 다 켜면 밤이 우선).
 *  - 밤 계열 2종은 일반 옵션으로 밤/미러볼 선택 시 노출 (고급 표시와 무관):
 *    `a01_intro` (초기 연출 켜고 끄기, 기본값 켜짐),
 *    `a01_fish` (물고기 군집 콤보: 끔 0 / 커서 따라가기 1 / 달에 배치 2, 기본값 끔,
 *    웹 하단 군집 3버튼과 동일. 밤에서만 그려지고, 다른 장면에서는 값을 유지한 채 효과가 없다).
 *  - 초기 진입 연출 2종 (밤 계열 선택 시에만, `a01_intro` 체크로 켜고 끈다, 기본값 켜짐):
 *    1) 밤: 황혼→밤 전환 (기존 그대로)
 *    2) 밤(미러볼): 황혼→밤 전환 이후, 미러볼 달 전환 연출(스포트라이트)까지 이어서 재생.
 *       코어 goTo('mirror')/mirrorShow() 예약 동작을 그대로 쓴다.
 *       끄면 황혼→밤을 건너뛰고, 즉시 밤에서 미러볼 전환 연출만 재생한다
 *       (코어에 즉시 미러볼 idle 점프 API가 없어 스포트라이트 생략은 불가).
 *
 * 코어(vendor/tsukuyomi.js)는 수정하지 않고, 이미 노출된 브릿지만 호출한다.
 * 웹 정적 배포(public/)에는 영향을 주지 않는다.
 */
(() => {
    'use strict';

    // 반드시 전역에 즉시 설치: WE는 문서 로드 직후 applyUserProperties를 1회 호출하므로
    // 어떤 이벤트 안에 넣으면 초기값을 놓친다.
    window.wallpaperPropertyListener = { applyUserProperties, applyGeneralProperties };

    // WE 콤보값은 정수(1~9)로 정의하지만, 문자열("1"/"day" 등)로 와도 동작한다.
    // 장면 id: day/dusk/night/mirror (月), mount/mountSunset (山: 땅거미/노을),
    //          earth (地), room (八), news (犬)
    const SCENE_BY_NUM = { 1: 'day', 2: 'dusk', 3: 'night', 4: 'mirror', 5: 'mount', 6: 'mountSunset', 7: 'earth', 8: 'room', 9: 'news' };
    const SCENE_ALIAS = {
        day: 'day', dusk: 'dusk', night: 'night', mirror: 'mirror',
        mount: 'mount', mountdusk: 'mount', 'mount-dusk': 'mount',
        mountsunset: 'mountSunset', 'mount-sunset': 'mountSunset', sunset: 'mountSunset',
        earth: 'earth', room: 'room', yachiyo: 'room', news: 'news',
    };
    function sceneOf(v) {
        if (typeof v === 'number') return SCENE_BY_NUM[v] || null;
        if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            if (SCENE_ALIAS[s]) return SCENE_ALIAS[s];
            const n = Number(s);
            if (s !== '' && SCENE_BY_NUM[n]) return SCENE_BY_NUM[n];
        }
        return null;
    }
    // 山 장면 id -> tsukuyomi.mount.js 장면 키
    const MOUNT_SCENE = { mount: 'dusk', mountSunset: 'sunset' };
    const isMountScene = s => Object.prototype.hasOwnProperty.call(MOUNT_SCENE, s);
    // 月 바깥 세계 판정 (단순 페이드 전환 대상)
    const isOuterScene = s => isMountScene(s) || s === 'earth' || s === 'room' || s === 'news';
    const isMoonScene = s => !isOuterScene(s);
    // project.json 키 규칙 (tools/generate-project-json.py):
    //   a00_scene, a01_intro, a01_fish(밤 계열 노출 콤보), a01_daystars, a01_daytone, a01_daydark,
    //   a02_show_advanced, a03_snapshot_json (그룹 미소속, 고급 토글과 무관(공백 선택 시 노출))
    //   a04~a15 그룹 헤더(type=group, 값 없음), 멤버 aNN_<CFG키> (예: a04_T_NIGHT)
    // 키는 반드시 식별자 형태(문자 시작) — WE 조건식이 숫자 시작 키를 해석하지 못한다.
    // 구 규칙(scene/intro/fish/cfg_<CFG키>/snapshot_json, 00_scene 등 숫자 시작)도 계속 받는다.
    const KEY_SCENE = 'a00_scene';
    const KEY_INTRO = 'a01_intro';
    const KEY_FISH = 'a01_fish';
    const KEY_DAYSTARS = 'a01_daystars';
    const KEY_DAYTONE = 'a01_daytone';
    const KEY_DAYDARK = 'a01_daydark';
    const KEY_SNAPSHOT = 'a03_snapshot_json';
    const MEMBER_RE = /^(?:[A-Za-z]\d\d_|\d\d_|cfg_)(.+)$/;
    // 물고기 (토리이 수면 상승) 그룹 멤버: a16_fish_<FISH키> -> __TSUKUYOMI__.fish[FISH키]
    const FISH_RE = /^[A-Za-z]\d\d_fish_(.+)$/;
    const GENERAL_SKIP = new Set([KEY_FISH, KEY_DAYSTARS, KEY_DAYTONE, KEY_DAYDARK, 'fish', 'cursor', 'cursorMode', 'cursormode', 'daystars', 'daytone', 'daydark']);
    const desired = { scene: 'night', intro: true, fish: 0, dayStars: false, dayTone: false, dayDark: false };
    const pendingCfg = new Map(); // CFG키 -> 마지막 값 (브릿지 대기분)
    const pendingFish = new Map(); // FISH키 -> 마지막 값 (브릿지 대기분)
    let pendingSnapshot = null;   // snapshot_json 원문 (브릿지 대기분)
    let initialized = false;      // 첫 장면 적용 여부
    let weFps = 0;

    // GROUPS rebuild 플래그와 1:1 (wallpaper/tools/rebuild-map.json 생성 시점과 대조).
    // verify-wallpaper.ps1이两者의 일치를 검사한다.
    const REBUILD = {
        HZ_RATIO: 'resize', DPR_MAX: 'resize', PIX_BUDGET: 'resize',
        POLE_X: 'resize', POLE_Y: 'resize',
        SUN_F: 'resize', SUN_MIN: 'resize', SUN_MAX: 'resize',
        MOON_F: 'resize', MOON_MIN: 'resize', MOON_MAX: 'resize', MOON_SIZE: 'resize',
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
        DS_POLE_X: 'stars', DS_POLE_Y: 'stars',
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

    // 물고기 값: 숫자/체크는 수치로, 색은 WE color("r g b", 0~1)를 '#rrggbb'로 바꿔 넣는다.
    // FISH는 발사·프레임마다 읽히므로 재빌드가 필요 없다 (tlOn=0이면 반사광 패스를 건너뛴다).
    function applyFishValue(b, key, value) {
        const f = b && b.fish;
        if (!f || !(key in f)) return;
        if (typeof f[key] === 'string') {
            const s = String(value).trim();
            if (/^#[0-9a-f]{6}$/i.test(s)) { f[key] = s; return; }
            const c = s.split(/[\s,]+/).map(Number);
            if (c.length < 3 || !c.slice(0, 3).every(isFinite)) return;
            f[key] = '#' + c.slice(0, 3)
                .map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
                .join('');
            return;
        }
        const num = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
        if (isFinite(num)) f[key] = num;
    }

    // ---------- 다섯 세계: 月(수면, vendor/tsukuyomi.js) ↔ 山/地/八/犬 ----------
    // 웹 tsukuyomi.worlds.js와 같은 단순 페이드. 해시 경로·하단 버튼 없이 WE 장면 옵션만 따른다.
    // 月와 海(공백)은 같은 엔진·캔버스를 쓴다 (day + dayStars/dayTone/dayDark).
    const moonEl = document.getElementById('worldMoon');
    const mountEl = document.getElementById('worldMount');
    const earthEl = document.getElementById('worldEarth');
    const roomEl = document.getElementById('worldRoom');
    const newsEl = document.getElementById('worldNews');
    const worldEls = { moon: moonEl, mount: mountEl, earth: earthEl, room: roomEl, news: newsEl };
    const FADE_MS = 1100;
    let world = 'moon';        // 화면에 안착한 세계
    let worldTarget = 'moon';  // 마지막으로 요청한 세계 (동기 판단용)
    let worldQueue = Promise.resolve();
    // 지연 로드 (웹 tsukuyomi.worlds.js와 같은 모듈·전역명)
    const engineP = {};
    function loadEngine(name, src) {
        if (!engineP[name]) {
            engineP[name] = new Promise((resolve, reject) => {
                if (window[name]) { resolve(window[name]); return; }
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => window[name] ? resolve(window[name]) : reject(new Error(name + ' 없음'));
                s.onerror = () => reject(new Error(src + ' 로드 실패'));
                document.head.appendChild(s);
            }).catch(e => { engineP[name] = null; throw e; });
        }
        return engineP[name];
    }
    const loadMount = () => loadEngine('TsukuyomiMount', 'vendor/tsukuyomi.mount.js');
    const loadEarth = () => loadEngine('TsukuyomiEarth', 'vendor/tsukuyomi.earth.js');
    const loadRoom = () => loadEngine('TsukuyomiRoom', 'vendor/tsukuyomi.room.js');
    const loadNews = () => loadEngine('TsukuyomiNews', 'vendor/tsukuyomi.news.js');
    const outerLoaders = { mount: loadMount, earth: loadEarth, room: loadRoom, news: loadNews };
    function stopOuter(id) {
        const g = { mount: 'TsukuyomiMount', earth: 'TsukuyomiEarth', room: 'TsukuyomiRoom', news: 'TsukuyomiNews' }[id];
        try { if (g && window[g]) window[g].stop(); } catch (e) { /* 무시 */ }
    }
    const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
    // B를 위에 올려 불투명도만 올린다 (둘 다 계속 그린다)
    function fadeIn(el) {
        el.style.opacity = '0';
        el.style.zIndex = '1';
        el.hidden = false;
        return new Promise(resolve => {
            const t0 = performance.now();
            const tick = now => {
                const u = Math.min(1, (now - t0) / FADE_MS);
                el.style.opacity = String(u * u * (3 - 2 * u));
                if (u < 1) requestAnimationFrame(tick);
                else resolve();
            };
            requestAnimationFrame(tick);
        });
    }
    const clearFx = el => { el.style.opacity = ''; el.style.zIndex = ''; };

    async function switchWorld(instant) {
        // 큐에서 실행되는 시점의 최신 요청을 따른다 (빠른 연속 변경은 마지막 값으로 수렴)
        const target = worldTarget;
        if (!moonEl) return;
        const T = worldEls[target];
        if (!T) { worldTarget = 'moon'; return; }   // DOM 없는 세계는 月로
        if (target !== 'moon') {
            const E = await outerLoaders[target]();
            if (worldTarget !== target) return;   // 로드 중 되돌렸으면 다음 작업에 맡긴다
            if (target === 'mount') {
                const id = MOUNT_SCENE[desired.scene];
                if (id && E.scene !== id) E.setScene(id);   // 산에 있는 중이면 크로스페이드
                if (world === 'mount') return;
            } else if (world === target) return;
            await E.start();   // 八·犬은 베이스/첫 프레임이 준비된 뒤에 resolve
            if (worldTarget !== target) { try { E.stop(); } catch (e) { /* 무시 */ } return; }
            const b = bridge();
            if (instant) {
                if (b) b.suspend();
                T.hidden = false;
            } else {
                document.body.setAttribute('data-world-busy', '');
                await nextFrame();   // 첫 프레임이 캔버스에 올라간 다음부터 보여 준다
                await fadeIn(T);
                if (b) b.suspend();
            }
            for (const id of ['mount', 'earth', 'room', 'news']) {
                if (id !== target) { stopOuter(id); if (worldEls[id]) worldEls[id].hidden = true; }
            }
            moonEl.hidden = true;
            world = target;
        } else {
            if (world === 'moon') return;
            const b = bridge();
            if (b) b.resume();
            document.body.setAttribute('data-world-busy', '');
            await nextFrame();
            await fadeIn(moonEl);
            for (const id of ['mount', 'earth', 'room', 'news']) {
                stopOuter(id);
                if (worldEls[id]) worldEls[id].hidden = true;
            }
            world = 'moon';
        }
        for (const el of Object.values(worldEls)) if (el) clearFx(el);
        document.body.removeAttribute('data-world-busy');
    }
    function syncWorld(instant) {
        worldTarget = isOuterScene(desired.scene) ? desired.scene : 'moon';
        worldQueue = worldQueue.then(() => switchWorld(instant)).catch(e => {
            console.warn('[tsukuyomi wallpaper] 세계 전환 실패:', e);
            for (const el of Object.values(worldEls)) if (el) clearFx(el);
            document.body.removeAttribute('data-world-busy');
            // 실패하면 안착한 세계를 다시 돌린다
            if (world === 'moon') {
                const b = bridge();
                if (b) b.resume();
                if (moonEl) moonEl.hidden = false;
            } else if (outerLoaders[world]) {
                outerLoaders[world]().then(E => {
                    try { E.start(); } catch (e2) { /* 무시 */ }
                    if (worldEls[world]) worldEls[world].hidden = false;
                }).catch(() => { /* 무시 */ });
            }
        });
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

    function mirrorIdle(b) {
        try {
            return b.state === 'night' && b.moonTarget === 'mirror';
        } catch (e) { return false; }
    }

    function startMirrorFull() {
        // 코어 mirrorShow(): 밤이면 일반 달에서 즉시 연출 시작,
        // 아니면 밤 도착 후 실행되도록 예약(goTo('mirror')의 mbPending).
        // 초기 황혼 idle에서 부르면 황혼→밤 전환 뒤 미러볼 전환까지 이어진다.
        const b = bridge();
        if (!b) return false;
        try {
            if (typeof b.actions.mirrorShow === 'function') b.actions.mirrorShow();
            else if (typeof b.actions.goTo === 'function') b.actions.goTo('mirror');
            else b.actions.toNight();
            return true;
        } catch (e) { return false; }
    }

    function applyScene(b, first) {
        if (desired.scene === 'mirror') {
            if (desired.intro) {
                // 진입 연출 2종 중 둘째: 황혼→밤 전환 이후 미러볼 전환까지.
                // 코어 기본값 자체가 황혼 idle이므로, 이미 미러볼에 안착했다면 그대로 둔다.
                if (first) {
                    if (!mirrorIdle(b)) startMirrorFull();
                } else {
                    if (!mirrorIdle(b)) startMirrorFull();
                }
            } else {
                // 인트로 스킵: 즉시 밤으로 점프한 뒤 미러볼 전환만 재생.
                // (코어에 스포트라이트 없는 즉시 미러볼 점프 API가 없다.)
                if (!mirrorIdle(b)) {
                    try { b.state = 'night'; } catch (e) { /* 현상 유지 */ }
                    startMirrorFull();
                }
            }
        } else if (desired.scene === 'night') {
            if (desired.intro) {
                if (first) {
                    // 코어 기본값은 황혼 idle이므로, 밤 계열이 아니면 toNight로 진입 연출을 시작한다.
                    // 이미 밤에 안착했다면 그대로 둔다.
                    const st = b.state;
                    if (st === 'day' || st === 'dusk' || st === 'toDay' || st === 'toDusk') {
                        b.actions.toNight();
                    }
                } else {
                    b.actions.toNight();
                }
            } else {
                // 인트로 스킵: 즉시 밤 idle. 다만 미러볼에 머물던 중이면
                // 직접 대입은 moonTarget을 그대로 두므로, goTo 경유로 일반 달에 복귀한다.
                try {
                    if (b.moonTarget === 'mirror') b.actions.toNight();
                    else b.state = 'night';
                } catch (e) {
                    try { b.state = 'night'; } catch (e2) { /* 현상 유지 */ }
                }
            }
        } else if (desired.scene === 'day') {
            if (first) b.state = 'day';
            else b.actions.toDay();
        } else {
            if (first) b.state = 'dusk';
            else b.actions.toDusk();
        }
    }

    function applyLanternAvoid(b) {
        // UI 숨김 상태에서는 컨트롤 패널 회피가 무의미하므로 WE 전용으로 끈다.
        // (웹 기본값 1은 그대로 두고, 월페이퍼에서만 호출로 덮는다.)
        if (b.cfg.LANTERN_CARD_AVOID !== 0) {
            b.cfg.LANTERN_CARD_AVOID = 0;
            queueRebuild('lanterns');
        }
    }

    function fishOf(v) {
        // WE 콤보값은 정수(0/1/2). 문자열("1" 등)이나 웹 키 이름("off"/"track"/"moon")도 받는다.
        if (v === 0 || v === '0' || v === 'off') return 0;
        if (v === 1 || v === '1' || v === 'track') return 1;
        if (v === 2 || v === '2' || v === 'moon') return 2;
        if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            if (s === 'off' || s === '끔') return 0;
            if (s === 'track' || s === '커서 따라가기') return 1;
            if (s === 'moon' || s === '달에 배치') return 2;
            const n = Number(s);
            if (n === 0 || n === 1 || n === 2) return n;
        }
        if (typeof v === 'number' && isFinite(v)) {
            const n = Math.round(v);
            if (n >= 0 && n <= 2) return n;
        }
        return null;
    }

    function applyPending(b, first) {
        for (const [key, value] of pendingCfg) applyCfgValue(b, key, value);
        pendingCfg.clear();
        for (const [key, value] of pendingFish) applyFishValue(b, key, value);
        pendingFish.clear();
        if (pendingSnapshot) {
            const s = pendingSnapshot;
            pendingSnapshot = null;
            applySnapshot(b, s);
        }
        // 공백 토글은 CFG가 아니라 코어 상태(dsOn/tnOn/dnOn)다. 세터가 없으면(구 코어) 무시.
        // 색조·밤은 웹과 같이 둘 중 하나만 고른다 (둘 다 켜면 밤이 우선, 코어 seaModeOf와 동일).
        try {
            if ('dayStars' in b) b.dayStars = desired.dayStars;
            if ('dayTone' in b) b.dayTone = desired.dayTone;
            else if ('seaMode' in b && desired.dayTone) b.seaMode = 'tone';
            if ('dayDark' in b) b.dayDark = desired.dayDark;
        } catch (e) { /* 브릿지 경합 시 현상 유지 */ }
        // 물고기 군집은 CFG가 아니라 코어 상태(cursorMode)다. 밤에서만 그려진다.
        // 세터가 없으면(구 코어) 무시.
        try {
            if ('cursorMode' in b) b.cursorMode = desired.fish;
            else if (b.actions && typeof b.actions.cursorPlace === 'function') b.actions.cursorPlace(desired.fish);
        } catch (e) { /* 브릿지 경합 시 현상 유지 */ }
        applyLanternAvoid(b);
        // 月 바깥에서 月로 돌아올 때는 月가 화면 밖이었으므로 첫 진입과 같이 처리한다
        // (공백·황혼은 즉시 idle, 밤 계열은 인트로 설정을 따름).
        const enteringMoon = world !== 'moon' && isMoonScene(desired.scene);
        syncWorld(first);
        if (isMoonScene(desired.scene)) applyScene(b, first || enteringMoon);
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
        const fh = properties[KEY_FISH] || properties.fish || properties.cursor || properties.cursorMode || properties.cursormode;
        if (fh && fh.value !== undefined && fh.value !== '') {
            const f = fishOf(fh.value);
            if (f !== null) desired.fish = f;
        }
        const st = properties[KEY_DAYSTARS] || properties.daystars;
        if (st && st.value !== undefined) {
            desired.dayStars = !!st.value;
        }
        const dk = properties[KEY_DAYDARK] || properties.daydark;
        if (dk && dk.value !== undefined) {
            desired.dayDark = !!dk.value;
        }
        const tn = properties[KEY_DAYTONE] || properties.daytone;
        if (tn && tn.value !== undefined) {
            desired.dayTone = !!tn.value;
        }
        for (const name of Object.keys(properties)) {
            if (GENERAL_SKIP.has(name)) continue;
            const fm = FISH_RE.exec(name);
            if (fm) {
                const entry = properties[name];
                if (entry && entry.value !== undefined && entry.value !== '') pendingFish.set(fm[1], entry.value);
                continue;
            }
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

    // WE가 없을 때(일반 브라우저 미리보기) 테스트용 쿼리: ?scene=mount|mount-sunset|earth|room|news|day|dusk|night|mirror(또는 1~9)&intro=0&fish=0/1/2&stars=1&tone=1&dark=1
    // 예: wallpaper.html?scene=earth , wallpaper.html?scene=room , wallpaper.html?scene=news
    // 예: wallpaper.html?scene=day&stars=1 , wallpaper.html?scene=day&tone=1 , wallpaper.html?scene=day&dark=1 , wallpaper.html?scene=night&intro=0 , wallpaper.html?scene=night&fish=1 , wallpaper.html?scene=mirror&fish=2
    function applyQueryOverride() {
        try {
            const q = new URLSearchParams(location.search);
            const s = sceneOf(q.get('scene') || '');
            if (s) desired.scene = s;
            const intro = q.get('intro');
            if (intro === '0' || intro === 'false' || intro === 'off') desired.intro = false;
            if (intro === '1' || intro === 'true' || intro === 'on') desired.intro = true;
            const fish = q.get('fish') ?? q.get('cursor');
            if (fish !== null && fish !== undefined) {
                const f = fishOf(fish);
                if (f !== null) desired.fish = f;
            }
            const stars = q.get('stars');
            if (stars === '0' || stars === 'false' || stars === 'off') desired.dayStars = false;
            if (stars === '1' || stars === 'true' || stars === 'on') desired.dayStars = true;
            const dark = q.get('dark');
            if (dark === '0' || dark === 'false' || dark === 'off') desired.dayDark = false;
            if (dark === '1' || dark === 'true' || dark === 'on') desired.dayDark = true;
            const tone = q.get('tone') ?? q.get('daytone');
            if (tone === '0' || tone === 'false' || tone === 'off') desired.dayTone = false;
            if (tone === '1' || tone === 'true' || tone === 'on') desired.dayTone = true;
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
        get fish() { return desired.fish; },
        get dayStars() { return desired.dayStars; },
        get dayTone() { return desired.dayTone; },
        get dayDark() { return desired.dayDark; },
        get fps() { return weFps; },
        get ready() { return !!bridge(); },
        get world() { return world; },
    };
})();
