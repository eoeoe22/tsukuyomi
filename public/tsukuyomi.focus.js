/* 랜드마크 인디케이터 + 인-캔버스 카메라 줌 + 플레이스홀더 카드.
 * tsukuyomi.js의 canvas를 카메라 파라미터(f/m/s)로 직접 다시 그린다.
 * 이전의 CSS transform 비트맵 확대와 달리 모든 프레임이 네이티브 해상도다.
 * 확대 상태: 랜드마크 오른쪽, 카드 왼쪽.
 * - 핀은 랜드마크 왼쪽에 배치한다.
 * - 카메라 패턴: 단일 구간 동시 이동. 시작점을 항등(f→f, s=1)으로 두면
 *   초점이 클릭 즉시 목표점으로 선형 이동하면서 스케일이 동시에 커진다.
 *   s(u)와 커버 하한이 모두 u에 대한 단조 함수라 양 끝점만 보장하면
 *   중간 프레임도 항상 커버된다. 복귀는 그 역재생.
 * - 최종 스케일은 화면 전체가 항상 장면으로 덮이도록(coverScale) 하한을 둔다.
 * - 일반 달 / 미러볼은 같은 중심을 공유하므로 우세한 쪽의 핀 하나만 표시하고,
 *   카드는 서로 다른 플레이스홀더 내용을 보여준다.
 */
(() => {
  const pinTorii = document.getElementById('pinTorii');
  const pinMoon = document.getElementById('pinMoon');
  const pinMirror = document.getElementById('pinMirror');
  const backBtn = document.getElementById('focusBack');
  const card = document.getElementById('focusCard');
  const title = document.getElementById('focusTitle');
  const desc = document.getElementById('focusDesc');
  if (!pinTorii || !pinMoon || !pinMirror || !backBtn || !card) return;

  // 구버전(CSS transform 확대)에서 남았을 수 있는 잔여 transform을 제거한다.
  // 인-캔버스 카메라와 CSS 확대가 겹치면 이중 스케일이 된다.
  try {
    for (const id of ['scene', 'ripple', 'fg']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.style.transition = 'none';
      el.style.transform = '';
      if (el.getAnimations) for (const a of el.getAnimations()) { try { a.cancel(); } catch (e) { /* 무시 */ } }
    }
  } catch (e) { /* 무시 */ }

  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const ts = () => window.__TSUKUYOMI__ || null;
  const camOK = () => {
    const T = ts();
    return !!(T && T.setCamView && T.clearCam && T.getCamView);
  };
  let focus = null; // null | 'torii' | 'moon' | 'mirror'
  let lastZoom = null; // { f, t, s }
  // 축소 애니메이션이 완전히 끝나고 멈춘 뒤에야 핀을 다시 보여준다.
  const ZOOM_MS = 1600;
  const EXIT_COOL_MS = REDUCED ? 60 : ZOOM_MS + 100;
  let exitCoolUntil = 0, exitCoolT = 0, focusBackT = 0;
  const cooling = () => performance.now() < exitCoolUntil;

  // CSS cubic-bezier(0.22, 0.8, 0.24, 1)와 같은 easing을 JS 애니메이션에 쓴다.
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

  let camAnim = 0;
  function cancelCamAnim() {
    if (camAnim) { cancelAnimationFrame(camAnim); camAnim = 0; }
  }
  // f 고정, 화면 매핑 m과 스케일 s를 eased u로 함께 보간한다. 렌더는 코어가 매 프레임 네이티브로 수행.
  // res: 캐시 해상도 힌트(구간 최대 스케일). 코어가 캐시를 시작 시 한 번만 굽고 매 프레임 재굽지 않게 한다.
  function animCam(f, m0, s0, m1, s1, done) {
    cancelCamAnim();
    const T = ts();
    const res = Math.max(s0, s1);
    if (REDUCED || !T || !camOK()) {
      try { T.setCamView(f, m1, s1, res); } catch (e) { /* 무시 */ }
      if (done) done();
      return;
    }
    const t0 = performance.now();
    const step = now => {
      const u = Math.min(1, (now - t0) / ZOOM_MS);
      const e = easeZoom(u);
      const m = { x: m0.x + (m1.x - m0.x) * e, y: m0.y + (m1.y - m0.y) * e };
      const s = s0 + (s1 - s0) * e;
      try { T.setCamView(f, m, s, res); } catch (err) { /* 무시 */ }
      if (u < 1) {
        camAnim = requestAnimationFrame(step);
      } else {
        camAnim = 0;
        if (done) done();
      }
    };
    camAnim = requestAnimationFrame(step);
  }

  const NAMES = { torii: '토리이', moon: '달', mirror: '미러볼' };
  const DESCS = {
    torii: '수면 위에 선 붉은 토리이. 실물과 물에 비친 상을 서로 다른 레이어로 그린다.',
    moon: '수평선 아래에서 떠오르는 달. 하늘 그라디언트·별 궤적과 같은 시간축으로 움직인다.',
    mirror: '달 자리를 대신하는 미러볼. 회전하는 타일이 장면에 빛 조각을 흩뿌린다.',
  };
  // 카드 본문 예시: 페이지의 기술적인 내용을 대략 정리 (dl 형식)
  const BODIES = {
    torii: [
      ['스프라이트', '색(p)·DPR이 바뀔 때만 torC/torR 캔버스를 다시 래스터하고, 평소엔 캐시를 blit한다.'],
      ['반사', '뒤집고 어둡게 만든 사본을 ripple 레이어에 그려, 물결 굴절은 반사상에만 적용된다.'],
      ['레이어', '실물 토리이와 비네트는 fg 캔버스에 따로 올려 물결 왜곡을 받지 않는다.'],
    ],
    moon: [
      ['상승', 'moonMT 0→1 보간으로 수평선 아래에서 올라오며, 완전히 떠오른 뒤에만 인디케이터가 표시된다.'],
      ['동기화', '별 궤적 회전은 달 상승과 같은 보간을 공유한다 (T_NIGHT 전환 시간 기준).'],
      ['수면 띠', '수평선 근처 반사 띠는 축소 해상도에서 blur 후 BAND_EVERY 프레임마다만 갱신한다.'],
    ],
    mirror: [
      ['공유 중심', '일반 달과 같은 중심을 쓰므로 화면 불투명도(v)가 우세한 쪽 핀 하나만 노출한다.'],
      ['카메라', '확대는 인-캔버스 카메라(f/m/s)로 매 프레임 네이티브 해상도로 다시 그린다.'],
      ['커버 보장', 'coverScale 하한으로 확대 중 어느 프레임에서도 장면 밖 빈 공간이 보이지 않는다.'],
    ],
  };
  const body = document.getElementById('focusBody');
  function renderBody(kind) {
    if (!body) return;
    body.textContent = '';
    const rows = BODIES[kind];
    if (!rows) return;
    const dl = document.createElement('dl');
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    body.append(dl);
  }
  const SCALES = { torii: 1.8, moon: 2.4, mirror: 2.4 };

  // 달 상승(moonMT)이 완료된 뒤에만 인디케이터를 노출한다.
  // moonMT: 0(수평선 아래)→1(완전히 떠오름). 부상 중에는 핀을 숨긴다.
  function moonRisen() {
    const T = ts();
    if (!T) return false;
    const mt = T.moonMT;
    if (typeof mt !== 'number') return true;
    return mt >= 0.999;
  }

  // 같은 중심을 공유하는 일반 달 / 미러볼 중 우세한 쪽의 좌표 (월드 = 화면, css px)
  function moonPos(kind) {
    const T = ts();
    if (!T) return null;
    if (!moonRisen()) return null;
    if (kind === 'mirror') {
      const m = T.moon;
      if (!m || !m.visible) return null;
      return { x: m.x, y: m.y };
    }
    const p = T.plainMoon || T.moon;
    if (!p || !p.visible) return null;
    return { x: p.x, y: p.y };
  }

  function landmarkCenter(kind) {
    if (kind === 'moon' || kind === 'mirror') return moonPos(kind);
    const T = ts();
    if (!T) return null;
    const t = T.torii;
    if (!t || !t.visible) return null;
    return { x: t.cx, y: t.cy };
  }

  // 목표: 랜드마크는 오른쪽, 카드는 왼쪽. 좁은 화면에서는 랜드마크 중앙 상단 + 카드 하단.
  function targetFor() {
    const W = window.innerWidth, H = window.innerHeight;
    const narrow = W <= 460 || (window.matchMedia && window.matchMedia('(pointer: coarse) and (max-height: 500px)').matches);
    if (narrow) return { x: W * 0.5, y: H * 0.32 };
    return { x: W * 0.72, y: H * 0.45 };
  }

  // 변환 후 뷰포트 네 모서리의 원본 좌표가 모두 장면 안에 들어가는 최소 스케일.
  // 최종 스케일이 이 하한보다 작으면 상·하·좌·우 중 한쪽이 장면을 벗어나 빈공간이 보인다.
  // (특히 달처럼 화면 가장자리 랜드마크에서 두드러진다)
  function coverScale(fx, fy, tx, ty) {
    const W = window.innerWidth, H = window.innerHeight;
    let s = 1;
    if (fx > 1) s = Math.max(s, tx / fx);
    if (W - fx > 1) s = Math.max(s, (W - tx) / (W - fx));
    if (fy > 1) s = Math.max(s, ty / fy);
    if (H - fy > 1) s = Math.max(s, (H - ty) / (H - fy));
    return s;
  }

  function computeZoom(kind) {
    const f = landmarkCenter(kind);
    if (!f) return null;
    const t = targetFor();
    const need = coverScale(f.x, f.y, t.x, t.y);
    // 하한에 여유(+4%, +0.01)를 둬 서브픽셀 반올림에도 가장자리가 비지 않게 한다
    const s = Math.max(SCALES[kind] || 2, need * 1.04 + 0.01);
    return { f, t, s };
  }

  function enter(kind) {
    if (focus === kind) return;
    const z = computeZoom(kind);
    if (!z) return;
    if (!camOK()) return;
    exitCoolUntil = 0;
    clearTimeout(exitCoolT);
    clearTimeout(focusBackT);
    focus = kind;
    lastZoom = z;
    document.body.dataset.focus = kind;
    if (title) title.textContent = NAMES[kind] || '플레이스홀더';
    if (desc) desc.textContent = DESCS[kind] || '내용 준비 중입니다.';
    renderBody(kind);
    card.hidden = false;
    backBtn.hidden = false;
    pinTorii.setAttribute('aria-expanded', kind === 'torii' ? 'true' : 'false');
    pinMoon.setAttribute('aria-expanded', kind === 'moon' ? 'true' : 'false');
    pinMirror.setAttribute('aria-expanded', kind === 'mirror' ? 'true' : 'false');
    // 같은 랜드마크의 진행 중 카메라에서 이어받으면 점프가 없다. 랜드마크가 다르면 항등에서 시작.
    let m0 = { x: z.f.x, y: z.f.y }, s0 = 1;
    try {
      const cur = ts().getCamView();
      if (cur && Math.abs(cur.f.x - z.f.x) < 0.5 && Math.abs(cur.f.y - z.f.y) < 0.5) {
        m0 = cur.m; s0 = cur.s;
      }
    } catch (e) { /* 무시 */ }
    animCam(z.f, m0, s0, z.t, z.s);
    backBtn.focus({ preventScroll: true });
  }

  function exit(restoreFocus) {
    if (!focus) return;
    cancelCamAnim();
    const T = ts();
    let cur = null;
    try { cur = T && T.getCamView ? T.getCamView() : null; } catch (e) { cur = null; }
    focus = null;
    lastZoom = null;
    delete document.body.dataset.focus;
    card.hidden = true;
    backBtn.hidden = true;
    pinTorii.setAttribute('aria-expanded', 'false');
    pinMoon.setAttribute('aria-expanded', 'false');
    pinMirror.setAttribute('aria-expanded', 'false');
    // 축소 애니메이션이 완전히 끝나고 멈춘 뒤에야 핀을 다시 표시한다.
    exitCoolUntil = performance.now() + EXIT_COOL_MS;
    clearTimeout(exitCoolT);
    exitCoolT = setTimeout(() => { exitCoolUntil = 0; }, EXIT_COOL_MS);
    const done = () => {
      cancelCamAnim();
      try { T && T.clearCam && T.clearCam(); } catch (e) { /* 무시 */ }
      exitCoolUntil = 0;
      clearTimeout(exitCoolT);
    };
    if (REDUCED || !T || !camOK() || !cur) {
      cancelCamAnim();
      try { T && T.clearCam && T.clearCam(); } catch (e) { /* 무시 */ }
      exitCoolUntil = 0;
      clearTimeout(exitCoolT);
    } else {
      // 복귀도 단일 구간 역재생: 목표점에서 시작점으로 선형 복귀 + 동시 축소.
      // 끝나면 카메라를 완전히 걷어 idle 렌더로 돌아간다.
      animCam(cur.f, cur.m, cur.s, { x: cur.f.x, y: cur.f.y }, 1, done);
      // animCam의 done은 u=1에서 호출되므로, 복귀 완료 시점에 카메라를 걷는다.
      // (animCam 자체는 최종 항등 상태를 1프레임 그리므로 점프가 없다.)
    }
    if (restoreFocus !== false) {
      // 핀이 다시 보일 때 포커스를 되돌린다 (전이 중 포커스 시 핀이 숨은 채로 잡힌다)
      const el = lastPin;
      clearTimeout(focusBackT);
      focusBackT = setTimeout(() => {
        if (!focus && el && el.style.display !== 'none') el.focus({ preventScroll: true });
      }, EXIT_COOL_MS);
    }
  }

  let lastPin = null;
  pinTorii.addEventListener('click', () => { lastPin = pinTorii; enter('torii'); });
  pinMoon.addEventListener('click', () => { lastPin = pinMoon; enter('moon'); });
  pinMirror.addEventListener('click', () => { lastPin = pinMirror; enter('mirror'); });
  backBtn.addEventListener('click', () => exit(true));
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && focus) exit(true);
  });
  // 리사이즈 중 확대 상태 유지: 랜드마크가 이동했으므로 최종값으로 즉시 갱신 (끝점 커버 보장)
  let rzT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      if (!focus) return;
      const z = computeZoom(focus);
      if (!z || !camOK()) return;
      lastZoom = z;
      cancelCamAnim();
      try { ts().setCamView(z.f, z.t, z.s, z.s); } catch (e) { /* 무시 */ }
    }, 120);
  });

  // 핀 클릭이 scene의 ripple/미러볼 핸들러까지 버블되지 않게 차단
  for (const el of [pinTorii, pinMoon, pinMirror, backBtn, card]) {
    el.addEventListener('pointerdown', e => e.stopPropagation(), true);
    el.addEventListener('pointermove', e => e.stopPropagation(), true);
  }

  const PIN_GAP = 22; // 랜드마크 가장자리에서 핀 중심까지 거리(px). 핀은 랜드마크 왼쪽에 둔다.

  // 제목 라벨은 기본적으로 핀의 왼쪽 위로 뻗는다. 왼쪽 공간이 모자라면 오른쪽 위로 뒤집는다.
  const LABEL_REACH = 26; // 핀 중심 → 수평선 시작점까지 가로 거리(px), CSS와 일치
  function flipLabel(el, x) {
    const lb = el._lb || (el._lb = el.querySelector('.pin-title'));
    if (!lb) return;
    // 텍스트는 고정이므로 폭은 한 번만 측정한다 (매 프레임 레이아웃 강제 방지)
    const w = el._lw || (el._lw = lb.offsetWidth || 0);
    const flip = x - LABEL_REACH - w < 8;
    if (el._flip !== flip) {
      el._flip = flip;
      el.classList.toggle('label-right', flip);
    }
  }

  function place(el, x, y, show) {
    if (!show) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    flipLabel(el, x);
    // 같은 값 반복 대입으로 인한 스타일 스래싱 방지
    const nx = Math.round(x), ny = Math.round(y);
    const key = nx + ',' + ny;
    if (el._pk !== key) {
      el._pk = key;
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    }
  }

  function tick() {
    if (!focus) {
      if (cooling()) {
        // 축소 전이 중: 세 핀 모두 숨긴 채로 대기한다
        place(pinTorii, 0, 0, false);
        place(pinMoon, 0, 0, false);
        place(pinMirror, 0, 0, false);
      } else {
        const T = ts();
        if (T) {
          const t = T.torii;
          if (t && t.visible) {
            const px = Math.max(28, Math.min(window.innerWidth - 28, t.x - PIN_GAP));
            const py = Math.max(28, Math.min(window.innerHeight - 28, t.cy));
            place(pinTorii, px, py, true);
          } else {
            place(pinTorii, 0, 0, false);
          }
          // 일반 달과 미러볼은 중심을 공유하므로 둘 다 보이면 우세한 쪽 하나만 노출한다.
          // 가중치는 화면 불투명도(v)로 판단하고, 동점이면 일반 달을 우선한다.
          // 달이 완전히 떠오르기 전(moonMT < 1)에는 둘 다 숨긴다.
          const pm = T.plainMoon || { visible: false, v: 0 };
          const mb = T.moon || { visible: false, v: 0 };
          const risen = moonRisen();
          const showPm = !!(pm && pm.visible) && risen;
          const showMb = !!(mb && mb.visible) && risen;
          let usePm = showPm, useMb = showMb;
          if (showPm && showMb) {
            if ((mb.v || 0) > (pm.v || 0)) { usePm = false; }
            else { useMb = false; }
          }
          if (usePm) {
            const px = Math.max(28, Math.min(window.innerWidth - 28, pm.x - pm.r - PIN_GAP));
            const py = Math.max(28, Math.min(window.innerHeight - 28, pm.y));
            place(pinMoon, px, py, true);
          } else {
            place(pinMoon, 0, 0, false);
          }
          if (useMb) {
            const px = Math.max(28, Math.min(window.innerWidth - 28, mb.x - mb.r - PIN_GAP));
            const py = Math.max(28, Math.min(window.innerHeight - 28, mb.y));
            place(pinMirror, px, py, true);
          } else {
            place(pinMirror, 0, 0, false);
          }
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
