/* 후스마(襖) 회랑: 양쪽으로 열리는 미닫이 문을 계속 지나가는 장면. 무한 반복 + 세계 전환 오버레이.
 * 참고 영상: references/opening.mp4(임시 폴더, 런타임에 쓰지 않음). 영상의 주황 테두리 UI·오디오는 옮기지 않았다.
 *
 * 구조(모두 절차적, 2D 캔버스 하나)
 *   - 미터 단위 회랑: 후스마 벽이 z = -k·D 마다 서 있고 카메라는 −z를 본다. 벽은 z축에 수직이라 원근이 '배율+이동'뿐이다.
 *     영상 첫 프레임처럼 문이 화면 높이를 채우게 잡아 바닥·천장은 그리지 않는다(벽 위아래는 어두운 나무로 무한히 이어짐).
 *     카메라 롤은 캔버스 회전 한 번.
 *   - 벽 하나 = 문틀 아래(敷居) · 후스마 10장(가운데 두 장이 열리는 문) · 상인방(鴨居) → 위아래 어두운 나무.
 *     종이 그림(수묵 산수 + 종이결)은 4장 폭 텍스처 하나를 미리 굽고 장마다 잘라 쓴다(주기 함수라 이어 붙여도 이음새 없음).
 *   - 한 주기(cycle): 앞 벽 가운데 문이 바깥 장 위로 미끄러져 열리고, 카메라가 그 사이를 지나 다음 벽 앞 같은 거리에 선다
 *     → 기하가 주기적이라 끊김 없이 반복된다.
 *   - 깊이 어둡힘은 벽마다 'source-atop' 덮개(불투명한 곳에만 칠함)로 누적한다. 같은 이유로 비네팅·그레인·줌 블러도
 *     source-atop이라, 전환의 마지막 벽(뒤가 비어 투명) 너머로 보이는 다음 세계는 건드리지 않는다.
 *
 * API (window.TsukuyomiFusuma)
 *   mount(canvas, opts) → { start(), stop(), setTime(t) }   무한 반복(fusuma.html)
 *   transition(opts) → { covered: Promise, finish(): Promise, cancel() }
 *     화면 위에 고정 캔버스를 띄워 닫힌 후스마(영상 첫 프레임 구도)로 다가가며 페이드인 → covered(완전히 덮임) →
 *     finish()가 오면 '빈 문'(뒤가 투명) 하나만 열어 아래 세계를 드러내고, 통과하면 캔버스를 걷는다.
 *     finish 전이면 닫힌 문 앞에서 감속해 기다린다(문 열기는 전환마다 한 번).
 *     opts: { zIndex, fadeInMs, onReveal(k, need) }  k: 빈 문 통과 진행도 0~1, need: 틈을 덮는 아래 세계의 최소 배율(0~1)
 *   cfg: 조절값(라이브 수정 가능)
 */
(() => {
  'use strict';

  const CFG = {
    // 영상 실측(12fps): 문 열림 컷이 약 6.5프레임마다 → 한 주기 ≈ 0.54초. 카메라는 등속으로 다가가고,
    // 문은 두 장이 화면을 채울 즈음 0.17초 남짓에 열린다
    CYCLE: 0.55,        // 한 주기(초): 직전 벽 통과 → 다음 벽 문 열림 → 통과. 전진은 등속
    OPEN_A: 0.48,       // 주기 안에서 문 열림 시작/끝(0~1)
    OPEN_B: 0.78,
    // 영상의 카메라는 한쪽으로만 꾸준히 기운다(되돌아오지 않음). 왕복(사인)은 끝에서 멈칫했다 반대로 꺾여 부자연스러워
    // 한 방향 등속으로 기울다가 ROLL_MAX 앞 ROLL_EASE 구간에서 고르게 감속해 멈춘 뒤 그 각도를 유지한다
    ROLL_SPEED: 4.5,    // 카메라 롤 각속도(도/초). 영상 실측 ≈ 4~5°/s. 0이면 기울지 않음
    ROLL_MAX: 70,       // 이 각도(도)에서 기울어짐을 멈춘다
    ROLL_EASE: 15,      // 멈추기 전 감속 구간(도). 등속 → 0으로 고르게 줄어든다
    FOG: 0.11,          // 깊이 어둡힘(1/m)
    BLUR: 0.32,         // 전진 줌 블러 세기
    GHOST: 0,           // 문 잔상 불투명도(0=끔). 켜면 문 틈에 반투명 판이 겹쳐 보인다
    GRAIN: 0.06,        // 필름 그레인
    DPR_MAX: 1.5,
    // 전환
    FADE_IN_MS: 380,
    TRANS_CYCLE: 0.8,   // 전환의 한 주기(초). 문은 한 번만 연다(첫 문 = 빈 문)
    HOLD_U: 0.4,        // 다음 세계가 아직 준비 중이면 이 위치(주기 진행도, 문 닫힘)에서 감속해 기다린다
  };

  // ---------- 치수(미터) ----------
  const PW = 0.95;          // 후스마 한 장 폭
  const SILL = 0.03;        // 문틀 아래(敷居) 윗면
  const PH = 1.8;           // 후스마 높이
  const TOP = SILL + PH;    // 상인방 아랫면
  const KAMOI = 0.1;        // 상인방 두께
  const EYE = 0.95;         // 눈높이
  const D = 2.2;            // 벽 간격. 주기 시작(직전 벽 통과) 때 카메라 ~ 앞 벽 거리이기도 하다
  // 영상 첫 프레임(주기 시작, 벽까지 D): 세로로 문틀 아래 ~ 상인방 가운데(≈1.95m), 가로로 문 4장 남짓(≈3.65m)이 보인다.
  // 이 거리에서 VIEW_W × VIEW_H가 화면을 채우도록(cover) 초점거리를 잡는다
  const FRAME_D = D;
  const VIEW_W = 3.65, VIEW_H = 1.95;
  // 바닥·천장이 없으니 롤로 화면이 기울면 문 띠(이 높이, 눈높이 중심) 밖 어두운 나무가 드러난다.
  // 기운 화면의 세로 폭이 주기 시작(벽까지 D)에서도 이 띠 안에 들도록 초점거리를 키운다(영상도 기울수록 가까워 보임)
  const BAND_H = 2.2;
  const NEAR = 0.06;
  const PANELS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4];   // 패널 i: x ∈ [i·PW, (i+1)·PW], 문 = -1, 0
  const STILE = 0.04;       // 문테 폭(영상: 가운데 맞닿는 두 문테가 굵은 검은 띠)
  const HIKITE_R = 0.046, HIKITE_IN = 0.1, HIKITE_Y = SILL + PH * 0.41;

  const COL = {
    fog: '24,16,9',
    frame: '#20170f', frameHi: 'rgba(150,118,80,0.35)',
    kamoi: '#3a2a1b', kamoiHi: 'rgba(190,150,100,0.28)',
    upper: '#22180f', upperFar: '#140e08',   // 상인방 위
    sill: '#2c2015', lower: '#1a120a',       // 문틀 아래
    hikite: '#17110c', hikiteRim: 'rgba(120,95,65,0.6)',
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease3 = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const openAt = u => ease3(clamp((u - CFG.OPEN_A) / (CFG.OPEN_B - CFG.OPEN_A), 0, 1));

  // ---------- 텍스처: 종이 + 수묵 산수(4장 폭, 가로 주기) ----------
  let TEX = null, GRAIN = null;
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function buildTextures() {
    if (TEX) return;
    const PPM = 460;
    const W = Math.round(4 * PW * PPM), H = Math.round(PH * PPM);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // 종이: 위·가운데가 밝은 세로 그라디언트
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#d6bf92'); gr.addColorStop(0.45, '#e0c9a0'); gr.addColorStop(1, '#c9ad7e');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const R = rng(7);
    // 종이결(짧은 섬유) + 얼룩
    for (let i = 0; i < 2600; i++) {
      const x = R() * W, y = R() * H, l = 3 + R() * 14, a = R() * Math.PI;
      g.strokeStyle = R() < 0.5 ? 'rgba(255,245,220,0.10)' : 'rgba(90,70,40,0.07)';
      g.lineWidth = 0.6 + R();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = R() * W, y = R() * H, r = 30 + R() * 120;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, R() < 0.5 ? 'rgba(120,95,55,0.05)' : 'rgba(255,240,210,0.06)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 산수(영상 첫 프레임): 문짝 아래 1/4 남짓에 겹겹의 수묵 능선. 능선 꼭대기가 가장 짙고 아래로 안개에 풀리며,
    // 앞 겹일수록 낮고 짙다. 봉우리는 뾰족한 삼각 + 잔 요철, 가장자리는 크게 번진다. 모두 가로 주기 W(4장)라 이음새 없음
    const layers = [
      { base: 0.215, ink: '92,98,80', a: 0.30, seed: 11, n: 5, ph: [0.035, 0.07], pw: [0.05, 0.09], blur: 7 },
      { base: 0.165, ink: '74,80,64', a: 0.48, seed: 23, n: 6, ph: [0.03, 0.065], pw: [0.04, 0.08], blur: 5.5 },
      { base: 0.105, ink: '58,64,50', a: 0.66, seed: 37, n: 6, ph: [0.03, 0.07], pw: [0.04, 0.08], blur: 4.5 },
      { base: 0.045, ink: '44,48,38', a: 0.80, seed: 53, n: 5, ph: [0.03, 0.06], pw: [0.05, 0.10], blur: 4 },
    ];
    const blurOk = 'filter' in g;
    for (const L of layers) {
      const r = rng(L.seed);
      const lerp = (m, k) => m[0] + (m[1] - m[0]) * k;
      const peaks = [];
      for (let k = 0; k < L.n; k++) {
        // 가로로 고르게 흩되(겹침 방지) 조금씩 흔든다. 비대칭 경사(왼/오 폭 다름)
        const w = lerp(L.pw, r());
        peaks.push({ x: (k + 0.2 + r() * 0.6) / L.n, h: lerp(L.ph, r()), wl: w * (0.7 + r() * 0.6), wr: w * (0.7 + r() * 0.6) });
      }
      const waves = [];
      for (const fq of [9, 14, 23, 37, 61]) waves.push({ f: fq, a: 0.004 * (20 / fq) ** 0.6 * (0.5 + r()), p: r() * Math.PI * 2 });
      const ridge = x => {
        const t = x / W;
        let h = 0;
        for (const p of peaks) {
          let d = t - p.x; d -= Math.round(d);              // 주기 거리(-0.5~0.5)
          const w = d < 0 ? p.wl : p.wr;
          h = Math.max(h, p.h * Math.max(0, 1 - Math.abs(d) / w) ** 1.25);
        }
        for (const w of waves) h += w.a * Math.sin(2 * Math.PI * w.f * t + w.p);
        return H - (L.base + h) * H;
      };
      const pts = [];
      let top = H;
      for (let x = 0; x <= W; x += 3) { const y = ridge(x); top = Math.min(top, y); pts.push(x, y); }
      g.save();
      if (blurOk) g.filter = 'blur(' + L.blur + 'px)';
      g.beginPath(); g.moveTo(0, H);
      for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.lineTo(W, H); g.closePath();
      // 꼭대기가 짙고 base 아래 0.07H 남짓에서 안개로 거의 사라진다
      const yb = H - L.base * H;
      const lg = g.createLinearGradient(0, top, 0, yb + 0.075 * H);
      lg.addColorStop(0, 'rgba(' + L.ink + ',' + L.a + ')');
      lg.addColorStop(clamp((yb - top) / (yb + 0.075 * H - top), 0.05, 0.9), 'rgba(' + L.ink + ',' + (L.a * 0.72) + ')');
      lg.addColorStop(1, 'rgba(' + L.ink + ',' + (L.a * 0.12) + ')');
      g.fillStyle = lg; g.fill();
      g.restore();
      // 겹 사이 안개 띠(다음 겹 능선 위를 흐리게)
      const my = yb + 0.02 * H;
      const mg = g.createLinearGradient(0, my - 0.03 * H, 0, my + 0.05 * H);
      mg.addColorStop(0, 'rgba(214,196,160,0)'); mg.addColorStop(0.5, 'rgba(214,196,160,0.28)'); mg.addColorStop(1, 'rgba(214,196,160,0)');
      g.fillStyle = mg; g.fillRect(0, my - 0.03 * H, W, 0.08 * H);
    }
    // 맨 아래(문틀 가까이)는 어둑하게 가라앉는다
    const bg = g.createLinearGradient(0, H * 0.9, 0, H);
    bg.addColorStop(0, 'rgba(38,40,30,0)'); bg.addColorStop(1, 'rgba(38,40,30,0.35)');
    g.fillStyle = bg; g.fillRect(0, H * 0.9, W, H * 0.1);
    TEX = { c, W, H, sw: W / 4 };
    // 그레인 타일
    const n = 192, gc = document.createElement('canvas'); gc.width = gc.height = n;
    const gx = gc.getContext('2d'), id = gx.createImageData(n, n), R2 = rng(99);
    for (let i = 0; i < n * n; i++) {
      const v = (R2() * 255) | 0;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
    }
    gx.putImageData(id, 0, 0);
    GRAIN = gc;
  }

  // ---------- 렌더러 ----------
  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, f = 1, f0 = 1, vign = null, grainPat = null;

    function resize() {
      dpr = Math.min(CFG.DPR_MAX, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
      if (w === W && h === H) return;
      W = canvas.width = w; H = canvas.height = h;
      f0 = Math.max(W / VIEW_W, H / VIEW_H) * FRAME_D;
      vign = null;
    }
    // 롤에 맞춘 초점거리: 기본 cover와 '기운 화면 세로 폭 ≤ BAND_H' 중 큰 쪽
    const focal = roll => Math.max(f0, (W * Math.abs(Math.sin(roll)) + H * Math.abs(Math.cos(roll))) * D / BAND_H);
    function vignette() {
      if (vign) return vign;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const r = Math.hypot(W, H) / 2;
      // 위 가운데의 따뜻한 빛 + 가장자리 어둠(영상의 세피아 톤)
      let rg = g.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, r * 0.9);
      rg.addColorStop(0, 'rgba(255,226,170,0.2)'); rg.addColorStop(1, 'rgba(255,226,170,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
      rg = g.createRadialGradient(W / 2, H / 2, r * 0.38, W / 2, H / 2, r * 1.05);
      rg.addColorStop(0, 'rgba(40,22,6,0)'); rg.addColorStop(0.62, 'rgba(40,22,6,0.34)'); rg.addColorStop(1, 'rgba(18,9,2,0.86)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
      return (vign = c);
    }

    // 회전 좌표계(화면 중심 원점)에서 벽 평면 사각형
    let S = 1, CX = 0;   // 현재 벽 배율·카메라 x
    const rx = x => S * (x - CX), ry = y => -S * (y - EYE);
    function rect(x0, y0, x1, y1, fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(rx(x0), ry(y1), S * (x1 - x0), S * (y1 - y0));
    }
    function panel(i, dx) {
      const x0 = i * PW + dx, x1 = x0 + PW;
      const slice = (((i + 2) % 4) + 4) % 4;
      ctx.drawImage(TEX.c, slice * TEX.sw, 0, TEX.sw, TEX.H, rx(x0), ry(TOP), S * PW, S * PH);
      // 문테(검은 옻칠) + 가는 반사선
      rect(x0, SILL, x0 + STILE, TOP, COL.frame);
      rect(x1 - STILE, SILL, x1, TOP, COL.frame);
      rect(x0, TOP - 0.018, x1, TOP, COL.frame);
      rect(x0, SILL, x1, SILL + 0.018, COL.frame);
      const lw = Math.max(1, S * 0.004);
      ctx.fillStyle = COL.frameHi;
      ctx.fillRect(rx(x0 + STILE * 0.55), ry(TOP), lw, S * PH);
      ctx.fillRect(rx(x1 - STILE * 0.45), ry(TOP), lw, S * PH);
      // 손잡이(引手): 가운데 쪽 가장자리 가까이
      const hx = i < 0 ? x1 - HIKITE_IN : x0 + HIKITE_IN;
      if (i >= -2 && i <= 1) {
        const cx = rx(hx), cy = ry(HIKITE_Y), r = S * HIKITE_R;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = COL.hikite; ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.14); ctx.strokeStyle = COL.hikiteRim; ctx.stroke();
      }
    }
    // 벽 k: dz = 카메라~벽 거리, open 0~1, hole이면 문 너머를 그리지 않는다(투명)
    function wall(dz, camX, open, ghost) {
      S = f / dz; CX = camX;
      const xL = PANELS[0] * PW - 1, xR = (PANELS[PANELS.length - 1] + 1) * PW + 1;
      // 바깥 장(고정)
      for (const i of PANELS) if (i !== -1 && i !== 0) panel(i, 0);
      // 문: 바깥 장 위로 미끄러진다. 빠를 때는 잔상 두 겹
      if (ghost && CFG.GHOST > 0) {
        ctx.globalAlpha = CFG.GHOST;
        for (const g of ghost) { panel(-1, -g * PW); panel(0, g * PW); }
        ctx.globalAlpha = 1;
      }
      panel(-1, -open * PW); panel(0, open * PW);
      // 문 열린 틈 위아래는 그대로 비어 있다(뒤가 보임). 문틀·상인방·회벽
      rect(xL, -0.2, xR, SILL, COL.sill);
      rect(xL, TOP, xR, TOP + KAMOI, COL.kamoi);
      ctx.fillStyle = COL.kamoiHi; ctx.fillRect(rx(xL), ry(TOP + 0.012), S * (xR - xL), Math.max(1, S * 0.006));
      // 상인방 위·문틀 아래: 바닥·천장 대신 어두운 나무가 이어진다(롤로 화면 끝이 벽 밖으로 나가도 비지 않게 넉넉히)
      const g = ctx.createLinearGradient(0, ry(TOP + KAMOI + 0.5), 0, ry(TOP + KAMOI));
      g.addColorStop(0, COL.upperFar); g.addColorStop(1, COL.upper);
      rect(xL, TOP + KAMOI, xR, TOP + 4, g);
      rect(xL, -4, xR, -0.2, COL.lower);
    }
    function fog(alpha) {
      if (alpha <= 0.002) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(' + COL.fog + ',' + alpha.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    /* st: { camZ, camX, roll(rad), openOf(k), hole(k): bool, speed(0~1) } */
    function draw(st) {
      resize();
      if (!TEX) buildTextures();
      f = focal(st.roll);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(Math.cos(st.roll), Math.sin(st.roll), -Math.sin(st.roll), Math.cos(st.roll), W / 2, H / 2);
      // 앞 벽 m: 카메라 앞에서 가장 가까운 벽
      const m = Math.max(0, Math.ceil((-(st.camZ - NEAR)) / D - 1e-9));
      const dzOf = k => st.camZ + k * D;
      const step = 1 - Math.exp(-CFG.FOG * D);
      // 뒤에서 앞으로: m+1, m. m+1의 문은 아직 닫혀 있어(카메라는 주기 n에 벽 n을 지나므로 m ≥ n) 그 너머는 안 보인다.
      // 빈 문(hole)이면 m 너머를 그리지 않아 투명하게 남는다
      const far = st.hole(m) ? m : m + 1;
      for (let k = far; k >= m; k--) {
        const dz = dzOf(k);
        wall(dz, st.camX, st.openOf(k), st.ghostOf ? st.ghostOf(k) : null);
        fog(k > m ? step : 1 - Math.exp(-CFG.FOG * dz));
      }
      // 화면 효과(불투명한 곳에만)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      const sp = clamp(st.speed || 0, 0, 1) * CFG.BLUR;
      if (sp > 0.01) {
        // 줌 블러: 캔버스를 자기 위에 조금씩 키워 겹친다
        for (const [s, a] of [[1.025, 0.5], [1.06, 0.3]]) {
          const k = 1 + (s - 1) * sp / CFG.BLUR;
          ctx.globalAlpha = a * sp;
          ctx.drawImage(canvas, W / 2 - W * k / 2, H / 2 - H * k / 2, W * k, H * k);
        }
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(vignette(), 0, 0);
      if (CFG.GRAIN > 0) {
        if (!grainPat) grainPat = ctx.createPattern(GRAIN, 'repeat');
        ctx.globalAlpha = CFG.GRAIN;
        const ox = (Math.random() * 192) | 0, oy = (Math.random() * 192) | 0;
        ctx.translate(-ox, -oy);
        ctx.fillStyle = grainPat; ctx.fillRect(ox, oy, W, H);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // 빈 문 틈(벽 평면 x ∈ ±open·PW, y ∈ SILL~TOP)을 화면 중심 기준으로 덮으려면 아래 장면이 최소 몇 배여야 하는가(≤ 1).
    // 틈 네 모서리를 롤까지 적용해 화면에 투영하고, 가로·세로 반폭 대비 가장 바깥 비율을 쓴다
    function coverNeed(dz, open, roll) {
      resize();
      if (open <= 0) return 0;
      if (dz <= NEAR) return 1;
      f = focal(roll);
      const c = Math.cos(roll), sn = Math.sin(roll);
      let need = 0;
      for (const x of [-open * PW, open * PW]) for (const y of [SILL, TOP]) {
        const X = f * x / dz, Y = -f * (y - EYE) / dz;
        const px = c * X - sn * Y, py = sn * X + c * Y;
        need = Math.max(need, Math.abs(px) / (W / 2), Math.abs(py) / (H / 2));
      }
      return Math.min(1, need * 1.03);
    }
    return { draw, resize, coverNeed };
  }

  // ---------- 롤(도): 등속 → 등감속 → 정지 ----------
  function rollDeg(t, a0) {
    const v = CFG.ROLL_SPEED, M = CFG.ROLL_MAX;
    if (!(v > 0) || t <= 0) return a0;
    if (a0 >= M) return a0;
    const B = clamp(CFG.ROLL_EASE, 0, M - a0);
    const t1 = (M - B - a0) / v;          // 감속 시작
    if (t <= t1) return a0 + v * t;
    const T = B > 0 ? 2 * B / v : 0;      // 감속 시간(등감속으로 B만큼 더 간다)
    const s = Math.min(t - t1, T);
    return M - B + v * s - (T > 0 ? v * s * s / (2 * T) : 0);
  }

  // ---------- 시간 → 상태 ----------
  // t: 초. 주기 n(u=0)에 카메라는 벽 n-1 자리(벽 n까지 D)에 있고 등속으로 다가가 u=1에 벽 n을 지난다.
  function stateAt(t, o, cycle) {
    const C = cycle || CFG.CYCLE;
    const rollSign = (o && o.rollSign) || 1;
    const roll = rollSign * rollDeg(t, (o && o.roll0) || 0) * Math.PI / 180;   // roll0: 시작 각(도)
    const n = Math.floor(t / C), u = t / C - n;
    const camZ = D - (n + u) * D;
    const openOf = k => k < n ? 1 : k > n ? 0 : openAt(u);
    const du = 0.03 / C;
    const ghostOf = k => {
      if (k !== n) return null;
      const a = openAt(u), b = openAt(u - du), c = openAt(u - 2 * du);
      return a - c > 0.05 ? [c, b] : null;
    };
    return { camZ, camX: 0, roll, speed: 0.6, openOf, hole: () => false, ghostOf, n, u };
  }

  // ---------- 무한 반복 ----------
  function mount(canvas, opts) {
    const R = createRenderer(canvas);
    let raf = 0, t0 = 0, fixed = null;
    const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const frame = now => {
      const t = fixed != null ? fixed : (now - t0) / 1000;
      R.draw(stateAt(t, opts));
      raf = fixed != null || RM.matches ? 0 : requestAnimationFrame(frame);
    };
    return {
      start() { if (raf) return; t0 = performance.now() - ((opts && opts.t0) || 0) * 1000; raf = requestAnimationFrame(frame); },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      setTime(t) { fixed = t; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
      renderer: R,
    };
  }

  // ---------- 세계 전환 오버레이 ----------
  function transition(opts) {
    opts = opts || {};
    buildTextures();
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: String(opts.zIndex || 50),
      pointerEvents: 'none', opacity: '0',
    });
    document.body.appendChild(cv);
    const R = createRenderer(cv);
    const fadeMs = opts.fadeInMs != null ? opts.fadeInMs : CFG.FADE_IN_MS;
    const ro = { rollSign: Math.random() < 0.5 ? -1 : 1, roll0: 0 };
    const C = CFG.TRANS_CYCLE;
    // 가상 시간 tv: 영상 첫 프레임 구도(벽 0까지 D, tv = 0)에서 페이드인하며 다가간다. 더 먼 곳에서 시작하면 문 위아래
    // 어두운 나무가 드러나므로 0부터. 준비가 안 됐으면 HOLD_U 앞에서 감속해 멈춘다. 벽 0이 곧 빈 문이라 문은 한 번만 열린다
    let tv = 0, rate = 1, last = performance.now();
    const start = last;
    let raf = 0, finishWanted = false, dead = false, resolveCovered, resolveDone;
    const covered = new Promise(r => { resolveCovered = r; });
    const done = new Promise(r => { resolveDone = r; });
    const dzOpen = D * (1 - CFG.OPEN_A);

    const end = () => {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      cv.remove();
      resolveCovered(); resolveDone();
    };
    const frame = now => {
      if (dead) return;
      const el = (now - start) / 1000, dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cv.style.opacity = String(clamp(el / (fadeMs / 1000 || 1e-3), 0, 1));
      if (el * 1000 >= fadeMs) resolveCovered();
      const go = finishWanted && el * 1000 >= fadeMs;
      const tH = CFG.HOLD_U * C;
      const target = go ? 1 : clamp((tH - tv) / (0.35 * C), 0, 1);
      rate += (target - rate) * Math.min(1, dt * 10);
      tv += dt * rate;
      if (!go) tv = Math.min(tv, tH);
      const st = stateAt(tv, ro, C);
      st.hole = k => k === 0;
      st.speed *= rate;
      const dz = st.camZ;   // 벽 0은 z = 0
      // need: 아래 세계를 이 배율 밑으로 줄이면 틈으로 바깥(빈 바탕)이 보인다
      if (opts.onReveal) opts.onReveal(clamp((dzOpen - dz) / (dzOpen - 0.15), 0, 1), R.coverNeed(dz, st.openOf(0), st.roll));
      if (dz < 0.15) { end(); return; }
      R.draw(st);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return {
      covered,
      finish() { finishWanted = true; return done; },
      cancel: end,
      el: cv,
    };
  }

  window.TsukuyomiFusuma = { mount, transition, cfg: CFG, prewarm: buildTextures, stateAt, createRenderer };
})();
