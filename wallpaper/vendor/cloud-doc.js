/* 브러시 구름 문서(tsukuyomi-cloud-doc) 공용 모듈.
 * tsukuyomi.cloudedit.js(디버그 패널 › 구름 › 브러시 구름 편집)와 tsukuyomi.js(장면에 굽기)가 같은 셰이더·프리셋을 써서
 * 편집 중 본 구름이 장면에 그대로 적용된다. window.CloudDoc 으로 노출.
 *
 * 문서 좌표: 세로 1 = 문서 높이, 가로 = aspect(가로/세로 비), 아래가 0. horizon 아래는 수면.
 * 맵 두 장(행 0 = 문서 아래):
 *   den: 엔벨로프(큰 형태). 0 근처가 평균 구름 경계, 양수는 속이 찬 곳, 음수는 빈 하늘.
 *   tr : 자기 그림자 투과율 보정. 계산된 거대 형태 투과율(macro)에 더한다. 0 = 계산값 그대로.
 * 장면 배치(fit): 문서의 horizon을 장면 수평선(HZ)에 맞추고 가로 가운데 정렬,
 *   하늘(HZ)과 화면 너비(W)를 모두 덮도록 확대(cover). 넘치는 위/양옆은 잘린다.
 */
(() => {
    'use strict';

    const VS = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

    const FS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime;
uniform float uCov,uSharp,uSoft,uScale,uAbsorb,uGrain; uniform vec2 uSun; uniform int uView;
uniform vec4 uDoc;        // 문서 사각형(캔버스 px, 아래 기준): 원점 xy, 크기 zw
uniform float uDocA;      // 문서 가로/세로 비
uniform float uH;         // 문서 수평선 높이
uniform int uMode;        // 0 = 에디터 미리보기(하늘·수면 배경), 1 = 장면용 굽기(구름만, 투명 배경)
uniform sampler2D uDen;   // 밀도 맵 = 엔벨로프
uniform sampler2D uTr;    // 투과율 보정 맵
uniform int uOverlay,uLayer;
// 장면 프리셋 색: 하늘 5단(위 → 수평선, 장면 SKY_STOPS와 같은 위치), 구름 3톤, 실버 라이닝, 대기 원근, 수면(미리보기용)
uniform vec3 uSky[5];
uniform vec3 uShLo,uShHi,uMid,uLit,uRim,uFar,uWatA,uWatB;
out vec4 fragColor;

float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y);}
// F1 워리 거리: 셀 중심이 밝은 둥근 혹을 만든다
float worley(vec2 p){vec2 i=floor(p),f=fract(p);float d=8.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y);vec2 o=hash22(i+g);
    o=.5+.38*sin(uTime*.04+6.2831*o);vec2 r=g+o-f;d=min(d,dot(r,r));}
  return sqrt(d);}
// 반전 워리 fbm = 빌로우(뭉게) 노이즈
float billow(vec2 p,int oct){float n=0.,a=.55,s=0.;
  for(int i=0;i<5;i++){if(i>=oct)break;n+=a*(1.-worley(p));s+=a;p=p*2.07+vec2(3.1,1.7);a*=.5;}
  return n/s;}
float vfbm(vec2 p){float n=0.,a=.5;for(int i=0;i<3;i++){n+=a*vnoise(p);p*=2.1;a*=.5;}return n/.875;}

// 큰 형태(엔벨로프): 브러시로 칠한 밀도 맵
float envelope(vec2 uv){return texture(uDen,vec2(uv.x/uDocA,uv.y)).r;}
float trEdit(vec2 uv){return texture(uTr,vec2(uv.x/uDocA,uv.y)).r;}
float lobeNoise(vec2 uv,int oct){
  vec2 q=uv*uScale+vec2(uTime*.006,0.);
  q+=.35*vec2(vfbm(q*.5),vfbm(q*.5+7.3))-.17; // 약한 도메인 워프: 격자 티 제거
  return billow(q,oct);
}
// 경계: 위로 향한 면은 날카롭게, 아래로 향한 면은 부드럽게
float density(vec2 uv,float e,float n){
  float r=e*.55+(n-.5)*1.25+.5;
  float up=envelope(uv+vec2(0.,.02))-e; // <0 이면 윗면
  float edge=mix(uSharp,uSoft,smoothstep(-.02,.06,up));
  return smoothstep(uCov,uCov+edge,r);
}
// 하늘: 문서 위(0) → 수평선(1)을 장면과 같은 5단 선형 그라데이션으로
vec3 skyCol(float y){
  float t=clamp((1.-y)/max(1.-uH,1e-3),0.,1.);
  vec3 c=uSky[0];
  c=mix(c,uSky[1],clamp(t/.30,0.,1.));
  c=mix(c,uSky[2],clamp((t-.30)/.28,0.,1.));
  c=mix(c,uSky[3],clamp((t-.58)/.22,0.,1.));
  c=mix(c,uSky[4],clamp((t-.80)/.20,0.,1.));
  return c;
}
// 등고선: v가 k를 지나는 곳에 화면 1px 남짓한 선
float iso(float v,float k,float fw){return 1.-smoothstep(0.,1.3,abs(v-k)/max(fw,1e-4));}

void main(){
  vec2 dp=(gl_FragCoord.xy-uDoc.xy)/uDoc.zw;   // 문서 좌표 0..1
  vec2 uv=vec2(dp.x*uDocA,dp.y);
  float e=envelope(uv), te=trEdit(uv), fw=fwidth(e);
  if(any(lessThan(dp,vec2(0.)))||any(greaterThan(dp,vec2(1.)))){
    fragColor=uMode==1?vec4(0.):vec4(skyCol(clamp(dp.y,0.,1.))*.3,1.);return;}   // 문서 밖
  float h=uH;
  vec3 col=skyCol(dp.y);
  int view=uMode==1?0:uView;
  if(view==3){fragColor=vec4(vec3(lobeNoise(uv,5)),1.);return;}
  if(view==4){
    vec3 g=vec3(clamp((e+2.)/4.2,0.,1.));
    g=mix(g,vec3(1.,.4,.3),iso(e,0.,fw));            // 0 = 평균 구름 경계
    g=mix(g,vec3(.5,.8,1.),iso(e,1.,fw)*.6);         // 1 = 속이 꽉 찬 영역
    g=mix(g,vec3(.9,.9,.3),iso(uv.y,h,fwidth(uv.y))*.5);   // 수평선
    fragColor=vec4(g,1.);return;}
  if(view==5){
    vec3 g=vec3(.16,.15,.2);
    g=mix(g,vec3(1.,.78,.42),clamp(te,0.,1.));
    g=mix(g,vec3(.32,.5,1.),clamp(-te,0.,1.));
    g=mix(g,vec3(.85),iso(e,0.,fw)*.35);
    fragColor=vec4(g,1.);return;}
  float n0=lobeNoise(uv,5);
  float d=density(uv,e,n0);
  // ① 덩어리 단위 음영: 노이즈를 태양 방향으로 미분 → 각 혹의 '윗면'이 밝아진다
  vec2 L=normalize(uSun);
  float ep=.35/uScale;                   // 혹 크기에 비례한 샘플 간격
  float dn=0.;
  for(int i=1;i<=3;i++){dn+=(n0-lobeNoise(uv+L*ep*float(i)*.5,3))/float(i);}
  float lobe=smoothstep(-.18,.22,dn);
  // ② 거대 형태 음영: 밀도 맵 두께를 태양 쪽으로 적분 → 칠한 형태 전체의 큰 명암
  float od=0.;
  for(int i=1;i<=4;i++){od+=max(envelope(uv+L*.035*float(i)),0.);}
  // 투과율 보정 맵을 계산된 투과율에 더한다(브러시로 칠한 자기 그림자). 위로 갈수록 직사광
  float macro=clamp(exp(-od*uAbsorb*.6)*mix(.55,1.,smoothstep(h+.03,h+.48,uv.y))+te,0.,1.);
  float T=lobe*mix(.18,1.,macro)+.15*macro;
  float powder=1.-exp(-d*4.);
  float light=clamp(mix(T,T*powder,.4),0.,1.);
  if(view==1){col=vec3(d);}
  else if(view==2){col=vec3(mix(.08,1.,light))*step(.01,d)+vec3(.05,.05,.1)*(1.-step(.01,d));}
  else{
    float hgt=smoothstep(h,h+.5,uv.y);
    vec3 shadowC=mix(uShLo,uShHi,hgt);   // 아랫면: 하늘색 반사 받은 그늘
    vec3 cc=mix(shadowC,uMid,smoothstep(.0,.5,light));
    cc=mix(cc,uLit,smoothstep(.45,.95,light));
    // 실버 라이닝: 얇은 가장자리 + 빛 정면
    float rim=(1.-smoothstep(.0,.6,d))*T;
    cc+=uRim*rim*.45;
    // 대기 원근: 수평선 쪽 대비를 낮춰 멀리 보이게
    float far=1.-smoothstep(h,h+.22,uv.y);
    cc=mix(cc,skyCol(dp.y)*uFar,far*.45);
    if(uMode==1){   // 장면용: 구름만 프리멀티플라이드 알파로. 편집 중 겹쳐 보기는 구름 위에 얹는다
      float a=d;vec3 pm=clamp(cc,0.,1.)*a;
      if(uOverlay==1){
        if(uLayer==0){float ln=iso(e,0.,fw)*.65;pm=vec3(.55,.95,1.)*ln+pm*(1.-ln);a=ln+a*(1.-ln);}
        else{pm=mix(pm,vec3(1.,.72,.3)*a,clamp(te,0.,1.)*.45);pm=mix(pm,vec3(.3,.5,1.)*a,clamp(-te,0.,1.)*.45);}
      }
      fragColor=vec4(pm,a);return;}
    col=mix(col,cc,d);
    // 수평선 아래(미리보기용 수면)
    if(uv.y<h){float k=(h-uv.y)/max(h,1e-3);col=mix(uWatA,uWatB,pow(k,.6));}
  }
  // 편집 레이어 겹쳐 보기: 밀도는 경계 등고선, 투과율은 보정 부호별 색조
  if(uOverlay==1){
    if(uLayer==0){col=mix(col,vec3(.55,.95,1.),iso(e,0.,fw)*.65);}
    else{col=mix(col,vec3(1.,.72,.3),clamp(te,0.,1.)*.45);col=mix(col,vec3(.3,.5,1.),clamp(-te,0.,1.)*.45);}
  }
  if(view==0)col+=(hash12(gl_FragCoord.xy+fract(uTime*7.)*137.)-.5)*uGrain;   // 필름 그레인
  fragColor=vec4(clamp(col,0.,1.),1.);
}`;

    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const c255 = a => a.map(v => v / 255);
    // 장면 프리셋: 하늘은 tsukuyomi.js의 idle 하늘(황혼 = SKY @ DUSK_Q, 낮 = SKY_DAY2 @ 0)과 같은 색.
    // 구름 색은 황혼 = 셰이더 초안 그대로, 낮 = 새 낮 구름(DY_LIT/DY_SHADE)의 청백 ~ 네이비.
    const PRESETS = {
        dusk: {
            name: '황혼',
            sky: ['#4e5687', '#6f77ab', '#9d95c6', '#cfa3c6', '#b3809a'].map(hex),
            shLo: [.42, .30, .44], shHi: [.50, .40, .60], mid: [.93, .60, .60], lit: [1, .93, .78],
            rim: [1, .85, .7], far: [1, .9, .95], watA: [.48, .36, .48], watB: [.16, .12, .22],
            params: { cov: .5, sharp: .04, soft: .3, scale: 5.5, absorb: 1.6, sun: 105, grain: .05 },
        },
        day: {
            name: '낮',
            sky: ['#1b4688', '#2a62a2', '#3c76b2', '#3f6d9e', '#6d9cc6'].map(hex),
            shLo: c255([30, 42, 80]), shHi: c255([70, 88, 136]), mid: c255([150, 170, 210]), lit: c255([246, 250, 255]),
            rim: c255([240, 247, 255]), far: [.92, .96, 1], watA: c255([52, 84, 128]), watB: c255([14, 24, 46]),
            params: { cov: .52, sharp: .04, soft: .3, scale: 5.5, absorb: 1.6, sun: 90, grain: .05 },
        },
    };
    const SCENES = Object.keys(PRESETS);
    const PIDS = ['cov', 'sharp', 'soft', 'scale', 'absorb', 'sun', 'grain'];
    // 장면 수평선 비율(tsukuyomi.js CFG.HZ_RATIO 기본값). 새 문서는 에디터 화면 = 장면 화면이 되도록 이 높이에 수평선을 둔다
    const SCENE_HZ_RATIO = 0.56;
    // 맵 값 범위(16비트 양자화 범위)와 비운 상태 값
    const RANGE = { den: { min: -2, max: 2.2, empty: -2 }, tr: { min: -1, max: 1, empty: 0 } };
    const KEY = {
        work: s => 'tsukuyomi.cloudEditor.v2.' + s,   // 에디터 작업본(자동 저장)
        applied: s => 'tsukuyomi.cloudDoc.' + s,      // "장면에 적용"한 문서: 장면이 읽는다
        legacy: 'tsukuyomi.cloudEditor.v1',
    };

    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

    // ---------- 인코딩 ----------
    // 맵은 [min,max] 범위를 16비트(리틀 엔디언)로 양자화한 base64
    function encodeLayer(data, R) {
        // 한 값으로 채워진 맵(손대지 않은 투과율 보정 등)은 값만 적어 localStorage 용량을 아낀다
        if (data.every(v => v === data[0])) return { min: R.min, max: R.max, enc: 'fill', value: data[0] };
        const span = R.max - R.min, q = new Uint16Array(data.length);
        for (let i = 0; i < q.length; i++) q[i] = Math.round(clamp((data[i] - R.min) / span, 0, 1) * 65535);
        const u8 = new Uint8Array(q.buffer);
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return { min: R.min, max: R.max, enc: 'u16le-b64', data: btoa(s) };
    }
    function decodeLayer(o, n, R) {
        if (o && o.enc === 'fill') return new Float32Array(n).fill(clamp(+o.value || 0, R.min, R.max));
        if (!o || o.enc !== 'u16le-b64') throw new Error('알 수 없는 인코딩: ' + (o && o.enc));
        const s = atob(o.data), u8 = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
        const q = new Uint16Array(u8.buffer);
        if (q.length !== n) throw new Error('맵 크기가 맞지 않습니다');
        const out = new Float32Array(n), span = o.max - o.min;
        for (let i = 0; i < n; i++) out[i] = clamp(o.min + q[i] / 65535 * span, R.min, R.max);
        return out;
    }
    // doc: { scene, w, h, aspect, horizon, time, params, den: Float32Array, tr: Float32Array }
    function serialize(doc) {
        return {
            type: 'tsukuyomi-cloud-doc', version: 2, scene: doc.scene,
            w: doc.w, h: doc.h, aspect: doc.w / doc.h, horizon: doc.horizon, time: doc.time,
            params: Object.fromEntries(PIDS.map(k => [k, +doc.params[k]])),
            layers: { density: encodeLayer(doc.den, RANGE.den), transmittance: encodeLayer(doc.tr, RANGE.tr) },
        };
    }
    // v1(구름 브러시 에디터 첫 판, 수평선 0.12·황혼 전용)도 읽는다
    function parse(o, sceneHint) {
        if (!o || o.type !== 'tsukuyomi-cloud-doc' || !(o.version === 1 || o.version === 2)) throw new Error('구름 문서(tsukuyomi-cloud-doc)가 아닙니다');
        const w = o.w | 0, h = o.h | 0;
        if (w < 8 || h < 8 || w > 4096 || h > 4096) throw new Error('문서 크기가 올바르지 않습니다');
        const scene = PRESETS[o.scene] ? o.scene : (sceneHint && PRESETS[sceneHint] ? sceneHint : 'dusk');
        const params = Object.assign({}, PRESETS[scene].params);
        if (o.params) for (const k of PIDS) if (Number.isFinite(+o.params[k])) params[k] = +o.params[k];
        return {
            scene, w, h, horizon: Number.isFinite(+o.horizon) ? clamp(+o.horizon, 0, 0.9) : 0.12,
            time: Number.isFinite(+o.time) ? +o.time : 20, params,
            den: decodeLayer(o.layers.density, w * h, RANGE.den), tr: decodeLayer(o.layers.transmittance, w * h, RANGE.tr),
        };
    }
    function blank(scene, w, h, horizon) {
        return {
            scene, w, h, horizon, time: 20, params: Object.assign({}, PRESETS[scene].params),
            den: new Float32Array(w * h).fill(RANGE.den.empty), tr: new Float32Array(w * h).fill(RANGE.tr.empty),
        };
    }
    // 장면 배치: 문서 → 장면 하늘(W × HZ, CSS px). 수평선 정렬 + 가로 가운데 + cover.
    // 반환: k = 문서 1단위당 px, ox = 문서 왼쪽 끝 x(px). 문서 (x, y) → 화면 (ox + x·k, HZ − (y − horizon)·k)
    function fit(doc, W, HZ) {
        const A = doc.w / doc.h, k = Math.max(HZ / Math.max(1e-3, 1 - doc.horizon), W / A);
        return { k, ox: W / 2 - A * k / 2 };
    }

    // ---------- 렌더러 ----------
    function createRenderer(canvas, opts = {}) {
        const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: true, alpha: !!opts.alpha });
        if (!gl) return { ok: false, error: '이 브라우저는 WebGL2를 지원하지 않습니다.' };
        let error = '';
        const sh = (t, src) => {
            const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) error = '셰이더 컴파일 실패: ' + gl.getShaderInfoLog(s);
            return s;
        };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
        gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
        if (!error && !gl.getProgramParameter(pr, gl.LINK_STATUS)) error = '셰이더 링크 실패: ' + gl.getProgramInfoLog(pr);
        if (error) { console.error(error); return { ok: false, error }; }
        gl.useProgram(pr);
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const locs = {};
        const U = n => (n in locs) ? locs[n] : (locs[n] = gl.getUniformLocation(pr, n));
        gl.uniform1i(U('uDen'), 0); gl.uniform1i(U('uTr'), 1);
        const tex = { den: gl.createTexture(), tr: gl.createTexture() }, unit = { den: 0, tr: 1 };
        let tw = 0, th = 0;
        function alloc(w, h) {
            tw = w; th = h;
            for (const k of ['den', 'tr']) {
                gl.activeTexture(gl.TEXTURE0 + unit[k]); gl.bindTexture(gl.TEXTURE_2D, tex[k]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            }
        }
        function upload(k, data) {
            gl.activeTexture(gl.TEXTURE0 + unit[k]); gl.bindTexture(gl.TEXTURE_2D, tex[k]);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tw, th, gl.RED, gl.FLOAT, data);
        }
        // o: { rect:[x,y,w,h](캔버스 px, 아래 기준), doc, preset, mode, view, overlay, layer, time }
        function render(o) {
            const d = o.doc, P = o.preset, pa = d.params;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform2f(U('uRes'), canvas.width, canvas.height);
            gl.uniform1f(U('uTime'), o.time ?? d.time);
            gl.uniform1f(U('uCov'), pa.cov); gl.uniform1f(U('uSharp'), pa.sharp); gl.uniform1f(U('uSoft'), pa.soft);
            gl.uniform1f(U('uScale'), pa.scale); gl.uniform1f(U('uAbsorb'), pa.absorb);
            gl.uniform1f(U('uGrain'), o.mode === 1 ? 0 : pa.grain);
            const a = pa.sun * Math.PI / 180; gl.uniform2f(U('uSun'), Math.cos(a), Math.sin(a));
            gl.uniform1i(U('uView'), o.view | 0); gl.uniform1i(U('uMode'), o.mode | 0);
            gl.uniform4f(U('uDoc'), o.rect[0], o.rect[1], o.rect[2], o.rect[3]);
            gl.uniform1f(U('uDocA'), d.w / d.h); gl.uniform1f(U('uH'), d.horizon);
            gl.uniform1i(U('uOverlay'), o.overlay ? 1 : 0); gl.uniform1i(U('uLayer'), o.layer === 'tr' ? 1 : 0);
            gl.uniform3fv(U('uSky'), P.sky.flat());
            for (const [u, k] of [['uShLo', 'shLo'], ['uShHi', 'shHi'], ['uMid', 'mid'], ['uLit', 'lit'], ['uRim', 'rim'], ['uFar', 'far'], ['uWatA', 'watA'], ['uWatB', 'watB']])
                gl.uniform3fv(U(u), P[k]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        return { ok: true, gl, canvas, alloc, upload, render, get size() { return [tw, th]; } };
    }

    // ---------- 장면용 굽기 ----------
    // 문서를 장면 하늘 크기(W × HZ, CSS px)의 투명 스프라이트로 굽는다. s: CSS px당 비트맵 배율.
    // WebGL 캔버스 하나를 재사용하고 결과는 2D 캔버스로 복사해 돌려준다. WebGL2가 없으면 null.
    let bakeR = null, bakeDoc = null;
    function bake(doc, W, HZ, s = 1) {
        if (!bakeR) bakeR = createRenderer(document.createElement('canvas'), { alpha: true });
        if (!bakeR.ok) return null;
        const cw = Math.max(1, Math.round(W * s)), ch = Math.max(1, Math.round(HZ * s));
        bakeR.canvas.width = cw; bakeR.canvas.height = ch;
        if (bakeDoc !== doc) {
            bakeR.alloc(doc.w, doc.h); bakeR.upload('den', doc.den); bakeR.upload('tr', doc.tr); bakeDoc = doc;
        }
        const f = fit(doc, W, HZ), A = doc.w / doc.h;
        // 캔버스 아래(y = 0)가 장면 수평선 = 문서 horizon
        bakeR.render({ rect: [f.ox * s, -doc.horizon * f.k * s, A * f.k * s, f.k * s], doc, preset: PRESETS[doc.scene], mode: 1, view: 0 });
        const out = document.createElement('canvas');
        out.width = cw; out.height = ch;
        out.getContext('2d').drawImage(bakeR.canvas, 0, 0);
        return out;
    }

    window.CloudDoc = { VS, FS, PRESETS, SCENES, PIDS, RANGE, KEY, SCENE_HZ_RATIO, serialize, parse, blank, fit, createRenderer, bake };
})();
