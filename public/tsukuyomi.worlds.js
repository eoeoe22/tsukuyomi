/* 두 세계 전환: 月(수면 토리이, tsukuyomi.js) ↔ 山(산정 토리이, tsukuyomi.mount.js).
 * 경로는 tsukuyomi.html 하나로 통합하고 산은 해시 #mount로 연다(정적 호스팅이라 경로 리라이트 없이).
 *
 * 진입 / 복귀
 *   - 황혼 장면(state === 'dusk')의 토리이 클릭 → 산 (포털)
 *   - 산 장면의 토리이 클릭 → 수면 (月가 황혼이면 포털, 아니면 페이드)
 *   - 산 버튼(#btnToMount / #btnToMoon): 백업 수단. 月가 황혼이면 포털, 다른 장면이면 단순 페이드.
 *     길게 누르면 디버그 패널 토글(예전 card-text 버튼의 홀드 동작을 이어받음).
 *   - 브라우저 뒤로/앞으로·해시 직접 수정도 같은 규칙으로 전환한다.
 *
 * 포털 (A → B)
 *   A는 인-캔버스 카메라로 토리이 아래 개구부(기둥 사이 · 누키 아래)를 향해 원해상도로 확대해 들어간다.
 *   카메라는 A의 개구부 중심을 B의 개구부가 놓인 화면 위치로 데려간다(山 → 月는 제자리에서 정면 직진).
 *   개구부 안에 B를 미리 비추지 않고, 기둥이 화면 밖으로 빠져나가는(토리이를 통과하는) 순간부터
 *   B가 A 위에서 화면 전체로 페이드 인한다.
 *   동작 줄이기 설정이면 포털 대신 짧은 페이드.
 */
(() => {
  'use strict';

  const moonEl = document.getElementById('worldMoon');
  const mountEl = document.getElementById('worldMount');
  const moonPanel = document.getElementById('panel');
  const moonDock = moonPanel ? moonPanel.closest('.dock') : null;
  const mountDock = document.getElementById('mountDock');
  const btnToMount = document.getElementById('btnToMount');
  const btnToMoon = document.getElementById('btnToMoon');
  if (!moonEl || !mountEl || !moonDock || !mountDock) return;

  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const T = () => window.__TSUKUYOMI__ || null;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOutSine = u => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));

  const CFG = {
    PORTAL_MS: 2600,    // 포털 전체 길이
    FADE_MS: 1100,      // 단순 페이드
    FADE_RM_MS: 450,    // 동작 줄이기 설정의 페이드
    CAM_MAX: 8,         // 카메라 최대 배율(개구부가 화면을 다 덮기 전이라도 여기서 멈추고 페이드로 마무리)
    // 토리이 개구부(torii.svg 680×450 좌표): 기둥 안쪽 모서리(기울기 평균) 사이, 누키 아래 ~ 발 높이
    GATE: { x0: 246, x1: 434, y0: 212, y1: 410 },
    PASS_AT: 0.55,      // 개구부가 화면을 덮는 배율의 이 비율에 이르면 '통과'로 보고 전체 페이드 시작
    FADE_FROM_MIN: 0.45, FADE_FROM_MAX: 0.8,   // 페이드 시작 진행도(u) 범위
    STRAIGHT_FROM: ['mount'],   // 이 세계에서 나가는 포털은 카메라가 개구부를 향해 정면 직진(옆 이동 없음)
    // 디버그: 0~1 숫자면 전환을 그 진행도에 멈춰 둔다(콘솔에서 __TSUKUYOMI_WORLDS__.cfg.SCRUB = 0.4). null이면 정상 재생
    SCRUB: null,
  };
  const TITLES = { moon: '月 | ( ◠ ᗜ ◠ )', mount: '山 | ( ◠ ᗜ ◠ )' };

  // ---------- 山 엔진 지연 로드 ----------
  let mountP = null;
  function loadMount() {
    if (!mountP) {
      mountP = new Promise((resolve, reject) => {
        if (window.TsukuyomiMount) { resolve(window.TsukuyomiMount); return; }
        const s = document.createElement('script');
        s.src = 'tsukuyomi.mount.js';
        s.onload = () => window.TsukuyomiMount ? resolve(window.TsukuyomiMount) : reject(new Error('TsukuyomiMount 없음'));
        s.onerror = () => reject(new Error('tsukuyomi.mount.js 로드 실패'));
        document.head.appendChild(s);
      }).catch(e => { mountP = null; throw e; });
    }
    return mountP;
  }
  // 의도가 보이면(산 버튼 근처, 황혼 토리이 위) 미리 받아 배치·구름 생성을 유휴 시간에 시작해 둔다
  const prewarm = () => { loadMount().catch(e => console.warn('[tsukuyomi] 산 장면 미리 로드 실패:', e)); };

  // ---------- 세계 어댑터: 토리이 배치(torii.svg 좌표 X → 화면 ox + X·k), 카메라, 시작/정지 ----------
  const moon = {
    id: 'moon', el: moonEl, dock: moonDock, toggle: btnToMount,
    torii() {
      const t = T() && T().torii;
      if (!t || !(t.w > 2)) return null;
      const k = t.w / 432;   // TB.w
      return { ox: t.x - 124 * k, oy: t.y - 62 * k, k };   // TB.x, TB.y
    },
    setCam(f, m, s, res, path) { try { T().setCamView(f, m, s, res, path); } catch (e) { /* 무시 */ } },
    clearCam() { try { T().clearCam(); } catch (e) { /* 무시 */ } },
    start() { try { T().resume(); } catch (e) { /* 무시 */ } return Promise.resolve(); },
    stop() { try { T().suspend(); } catch (e) { /* 무시 */ } },
  };
  const mount = {
    id: 'mount', el: mountEl, dock: mountDock, toggle: btnToMoon,
    M: null,
    torii() { return this.M ? this.M.torii() : null; },
    setCam(f, m, s) { if (this.M) this.M.setCam(f, m, s); },
    clearCam() { if (this.M) this.M.clearCam(); },
    start() {
      return loadMount().then(M => { this.M = M; M.start(); });
    },
    stop() { if (this.M) this.M.stop(); },
  };
  const WORLDS = { moon, mount };

  // 개구부 사각형(화면, 카메라 적용 전)과 그 중심
  function gateOf(w) {
    const tm = w.torii();
    if (!tm) return null;
    const G = CFG.GATE;
    const x0 = tm.ox + G.x0 * tm.k, x1 = tm.ox + G.x1 * tm.k;
    const y0 = tm.oy + G.y0 * tm.k, y1 = tm.oy + G.y1 * tm.k;
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k: tm.k };
  }
  // 토리이 전체(지붕 끝 ~ 발) 사각형: 클릭 판정
  function toriiBox(w) {
    const tm = w.torii();
    if (!tm) return null;
    return { x0: tm.ox + 124 * tm.k, x1: tm.ox + 556 * tm.k, y0: tm.oy + 62 * tm.k, y1: tm.oy + 420 * tm.k };
  }

  // 변환 후 뷰포트 네 모서리가 모두 장면 안에 들어가는 최소 배율 (빈 공간이 보이지 않게)
  function coverScale(f, m) {
    const W = window.innerWidth, H = window.innerHeight;
    let s = 1;
    if (f.x > 1) s = Math.max(s, m.x / f.x);
    if (W - f.x > 1) s = Math.max(s, (W - m.x) / (W - f.x));
    if (f.y > 1) s = Math.max(s, m.y / f.y);
    if (H - f.y > 1) s = Math.max(s, (H - m.y) / (H - f.y));
    return s;
  }

  // ---------- 상태 ----------
  let world = 'moon';
  let busy = false;
  const isDusk = () => { const t = T(); return !!(t && t.state === 'dusk'); };
  const howFor = () => (isDusk() && !RM.matches) ? 'portal' : 'fade';

  function setBusy(on) {
    busy = on;
    if (on) {
      document.body.setAttribute('data-world-busy', '');
      document.body.removeAttribute('data-torii-hover');
      hoverOn = false;
    } else document.body.removeAttribute('data-world-busy');
  }
  function clearFx(w) {
    const st = w.el.style;
    st.opacity = ''; st.zIndex = '';
    st.maskImage = st.webkitMaskImage = '';
    st.maskSize = st.webkitMaskSize = '';
    st.maskPosition = st.webkitMaskPosition = '';
    st.maskRepeat = st.webkitMaskRepeat = '';
    const v = w.el.firstElementChild;
    if (v) v.style.transform = '';
  }
  // 전환이 끝나면 B만 남기고 A를 내린다
  function settle(A, B) {
    A.clearCam();
    A.stop();
    A.el.hidden = true;
    A.dock.hidden = true;
    clearFx(A); clearFx(B);
    B.dock.hidden = false;
    if (B === mount && mount.M) mount.M.syncUI();
    world = B.id;
    document.title = TITLES[B.id];
  }

  function rafLoop(ms, step) {
    return new Promise(resolve => {
      const t0 = performance.now();
      let t0s = t0;
      const tick = now => {
        const sc = CFG.SCRUB;
        if (typeof sc === 'number') {
          // 멈춘 동안은 시작 시각을 밀어 두어, 해제하면 그 진행도에서 이어 간다
          const u = clamp(sc, 0, 0.999);
          t0s = now - u * ms;
          step(u);
          requestAnimationFrame(tick);
          return;
        }
        const u = Math.min(1, (now - t0s) / ms);
        step(u);
        if (u < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  // 단순 페이드: B를 A 위에 올려 불투명도만 올린다(둘 다 계속 그린다)
  function fade(A, B) {
    B.el.style.opacity = '0';
    B.el.style.zIndex = '1';
    B.el.hidden = false;
    return rafLoop(RM.matches ? CFG.FADE_RM_MS : CFG.FADE_MS, u => {
      B.el.style.opacity = String(ss(0, 1, u));
    });
  }

  function portal(A, B) {
    const gA = gateOf(A), gB = gateOf(B);
    if (!gA || !gB) return fade(A, B);
    const W = window.innerWidth, H = window.innerHeight;
    const f = { x: gA.cx, y: gA.cy };
    const C = clamp(Math.max(W / gA.w, H / gA.h), 2, CFG.CAM_MAX);
    const lnC = Math.log(C);
    // 카메라 목적지: B의 개구부 중심(B 항등 화면). 페이드가 끝날 때 A·B 개구부가 같은 자리에 겹친다.
    // 山에서 나갈 때는 개구부 중심을 화면에 고정해 옆으로 휘지 않고 정면으로 직진한다
    const dest = CFG.STRAIGHT_FROM.includes(A.id) ? f : { x: gB.cx, y: gB.cy };
    const path = { m0: f, s0: 1, m1: dest, s1: C };
    // 페이드 시작: 개구부가 화면을 덮는 배율(C)의 PASS_AT만큼 커진 순간 = 기둥이 화면 가장자리로 빠져나가기 시작할 때.
    // 배율 s = C^z, z = easeInOutSine(u) 이므로 z를 u로 되돌린다
    const zPass = clamp(Math.log(Math.max(1, C * CFG.PASS_AT)) / lnC, 0, 1);
    const uPass = clamp(Math.acos(1 - 2 * zPass) / Math.PI, CFG.FADE_FROM_MIN, CFG.FADE_FROM_MAX);
    const prof = T() && T().zoomProf;
    if (A === moon && prof) { try { prof.begin('portal:in s=' + C.toFixed(2)); } catch (e) { /* 무시 */ } }

    B.el.style.opacity = '0';
    B.el.style.zIndex = '1';
    B.el.hidden = false;

    return rafLoop(CFG.PORTAL_MS, u => {
      // 카메라: 배율은 로그 공간에서 보간(체감 속도 일정). 개구부 중심은 확대 70% 지점까지 목적지로 옮긴다
      const z = easeInOutSine(u);
      const w = ss(0, 0.7, z);
      const m = { x: lerp(f.x, dest.x, w), y: lerp(f.y, dest.y, w) };
      const s = Math.max(Math.exp(lnC * z), coverScale(f, m) * 1.01);
      A.setCam(f, m, s, C, path);
      // B: 토리이를 지나는 순간부터 화면 전체가 B로 페이드
      B.el.style.opacity = String(ss(uPass, 1, u));
    }).then(() => {
      if (A === moon && prof) { try { if (prof.on) prof.end(); } catch (e) { /* 무시 */ } }
    });
  }

  // ---------- 전환 진입점 ----------
  let wanted = null;   // 전환 중 들어온 마지막 요청(해시 변화 등)
  async function go(target, how) {
    if (!WORLDS[target]) return;
    if (busy) { wanted = target; return; }
    if (target === world) return;
    const A = WORLDS[world], B = WORLDS[target];
    setBusy(true);
    try {
      await B.start();
      // 첫 프레임이 캔버스에 올라간 다음부터 보여 준다
      await new Promise(r => requestAnimationFrame(() => r()));
      if (how === 'portal' && !RM.matches) await portal(A, B);
      else await fade(A, B);
      settle(A, B);
    } catch (e) {
      console.warn('[tsukuyomi] 세계 전환 실패:', e);
      clearFx(B);
      if (B !== WORLDS[world]) { B.stop(); B.el.hidden = true; }
      // 주소를 실제로 남은 세계에 맞춘다(뒤로 가기 기록은 건드리지 않음)
      if (hashWorld() !== world) history.replaceState(null, '', world === 'mount' ? '#mount' : location.pathname + location.search);
    } finally {
      setBusy(false);
    }
    if (wanted && wanted !== world) { const t = wanted; wanted = null; go(t, 'fade'); }
    else wanted = null;
  }

  // ---------- 경로(#mount)와 기록 ----------
  const hashWorld = () => (location.hash === '#mount' ? 'mount' : 'moon');
  let pendingHow = null;
  function navigate(target, how) {
    if (busy || target === world) return;
    pendingHow = how;
    if (target === 'mount') {
      history.pushState({ tsukuyomiWorld: 'mount' }, '', '#mount');
      onRoute();
    } else if (history.state && history.state.tsukuyomiWorld === 'mount') {
      history.back();   // hashchange → onRoute
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      onRoute();
    }
  }
  function onRoute() {
    const how = pendingHow || howFor();
    pendingHow = null;
    go(hashWorld(), how);
  }
  window.addEventListener('hashchange', onRoute);

  // ---------- 토리이 클릭 / 호버 ----------
  const overUI = t => (t instanceof Element) && !!t.closest('.panel,.dock,.tsd-panel,#tsdFab,.tsce-pad,.tcl-panel');
  function hitTorii(w, x, y) {
    const b = toriiBox(w);
    if (!b) return false;
    const pad = Math.max(6, (b.x1 - b.x0) * 0.04);
    return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
  }
  // 지금 토리이가 문 역할을 하는가: 月는 황혼일 때만, 山은 항상
  function doorAt(x, y) {
    if (busy) return null;
    if (world === 'moon') {
      const t = T();
      if (!isDusk() || !t || t.camOn || !(t.torii && t.torii.visible)) return null;
      return hitTorii(moon, x, y) ? 'mount' : null;
    }
    if (world === 'mount' && mount.M) return hitTorii(mount, x, y) ? 'moon' : null;
    return null;
  }
  let down = null;
  window.addEventListener('pointerdown', e => {
    down = (e.button > 0 || overUI(e.target)) ? null : { x: e.clientX, y: e.clientY, id: e.pointerId };
  }, true);
  window.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || d.id !== e.pointerId || overUI(e.target)) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;   // 드래그(물결 긋기)는 제외
    const target = doorAt(e.clientX, e.clientY);
    if (!target) return;
    navigate(target, target === 'mount' ? 'portal' : howFor());
  });
  let hoverOn = false;
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const on = !overUI(e.target) && !!doorAt(e.clientX, e.clientY);
    if (on && world === 'moon') prewarm();
    if (on !== hoverOn) {
      hoverOn = on;
      if (on) document.body.setAttribute('data-torii-hover', '');
      else document.body.removeAttribute('data-torii-hover');
    }
  }, { passive: true });

  // ---------- 산 버튼 (백업 전환 + 길게 눌러 디버그 패널) ----------
  const HOLD_MS = 600;
  function wireToggle(btn, target) {
    if (!btn) return;
    let holdT = 0, held = false;
    const cancel = () => { clearTimeout(holdT); holdT = 0; };
    btn.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      cancel();
      holdT = setTimeout(() => {
        holdT = 0;
        held = true;
        const dbg = window.__TSUKUYOMI_DEBUG__;
        if (dbg && dbg.toggle) dbg.toggle();
      }, HOLD_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, cancel));
    btn.addEventListener('contextmenu', e => { if (held) e.preventDefault(); });
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (held) { held = false; return; }
      const kb = e.detail === 0;
      navigate(target, howFor());
      // 키보드로 눌렀으면 전환 뒤 반대편 버튼으로 포커스를 옮긴다
      if (kb) {
        const other = target === 'mount' ? btnToMoon : btnToMount;
        const wait = () => {
          if (busy) { requestAnimationFrame(wait); return; }
          if (world === target && other) { try { other.focus({ preventScroll: true }); } catch (err) { /* 무시 */ } }
        };
        requestAnimationFrame(wait);
      } else {
        try { btn.blur(); } catch (err) { /* 무시 */ }
      }
    });
    if (target === 'mount') {
      btn.addEventListener('pointerenter', prewarm);
      btn.addEventListener('focus', prewarm);
    }
  }
  wireToggle(btnToMount, 'mount');
  wireToggle(btnToMoon, 'moon');

  // ---------- 시작 ----------
  if (hashWorld() === 'mount') {
    // #mount로 바로 들어오면 전환 연출 없이 산을 띄운다(月는 그 사이 멈춰 둔다)
    setBusy(true);
    mount.start().then(() => {
      mountEl.hidden = false;
      settle(moon, mount);
    }).catch(e => {
      console.warn('[tsukuyomi] 산 장면 로드 실패, 수면으로 시작:', e);
      history.replaceState(null, '', location.pathname + location.search);
    }).finally(() => setBusy(false));
  } else {
    // 첫 방문은 月. 유휴 시간이 넉넉할 때 산을 미리 데워 둔다(첫 포털이 끊기지 않게)
    const later = () => { if (world === 'moon' && !mountP) prewarm(); };
    if (window.requestIdleCallback) setTimeout(() => requestIdleCallback(later, { timeout: 4000 }), 4000);
    else setTimeout(later, 6000);
  }

  window.__TSUKUYOMI_WORLDS__ = {
    get world() { return world; },
    get busy() { return busy; },
    go: (target, how) => navigate(target, how || howFor()),
    cfg: CFG,
  };
})();
