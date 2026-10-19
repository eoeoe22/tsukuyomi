/* 랜딩(landing.html): 스크롤 섹션 → 장면 컨트롤러.
 *
 * - 스크롤은 body가 아니라 #landing(fixed, overflow-y: auto)에서 한다.
 *   모바일 주소창이 접혔다 펴지며 innerHeight가 바뀌면 엔진 resize()가 별·리플·랜턴을 다시 만들기 때문.
 * - 화면 중앙선을 지나는 섹션이 활성 섹션. 바뀌면 150ms 뒤 엔진 mode(goTo)를 부른다.
 *   goTo는 전환 도중 재호출돼도 현재 p에서 이어 가므로 역스크롤·빠른 통과에도 화면이 튀지 않는다.
 * - 마지막 섹션은 山(산 세계)로 페이드한다. 해시·기록은 건드리지 않는다(__TSUKUYOMI_WORLDS__.go(..., { history: false })).
 * - 루트의 data-phase(day|dusk|night|mirror|mount)가 글자색·그림자를 고른다(landing.css).
 *
 * 이 파일은 tsukuyomi.js 바로 뒤에 동기 로드된다: 엔진 기본값(황혼)이 한 번도 그려지기 전에 낮으로 스냅.
 */
(() => {
  'use strict';

  const T = window.__TSUKUYOMI__ || null;
  const root = document.documentElement;

  // ---------- 첫 페인트 전: 낮으로 스냅 ----------
  if (T) {
    try { T.state = 'day'; T.cursorMode = 0; } catch (e) { console.warn('[landing] 초기 장면 설정 실패:', e); }
  }

  const mq = q => { try { return window.matchMedia(q); } catch (e) { return { matches: false, addEventListener() {} }; } };
  const RM = mq('(prefers-reduced-motion: reduce)');
  const HOVER = mq('(hover: hover) and (pointer: fine)');
  // 엔진 isMobileLayout()과 같은 기준(토리이/달이 화면 가운데로 온다)
  const MOBILE = mq('(max-width: 460px), (pointer: coarse) and (max-height: 500px)');

  const DEBOUNCE_MS = 150;
  const MOUNT_SCENE = 'sunset';

  function init() {
    const scroller = document.getElementById('landing');
    if (!scroller) return;
    const secs = Array.from(scroller.querySelectorAll('.l-sec'));
    const dots = Array.from(scroller.querySelectorAll('.l-nav a'));
    const Wd = () => window.__TSUKUYOMI_WORLDS__ || null;

    let current = null;   // 지금 장면에 반영된 섹션
    let debT = 0;

    // ---------- 세계(月 / 山) ----------
    let worldWant = 'moon';
    function toWorld(target) {
      const W = Wd();
      if (target === worldWant) return;
      worldWant = target;
      root.toggleAttribute('data-scene-off', target === 'mount');
      if (!W) return;
      Promise.resolve(W.go(target, { history: false, scene: MOUNT_SCENE })).then(() => {
        // 산 로드 실패 등으로 月에 남았으면 글자 처리도 月 기준으로 되돌린다
        if (worldWant === 'mount' && W.world !== 'mount' && !W.busy) {
          worldWant = 'moon';
          root.removeAttribute('data-scene-off');
          setPhase(T ? T.mode : 'mirror');
        }
      }).catch(e => console.warn('[landing] 세계 전환 실패:', e));
    }

    function setPhase(ph) { root.setAttribute('data-phase', ph); }

    // 커서 물고기: 밤은 커서 추적(hover 가능한 기기만), 미러볼은 달 배치, 나머지는 숨김
    function cursorFor(scene) {
      if (scene === 'night') return HOVER.matches ? 1 : 0;
      if (scene === 'mirror') return 2;
      return 0;
    }

    function apply(sec) {
      if (!sec || sec === current) return;
      current = sec;
      const scene = sec.dataset.scene;
      for (const a of dots) {
        if (a.dataset.to === sec.id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      }
      if (sec.hasAttribute('data-prewarm')) {
        const W = Wd();
        if (W && W.prewarm) W.prewarm();
      }
      if (scene === 'mount') {
        setPhase('mount');
        toWorld('mount');
        return;
      }
      toWorld('moon');
      if (T) {
        try {
          T.mode = scene;
          T.cursorMode = cursorFor(scene);
        } catch (e) { /* 엔진 없음 */ }
      }
      setPhase(scene);
    }

    // ---------- 활성 섹션: 화면 중앙선이 들어 있는 섹션 ----------
    function pickCenter() {
      const r = scroller.getBoundingClientRect();
      const c = r.top + r.height / 2;
      for (const s of secs) {
        const b = s.getBoundingClientRect();
        if (b.top <= c && b.bottom > c) return s;
      }
      return null;
    }
    function schedule() {
      clearTimeout(debT);
      debT = setTimeout(() => apply(pickCenter()), DEBOUNCE_MS);
    }
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(schedule, { root: scroller, rootMargin: '-45% 0px -45% 0px', threshold: 0 });
      secs.forEach(s => io.observe(s));
    } else {
      scroller.addEventListener('scroll', schedule, { passive: true });
    }
    // 첫 섹션은 이미 낮으로 스냅돼 있으니 즉시 반영(디바운스 없이)
    apply(pickCenter() || secs[0]);

    // ---------- 섹션 이동(내비 점, 히어로 버튼, 스크롤 안내) ----------
    scroller.addEventListener('click', e => {
      const a = e.target instanceof Element ? e.target.closest('[data-to]') : null;
      if (!a) return;
      const target = document.getElementById(a.dataset.to);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' });
      // 키보드 사용자를 위해 섹션으로 포커스를 옮긴다(스크롤은 위에서 처리)
      const h = target.querySelector('h1, h2');
      if (h) {
        if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
        try { h.focus({ preventScroll: true }); } catch (err) { /* 무시 */ }
      }
    });

    // ---------- 데스크톱 배치: 토리이·달 수직선과 겹치는 컬럼은 반대편으로 ----------
    // 리사이즈 때만 계산한다. 산 섹션은 산 토리이가 가운데라 지정값 그대로 둔다.
    function place() {
      const vw = window.innerWidth;
      let lx = null, half = 0;
      if (T && !MOBILE.matches) {
        try {
          const t = T.torii;
          if (t && t.w > 0) { lx = t.cx; half = t.w / 2; }
        } catch (e) { /* 엔진 없음 */ }
      }
      for (const s of secs) {
        let side = s.dataset.side || 'left';
        const copy = s.querySelector('.l-copy');
        if (lx !== null && copy && s.dataset.scene !== 'mount') {
          // 지정 쪽에 두었을 때의 컬럼 범위(landing.css의 --gut: max(24px, 6vw)와 같은 계산)
          const gut = Math.max(24, vw * 0.06);
          const col = Math.min(copy.scrollWidth || vw * 0.38, vw * 0.5);
          const span = side === 'left' ? [gut, gut + col] : [vw - gut - col, vw - gut];
          const hit = lx + half > span[0] && lx - half < span[1];
          if (hit) side = side === 'left' ? 'right' : 'left';
        }
        s.dataset.place = side;
      }
    }
    let rzT = 0;
    window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(place, 160); });
    place();
    // 폰트가 늦게 오면 컬럼 폭이 바뀔 수 있다
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place).catch(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
