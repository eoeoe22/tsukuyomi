/* 세계 전환: 月(수면 토리이: 황혼·밤·미러볼) · 海(공백) · 山(산정 토리이, tsukuyomi.mount.js) · 地(역광 지구, tsukuyomi.earth.js).
 * 경로는 tsukuyomi.html 하나로 통합하고 해시로 연다(정적 호스팅이라 경로 리라이트 없이):
 *   없음 = 月, #sea = 海, #mount = 山, #earth = 地.
 * 月와 海는 같은 엔진(tsukuyomi.js)·캔버스를 쓴다. 둘 사이는 엔진의 장면 전환(공백 ↔ 황혼 스냅샷 크로스페이드 등)에
 * 맡기고 하단 패널만 바꾼다. 그 밖의 전환은 모두 단순 페이드.
 *
 * 진입 / 복귀
 *   - 각 세계 패널 맨 왼쪽의 세계 드롭다운(.world-picker, 이 파일이 만든다).
 *     드롭다운 버튼을 길게 누르면 디버그 패널 토글(예전 산 버튼의 홀드 동작을 이어받음).
 *   - 브라우저 뒤로/앞으로·해시 직접 수정도 같은 규칙으로 전환한다. 기록은 月 위에 한 칸만 쌓는다(山↔地는 그 칸을 바꿔 씀).
 *   - 랜딩(landing.html)은 <html data-worlds-route="off">로 해시·기록·제목 연동과 드롭다운을 끄고
 *     __TSUKUYOMI_WORLDS__.go(target, { history: false, scene })로 직접 전환한다.
 */
(() => {
  'use strict';

  const moonEl = document.getElementById('worldMoon');
  const mountEl = document.getElementById('worldMount');
  const earthEl = document.getElementById('worldEarth');
  const moonPanel = document.getElementById('panel');
  const moonDock = moonPanel ? moonPanel.closest('.dock') : null;
  const mountDock = document.getElementById('mountDock');
  const earthDock = document.getElementById('earthDock');
  const seaDock = document.getElementById('seaDock');
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
  // 해시·history·document.title 연동. 랜딩은 스크롤이 세계를 고르므로 끈다
  const ROUTE = document.documentElement.getAttribute('data-worlds-route') !== 'off';
  const TITLES = { moon: '月 | ( ◠ ᗜ ◠ )', sea: '海 | ( ◠ ᗜ ◠ )', mount: '山 | ( ◠ ᗜ ◠ )', earth: '地 | ( ◠ ᗜ ◠ )' };
  const HASH = { sea: '#sea', mount: '#mount', earth: '#earth' };

  // ---------- 엔진 지연 로드 (山 / 地) ----------
  function lazyScript(src, name) {
    let p = null;
    return () => {
      if (!p) {
        p = new Promise((resolve, reject) => {
          if (window[name]) { resolve(window[name]); return; }
          const s = document.createElement('script');
          s.src = src;
          s.onload = () => window[name] ? resolve(window[name]) : reject(new Error(name + ' 없음'));
          s.onerror = () => reject(new Error(src + ' 로드 실패'));
          document.head.appendChild(s);
        }).catch(e => { p = null; throw e; });
      }
      return p;
    };
  }
  const loadMount = lazyScript('tsukuyomi.mount.js', 'TsukuyomiMount');
  const loadEarth = lazyScript('tsukuyomi.earth.js', 'TsukuyomiEarth');
  // 의도가 보이면(드롭다운 근처) 미리 받아 배치·구름 생성·셰이더 컴파일을 시작해 둔다
  const prewarmMount = () => { loadMount().catch(e => console.warn('[tsukuyomi] 산 장면 미리 로드 실패:', e)); };
  const prewarmEarth = () => { if (earthEl) loadEarth().catch(e => console.warn('[tsukuyomi] 지구 장면 미리 로드 실패:', e)); };
  const prewarm = () => { prewarmMount(); prewarmEarth(); };

  // ---------- 세계 어댑터: 시작/정지 ----------
  // o.snap: 엔진이 멈춰 있다가(다른 세계에서) 올라오는 경우. 화면에 보이기 전이라 장면을 전환 없이 바로 맞춘다
  const engineMode = () => { try { return T().mode; } catch (e) { return null; } };
  function engineTo(mode, snap) {
    const t = T();
    if (!t) return;
    try {
      if (mode === t.mode) return;
      t.mode = mode;   // 진행 중인 연출(미러볼 등) 정리 + 전환 시작
      // 공백·황혼은 정지 상태로 바로 스냅(랜딩 첫 화면과 같은 방식). 밤·미러볼은 엔진 전환 그대로
      if (snap && (mode === 'day' || mode === 'dusk')) t.state = mode;
    } catch (e) { console.warn('[tsukuyomi] 장면 설정 실패:', e); }
  }
  // 月로 돌아올 때 띄울 장면: 月에서 마지막으로 보던 것(처음엔 인트로가 향하는 밤)
  let moonMode = 'night';
  const moon = {
    id: 'moon', el: moonEl, dock: moonDock,
    start(o) {
      try { T().resume(); } catch (e) { /* 무시 */ }
      // 海가 따로 있을 때만(tsukuyomi.html). 랜딩은 공백도 月의 장면이다
      if (sea && engineMode() === 'day') engineTo(moonMode, o && o.snap);
      return Promise.resolve();
    },
    leave() { const m = engineMode(); if (m && m !== 'day') moonMode = m; },
    stop() { try { T().suspend(); } catch (e) { /* 무시 */ } },
  };
  const sea = seaDock ? {
    id: 'sea', el: moonEl, dock: seaDock,
    start(o) {
      try { T().resume(); } catch (e) { /* 무시 */ }
      engineTo('day', o && o.snap);
      return Promise.resolve();
    },
    stop() { try { T().suspend(); } catch (e) { /* 무시 */ } },
  } : null;
  const mount = {
    id: 'mount', el: mountEl, dock: mountDock,
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
  // 地: 올릴 때마다 인트로(태양이 떠오르고 죽순이 멀어짐)를 처음부터 재생한다
  const earth = (earthEl && earthDock) ? {
    id: 'earth', el: earthEl, dock: earthDock,
    E: null,
    start() { return loadEarth().then(E => { this.E = E; E.start(); }); },
    stop() { if (this.E) this.E.stop(); },
  } : null;
  const WORLDS = { moon };
  if (sea) WORLDS.sea = sea;
  WORLDS.mount = mount;
  if (earth) WORLDS.earth = earth;

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

  // 단순 페이드: B를 A 위에 올려 불투명도만 올린다.
  // A는 페이드를 시작할 때 멈춘다: 캔버스에 마지막 화면이 그대로 남아 정지 화면으로 걷히고, 두 세계를 함께 그리지 않는다
  function fade(A, B) {
    A.stop();
    B.el.style.opacity = '0';
    B.el.style.zIndex = '1';
    B.el.hidden = false;
    return rafLoop(RM.matches ? CFG.FADE_RM_MS : CFG.FADE_MS, u => {
      B.el.style.opacity = String(ss(0, 1, u));
    });
  }

  // ---------- 전환 진입점 ----------
  const urlOf = id => (HASH[id] || (location.pathname + location.search));
  let wanted = null, wantedOpts = null;   // 전환 중 들어온 마지막 요청(해시 변화 등)
  async function go(target, opts) {
    if (!WORLDS[target]) return;
    if (busy) { wanted = target; wantedOpts = opts || null; return; }
    if (target === world) return;
    const A = WORLDS[world], B = WORLDS[target];
    setBusy(true);
    if (A.leave) A.leave();
    // 같은 엔진(月 ↔ 海): 캔버스는 그대로 두고 엔진 장면 전환 + 패널 교체(패널은 busy 동안 잠깐 내려간다)
    if (A.el === B.el) {
      try {
        await B.start(opts);
        await new Promise(r => setTimeout(r, RM.matches ? 0 : 350));
        A.dock.hidden = true;
        B.dock.hidden = false;
        world = B.id;
        if (ROUTE) document.title = TITLES[B.id];
      } catch (e) {
        console.warn('[tsukuyomi] 세계 전환 실패:', e);
      } finally {
        setBusy(false);
      }
      if (wanted && wanted !== world) { const t = wanted, o = wantedOpts; wanted = null; wantedOpts = null; await go(t, o); }
      else { wanted = null; wantedOpts = null; }
      return;
    }
    try {
      await B.start(Object.assign({}, opts, { snap: true }));
      // 첫 프레임이 캔버스에 올라간 다음부터 보여 준다
      await new Promise(r => requestAnimationFrame(() => r()));
      await fade(A, B);
      settle(A, B);
    } catch (e) {
      console.warn('[tsukuyomi] 세계 전환 실패:', e);
      clearFx(B);
      WORLDS[world].start().catch(() => { /* 무시 */ });   // fade()가 멈췄을 수 있다
      if (B !== WORLDS[world]) { B.stop(); B.el.hidden = true; }
      // 주소를 실제로 남은 세계에 맞춘다(뒤로 가기 기록은 건드리지 않음)
      if (ROUTE && hashWorld() !== world) history.replaceState(history.state, '', urlOf(world));
    } finally {
      setBusy(false);
    }
    if (wanted && wanted !== world) { const t = wanted, o = wantedOpts; wanted = null; wantedOpts = null; await go(t, o); }
    else { wanted = null; wantedOpts = null; }
  }

  // ---------- 경로(해시)와 기록 ----------
  function hashWorld() {
    for (const id in HASH) if (location.hash === HASH[id] && WORLDS[id]) return id;
    return 'moon';
  }
  function navigate(target) {
    if (busy || target === world || !WORLDS[target]) return;
    const pushed = !!(history.state && history.state.tsukuyomiWorld);   // 月 위에 쌓은 한 칸 안에 있는가
    if (target !== 'moon') {
      if (pushed) history.replaceState({ tsukuyomiWorld: target }, '', HASH[target]);
      else history.pushState({ tsukuyomiWorld: target }, '', HASH[target]);
      onRoute();
    } else if (pushed) {
      history.back();   // hashchange → onRoute
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      onRoute();
    }
  }
  function onRoute() { go(hashWorld()); }
  if (ROUTE) window.addEventListener('hashchange', onRoute);

  // ---------- 세계 드롭다운 (각 패널 맨 왼쪽) ----------
  // 아이콘: 16px 단색(currentColor). 토리이는 reference-images/done/torii.svg를 줄인 examples/torii-icon.svg,
  // 산은 examples/mountain-icon.svg, 지구는 bootstrap-icons
  const svg16 = d => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>';
  const MENU = [
    {
      id: 'moon', label: '츠쿠요미 수면',
      icon: svg16('M.07 1.41Q8 3.04 15.93 1.41L15.7 2.19 15.19 2.22 15.11 3.04Q8 4.44.89 3.04L.81 2.22.3 2.19ZM7.5 3.5H8.5V6.1H7.5ZM1.63 6H14.37V7H1.63ZM3.41 3.2H4.44L4.56 13.7H3.3ZM3.19 13.56H4.67V14.59H3.19ZM11.56 3.2H12.59L12.7 13.7H11.44ZM11.33 13.56H12.81V14.59H11.33Z'),
    },
    { id: 'sea', label: '츠쿠요미 바다', icon: '<i class="bi bi-cloud-fill" aria-hidden="true"></i>' },
    {
      id: 'mount', label: '산 정상',
      icon: svg16('M11.225 6.553a.5.5 0 0 0-.577.093l-3.71 4.71-2.66-2.772a.5.5 0 0 0-.63.062L.002 13v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4.5z'),
    },
    { id: 'earth', label: '지구', icon: '<i class="bi bi-globe-americas-fill" aria-hidden="true"></i>' },
  ].filter(m => WORLDS[m.id]);
  const pickers = [];

  function buildPicker(w) {
    const panel = w.dock.querySelector('.panel');
    if (!panel) return;
    const cur = MENU.find(m => m.id === w.id);
    const wrap = document.createElement('div');
    wrap.className = 'world-picker';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'world-select';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', '장면 선택: ' + cur.label);
    btn.innerHTML = cur.icon + '<i class="bi bi-chevron-expand world-caret" aria-hidden="true"></i>';
    const menu = document.createElement('div');
    menu.className = 'world-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '장면 선택');
    const items = MENU.map(m => {
      const it = document.createElement('button');
      it.type = 'button';
      it.setAttribute('role', 'menuitemradio');
      it.setAttribute('aria-checked', m.id === w.id ? 'true' : 'false');
      it.tabIndex = -1;
      it.dataset.world = m.id;
      it.innerHTML = '<span class="world-menu-icon">' + m.icon + '</span><span>' + m.label + '</span>';
      menu.appendChild(it);
      return it;
    });
    wrap.append(btn, menu);
    panel.insertBefore(wrap, panel.firstChild);
    const P = { w, wrap, btn, menu, items };
    pickers.push(P);
    wirePicker(P);
  }

  const isOpen = P => P.wrap.classList.contains('open');
  function openMenu(P, focusIdx) {
    for (const o of pickers) if (o !== P) closeMenu(o, false);
    P.wrap.classList.add('open');
    P.btn.setAttribute('aria-expanded', 'true');
    prewarm();
    if (focusIdx != null) {
      const i = (focusIdx + P.items.length) % P.items.length;
      try { P.items[i].focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
    }
  }
  function closeMenu(P, refocus) {
    if (!isOpen(P)) return;
    P.wrap.classList.remove('open');
    P.btn.setAttribute('aria-expanded', 'false');
    if (refocus) { try { P.btn.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
  }
  const curIdx = P => Math.max(0, P.items.findIndex(it => it.getAttribute('aria-checked') === 'true'));

  // 고른 세계로 전환. 키보드로 골랐으면 전환 뒤 새 패널의 드롭다운 버튼으로 포커스를 옮긴다
  function pick(P, id, kb) {
    closeMenu(P, kb && id === P.w.id);
    if (id === P.w.id) return;
    navigate(id);
    if (!kb) { try { document.activeElement && document.activeElement.blur(); } catch (e) { /* 무시 */ } return; }
    const wait = () => {
      if (busy) { requestAnimationFrame(wait); return; }
      const nP = pickers.find(o => o.w.id === world);
      if (world === id && nP) { try { nP.btn.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
    };
    requestAnimationFrame(wait);
  }

  const HOLD_MS = 600;
  function wirePicker(P) {
    const { btn, menu, items, wrap } = P;
    // 버튼: 클릭 = 열기/닫기, 길게 누르기 = 디버그 패널
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
      if (isOpen(P)) closeMenu(P, false);
      else openMenu(P, e.detail === 0 ? curIdx(P) : null);
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu(P, e.key === 'ArrowUp' ? items.length - 1 : 0);
      }
    });
    btn.addEventListener('pointerenter', prewarm);
    btn.addEventListener('focus', prewarm);

    // 항목
    items.forEach((it, i) => {
      it.addEventListener('click', e => { e.stopPropagation(); pick(P, it.dataset.world, e.detail === 0); });
      it.addEventListener('keydown', e => {
        let j = null;
        if (e.key === 'ArrowDown') j = i + 1;
        else if (e.key === 'ArrowUp') j = i - 1;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = items.length - 1;
        else if (e.key === 'Escape') { e.preventDefault(); closeMenu(P, true); return; }
        else if (e.key === 'Tab') { closeMenu(P, false); return; }
        if (j == null) return;
        e.preventDefault();
        try { items[(j + items.length) % items.length].focus({ preventScroll: true }); } catch (err) { /* 무시 */ }
      });
    });
    // 바깥을 누르거나 포커스가 빠지면 닫는다
    document.addEventListener('pointerdown', e => { if (isOpen(P) && !wrap.contains(e.target)) closeMenu(P, false); }, true);
    wrap.addEventListener('focusout', () => setTimeout(() => {
      if (isOpen(P) && !wrap.contains(document.activeElement)) closeMenu(P, false);
    }, 0));
    menu.addEventListener('pointerdown', e => e.stopPropagation());
  }
  if (ROUTE) for (const id in WORLDS) buildPicker(WORLDS[id]);
  // 전환이 시작되면 열린 메뉴를 닫는다(뒤로 가기 등)
  const closeAll = () => { for (const P of pickers) closeMenu(P, false); };
  if (ROUTE) window.addEventListener('hashchange', closeAll);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  // ---------- 시작 ----------
  const first = ROUTE ? hashWorld() : 'moon';
  if (first !== 'moon') {
    // 해시로 바로 들어오면 전환 연출 없이 그 세계를 띄운다(月는 그 사이 멈춰 둔다)
    const B = WORLDS[first];
    setBusy(true);
    B.start({ snap: true }).then(() => {
      B.el.hidden = false;
      if (B.el === moon.el) {
        // 海: 같은 캔버스 그대로, 패널만 바꾼다
        moon.dock.hidden = true;
        B.dock.hidden = false;
        world = B.id;
        document.title = TITLES[B.id];
      } else settle(moon, B);
    }).catch(e => {
      console.warn('[tsukuyomi] ' + first + ' 장면 로드 실패, 수면으로 시작:', e);
      history.replaceState(null, '', location.pathname + location.search);
    }).finally(() => setBusy(false));
  } else {
    // 첫 방문은 月. 유휴 시간이 넉넉할 때 산을 미리 데워 둔다(첫 전환이 끊기지 않게)
    const later = () => { if (world === 'moon') prewarmMount(); };
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
