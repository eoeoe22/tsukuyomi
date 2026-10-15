// 물고기 이펙트 성능 측정 스크립트 (계측 전용, tsukuyomi.html에는 로드하지 않는다)
// 사용: 웹 배포판을 연 탭의 콘솔에 이 파일 내용을 붙여넣는다 (붙여넣으면 기본 측정 1회 실행).
//   fishBench({ ms: 4000, runs: 3 })        기본 4시나리오: idle / moon(달 배치 단독) / rise(토리이 1회) / moon+rise
//   fishBench({ ab: true })                 A/B: 변형마다 파라미터를 끄고 moon·rise를 재서 base와 비교
//   fishBench({ ab: ['noGlow', 'noOcc'] })  A/B 변형 일부만
// 결과는 window.__FISH_BENCH__ (원본 JSON은 .json, DevTools에서 copy(__FISH_BENCH__.json)).
// 코어 줌 프로파일러(__TSUKUYOMI__.zoomProf)로 프레임을 모으고, 600프레임 안전 상한에 걸리면 이어서 다시 잰다.
// 측정 중에는 탭을 전면에 두고 마우스를 움직이지 않는다 (rAF 스로틀·포인터 이벤트 영향 배제).
(() => {
    const T = () => window.__TSUKUYOMI__;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const KEYS = ['update', 'fg', 'fishUpd', 'fishScene', 'fishBack', 'fishFront', 'curUpd', 'curDraw'];
    const r2 = v => Math.round(v * 100) / 100;

    // A/B 변형: cursor = CURSOR(달 배치 군집), fish = FISH(토리이 상승), occ = 달 가림 경로 끄기.
    // on: 해당 변형이 영향을 주는 시나리오만 잰다.
    const VARIANTS = {
        base: { on: ['moon', 'rise'] },
        noGlow: { cursor: { glow: 0 }, fish: { glow: 0 }, on: ['moon', 'rise'] },          // 글로우 버퍼 + blur 합성
        noTrail: { cursor: { trail: 0 }, fish: { trail: 0 }, on: ['moon', 'rise'] },       // 꼬리 잔상 고스트
        noFarBlur: { fish: { farBlur: 0 }, on: ['rise'] },                                 // 원경 물고기 blur 필터
        noOcc: { occ: true, on: ['moon'] },                                                // 달 가림 (전체화면 뒤 버퍼)
        minimal: { cursor: { glow: 0, trail: 0 }, fish: { glow: 0, trail: 0, farBlur: 0 }, occ: true, on: ['moon', 'rise'] },
    };

    async function waitFor(cond, timeout, what) {
        const t0 = performance.now();
        while (!cond()) {
            if (performance.now() - t0 > timeout) throw new Error('fishBench: 대기 시간 초과 (' + what + ')');
            await sleep(100);
        }
    }

    // until()이 true가 되거나 maxMs가 지날 때까지 프레임을 모은다. 상한으로 끊긴 구간은 이어 붙인다.
    async function record(label, minMs, maxMs, until) {
        const P = T().zoomProf;
        const raw = [];
        let chunks = 0;
        const flush = S => { if (S && S.label === label && S.raw) raw.push(...S.raw); };
        P.begin(label); chunks++;
        const t0 = performance.now();
        for (;;) {
            await sleep(50);
            const el = performance.now() - t0;
            if (!P.on) { flush(P.last); P.begin(label); chunks++; }
            if (el >= maxMs || (el >= minMs && (!until || until()))) break;
        }
        flush(P.end());
        return summarize(label, raw, chunks);
    }

    function summarize(label, F, chunks) {
        if (!F.length) return { scenario: label, frames: 0 };
        const dts = F.map(f => f.dt).sort((a, b) => a - b);
        const pct = q => dts[Math.min(dts.length - 1, Math.floor(q * dts.length))];
        const dur = F.reduce((s, f) => s + f.dt, 0);
        const lim = Math.max(pct(0.5) * 1.6, 12);
        // 놓친 프레임 비율: 주사율 기준(최소 dt * 1.5) 초과. long(중앙값 기준)은 중앙값이 밀리면 과소 집계된다.
        const vsync = dts[Math.floor(dts.length * 0.05)];
        const row = {
            scenario: label, frames: F.length, ms: Math.round(dur),
            fps: r2(F.length / Math.max(0.001, dur / 1000)),
            dtP50: r2(pct(0.5)), dtP95: r2(pct(0.95)), dtP99: r2(pct(0.99)), dtMax: r2(dts[dts.length - 1]),
            long: F.filter(f => f.dt > lim).length,
            miss: r2(100 * F.filter(f => f.dt > vsync * 1.5).length / F.length),
            js: r2(F.reduce((s, f) => s + f.js, 0) / F.length),
            jsMax: r2(Math.max(...F.map(f => f.js))),
        };
        for (const k of KEYS) {
            let s = 0, m = 0;
            for (const f of F) { const v = f[k] || 0; s += v; if (v > m) m = v; }
            row[k] = r2(s / F.length); row[k + 'Max'] = r2(m);
        }
        row.fishJs = r2(row.fishUpd + row.fishScene + row.fishBack + row.fishFront);
        row.curJs = r2(row.curUpd + row.curDraw);
        row.nFishMax = Math.max(...F.map(f => f.nFish || 0));
        row.nCurMax = Math.max(...F.map(f => f.nCur || 0));
        if (chunks > 1) row.chunks = chunks;
        return row;
    }

    let busy = false;
    async function fishBench(opts = {}) {
        if (busy) throw new Error('fishBench: 이미 측정 중');
        busy = true;
        try { return await runBench(opts); } finally { busy = false; }
    }

    async function runBench(opts) {
        const ms = opts.ms || 4000;            // idle / moon 측정 길이
        const riseMax = opts.riseMax || 15000; // rise 측정 상한 (이펙트 종료 시 조기 종료)
        const runs = Math.max(1, opts.runs || 1);
        const t = T();
        if (!t || !t.zoomProf || !('noOcc' in t.zoomProf)) throw new Error('fishBench: 물고기 계측(noOcc 포함)이 들어간 tsukuyomi.js가 아니다');
        if (document.hidden) console.warn('[fishBench] 탭이 숨겨져 있으면 rAF가 멈춰 측정이 무의미하다');

        let abList = null;
        if (opts.ab) {
            abList = Array.isArray(opts.ab) ? opts.ab.slice() : Object.keys(VARIANTS);
            const bad = abList.filter(v => !VARIANTS[v]);
            if (bad.length) throw new Error('fishBench: 알 수 없는 변형 ' + bad.join(', ') + ' (가능: ' + Object.keys(VARIANTS).join(', ') + ')');
            if (abList[0] !== 'base') abList = ['base', ...abList.filter(v => v !== 'base')];
        }

        const prevCursor = t.cursorMode;
        const prevLog = t.zoomProf.log;
        const prevCursorFx = JSON.parse(JSON.stringify(t.cursorFx));
        const prevFish = JSON.parse(JSON.stringify(t.fish));
        const restoreParams = () => {
            Object.assign(t.cursorFx, prevCursorFx);
            Object.assign(t.fish, prevFish);
            t.zoomProf.noOcc = false;
        };
        t.zoomProf.log = false;
        try {
            // 밤 장면 확보 (일반 달/미러볼은 현재 선택 유지)
            if (t.state !== 'night') {
                console.log('[fishBench] 밤 장면으로 전환 대기…');
                t.mode = t.mode === 'mirror' ? 'mirror' : 'night';
                await waitFor(() => T().state === 'night', 30000, '밤 전환');
                await sleep(1500);
            }
            const fadeMs = Math.max(0.05, prevCursorFx.fade || 0.6) * 1000 + 600;
            const fishDone = () => !T().fishActive;
            const idle = async () => {
                t.actions.fishClear();
                if (t.cursorMode !== 0) { t.cursorMode = 0; await sleep(fadeMs); }
                await sleep(500);
            };
            const moonOn = async () => {
                if (t.cursorMode !== 2) t.cursorMode = 2;
                await sleep(fadeMs);
                if (!t.cursorActive) console.warn('[fishBench] 달 배치 군집이 보이지 않는다 (달이 화면 밖이거나 감소된 동작 설정)');
            };
            const SCEN = {
                idle: async label => { await idle(); return record(label, ms, ms); },
                moon: async label => { await moonOn(); return record(label, ms, ms); },
                rise: async label => {
                    await idle();
                    t.actions.fishRise();
                    const r = await record(label, 500, riseMax, fishDone);
                    await waitFor(fishDone, riseMax, label + ' 종료');
                    return r;
                },
                'moon+rise': async label => {
                    await moonOn();
                    t.actions.fishRise();
                    const r = await record(label, 500, riseMax, fishDone);
                    await waitFor(fishDone, riseMax, label + ' 종료');
                    return r;
                },
            };

            const rows = [];
            for (let r = 0; r < runs; r++) {
                const sfx = runs > 1 ? '#' + (r + 1) : '';
                console.log('[fishBench] run ' + (r + 1) + '/' + runs);
                if (!abList) {
                    for (const s of ['idle', 'moon', 'rise', 'moon+rise']) rows.push(await SCEN[s](s + sfx));
                    continue;
                }
                for (const v of abList) {
                    const V = VARIANTS[v];
                    restoreParams();
                    if (V.cursor) Object.assign(t.cursorFx, V.cursor);
                    if (V.fish) Object.assign(t.fish, V.fish);
                    t.zoomProf.noOcc = !!V.occ;
                    for (const s of V.on) {
                        console.log('[fishBench]   ' + v + ' / ' + s);
                        const row = await SCEN[s](v + ':' + s + sfx);
                        row.variant = v; row.base = s;
                        rows.push(row);
                    }
                }
                restoreParams();
            }

            const env = {
                ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight,
                moon: t.mode, at: new Date().toISOString(), mode: abList ? 'ab' : 'scenarios', variants: abList,
            };
            const res = { env, rows, json: '' };
            res.json = JSON.stringify({ env, rows });
            window.__FISH_BENCH__ = res;

            console.log('[fishBench] ' + env.w + 'x' + env.h + '@' + env.dpr + '  moon=' + env.moon);
            console.table(rows.map(x => ({
                scenario: x.scenario, frames: x.frames, fps: x.fps,
                dtP50: x.dtP50, dtP95: x.dtP95, dtP99: x.dtP99, dtMax: x.dtMax, 'miss%': x.miss, long: x.long,
                js: x.js, jsMax: x.jsMax, fishJs: x.fishJs, curJs: x.curJs, nFish: x.nFishMax, nCur: x.nCurMax,
            })));
            if (abList) {
                // base 대비 증감 (같은 시나리오, run 평균)
                const avgOf = (v, s, k) => {
                    const xs = rows.filter(x => x.variant === v && x.base === s);
                    return xs.length ? xs.reduce((a, x) => a + x[k], 0) / xs.length : NaN;
                };
                const cmp = [];
                for (const v of abList) {
                    if (v === 'base') continue;
                    for (const s of VARIANTS[v].on) {
                        const d = k => r2(avgOf(v, s, k) - avgOf('base', s, k));
                        cmp.push({
                            variant: v, scenario: s,
                            fps: r2(avgOf(v, s, 'fps')), 'Δfps': d('fps'),
                            'miss%': r2(avgOf(v, s, 'miss')), 'Δmiss%': d('miss'),
                            'ΔdtP95': d('dtP95'), 'Δjs': d('js'), 'Δfg': d('fg'),
                            'ΔfishJs': d('fishJs'), 'ΔcurJs': d('curJs'),
                        });
                    }
                }
                console.log('[fishBench] A/B: base 대비 증감 (Δfps↑ / Δmiss%↓ 가 개선)');
                console.table(cmp);
                res.ab = cmp;
            } else {
                console.log('[fishBench] 구간별 JS ms (avg / max)');
                console.table(rows.map(x => {
                    const o = { scenario: x.scenario };
                    for (const k of KEYS) o[k] = x[k] + ' / ' + x[k + 'Max'];
                    return o;
                }));
            }
            console.log('[fishBench] 원본 JSON: __FISH_BENCH__.json  (DevTools에서는 copy(__FISH_BENCH__.json))');
            return res;
        } finally {
            restoreParams();
            t.zoomProf.log = prevLog;
            t.cursorMode = prevCursor;
        }
    }

    window.fishBench = fishBench;
    window.fishBench.variants = VARIANTS;
    fishBench().catch(e => console.error(e));
})();
