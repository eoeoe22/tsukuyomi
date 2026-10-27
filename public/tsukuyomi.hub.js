/* 허브 페이지(hub.html): 랜드마크 클릭 인디케이터 + 카메라 확대 + 설명카드.
 * 예전 tsukuyomi.focus.js(6cb343a에서 제거, 정리 문서 docs/click-indicator-and-markup-card.md)를
 * 세계 전환(tsukuyomi.worlds.js)에 맞게 세계별 등록 방식으로 바꿨다.
 *
 * 세계 정의: TsukuyomiHub.register(worldId, { camera, landmarks })
 *   camera()  → 카메라 어댑터 또는 null. 엔진이 늦게 로드되는 세계가 있어 함수로 받는다.
 *     { get() → {f, m, s} | null, set(f, m, s, info), clear(), cover: bool, prof?() → zoomProf }
 *     screen = m + s·(world − f), 좌표는 모두 css px. info = { res, path, follow }
 *     cover: true면 확대 중 화면 밖(장면이 없는 곳)이 보이지 않도록 배율 하한을 둔다.
 *   landmarks: [{ id, name, scale, follow, get() }]
 *     id: 카드 원문 cards/{id}.wiki, 핀 식별자.  name: 원문을 못 읽었을 때의 제목
 *     scale: 확대 배율(기본 2).  follow: 카메라가 매 프레임 랜드마크를 따라간다(움직이는 랜드마크)
 *     get() → { x, y, ext: { l, r, t, b }, visible }  중심과 가장자리까지 거리 (css px, 카메라 적용 전)
 *
 * 등록된 세계
 *   月(moon): 토리이 · 달 · 미러볼. 엔진(tsukuyomi.js)의 인-캔버스 카메라.
 *   地(earth): 죽순. 지구 셰이더의 카메라(tsukuyomi.earth.js), 죽순을 따라간다.
 *   海·山·八·犬: 랜드마크 없이 카메라만 연결해 둔 상태. 海는 엔진 카메라, 나머지는 .world-view CSS 변환(cssCamera).
 *     랜드마크를 붙이려면 아래 "그 밖의 세계"의 landmarks 배열에 항목을 넣고 cards/{id}.wiki를 만든다.
 */
(() => {
  'use strict';

  const ui = document.getElementById('focusUi');
  const backBtn = document.getElementById('focusBack');
  const card = document.getElementById('focusCard');
  const title = document.getElementById('focusTitle');
  const desc = document.getElementById('focusDesc');
  const body = document.getElementById('focusBody');
  if (!ui || !backBtn || !card) return;

  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const T = () => window.__TSUKUYOMI__ || null;
  const WORLDS = () => window.__TSUKUYOMI_WORLDS__ || null;
  const curWorld = () => { const w = WORLDS(); return w ? w.world : 'moon'; };
  const worldBusy = () => { const w = WORLDS(); return !!(w && w.busy); };

  // ---------- 카메라 어댑터 ----------
  // 月·海: 엔진 인-캔버스 카메라
  const engineCam = {
    get() { try { return T().getCamView(); } catch (e) { return null; } },
    set(f, m, s, o) { T().setCamView(f, m, s, o.res, o.path); },
    clear() { try { T().clearCam(); } catch (e) { /* 무시 */ } },
    cover: true,
    prof() { const t = T(); return t && t.zoomProf; },
  };
  const engineCamera = () => {
    const t = T();
    return (t && t.setCamView && t.clearCam && t.getCamView) ? engineCam : null;
  };
  // 자체 카메라가 없는 세계: .world-view에 CSS 변환을 건다(비트맵 확대라 흐려질 수 있다).
  // 장면이 화면 크기만큼만 있으므로 cover를 켠다.
  function cssCamera(worldId) {
    const el = document.getElementById(worldId);
    const view = el && el.querySelector('.world-view');
    if (!view) return () => null;
    let st = null;
    const cam = {
      get() { return st; },
      set(f, m, s) {
        st = { f: { x: f.x, y: f.y }, m: { x: m.x, y: m.y }, s };
        view.style.transform = 'translate(' + (m.x - s * f.x) + 'px,' + (m.y - s * f.y) + 'px) scale(' + s + ')';
      },
      clear() { st = null; view.style.transform = ''; },
      cover: true,
    };
    return () => cam;
  }

  // ---------- 세계 정의 ----------
  const DEFS = {};
  const LM = {};   // id → { def, lm, pin }
  function register(worldId, def) {
    const d = { id: worldId, camera: def.camera || (() => null), landmarks: def.landmarks || [] };
    DEFS[worldId] = d;
    for (const lm of d.landmarks) {
      if (LM[lm.id]) console.warn('[hub] 랜드마크 id 중복:', lm.id);
      LM[lm.id] = { def: d, lm, pin: makePin(lm) };
      loadCardSrc(lm.id).catch(() => { /* 진입 시 재시도 */ });
    }
    return d;
  }

  // 月: 달 상승(moonMT)이 끝난 뒤에만 달·미러볼을 보인다. 둘은 같은 중심이라 화면 불투명도(v)가 큰 쪽 하나만.
  const moonRisen = () => { const t = T(); const mt = t && t.moonMT; return typeof mt !== 'number' || mt >= 0.999; };
  const HIDDEN = { x: 0, y: 0, ext: { l: 0, r: 0, t: 0, b: 0 }, visible: false };
  function moonGet(kind) {
    const t = T();
    if (!t) return HIDDEN;
    const pm = t.plainMoon || { visible: false, v: 0 };
    const mb = t.moon || { visible: false, v: 0 };
    const risen = moonRisen();
    const showPm = !!pm.visible && risen, showMb = !!mb.visible && risen;
    // 동점이면 일반 달 우선
    const usePm = showPm && !(showMb && (mb.v || 0) > (pm.v || 0));
    const useMb = showMb && !usePm;
    const m = kind === 'mirror' ? mb : pm;
    const r = m.r || 0;
    return { x: m.x, y: m.y, ext: { l: r, r, t: r, b: r }, visible: kind === 'mirror' ? useMb : usePm };
  }
  const moonLandmarks = [
    {
      id: 'torii', name: '토리이', scale: 1.8,
      get() {
        const t = T(), o = t && t.torii;
        if (!o) return HIDDEN;
        return {
          x: o.cx, y: o.cy,
          ext: { l: o.cx - o.x, r: o.x + o.w - o.cx, t: o.cy - o.y, b: Math.max(0, o.y + o.h - o.cy) },
          visible: !!o.visible,
        };
      },
    },
    { id: 'moon', name: '달', scale: 2.4, get: () => moonGet('moon') },
    { id: 'mirror', name: '미러볼', scale: 2.4, get: () => moonGet('mirror') },
  ];

  // 地: 죽순. 인트로가 끝나 자리를 잡은 뒤에 보이고, 확대 중에는 카메라가 죽순을 따라간다.
  const earthE = () => window.TsukuyomiEarth || null;
  const earthCam = {
    get() { const E = earthE(); return E ? E.getCamView() : null; },
    set(f, m, s, o) { earthE().setCamView(f, m, s, { follow: !!o.follow }); },
    clear() { const E = earthE(); if (E) E.clearCam(); },
    cover: false,   // 셰이더 장면이라 화면 밖도 그려진다
  };
  const earthLandmarks = [
    {
      id: 'takenoko', name: '죽순', scale: 5, follow: true,
      get() { const E = earthE(); return (E && E.takenoko) || HIDDEN; },
    },
  ];

  // ---------- 핀 (클릭 인디케이터 + 제목 표시기) ----------
  function makePin(lm) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'focus-pin';
    el.dataset.landmark = lm.id;
    el.style.display = 'none';
    el.setAttribute('aria-label', lm.name + ' 확대 보기');
    el.setAttribute('aria-expanded', 'false');
    el.innerHTML =
      '<span class="click-indicator" aria-hidden="true"><span class="pulse"></span><span class="core"></span></span>' +
      '<span class="pin-label" aria-hidden="true"><span class="pin-diag"></span><span class="pin-title"></span></span>';
    el.querySelector('.pin-title').textContent = lm.name;
    ui.insertBefore(el, backBtn);
    el.addEventListener('click', e => { lastPin = el; enter(lm.id, e.detail === 0); });
    el.addEventListener('blur', () => el.classList.remove('no-focus-ring'));
    stopScene(el);
    return el;
  }
  // 핀·카드 위 포인터가 장면 핸들러(물결·미러볼 발사 등)까지 가지 않게 막는다
  function stopScene(el) {
    el.addEventListener('pointerdown', e => e.stopPropagation(), true);
    el.addEventListener('pointermove', e => e.stopPropagation(), true);
  }
  stopScene(backBtn);
  stopScene(card);
  backBtn.addEventListener('blur', () => backBtn.classList.remove('no-focus-ring'));

  // ---------- 카메라 애니메이션 ----------
  let focus = null;      // null | { id, def, lm, cam }
  let lastZoom = null;   // { f, t, s, ext }
  let lastPin = null;
  const ZOOM_MS = 1600;
  const EXIT_COOL_MS = REDUCED ? 60 : ZOOM_MS + 100;   // 복귀가 끝날 때까지 핀을 숨긴다
  let exitCoolUntil = 0, exitCoolT = 0, focusBackT = 0;
  const cooling = () => performance.now() < exitCoolUntil;

  // CSS cubic-bezier(0.22, 0.8, 0.24, 1)와 같은 곡선 (뉴턴법)
  function cubicBezier(p1x, p1y, p2x, p2y) {
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t;
    const sy = t => ((ay * t + by) * t + cy) * t;
    const dx = t => (3 * ax * t + 2 * bx) * t + cx;
    return u => {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      let t = u;
      for (let i = 0; i < 5; i++) {
        const e = sx(t) - u, d = dx(t);
        if (Math.abs(e) < 1e-4 || Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      return sy(t);
    };
  }
  const easeZoom = cubicBezier(0.22, 0.8, 0.24, 1);

  // 줌 프로파일러(엔진 카메라만): 구간을 감싸고, 끝은 2프레임 늦춰 마지막 프레임 비용까지 잰다
  let profId = 0;
  const prof = (cam, label) => {
    profId++;
    try { const P = cam.prof && cam.prof(); if (P) P.begin(label); } catch (e) { /* 무시 */ }
  };
  const profEnd = cam => {
    const id = profId;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (id !== profId) return;
      try { const P = cam.prof && cam.prof(); if (P && P.on) P.end(); } catch (e) { /* 무시 */ }
    }));
  };

  let camAnim = 0;
  function cancelCamAnim() { if (camAnim) { cancelAnimationFrame(camAnim); camAnim = 0; } }
  // f 고정, 화면 위치 m과 배율 s를 같은 곡선으로 함께 보간한다.
  // 시작이 항등(m0 = f, s0 = 1)이면 초점이 바로 목표로 움직이면서 동시에 커진다.
  // res: 캐시 해상도 힌트(구간 최대 배율), path: 경로 전체 (엔진이 캐시를 한 번만 굽게)
  function animCam(cam, f, m0, s0, m1, s1, follow, done) {
    cancelCamAnim();
    const info = { res: Math.max(s0, s1), path: { m0, s0, m1, s1 }, follow };
    const apply = (m, s) => { try { cam.set(f, m, s, info); } catch (e) { /* 무시 */ } };
    if (REDUCED) { apply(m1, s1); if (done) done(); return; }
    const t0 = performance.now();
    const step = now => {
      const u = Math.min(1, (now - t0) / ZOOM_MS);
      const e = easeZoom(u);
      apply({ x: m0.x + (m1.x - m0.x) * e, y: m0.y + (m1.y - m0.y) * e }, s0 + (s1 - s0) * e);
      if (u < 1) camAnim = requestAnimationFrame(step);
      else { camAnim = 0; if (done) done(); }
    };
    camAnim = requestAnimationFrame(step);
  }

  // ---------- 확대 계산 ----------
  const isNarrow = () => window.innerWidth <= 460 ||
    !!(window.matchMedia && window.matchMedia('(pointer: coarse) and (max-height: 500px)').matches);
  // 넓은 화면: 랜드마크 오른쪽, 카드 왼쪽. 좁은 화면: 랜드마크 위쪽 가운데, 카드는 하단 시트
  const targetFor = () => isNarrow()
    ? { x: window.innerWidth * 0.5, y: window.innerHeight * 0.32 }
    : { x: window.innerWidth * 0.72, y: window.innerHeight * 0.45 };
  const CARD_GAP = 12;     // 확대된 랜드마크 가장자리 ↔ 카드
  const CARD_MARGIN = 16;  // 카드 ↔ 뷰포트 가장자리
  const cardWidth = () => Math.min(340, window.innerWidth - 32);   // CSS width와 같게

  // 뷰포트 네 모서리를 되돌린 좌표가 모두 장면(화면 크기) 안에 들어가는 최소 배율
  function coverScale(fx, fy, tx, ty) {
    const W = window.innerWidth, H = window.innerHeight;
    let s = 1;
    if (fx > 1) s = Math.max(s, tx / fx);
    if (W - fx > 1) s = Math.max(s, (W - tx) / (W - fx));
    if (fy > 1) s = Math.max(s, ty / fy);
    if (H - fy > 1) s = Math.max(s, (H - ty) / (H - fy));
    return s;
  }

  function computeZoom(lm, cam) {
    const g = lm.get();
    if (!g || !g.visible) return null;
    const f = { x: g.x, y: g.y };
    const ext = g.ext || { l: 0, r: 0, t: 0, b: 0 };
    const t = targetFor();
    const base = lm.scale || 2;
    // 커버 하한에 여유(+4%, +0.01)를 둬 서브픽셀 반올림에도 가장자리가 비지 않게
    const scaleAt = tx => cam.cover ? Math.max(base, coverScale(f.x, f.y, tx, t.y) * 1.04 + 0.01) : base;
    let s = scaleAt(t.x);
    if (!isNarrow()) {
      // 카드 + 간격 + 랜드마크 왼쪽 반폭이 들어가지 않으면 랜드마크를 오른쪽으로 민다(최대 W·0.86).
      // t.x가 바뀌면 커버 하한도 바뀌므로 몇 번 반복해 수렴시킨다.
      const minX = CARD_MARGIN + cardWidth() + CARD_GAP;
      for (let i = 0; i < 4; i++) {
        const need = Math.min(window.innerWidth * 0.86, minX + ext.l * s);
        if (need <= t.x) break;
        t.x = need;
        s = scaleAt(t.x);
      }
    }
    return { f, t, s, ext };
  }

  // 카드를 확대된 랜드마크 바로 옆(넓은 화면: 왼쪽, 좁은 화면: 아래)에 붙인다
  function placeCard(z) {
    const H = window.innerHeight;
    if (isNarrow()) {
      const top = Math.round(z.t.y + z.ext.b * z.s + CARD_GAP);
      card.style.top = (H - top - CARD_MARGIN >= 160) ? top + 'px' : '';
      card.style.left = '';
      return;
    }
    const left = Math.max(CARD_MARGIN, Math.round(z.t.x - z.ext.l * z.s - CARD_GAP - cardWidth()));
    const half = (card.offsetHeight || 220) / 2;
    const cy = Math.max(CARD_MARGIN + half, Math.min(H - CARD_MARGIN - half, z.t.y));
    card.style.left = left + 'px';
    card.style.top = Math.round(cy) + 'px';
  }

  // ---------- 카드 내용 ----------
  const markup = () => window.TsukuyomiMarkup || null;
  const nameOf = id => (LM[id] && LM[id].lm.name) || '플레이스홀더';
  function teardownBody() { const M = markup(); if (M && body) M.teardown(body); }
  function setHead(t, d) {
    if (title) title.textContent = t;
    if (desc) { desc.textContent = d || ''; desc.hidden = !d; }
  }

  // 핀 제목(.pin-title + aria-label)도 :::meta title을 따른다. 렌더러가 없으면 정규식으로 마지막 title만 뽑는다
  function metaTitleOf(src) {
    try {
      const M = markup();
      if (M && M.extractMeta) {
        const meta = M.extractMeta(src) || {};
        if (typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim();
      }
    } catch (e) { /* 폴백으로 */ }
    let found = '';
    const re = /^:::meta[ \t]*\n([\s\S]*?)\n:::[ \t]*$\n?/gm;
    let b;
    while ((b = re.exec(String(src).replace(/\r\n?/g, '\n'))) !== null) {
      for (const line of b[1].split('\n')) {
        const eq = line.indexOf('=');
        if (eq !== -1 && line.slice(0, eq).trim() === 'title' && line.slice(eq + 1).trim()) found = line.slice(eq + 1).trim();
      }
    }
    return found;
  }
  function applyPinTitle(id, t) {
    const o = LM[id];
    if (!o) return;
    t = (typeof t === 'string' && t.trim()) ? t.trim() : o.lm.name;
    const lb = o.pin.querySelector('.pin-title');
    if (lb && lb.textContent !== t) { lb.textContent = t; o.pin._lw = 0; }   // 라벨 폭 다시 재기
    const label = t + ' 확대 보기';
    if (o.pin.getAttribute('aria-label') !== label) o.pin.setAttribute('aria-label', label);
  }
  const refreshPinFromSrc = (id, src) => { if (typeof src === 'string') applyPinTitle(id, metaTitleOf(src)); };

  function renderFallback(id) {
    setHead(nameOf(id), '내용 준비 중입니다.');
    if (!body) return;
    teardownBody();
    body.classList.remove('wiki-content');
    body.textContent = '';
  }
  // 위키 원문 렌더. :::meta의 title/lead가 제목·설명이 된다. 실패하면 false
  function renderSource(id, src) {
    const M = markup();
    if (!M || !body || typeof src !== 'string') return false;
    let meta;
    try { meta = M.render(src, body, { dark: true }).meta || {}; } catch (e) {
      console.warn('[hub] 카드 렌더 실패:', id, e);
      return false;
    }
    setHead(meta.title || nameOf(id), meta.lead || '');
    applyPinTitle(id, meta.title);
    body.scrollTop = 0;
    card.scrollTop = 0;
    return true;
  }

  // cards/{id}.wiki 원문 캐시. 성공한 응답만 캐시하고 실패는 다음 진입 때 다시 시도한다
  const cardSrc = {}, cardReq = {};
  function loadCardSrc(id) {
    if (cardSrc[id] != null) return Promise.resolve(cardSrc[id]);
    if (!cardReq[id]) {
      cardReq[id] = fetch('cards/' + encodeURIComponent(id) + '.wiki', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(t => { cardSrc[id] = t; refreshPinFromSrc(id, t); return t; })
        .finally(() => { delete cardReq[id]; });
    }
    return cardReq[id];
  }
  const previewSrc = {};   // 디버그 패널 미리보기 원문. 있으면 파일보다 우선
  let bodySeq = 0;
  function renderBody(id) {
    const seq = ++bodySeq;
    if (previewSrc[id] != null && renderSource(id, previewSrc[id])) return;
    if (cardSrc[id] != null && renderSource(id, cardSrc[id])) return;
    teardownBody();
    if (body) body.textContent = '';
    setHead(nameOf(id), '');
    const stale = () => seq !== bodySeq || !focus || focus.id !== id;   // 그사이 닫았거나 바꿨으면 버린다
    loadCardSrc(id).then(src => {
      if (stale()) return;
      if (!renderSource(id, src)) renderFallback(id);
      if (lastZoom) placeCard(lastZoom);
    }, err => {
      if (stale()) return;
      console.warn('[hub] cards/' + id + '.wiki 를 불러오지 못함:', err);
      renderFallback(id);
      if (lastZoom) placeCard(lastZoom);
    });
  }

  // ---------- 열기 / 닫기 ----------
  // 프로그램 포커스 이동: 마우스 경로에서는 링을 띄우지 않고 키보드(Enter/Space/Escape) 경로에서는 유지한다
  function focusEl(el, showRing) {
    if (!el) return;
    el.classList.toggle('no-focus-ring', !showRing);
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (_) { /* 무시 */ } }
  }
  function setExpanded(id) {
    for (const k in LM) LM[k].pin.setAttribute('aria-expanded', k === id ? 'true' : 'false');
  }

  function enter(id, showRing) {
    const o = LM[id];
    if (!o || (focus && focus.id === id)) return false;
    if (o.def.id !== curWorld() || worldBusy()) return false;
    const cam = o.def.camera();
    if (!cam) return false;
    const z = computeZoom(o.lm, cam);
    if (!z) return false;
    if (focus) exit(false);
    exitCoolUntil = 0;
    clearTimeout(exitCoolT);
    clearTimeout(focusBackT);
    focus = { id, def: o.def, lm: o.lm, cam };
    lastZoom = z;
    document.body.dataset.focus = id;
    renderBody(id);
    card.hidden = false;
    placeCard(z);
    backBtn.hidden = false;
    setExpanded(id);
    // 진행 중인 카메라가 같은 초점이면 거기서 이어받아 점프가 없다. 아니면 항등에서 시작
    let m0 = { x: z.f.x, y: z.f.y }, s0 = 1;
    try {
      const cur = cam.get();
      if (cur && Math.abs(cur.f.x - z.f.x) < 0.5 && Math.abs(cur.f.y - z.f.y) < 0.5) { m0 = cur.m; s0 = cur.s; }
    } catch (e) { /* 무시 */ }
    prof(cam, 'in:' + id + ' s=' + z.s.toFixed(2));
    animCam(cam, z.f, m0, s0, z.t, z.s, !!o.lm.follow, () => profEnd(cam));
    focusEl(backBtn, !!showRing);
    return true;
  }

  // hard: 세계가 바뀌는 등 애니메이션 없이 바로 걷는다
  function exit(restoreFocus, showRing, hard) {
    if (!focus) return;
    const { id, cam } = focus;
    cancelCamAnim();
    let cur = null;
    try { cur = cam.get(); } catch (e) { cur = null; }
    focus = null;
    lastZoom = null;
    bodySeq++;
    teardownBody();
    delete document.body.dataset.focus;
    card.hidden = true;
    backBtn.hidden = true;
    setExpanded(null);
    const finish = () => {
      cancelCamAnim();
      try { cam.clear(); } catch (e) { /* 무시 */ }
      exitCoolUntil = 0;
      clearTimeout(exitCoolT);
    };
    if (hard || REDUCED || !cur) {
      finish();
    } else {
      exitCoolUntil = performance.now() + EXIT_COOL_MS;
      clearTimeout(exitCoolT);
      exitCoolT = setTimeout(() => { exitCoolUntil = 0; }, EXIT_COOL_MS);
      // 역재생: 현재 상태 → (f, s = 1). 복귀 중에는 따라가기를 멈춰 끝에서 정확히 항등이 된다
      prof(cam, 'out:' + id + ' s=' + cur.s.toFixed(2));
      animCam(cam, cur.f, cur.m, cur.s, { x: cur.f.x, y: cur.f.y }, 1, false, () => { profEnd(cam); finish(); });
    }
    if (restoreFocus !== false && !hard) {
      // 핀이 다시 보일 때 포커스를 되돌린다
      const el = lastPin, ring = !!showRing;
      clearTimeout(focusBackT);
      focusBackT = setTimeout(() => {
        if (!focus && el && el.style.display !== 'none') focusEl(el, ring);
      }, EXIT_COOL_MS);
    }
  }

  backBtn.addEventListener('click', e => exit(true, e.detail === 0));
  window.addEventListener('keydown', e => {
    // 입력 필드(디버그 패널 카드 미리보기 등)의 Escape는 무시
    if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (e.key === 'Escape' && focus) exit(true, true);
  });
  // 리사이즈: 랜드마크가 움직였으므로 최종값으로 즉시 맞춘다
  let rzT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      if (!focus) return;
      const z = computeZoom(focus.lm, focus.cam);
      if (!z) { exit(false, false, true); return; }
      lastZoom = z;
      placeCard(z);
      cancelCamAnim();
      try { focus.cam.set(z.f, z.t, z.s, { res: z.s, path: { m0: z.t, s0: z.s, m1: z.t, s1: z.s }, follow: !!focus.lm.follow }); } catch (e) { /* 무시 */ }
    }, 120);
  });

  // ---------- 핀 배치 (매 프레임) ----------
  const PIN_GAP = 22;       // 랜드마크 왼쪽 가장자리 → 핀 중심
  const PIN_EDGE = 28;      // 화면 가장자리 여백
  const LABEL_REACH = 26;   // 핀 중심 → 제목 수평선 시작 (CSS와 같게)
  function flipLabel(el, x) {
    const lb = el._lb || (el._lb = el.querySelector('.pin-title'));
    if (!lb) return;
    const w = el._lw || (el._lw = lb.offsetWidth || 0);
    const flip = x - LABEL_REACH - w < 8;   // 왼쪽 공간이 모자라면 오른쪽 위로
    if (el._flip !== flip) { el._flip = flip; el.classList.toggle('label-right', flip); }
  }
  function place(el, x, y, show) {
    if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    if (el.style.display === 'none') { el.style.display = ''; el._lw = 0; }
    flipLabel(el, x);
    const nx = Math.round(x), ny = Math.round(y), key = nx + ',' + ny;
    if (el._pk !== key) { el._pk = key; el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
  }
  function tick() {
    const world = curWorld(), busy = worldBusy();
    // 해시 변경·뒤로 가기로 세계가 바뀌면 확대를 바로 걷는다
    if (focus && (busy || focus.def.id !== world)) exit(false, false, true);
    const hideAll = !!focus || cooling() || busy;
    const W = window.innerWidth, H = window.innerHeight;
    for (const id in LM) {
      const o = LM[id];
      let g = null;
      if (!hideAll && o.def.id === world) { try { g = o.lm.get(); } catch (e) { g = null; } }
      if (!g || !g.visible) { place(o.pin, 0, 0, false); continue; }
      const x = Math.max(PIN_EDGE, Math.min(W - PIN_EDGE, g.x - (g.ext ? g.ext.l : 0) - PIN_GAP));
      const y = Math.max(PIN_EDGE, Math.min(H - PIN_EDGE, g.y));
      place(o.pin, x, y, true);
    }
    requestAnimationFrame(tick);
  }

  // ---------- 등록 ----------
  register('moon', { camera: engineCamera, landmarks: moonLandmarks });
  register('earth', { camera: () => (earthE() && earthE().setCamView) ? earthCam : null, landmarks: earthLandmarks });
  // 그 밖의 세계: 카메라만 연결. 랜드마크는 { id, name, scale, follow?, get() } 형식으로 추가한다
  register('sea', { camera: engineCamera, landmarks: [] });
  register('mount', { camera: cssCamera('worldMount'), landmarks: [] });
  register('room', { camera: cssCamera('worldRoom'), landmarks: [] });
  register('news', { camera: cssCamera('worldNews'), landmarks: [] });
  requestAnimationFrame(tick);

  // ---------- 외부 API ----------
  window.TsukuyomiHub = {
    register,
    get focus() { return focus ? focus.id : null; },
    open: id => !!enter(id, false),
    close: () => exit(true, false),
    cssCamera,
  };
  // 디버그 패널(카드 미리보기)용
  window.__TSUKUYOMI_CARD__ = {
    kinds: () => Object.keys(LM),
    current: () => focus ? focus.id : null,
    source: id => loadCardSrc(id),
    // 미리보기 원문 지정. 그 카드가 열려 있으면 바로 다시 그린다. 핀 제목에도 반영
    preview(id, src) {
      previewSrc[id] = String(src);
      refreshPinFromSrc(id, previewSrc[id]);
      if (!focus || focus.id !== id) return null;
      bodySeq++;
      const ok = renderSource(id, previewSrc[id]);
      if (lastZoom) placeCard(lastZoom);
      return ok;
    },
    reset(id) {
      delete previewSrc[id];
      if (cardSrc[id] != null) refreshPinFromSrc(id, cardSrc[id]);
      else loadCardSrc(id).catch(() => { /* 기존 제목 유지 */ });
      if (focus && focus.id === id) { renderBody(id); if (lastZoom) placeCard(lastZoom); }
    },
    // 카드 열기 (랜드마크가 지금 세계에 없거나 화면에 안 보이면 false)
    open(id) {
      if (focus && focus.id === id) return true;
      if (LM[id]) lastPin = LM[id].pin;
      return !!enter(id, false);
    },
  };
})();
