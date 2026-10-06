
        // mirrorball.svg 기준 (미러볼 SVG 생성기 설정값):
        // tilt -16°, step 6°, gap 0.14, jit 0.06, off 1, seed 11,
        // tile #dfe4ea, grout #6b7480 — 같은 시드·난수 순서로 타일 배치 재생성 후 회전
        const OPT = {
            tilt: -16, step: 6, gap: 0.14, jit: 0.06, off: 1, seed: 11,
            tile: '#dfe4ea', grout: '#6b7480'
        };
        const cv = document.getElementById('ball');
        const ctx = cv.getContext('2d');
        const S = 440, C = 220, R = 200;
        const dpr = window.devicePixelRatio || 1;
        cv.width = S * dpr;
        cv.height = S * dpr;
        ctx.scale(dpr, dpr);

        const PERIOD = 40; // 1회전 초
        const rad = d => d * Math.PI / 180;
        const T = rad(OPT.tilt), ct = Math.cos(T), st = Math.sin(T);
        const K = 1 - OPT.gap;

        function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

        // 구면 좌표 → 시점 기울기(x축 회전) 적용 → 정사영 (SVG 생성기와 동일)
        function V(lat, lon) {
            const la = rad(lat), lo = rad(lon);
            const x = Math.cos(la) * Math.sin(lo);
            const y = Math.sin(la);
            const z = Math.cos(la) * Math.cos(lo);
            return [x, y * ct - z * st, y * st + z * ct];
        }
        function Pj(lat, lon) {
            const q = V(lat, lon);
            return [C + R * q[0], C - R * q[1]];
        }

        // 타일 토폴로지 1회 생성 (난수 호출 순서는 SVG 생성기와 동일: 행마다 폭 n개 → 오프셋 1개)
        const tiles = [];
        {
            const rnd = mulberry32(OPT.seed);
            const rows = Math.ceil(180 / OPT.step);
            for (let i = 0; i < rows; i++) {
                const lat = -90 + i * OPT.step, lat2 = Math.min(90, lat + OPT.step), mid = (lat + lat2) / 2;
                const n = Math.max(4, Math.round(360 * Math.cos(rad(mid)) / OPT.step));
                const ws = []; let sum = 0;
                for (let j = 0; j < n; j++) { const w = 1 + (rnd() * 2 - 1) * OPT.jit; ws.push(w); sum += w; }
                const lonStart = (rnd() * OPT.off) * (360 / n);
                let lon = lonStart;
                for (let j = 0; j < n; j++) {
                    const tw = ws[j] * 360 / sum;
                    tiles.push({ lat, lat2, mid, lon0: lon, tw });
                    lon += tw;
                }
            }
        }

        let rotDeg = 0, last = performance.now();

        function shade(hex, f) {
            const n = parseInt(hex.slice(1), 16);
            const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
            return `rgb(${r},${g},${b})`;
        }
        const SIDE = shade(OPT.tile, 0.55);

        function draw() {
            ctx.clearRect(0, 0, S, S);
            ctx.save();
            ctx.beginPath();
            ctx.arc(C, C, R, 0, Math.PI * 2);
            ctx.fillStyle = OPT.grout;
            ctx.fill();
            ctx.clip();
            // 타일 질감(형태만 — 반사/색상은 나중에):
            // 1) 전체 쿼드 = 측면/두께 (어둡게) → 2) 수축 쿼드 = 정면 → 3) 윗변 하이라이트 + 아랫변 그림자
            const tops = [], bottoms = [];
            for (const t of tiles) {
                const midLon = t.lon0 + t.tw / 2 + rotDeg;
                if (V(t.mid, midLon)[2] <= 0) continue; // 뒷면 컬링 (SVG 생성기와 같은 기준)
                const lon0 = t.lon0 + rotDeg, lon1 = lon0 + t.tw;
                const pts = [Pj(t.lat, lon0), Pj(t.lat, lon1), Pj(t.lat2, lon1), Pj(t.lat2, lon0)];
                const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
                const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
                const fx = pts.map(q => [cx + (q[0] - cx) * K, cy + (q[1] - cy) * K]);
                // 1) 측면 베이스 (두께감: 정면보다 한 겹 크게 어둡게)
                ctx.beginPath();
                pts.forEach((q, k) => { k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
                ctx.closePath();
                ctx.fillStyle = SIDE;
                ctx.fill();
                // 2) 정면
                ctx.beginPath();
                fx.forEach((q, k) => { k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
                ctx.closePath();
                ctx.fillStyle = OPT.tile;
                ctx.fill();
                // 3) 베벨용 변 수집 (pts 순서: 0 좌하, 1 우하, 2 우상, 3 좌상)
                tops.push([fx[3], fx[2]]);
                bottoms.push([fx[0], fx[1]]);
            }
            // 윗변: 두께가 빛 받는 느낌 (참고영상 첫 프레임의 윗면 밝은 림)
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (const [a, b] of tops) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
            ctx.stroke();
            // 아랫변: 정면 아래 그림자로 입체감
            ctx.strokeStyle = 'rgba(0,0,0,0.28)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const [a, b] of bottoms) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
            ctx.stroke();
            ctx.restore();
        }

        function loop(t) {
            const dt = (t - last) / 1000;
            last = t;
            rotDeg = (rotDeg + dt * 360 / PERIOD) % 360;
            draw();
            requestAnimationFrame(loop);
        }

        draw();
        requestAnimationFrame(loop);
    