/* 두 세계 전환: 月(수면 토리이, tsukuyomi.js) ↔ 山(산정 토리이, tsukuyomi.mount.js).
 * 경로는 tsukuyomi.html 하나로 통합하고 산은 해시 #mount로 연다(정적 호스팅이라 경로 리라이트 없이).
 *
 * 진입 / 복귀 (전환은 모두 단순 페이드)
 *   - 산 버튼(#btnToMount / #btnToMoon). 길게 누르면 디버그 패널 토글(예전 card-text 버튼의 홀드 동작을 이어받음).
 *   - 브라우저 뒤로/앞으로·해시 직접 수정도 같은 규칙으로 전환한다.
 *   - 랜딩(landing.html)은 <html data-worlds-route="off">로 해시·기록·제목 연동을 끄고
 *     __TSUKUYOMI_WORLDS__.go(target, { history: false, scene })로 직접 전환한다.
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
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  const CFG = {
    FADE_MS: 1100,      // 단순 페이드
    FADE_RM_MS: 450,    // 동작 줄이기 설정의 페이드
    // 디버그: 0~1 숫자면 전환을 그 진행도에 멈춰 둔다(콘솔에서 __TSUKUYOMI_WORLDS__.cfg.SCRUB = 0.4). null이면 정상 재생
    SCRUB: null,
  };
  // 해시(#mount)·history·document.title 연동. 랜딩은 스크롤이 세계를 고르므로 끈다
  const ROUTE = document.documentElement.getAttribute('data-worlds-route') !== 'off';
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
  // 의도가 보이면(산 버튼 근처) 미리 받아 배치·구름 생성을 유휴 시간에 시작해 둔다
  const prewarm = () => { loadMount().catch(e => console.warn('[tsukuyomi] 산 장면 미리 로드 실패:', e)); };

  // ---------- 세계 어댑터: 시작/정지 ----------
  const moon = {
    id: 'moon', el: moonEl, dock: moonDock, toggle: btnToMount,
    start() { try { T().resume(); } catch (e) { /* 무시 */ } return Promise.resolve(); },
    stop() { try { T().suspend(); } catch (e) { /* 무시 */ } },
  };
  const mount = {
    id: 'mount', el: mountEl, dock: mountDock, toggle: btnToMoon,
    M: null,
    // o.scene: 화면에 올리기 전에 산 장면을 바로(페이드 없이, 저장 없이) 맞춘다
    start(o) {
      return loadMount().then(M => {
        this.M = M;
        if (o && o.scene) M.setScene(o.scene, { instant: true, persist: false });
        M.start();
      });
    },
    stop() { if (this.M) this.M.stop(); },
  };
  const WORLDS = { moon, mount };

  // ---------- 상태 ----------
  let world = 'moon';
  let busy = false;

  function setBusy(on) {
    busy = on;
    if (on) document.body.setAttribute('data-world-busy', '');
    else document.body.removeAttribute('data-world-busy');
  }
  function clearFx(w) {
    const st = w.el.style;
    st.opacity = ''; st.zIndex = '';
  }
  // 전환이 끝나면 B만 남기고 A를 내린다
  function settle(A, B) {
    A.stop();
    A.el.hidden = true;
    A.dock.hidden = true;
    clearFx(A); clearFx(B);
    B.dock.hidden = false;
    if (B === mount && mount.M) mount.M.syncUI();
    world = B.id;
    if (ROUTE) document.title = TITLES[B.id];
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

  // ---------- 전환 진입점 ----------
  let wanted = null, wantedOpts = null;   // 전환 중 들어온 마지막 요청(해시 변화 등)
  async function go(target, opts) {
    if (!WORLDS[target]) return;
    if (busy) { wanted = target; wantedOpts = opts || null; return; }
    if (target === world) return;
    const A = WORLDS[world], B = WORLDS[target];
    setBusy(true);
    try {
      await B.start(opts);
      // 첫 프레임이 캔버스에 올라간 다음부터 보여 준다
      await new Promise(r => requestAnimationFrame(() => r()));
      await fade(A, B);
      settle(A, B);
    } catch (e) {
      console.warn('[tsukuyomi] 세계 전환 실패:', e);
      clearFx(B);
      if (B !== WORLDS[world]) { B.stop(); B.el.hidden = true; }
      // 주소를 실제로 남은 세계에 맞춘다(뒤로 가기 기록은 건드리지 않음)
      if (ROUTE && hashWorld() !== world) history.replaceState(null, '', world === 'mount' ? '#mount' : location.pathname + location.search);
    } finally {
      setBusy(false);
    }
    if (wanted && wanted !== world) { const t = wanted, o = wantedOpts; wanted = null; wantedOpts = null; await go(t, o); }
    else { wanted = null; wantedOpts = null; }
  }

  // ---------- 경로(#mount)와 기록 ----------
  const hashWorld = () => (location.hash === '#mount' ? 'mount' : 'moon');
  function navigate(target) {
    if (busy || target === world) return;
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
  function onRoute() { go(hashWorld()); }
  if (ROUTE) window.addEventListener('hashchange', onRoute);

  // ---------- 산 버튼 (전환 + 길게 눌러 디버그 패널) ----------
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
      navigate(target);
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
  if (ROUTE && hashWorld() === 'mount') {
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
    // 첫 방문은 月. 유휴 시간이 넉넉할 때 산을 미리 데워 둔다(첫 전환이 끊기지 않게)
    const later = () => { if (world === 'moon' && !mountP) prewarm(); };
    if (window.requestIdleCallback) setTimeout(() => requestIdleCallback(later, { timeout: 4000 }), 4000);
    else setTimeout(later, 6000);
  }

  window.__TSUKUYOMI_WORLDS__ = {
    get world() { return world; },
    get busy() { return busy; },
    // opts.history === false: 해시·뒤로 가기 기록을 남기지 않고 바로 전환한다(랜딩 스크롤용).
    //   opts.scene: 산으로 갈 때 띄울 장면('dusk' | 'sunset'). 전환이 끝나면 resolve.
    go: (target, opts) => (opts && opts.history === false) ? go(target, opts) : navigate(target),
    prewarm,
    cfg: CFG,
  };
})();
