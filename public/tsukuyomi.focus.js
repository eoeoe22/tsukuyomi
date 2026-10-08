/* 페이지 엔진 개조 준비: 랜드마크 인디케이터 + 카메라 줌 + 플레이스홀더 카드.
 * tsukuyomi.js의 canvas 렌더는 그대로 두고, DOM 오버레이와 transform으로
 * 카메라가 해당 위치로 이동하듯 확대한다. 확대 상태: 랜드마크 오른쪽, 카드 왼쪽.
 * - 핀은 랜드마크 왼쪽에 배치한다.
 * - 카메라 패턴: 단일 구간 동시 이동. 시작 키프레임을 pinned(f,1)
 *   (시각적 항등변환,内外 translate 고정)으로 두면 초점이 클릭 즉시 목표점으로
 *   선형 이동하면서 스케일이 동시에 커진다.内外 translate이 고정값이라
 *   부풀림 덜컹거림이 없고, s(u)와 커버 하한이 모두 선형이라 양 끝점만
 *   보장하면 중간 프레임도 항상 커버된다. 복귀는 그 역재생.
 * - 최종 스케일은 화면 전체가 항상 캔버스로 덮이도록(coverScale) 하한을 둔다.
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

  const layers = () => [
    document.getElementById('scene'),
    document.getElementById('ripple'),
    document.getElementById('fg'),
  ].filter(Boolean);

  // WAAPI로 직접 구동하므로 CSS transition은 끈다 (없으면 순간 이동 폴백)
  try {
    for (const el of layers()) el.style.transition = 'none';
  } catch (e) { /* 무시 */ }

  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const waapiOK = () => {
    try {
      const l = layers();
      return l.length > 0 && typeof l[0].animate === 'function';
    } catch (e) { return false; }
  };

  const ts = () => window.__TSUKUYOMI__ || null;
  let focus = null; // null | 'torii' | 'moon' | 'mirror'
  let lastZoom = null; // { f, t, s, pinned, final }
  // 축소 애니메이션이 완전히 끝나고 멈춘 뒤에야 핀을 다시 보여준다.
  const ZOOM_MS = 1600;
  const ZOOM_EASE = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
  const EXIT_COOL_MS = REDUCED ? 60 : ZOOM_MS + 100;
  let exitCoolUntil = 0, exitCoolT = 0, focusBackT = 0;
  const cooling = () => performance.now() < exitCoolUntil;
  let zoomAnims = [];
  function stopZoom() {
    for (const a of zoomAnims) { try { a.cancel(); } catch (e) { /* 무시 */ } }
    zoomAnims = [];
  }

  const NAMES = { torii: '토리이', moon: '달', mirror: '미러볼' };
  const DESCS = {
    torii: '토리이 내용 준비 중입니다.',
    moon: '달 내용 준비 중입니다.',
    mirror: '미러볼 내용 준비 중입니다.',
  };
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

  // 같은 중심을 공유하는 일반 달 / 미러볼 중 우세한 쪽의 좌표
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

  // 변환 후 뷰포트 네 모서리의 원본 좌표가 모두 캔버스 안에 들어가는 최소 스케일.
  // 최종 스케일이 이 하한보다 작으면 상·하·좌·우 중 한쪽이 뷰포트를 벗어나 빈공간이 보인다.
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

  const fmtPx = n => `${n.toFixed(1)}px`;
  // 스케일-인-플레이스: 랜드마크가 화면상 제자리에 머문 채로 확대된다. s>=1이면 항상 커버.
  // K0으로는 translate(0) scale(1) translate(0)을 쓰지 않는다: 키프레임 보간이内外
  // translate을 0↔fx로 함께 움직여 중간에 화면 전체가 부풀었다 되돌아오는
  // 위/아래 덜컹거림이 생긴다. scale=1의 pinned 형태(시각적으로 항등변환)로 두면
  //内外 translate이 상수로 고정돼 초점이 전 구간 완전히 고정된다.
  const tfPinned = (f, s) =>
    `translate(${fmtPx(f.x)}, ${fmtPx(f.y)}) scale(${s.toFixed(3)}) translate(${fmtPx(-f.x)}, ${fmtPx(-f.y)})`;
  // 최종: 랜드마크가 목표점으로 이동. s가 coverScale 이상이면 커버.
  const tfFinal = (t, f, s) =>
    `translate(${fmtPx(t.x)}, ${fmtPx(t.y)}) scale(${s.toFixed(3)}) translate(${fmtPx(-f.x)}, ${fmtPx(-f.y)})`;

  function computeZoom(kind) {
    const f = landmarkCenter(kind);
    if (!f) return null;
    const t = targetFor();
    const need = coverScale(f.x, f.y, t.x, t.y);
    // 하한에 여유(+4%, +0.01)를 둬 서브픽셀 반올림에도 가장자리가 비지 않게 한다
    const s = Math.max(SCALES[kind] || 2, need * 1.04 + 0.01);
    return { f, t, s, pinned0: tfPinned(f, 1), final: tfFinal(t, f, s) };
  }

  function commitFinal(final) {
    for (const el of layers()) el.style.transform = final;
  }

  function clearZoom() {
    for (const el of layers()) el.style.transform = '';
  }

  function enter(kind) {
    if (focus === kind) return;
    const z = computeZoom(kind);
    if (!z) return;
    exitCoolUntil = 0;
    clearTimeout(exitCoolT);
    clearTimeout(focusBackT);
    focus = kind;
    lastZoom = z;
    document.body.dataset.focus = kind;
    if (title) title.textContent = NAMES[kind] || '플레이스홀더';
    if (desc) desc.textContent = DESCS[kind] || '내용 준비 중입니다.';
    card.hidden = false;
    backBtn.hidden = false;
    pinTorii.setAttribute('aria-expanded', kind === 'torii' ? 'true' : 'false');
    pinMoon.setAttribute('aria-expanded', kind === 'moon' ? 'true' : 'false');
    pinMirror.setAttribute('aria-expanded', kind === 'mirror' ? 'true' : 'false');
    if (REDUCED || !waapiOK()) {
      stopZoom();
      commitFinal(z.final);
    } else {
      stopZoom();
      // 단일 구간 동시 이동: 시작점을 pinned0(초점 고정·시각적 항등변환)으로 두면
      // 초점은 클릭 즉시 목표점으로 선형 이동하고 스케일은 동시에 커진다.
      //内外 translate이 양 끝점에서 고정값이라 부풀림이 없고,
      // s(u)와 커버 하한 need(u)가 모두 u에 대한 선형 함수라 양 끝점만
      // 보장하면(s(0)=need(0)=1, s(1)>=need(1)) 중간도 항상 커버된다.
      const frames = [
        { transform: z.pinned0, easing: ZOOM_EASE },
        { transform: z.final },
      ];
      zoomAnims = layers().map(el => el.animate(frames, { duration: ZOOM_MS, fill: 'forwards' }));
      Promise.allSettled(zoomAnims.map(a => a.finished)).then(() => {
        if (focus !== kind) return;
        commitFinal(z.final);
        stopZoom();
      });
    }
    backBtn.focus({ preventScroll: true });
  }

  function exit(restoreFocus) {
    if (!focus) return;
    // 진입 애니메이션 진행 중이면 끝 상태로 확정한 뒤 복귀를 시작한다 (점프 방지)
    for (const a of zoomAnims) { try { a.finish(); } catch (e) { /* 무시 */ } }
    zoomAnims = [];
    const z = lastZoom;
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
      stopZoom();
      clearZoom();
      exitCoolUntil = 0;
      clearTimeout(exitCoolT);
    };
    if (REDUCED || !waapiOK() || !z) {
      stopZoom();
      clearZoom();
      exitCoolUntil = 0;
      clearTimeout(exitCoolT);
    } else {
      // 복귀도 단일 구간 역재생: 목표점에서 시작점으로 선형 복귀 + 동시 축소
      const frames = [
        { transform: z.final, easing: ZOOM_EASE },
        { transform: z.pinned0 },
      ];
      zoomAnims = layers().map(el => el.animate(frames, { duration: ZOOM_MS, fill: 'forwards' }));
      Promise.allSettled(zoomAnims.map(a => a.finished)).then(() => {
        if (focus) return;
        done();
      });
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
      if (!z) return;
      lastZoom = z;
      stopZoom();
      commitFinal(z.final);
    }, 120);
  });

  // 핀 클릭이 scene의 ripple/미러볼 핸들러까지 버블되지 않게 차단
  for (const el of [pinTorii, pinMoon, pinMirror, backBtn, card]) {
    el.addEventListener('pointerdown', e => e.stopPropagation(), true);
    el.addEventListener('pointermove', e => e.stopPropagation(), true);
  }

  const PIN_GAP = 22; // 랜드마크 가장자리에서 핀 중심까지 거리(px). 핀은 랜드마크 왼쪽에 둔다.

  function place(el, x, y, show) {
    if (!show) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
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
