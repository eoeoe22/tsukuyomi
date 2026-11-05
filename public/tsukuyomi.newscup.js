/* 犬 하위 페이지: 야치요컵 중간 속보 (tsukuyomi-hub 보존, 준더미). 경로는 #news/cup.
 * tsukuyomi-hub 폐기 전 cup-nameplate 계열(순위 배지 n位)만 이쪽으로 가져와 보존한다.
 * UI는 이식하지 않는다: 트로피 버튼·관리 카드 연동 없이, 주소 직접 입력(#news/cup)으로만 들어간다.
 * 세부 카드 내용은 전부 "n위 이름표" 플레이스홀더, 순위 배지 태그는 n位(10~4)로 고정한다.
 * tsukuyomi.worlds.js가 뉴스 장면을 올릴 때 함께 로드한다.
 *
 * 레이어(#worldNews 안, .world-view 위)
 *   배경: 청해파(부채꼴 물결) 패턴 → 고정 구름 글리프(references/newscloud-hq.svg 모양)
 *   → 장식(띠 위 작은 사각형, 띠 위 왼쪽 화살표 2개, 아래 가운데 삼각형, 4위 액자 뒤 오른쪽 아래 화살표)
 *   → 상단 제목 띠(빗금 큐브 패턴 + 제목) → 순위 액자 7개(10위~4위).
 * 글꼴은 허브 기본 Noto Sans KR 700.
 * 액자 안 그림·캐릭터는 아직 없다. 순위마다 자리 색만 칠해 두었다(FALLBACK의 bg).
 * 열려 있는 동안 뒤 뉴스 장면은 멈춘다(가려져 보이지 않으므로).
 *
 * 내용: FALLBACK 7자리 고정(위 10·9·8·7, 아래 6·5·4). 이름표 "n위 이름표", 배지 "n位".
 *   이름표 배경·텍스트색과 액자 색(plate/badge/bg)은 화면 자리마다 고정.
 *   이름표 텍스트가 그라데이션인 자리(7·6·4위)는 위→아래, 글자 높이 기준 위 6 : 아래 4로 보이게 경계(박스 약 64%) 앞뒤만 짧게 섞는다.
 *
 * API: window.TsukuyomiNewsCup
 *   open() / close() / toggle()   주소를 #news/cup ↔ #news로 바꿔 쓴다(기록은 쌓지 않는다)
 *   start() / stop()               뉴스 세계 어댑터가 부른다. start는 열림 상태에 맞춰 보이기만 맞춘다
 *   leave()                        뉴스 세계를 떠날 때: 다음에 돌아오면 닫힌 상태로
 *   refresh()                      단일 카드를 다시 읽어 액자에 배치한다(열려 있을 때만 갱신). 실패하면 false
 */
(() => {
'use strict';
const world = document.getElementById('worldNews');
if (!world) return;

const NS = 'http://www.w3.org/2000/svg';
const HASH = '#news/cup', BASE = '#news';
const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const News = () => window.TsukuyomiNews || null;
const curWorld = () => { const w = window.__TSUKUYOMI_WORLDS__; return w ? w.world : null; };

// 자리 기본값: 화면 순서(위 4개, 아래 3개). 준더미 보존이라 단일 카드 없이 이대로 나온다.
// 이름표는 전부 "n위 이름표" 플레이스홀더, 순위 배지는 n位(10~4). 이름표 배경·텍스트와 액자 색(badge/bg)은 자리마다 고정.
// 이름표 텍스트가 그라데이션인 자리(7·6·4위)는 위→아래, 글자 높이 기준 위 6 : 아래 4로 보이게 섞는다(CSS 참고).
const FALLBACK = [
  { rank: 10, name: '10위 이름표', badge: { bg: '#ffffff', fg: '#e5407f' }, nameBg: '#EBB4C4', nameFg: '#B0086A', nameGrad: null,                 bg: ['#f1ead9', '#2d3138'] },
  { rank: 9,  name: '9위 이름표',  badge: { bg: '#2d5fd0', fg: '#ffffff' }, nameBg: '#95C9DC', nameFg: '#07A0E0', nameGrad: null,                 bg: ['#2a63d8', '#5aa8f0'] },
  { rank: 8,  name: '8위 이름표',  badge: { bg: '#8fa6e8', fg: '#ffffff' }, nameBg: '#FFE3F8', nameFg: '#ABA8E8', nameGrad: null,                 bg: ['#f7d6e6', '#cfe3f7'] },
  { rank: 7,  name: '7위 이름표',  badge: { bg: '#f0a070', fg: '#ffffff' }, nameBg: '#E0D1CE', nameFg: null,      nameGrad: ['#6288BB', '#B3776D'], bg: ['#e8f3f6', '#4fa9c7'] },
  { rank: 6,  name: '6위 이름표',  badge: { bg: '#8a1220', fg: '#ffffff' }, nameBg: '#181C2A', nameFg: null,      nameGrad: ['#A52341', '#6F477B'], bg: ['#7e0f1c', '#c0202c'] },
  { rank: 5,  name: '5위 이름표',  badge: { bg: '#3fae5a', fg: '#ffffff' }, nameBg: '#F0E4BE', nameFg: '#E90F0E', nameGrad: null,                 bg: ['#f07a22', '#f7b04a'] },
  { rank: 4,  name: '4위 이름표',  badge: { bg: '#3b2a78', fg: '#ffffff' }, nameBg: '#C1B1D3', nameFg: null,      nameGrad: ['#463754', '#834AB0'], bg: ['#4b358f', '#7b5cc4'] },
];

/* ───────── DOM ───────── */
const root = document.createElement('div');
root.className = 'news-cup';
root.id = 'newsCup';
root.hidden = true;
root.setAttribute('role', 'region');
root.setAttribute('aria-label', 'ヤチヨカップ 中間速報');
root.innerHTML = `
<svg class="cup-defs" aria-hidden="true" width="0" height="0">
  <defs>
    <!-- 청해파: 반지름 100 부채꼴(동심원 8겹). 타일 200×100, 위 줄부터 그려 아래 줄이 덮는다 -->
    <g id="cup-fan">
      <circle r="100" fill="#0b6a80"/><circle r="89" fill="#4db0ae"/>
      <circle r="75.4" fill="#0b6a80"/><circle r="64.4" fill="#4db0ae"/>
      <circle r="50.7" fill="#0b6a80"/><circle r="39.7" fill="#4db0ae"/>
      <circle r="26" fill="#0b6a80"/><circle r="15" fill="#4db0ae"/>
    </g>
    <pattern id="cup-seigaiha" width="200" height="100" patternUnits="userSpaceOnUse">
      <use href="#cup-fan" x="-100" y="-50"/><use href="#cup-fan" x="100" y="-50"/><use href="#cup-fan" x="300" y="-50"/>
      <use href="#cup-fan" x="0" y="0"/><use href="#cup-fan" x="200" y="0"/>
      <use href="#cup-fan" x="-100" y="50"/><use href="#cup-fan" x="100" y="50"/><use href="#cup-fan" x="300" y="50"/>
      <use href="#cup-fan" x="0" y="100"/><use href="#cup-fan" x="200" y="100"/>
      <use href="#cup-fan" x="-100" y="150"/><use href="#cup-fan" x="100" y="150"/><use href="#cup-fan" x="300" y="150"/>
    </pattern>
    <!-- 빗금 큐브: 한 변 100 아이소메트릭 큐브, 면마다 3칸 빗금. 타일 173.205×300 -->
    <path id="cup-cube" fill="none" stroke="#34645f" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="
      M0,-100 L86.6025,-50 L86.6025,50 L0,100 L-86.6025,50 L-86.6025,-50 Z
      M-86.6025,-50 L0,0 L86.6025,-50 M0,0 L0,100
      M-86.6025,-16.6667 L0,33.3333 M-86.6025,16.6667 L0,66.6667
      M0,33.3333 L86.6025,-16.6667 M0,66.6667 L86.6025,16.6667
      M-57.735,-66.6667 L28.8675,-16.6667 M-28.8675,-83.3333 L57.735,-33.3333"/>
    <pattern id="cup-cubes" width="173.205" height="300" patternUnits="userSpaceOnUse">
      <rect width="173.205" height="300" fill="#062a5c"/>
      <use href="#cup-cube" x="86.6025" y="-150"/>
      <use href="#cup-cube" x="0" y="0"/><use href="#cup-cube" x="173.205" y="0"/>
      <use href="#cup-cube" x="86.6025" y="150"/>
      <use href="#cup-cube" x="0" y="300"/><use href="#cup-cube" x="173.205" y="300"/>
      <use href="#cup-cube" x="86.6025" y="450"/>
    </pattern>
    <!-- 구름 글리프(references/newscloud-hq.svg): 막대 3개 + 반원 홈 기둥 2개 -->
    <symbol id="cup-cloud" viewBox="18 52 124 56">
      <rect x="58" y="52" width="64" height="12" rx="6"/>
      <path d="M90 63.5V64A5 5 0 0 1 90 74V74.5H110V74A5 5 0 0 1 110 64V63.5Z"/>
      <rect x="18" y="74" width="124" height="12" rx="6"/>
      <path d="M36 85.5V86A5 5 0 0 1 36 96V96.5H56V96A5 5 0 0 1 56 86V85.5Z"/>
      <rect x="22" y="96" width="66" height="12" rx="6"/>
    </symbol>
    <!-- 제목 띠 위 작은 사각형: 한 칸 1×1, 세로 결 -->
    <pattern id="cup-sq-grain" width=".125" height="1" patternUnits="userSpaceOnUse">
      <rect width=".125" height="1" fill="#0c4d5c"/><rect x=".09" width=".035" height="1" fill="#093e4b"/>
    </pattern>
    <rect id="cup-sq" width="1" height="1" fill="url(#cup-sq-grain)"/>
    <!-- 화살표(쉐브론): 높이 54, 몸통 54, 뾰족한 끝 27 (원본 2000 폭 기준 px).
         길이(들어간 꼭지점 x27 → 나온 꼭지점 x81) 54. 화살표끼리 옆 간격은 108 = 가운데에 1개가 끼워질 만큼 -->
    <path id="cup-chev" d="M0 0H54L81 27L54 54H0L27 27Z"/>
    <!-- 액자 5:3, 테두리 14. 모서리: ㄱ자 금색 블록 + 정사각형 구멍 3개 -->
    <path id="cup-corner" fill-rule="evenodd" d="M0 0H76V48H48V76H0Z M20 20H38V38H20Z M48 20H66V38H48Z M20 48H38V66H20Z"/>
    <symbol id="cup-frame" viewBox="0 0 1000 600">
      <g fill="#B4AE7C">
        <path fill-rule="evenodd" d="M0 0H1000V600H0Z M14 14V586H986V14Z"/>
        <use href="#cup-corner"/>
        <use href="#cup-corner" transform="translate(1000 0) scale(-1 1)"/>
        <use href="#cup-corner" transform="translate(0 600) scale(1 -1)"/>
        <use href="#cup-corner" transform="translate(1000 600) scale(-1 -1)"/>
      </g>
    </symbol>
  </defs>
</svg>
<svg class="cup-bg" aria-hidden="true"><rect width="100%" height="100%" fill="url(#cup-seigaiha)"/></svg>
<svg class="cup-clouds" aria-hidden="true"><g fill="#eef4f3"></g></svg>
<header class="cup-band">
  <svg class="cup-band-bg" aria-hidden="true"><rect width="100%" height="100%" fill="url(#cup-cubes)"/></svg>
  <h2 class="cup-title"><span>ヤチヨカップ</span><span>中間速報</span></h2>
</header>
<svg class="cup-squares" viewBox="0 0 7 2" aria-hidden="true"><use href="#cup-sq"/><use href="#cup-sq" x="4"/><use href="#cup-sq" x="6"/><use href="#cup-sq" x="3" y="1"/><use href="#cup-sq" x="5" y="1"/></svg>
<svg class="cup-arrows-top" viewBox="0 0 189 54" aria-hidden="true"><g fill="#0b3b52"><use href="#cup-chev"/><use href="#cup-chev" x="108"/></g></svg>
<svg class="cup-tris" viewBox="0 0 4 1.8" aria-hidden="true">
  <path fill="#0a5464" d="M0 1.8L.5 .9L1 1.8Z M2 1.8L2.5 .9L3 1.8Z M.5 .9L1 0L1.5 .9Z"/>
  <path fill="#084757" d="M1 1.8L1.5 .9L2 1.8Z M3 1.8L3.5 .9L4 1.8Z M1.5 .9L2 0L2.5 .9Z"/>
</svg>
<ol class="cup-grid"></ol>`;
const fanPat = root.querySelector('#cup-seigaiha'), cubePat = root.querySelector('#cup-cubes');
const cloudG = root.querySelector('.cup-clouds g');
const grid = root.querySelector('.cup-grid');
world.appendChild(root);

FALLBACK.forEach((r, i) => {
  const li = document.createElement('li');
  li.className = 'cup-card';
  li.style.setProperty('--i', i);
  li.style.setProperty('--bg1', r.bg[0]);
  li.style.setProperty('--bg2', r.bg[1]);
  li.style.setProperty('--name-bg', r.nameBg);
  if (r.nameGrad) {
    li.style.setProperty('--name-grad1', r.nameGrad[0]);
    li.style.setProperty('--name-grad2', r.nameGrad[1]);
  } else {
    li.style.setProperty('--name-fg', r.nameFg);
  }
  li.style.setProperty('--badge-bg', r.badge.bg);
  li.style.setProperty('--badge-fg', r.badge.fg);
  li.innerHTML =
    // 2줄 2개: 줄 사이 54(화살표 1개 높이), 옆 간격 108(가운데에 화살표 1개가 끼워질 만큼), 아랫줄은 화살표 길이 54만큼 오른쪽
    (r.rank === 4 ? '<svg class="cup-arrows" viewBox="0 0 243 162" aria-hidden="true"><g fill="#0b3b52">' +
      '<use href="#cup-chev"/><use href="#cup-chev" x="108"/><use href="#cup-chev" x="54" y="108"/><use href="#cup-chev" x="162" y="108"/></g></svg>' : '') +
    '<span class="cup-pic" aria-hidden="true"></span>' +
    '<svg class="cup-frame" viewBox="0 0 1000 600" aria-hidden="true"><use href="#cup-frame"/></svg>' +
    '<span class="cup-rank"><b></b>位</span>' +
    '<span class="cup-name' + (r.nameGrad ? ' is-grad' : '') + '"><span class="cup-name-text"></span></span>';
  grid.appendChild(li);
});
// 자리별 요소 참조 + 기본값 그리기. 단일 카드를 읽으면 텍스트만 갈아 끼운다(색은 자리 고정)
const cards = [...grid.children].map((li, i) => ({
  li,
  rankEl: li.querySelector('.cup-rank'),
  nameTextEl: li.querySelector('.cup-name-text'),
  fb: FALLBACK[i],
}));
function setName(nameTextEl, text, fallbackName) {
  nameTextEl.textContent = (text == null ? '' : String(text)).trim() || fallbackName || '？？？';
}
function paintFallback() {
  for (const c of cards) {
    setRank(c.rankEl, null, c.fb.rank);
    setName(c.nameTextEl, c.fb.name, '？？？');
  }
}
paintFallback();

/* ───────── 단일 카드 cup(준더미: 연동 없음) ─────────
 * 원문 연동은 가져오지 않는다. 항상 FALLBACK("n위 이름표" + n位)만 표시한다. */
function setRank(rankEl, text, fallbackNum) {
  const t = (text == null ? '' : String(text)).trim();
  if (!t) {
    rankEl.innerHTML = '<b></b>位';
    rankEl.querySelector('b').textContent = String(fallbackNum);
    return;
  }
  if (/^\d+$/.test(t)) {
    rankEl.innerHTML = '<b></b>位';
    rankEl.querySelector('b').textContent = t;
    return;
  }
  rankEl.textContent = t;   // "n위" 통째로 바꾼 경우: 쓴 그대로
}
/* ───────── 준더미: 카드 원문 없이 FALLBACK 플레이스홀더만 ─────────
 * tsukuyomi-hub의 cards/cup.wiki 연동은 가져오지 않는다. 항상 "n위 이름표" + n位(10~4)만 보인다. */
let refreshSeq = 0;
function refreshCup() {
  refreshSeq++;
  paintFallback();
  return Promise.resolve(true);
}

/* ───────── 패턴 배율 ─────────
 * 부채꼴 반지름은 가로 2000 화면 기준 ≈ 100(원본보다 크게), 큐브 한 변 ≈ 52. 화면 폭에 비례하되 너무 작아지지 않게. */
function rescale() {
  const W = Math.max(1, window.innerWidth);
  const k = Math.max(0.55, W / 2000);
  fanPat.setAttribute('patternTransform', `scale(${(1.0 * k).toFixed(4)})`);
  cubePat.setAttribute('patternTransform', `scale(${(0.52 * k).toFixed(4)})`);
  layoutClouds();
}

/* ───────── 구름 ─────────
 * 고정 배치. 화면 아래쪽에 큰 구름, 가운데 높이에 작은 구름. 크기·위치는 화면 비율로 정해 리사이즈 때 다시 맞춘다.
 * [가운데 y(화면 높이 비), 폭(화면 폭 비), 왼쪽 x(화면 폭 비), 좌우 뒤집기] */
const CLOUDS = [
  [0.86, 0.30, 0.02, false], [0.90, 0.26, 0.62, true], [0.78, 0.18, 0.80, false],
  [0.94, 0.20, 0.35, true], [0.60, 0.13, 0.94, false], [0.52, 0.10, 0.05, true],
  [0.70, 0.12, 0.45, false],
];
const clouds = CLOUDS.map(([y, w, x, flip]) => {
  const u = document.createElementNS(NS, 'use');
  u.setAttribute('href', '#cup-cloud');
  cloudG.appendChild(u);
  return { u, y, w, x, flip };
});
function layoutClouds() {
  const W = window.innerWidth, H = window.innerHeight;
  for (const c of clouds) {
    const pw = Math.max(120, c.w * W), ph = pw * 56 / 124;
    const x = c.x * W, y = c.y * H - ph / 2;
    c.u.setAttribute('width', pw.toFixed(1));
    c.u.setAttribute('height', ph.toFixed(1));
    c.u.setAttribute('transform', c.flip
      ? `translate(${(x + pw).toFixed(1)},${y.toFixed(1)}) scale(-1,1)`
      : `translate(${x.toFixed(1)},${y.toFixed(1)})`);
  }
}

let rzT = 0;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(rescale, 120); });

/* ───────── 열기 / 닫기 ───────── */
let open = false;
const btn = () => document.getElementById('btnNewsCup');
function syncBtn() {
  const b = btn();
  if (!b) return;
  b.classList.toggle('on', open);
  b.setAttribute('aria-pressed', open ? 'true' : 'false');
}
function setHash(h) {
  if (location.hash === h) return;
  try { history.replaceState(history.state, '', h); } catch (e) { /* 무시 */ }
}
// 보이기만 맞춘다(뉴스 장면 시작·정지는 부르는 쪽 몫)
function show(on, intro) {
  if (on) {
    rescale();
    root.hidden = false;
    if (intro && !RM.matches) {
      root.classList.remove('intro');
      void root.offsetWidth;   // 등장 애니메이션 다시 시작
      root.classList.add('intro');
    }
  } else {
    root.hidden = true;
    root.classList.remove('intro');
  }
}
function openCup() {
  if (open || curWorld() !== 'news') return false;
  open = true;
  syncBtn();
  setHash(HASH);
  paintFallback();   // 단일 카드를 읽기 전에는 기본값으로 바로 보여 준다
  show(true, true);
  refreshCup().catch(() => { /* 기본값 유지 */ });
  const N = News(); if (N) N.stop();
  return true;
}
function closeCup() {
  if (!open) return false;
  open = false;
  syncBtn();
  if (curWorld() === 'news') setHash(BASE);
  show(false);
  const N = News(); if (N && curWorld() === 'news') N.start().catch(() => { /* 무시 */ });
  return true;
}

// 주소 직접 수정·새로고침: #news/cup이면 열린 상태로 시작한다
open = location.hash === HASH;
syncBtn();
window.addEventListener('hashchange', () => {
  if (curWorld() !== 'news') return;
  if (location.hash === HASH) openCup();
  else if (location.hash === BASE) closeCup();
});
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !open || curWorld() !== 'news') return;
  if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  closeCup();
});

window.TsukuyomiNewsCup = {
  get isOpen() { return open; },
  open: openCup,
  close: closeCup,
  toggle: () => (open ? closeCup() : openCup()),
  refresh: refreshCup,
  // 뉴스 세계를 올릴 때: 열려 있으면 하위 페이지만 보인다
  start() {
    syncBtn();
    show(open, false);
    if (open) refreshCup().catch(() => { /* 기본값 유지 */ });
    return Promise.resolve();
  },
  stop() { /* 움직이는 것이 없다 */ },
  // 다른 세계로 떠날 때: 슬라이드 동안은 그대로 보이고, 돌아오면 닫혀 있다
  leave() { open = false; refreshSeq++; syncBtn(); },
};
})();
