/* 절차적 구름 라이브 렌더러 (window.CloudLive).
 * tsukuyomi.js의 duskRender(황혼 띠·적란운, 새 낮 덩어리·띠)는 퍼프 엔벨로프(E)만 CPU로 만들고,
 * 그 뒤 단계(빌로우 노이즈 → 실루엣 → 음영 → 착색)를 여기서 WebGL2로 다시 그린다.
 * 결과는 duskRender가 돌려주던 것과 같은 2D 캔버스(w0/h0/pad 속성 포함)에 계속 덮어쓰므로 그리기 코드는 그대로다.
 *
 * 움직임(타임랩스):
 *   - 끓음: 워리 셀 중심이 옥타브마다 다른 속도로 돈다(잔 혹일수록 빠르게) → 내부 혹이 피고 진다
 *   - 상승: 노이즈 공간이 엔벨로프 안에서 천천히 위·옆으로 흐른다 → 혹이 솟아오르며 바뀐다
 *   - 경계 일렁임: 엔벨로프 샘플링 좌표를 저주파 fbm으로 비틀어 윤곽이 숨쉰다
 * 브러시 자국(퍼프 타원 윤곽) 해소용 랜덤화:
 *   - 엔벨로프 워프(CL_WARP)로 타원 호가 그대로 드러나지 않게 휜다
 *   - 국소 덮임 변동(CL_RAND)으로 곳에 따라 경계가 더 차고/더 성기게, 군데군데 틈과 솜털
 *   - 아랫면 쪽 고주파 침식으로 가장자리가 갉아먹힌 듯 불규칙하게
 * 갱신은 tick()이 프레임당 몇 장씩 돌아가며(라운드 로빈) CL_HZ 주기로 한다. 변화가 느려 계단이 보이지 않는다.
 * WebGL2가 없거나 컨텍스트를 잃으면 add()가 null을 돌려 기존 CPU 굽기로 돌아간다.
 */
(() => {
    'use strict';

    const VS = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

    const COMMON = `#version 300 es
precision highp float;
uniform vec2 uSize;     // 격자 크기(스프라이트 × RS)
uniform float uSeed, uT;
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y);}
float vfbm(vec2 p){float n=0.,a=.5;for(int i=0;i<3;i++){n+=a*vnoise(p);p=p*2.1+vec2(1.7,9.2);a*=.5;}return n/.875;}
vec2 seedOff(float k){return 900.*fract(vec2(uSeed*.000137+k*.1371,uSeed*.000291+k*.2913));}
// 격자 좌표(px, 아래로 +y). 뷰포트 아래쪽 uSize 영역 = 스프라이트
vec2 gridP(){return vec2(gl_FragCoord.x-.5,uSize.y-gl_FragCoord.y-.5);}
`;

    // ---------- 1패스: 빌로우 노이즈(5옥타브 N5, 앞 3옥타브 N3)를 16비트씩 RGBA8에 포장 ----------
    const FS_NOISE = COMMON + `
uniform float uUV,uUX,uSC,uBoil;
uniform vec2 uDrift;
out vec4 o;
float worley(vec2 p,float k,float t){vec2 i=floor(p),f=fract(p);float d=8.;vec2 so=seedOff(k);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y);vec2 h=hash22(i+g+so);
    vec2 c=.5+.38*sin(.8+6.2831*h+t*vec2(1.,.83));vec2 r=g+c-f;d=min(d,dot(r,r));}
  return sqrt(d);}
vec2 pack16(float v){v=floor(clamp(v,0.,1.)*65535.+.5);float hi=floor(v/256.);return vec2(hi,v-hi*256.)/255.;}
void main(){
  vec2 p=gridP();
  vec2 q=vec2(p.x*uUX,p.y*uUV)*uSC+uDrift*uT;
  q+=vec2(.35*vfbm(q*.5+seedOff(11.))-.17,.35*vfbm(q*.5+seedOff(11.)+7.3)-.17);
  float n=0.,a=.55,s=0.,n3=0.;
  for(int k=0;k<5;k++){
    float fk=float(k);
    n+=a*(1.-worley(q,fk,uT*uBoil*(.12+.09*fk)));s+=a;
    if(k==2)n3=n/s;
    q=q*2.07+vec2(3.1,1.7);a*=.5;
  }
  o=vec4(pack16(n/s),pack16(n3));
}`;

    // ---------- 2패스: 실루엣·음영·착색 (tsukuyomi.js duskRender의 CPU 식을 그대로 옮김 + 워프/랜덤화) ----------
    const FS_SHADE = COMMON + `
uniform sampler2D uE;     // 엔벨로프(RG16F: r = 원본, g = 부드러운 사본, 행 0 = 위)
uniform sampler2D uN;     // 1패스 결과(포장된 N5/N3)
uniform sampler2D uRamp;  // 256×2: 행 0 = 빛 램프, 행 1 = 그늘 램프 (콘텐츠 높이 0 위 → 1 아래)
uniform vec2 uNOrg;       // 1패스 텍스처에서 이 스프라이트 영역 원점(텍셀)
uniform float uTop,uHh,uCOV,uSHARP,uSOFT,uABS,uUV,uUX,uSC,uLive,uRimK,uFade;
uniform float uSkyBot,uVLift;
uniform vec2 uL,uLa,uGD; uniform float uLdiag;
uniform vec3 uGlow,uRimC,uGlowC;
uniform float uWarp,uRand,uUp;
out vec4 o;
float Eat(vec2 g){return texture(uE,(g+.5)/uSize).r;}
float Ebat(vec2 g){return texture(uE,(g+.5)/uSize).g;}   // 부드러운 엔벨로프: 음영·면 방향 판정용
float unpack16(vec2 c){return (c.x*255.*256.+c.y*255.)/65535.;}
vec2 Nf(ivec2 g){g=clamp(g,ivec2(0),ivec2(uSize)-1);vec4 c=texelFetch(uN,g+ivec2(uNOrg),0);return vec2(unpack16(c.xy),unpack16(c.zw));}
float N3at(vec2 g){
  g=clamp(g,vec2(0.),uSize-2.);vec2 f=fract(g);ivec2 i=ivec2(floor(g));
  float a=mix(Nf(i).y,Nf(i+ivec2(1,0)).y,f.x),b=mix(Nf(i+ivec2(0,1)).y,Nf(i+ivec2(1,1)).y,f.x);
  return mix(a,b,f.y);
}
void main(){
  vec2 p=gridP();
  // 경계 일렁임 + 타원 호 지우기: 엔벨로프를 저주파 fbm으로 비틀어 샘플링(움직임은 느리게)
  float kf=1./46.;
  vec2 wp=p+uWarp*7.*(vec2(vfbm(p*kf+seedOff(3.)+vec2(uT*.045,0.)),vfbm(p*kf+seedOff(4.)+vec2(0.,-uT*.035)))-.5)*2.;
  float E=Eat(wp);
  vec2 n=Nf(ivec2(p));
  float n5=n.x;
  float hy=clamp((p.y-uTop)/uHh,0.,1.);
  // 위로 향한 면은 날카롭게, 아래로 향한 면은 부드럽게
  float dU=.02/uUV;
  float Eb=Ebat(wp);
  float up=Ebat(wp-vec2(0.,dU))-Eb;
  float face=smoothstep(-.02,.06,up);
  float edge=mix(uSHARP,uSOFT,face);
  // 국소 덮임 변동 + 침식(아랫면 쪽 강하게): 같은 퍼프라도 곳마다 경계가 다르게 갈린다
  float cov=uCOV+uRand*.09*(vfbm(p*kf*1.6+seedOff(5.)+vec2(uT*.02,uT*.012))-.5)*2.;
  float ero=uRand*.16*(vfbm(p/8.5+seedOff(6.)+vec2(uT*.09,-uT*.06))-.5)*mix(.35,1.,face);
  float raw=E*.55+(n5-.5)*1.25+.5+ero;
  float aa=length(vec2(dFdx(raw),dFdy(raw)))*1.2;
  float d=smoothstep(cov-aa*.5,cov+max(edge,aa),raw);
  if(E<uLive||d<=.003){o=vec4(0.);return;}
  // ① 혹 단위 음영
  float eL=.35/uSC*.5;
  // 혹 단위 빛 방향: 해 방향만 쓰면(황혼은 거의 수평) 혹마다 세로 명암 경계가 서서 붓자국 줄무늬가 된다.
  // 위쪽 하늘빛(격자 -y)을 섞어 경계가 혹 아래 초승달로 눕게 하고, 저주파 노이즈로 방향을 곳마다 ±흔들어 규칙성을 없앤다
  float jit=(vfbm(p*kf*.8+seedOff(7.)+vec2(uT*.015,0.))-.5)*1.1*uRand;
  vec2 Ll=normalize(uL+vec2(0.,-uUp));
  Ll=vec2(Ll.x*cos(jit)-Ll.y*sin(jit),Ll.x*sin(jit)+Ll.y*cos(jit));
  float dn=0.;
  for(int k=1;k<=3;k++){float fk=float(k);dn+=(n5-N3at(p+vec2(Ll.x*eL*fk/uUX,Ll.y*eL*fk/uUV)))/fk;}
  float lobe=smoothstep(-.24,.28,dn);
  // 주름 그늘: 혹 사이 골짜기를 방향 없이 어둡게(경계를 세로선 대신 둥근 초승달로 읽히게)
  lobe*=mix(.72,1.,smoothstep(.28,.72,n5));
  // ② 거대 형태 음영
  float od=0.;
  for(int k=1;k<=4;k++){float fk=float(k);od+=max(Ebat(wp+vec2(uL.x*.035*fk/uUX,uL.y*.035*fk/uUV)),0.);}
  float sky=mix(uSkyBot,1.,1.-smoothstep(.35,1.,hy));
  float macro=exp(-od*uABS*.6)*sky;
  float T=lobe*mix(.18,1.,macro)+.15*macro;
  float powder=1.-exp(-d*4.);
  float v=clamp(mix(T,T*powder,.4),0.,1.);
  float gd=length(vec2(p.x-uLa.x,(p.y-uLa.y)*1.25))/uLdiag;
  v*=mix(uGD.x,uGD.y,smoothstep(.05,.95,gd));
  v=smoothstep(.1,.9,v);
  v=v+(sqrt(v)-v)*uVLift;
  vec3 L0=texture(uRamp,vec2(hy,.25)).rgb,S0=texture(uRamp,vec2(hy,.75)).rgb;
  vec3 col=mix(S0,L0,v);
  float rim=(1.-smoothstep(0.,.55,d))*T*(1.-.6*hy)*uRimK;
  col+=(uRimC-col)*rim;
  if(uGlow.z>0.){vec2 dd=p-uGlow.xy;float w=exp(-dot(dd,dd)/(uGlow.z*uGlow.z))*(.35+.65*v);
    col+=(uGlowC-col)*w*vec3(.85,.8,.7);}
  float A=d;
  if(uFade<1.)A*=1.-smoothstep(uFade,1.,hy);
  A*=smoothstep(0.,6.,min(min(p.x,p.y),min(uSize.x-1.-p.x,uSize.y-1.-p.y)));
  o=vec4(clamp(col,0.,1.)*A,A);
}`;

    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    // 엔벨로프 부드러운 사본: 퍼프 원뿔들을 max로 합친 이음매(주름)가 음영에 세로 줄무늬·붓자국으로 찍히는 걸 막는다.
    // 박스 블러 3회(≈ 가우스), 반경 r 격자 px. 결과는 (E, Eblur) 2채널로 interleave
    function smoothEnv(E, W, H, r) {
        let a = Float32Array.from(E), b = new Float32Array(E.length);
        const pass = (src, dst, horiz) => {
            const n = horiz ? W : H, m = horiz ? H : W, inv = 1 / (2 * r + 1);
            for (let j = 0; j < m; j++) {
                const at = i => src[horiz ? j * W + clamp(i, 0, n - 1) : clamp(i, 0, n - 1) * W + j];
                let acc = 0;
                for (let i = -r; i <= r; i++) acc += at(i);
                for (let i = 0; i < n; i++) {
                    dst[horiz ? j * W + i : i * W + j] = acc * inv;
                    acc += at(i + r + 1) - at(i - r);
                }
            }
        };
        for (let k = 0; k < 3; k++) { pass(a, b, true); pass(b, a, false); }
        const out = new Float32Array(E.length * 2);
        for (let i = 0; i < E.length; i++) { out[i * 2] = E[i]; out[i * 2 + 1] = a[i]; }
        return out;
    }
    // tsukuyomi.js duskRamp와 같은 선형 램프
    function ramp(stops, t) {
        if (t <= stops[0][0]) return stops[0][1];
        for (let i = 1; i < stops.length; i++) {
            const [t1, c1] = stops[i];
            if (t <= t1) {
                const [t0, c0] = stops[i - 1], k = (t - t0) / (t1 - t0);
                return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
            }
        }
        return stops[stops.length - 1][1];
    }

    function create() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
        if (!gl) return null;
        let ok = true;
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ok = false; });

        const sh = (t, src) => {
            const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const prog = fs => {
            const p = gl.createProgram();
            gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
            gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
            const locs = {};
            return { p, U: n => (n in locs) ? locs[n] : (locs[n] = gl.getUniformLocation(p, n)) };
        };
        let PN, PS;
        try { PN = prog(FS_NOISE); PS = prog(FS_SHADE); }
        catch (e) { console.warn('CloudLive 셰이더 실패, CPU 굽기로 돌아감', e); return null; }

        const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.disable(gl.BLEND);

        // 1패스 렌더 타깃(RGBA8, 모든 기기에서 렌더 가능). 가장 큰 스프라이트에 맞춰 키운다
        const nTex = gl.createTexture(), fbo = gl.createFramebuffer();
        let nw = 0, nh = 0;
        function ensure(w, h) {
            if (w > canvas.width || h > canvas.height) {
                canvas.width = Math.max(canvas.width, w); canvas.height = Math.max(canvas.height, h);
            }
            if (w > nw || h > nh) {
                nw = Math.max(nw, w); nh = Math.max(nh, h);
                gl.bindTexture(gl.TEXTURE_2D, nTex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
                    gl.texParameteri(gl.TEXTURE_2D, k, v);
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nTex, 0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
        }
        function tex(filter) {
            const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
            for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, filter], [gl.TEXTURE_MAG_FILTER, filter], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
                gl.texParameteri(gl.TEXTURE_2D, k, v);
            return t;
        }
        function upload(h) {
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            h.eTex = tex(gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, h.W, h.H, 0, gl.RG, gl.FLOAT, h.E2);
            h.rTex = tex(gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, h.rampData);
        }
        function release(h) {
            if (h.eTex) gl.deleteTexture(h.eTex);
            if (h.rTex) gl.deleteTexture(h.rTex);
            h.eTex = h.rTex = null;
        }

        const sprites = [];
        let perFrame = 3;
        const cfg = { CL_RATE: 1, CL_BOIL: 1, CL_WARP: 1, CL_RAND: 1, CL_HZ: 12, CL_UP: 0.9 };

        function render(h, t) {
            if (!ok || !h.eTex) return;
            const { W, H } = h, P = h.par;
            ensure(W, H);
            const T = t * cfg.CL_RATE + h.tOff;
            // 1패스
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.viewport(0, 0, W, H);
            gl.useProgram(PN.p);
            gl.uniform2f(PN.U('uSize'), W, H); gl.uniform1f(PN.U('uSeed'), P.seed); gl.uniform1f(PN.U('uT'), T);
            gl.uniform1f(PN.U('uUV'), P.UV); gl.uniform1f(PN.U('uUX'), P.UX); gl.uniform1f(PN.U('uSC'), P.SC);
            gl.uniform1f(PN.U('uBoil'), cfg.CL_BOIL);
            // 노이즈 공간 흐름: 옆으로 조금 + 위로(격자 y 아래가 +) → 혹이 솟으며 바뀐다
            gl.uniform2f(PN.U('uDrift'), 0.012 * h.dir, -0.018);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // 2패스
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, W, H);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(PS.p);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, h.eTex);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, nTex);
            gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, h.rTex);
            const U = PS.U;
            gl.uniform1i(U('uE'), 0); gl.uniform1i(U('uN'), 1); gl.uniform1i(U('uRamp'), 2);
            gl.uniform2f(U('uSize'), W, H); gl.uniform1f(U('uSeed'), P.seed); gl.uniform1f(U('uT'), T);
            gl.uniform2f(U('uNOrg'), 0, 0);
            gl.uniform1f(U('uTop'), P.top); gl.uniform1f(U('uHh'), P.hh);
            gl.uniform1f(U('uCOV'), P.COV); gl.uniform1f(U('uSHARP'), P.SHARP); gl.uniform1f(U('uSOFT'), P.SOFT);
            gl.uniform1f(U('uABS'), P.ABS); gl.uniform1f(U('uUV'), P.UV); gl.uniform1f(U('uUX'), P.UX); gl.uniform1f(U('uSC'), P.SC);
            gl.uniform1f(U('uLive'), P.live); gl.uniform1f(U('uRimK'), P.rimK); gl.uniform1f(U('uFade'), P.fade);
            gl.uniform1f(U('uSkyBot'), P.skyBot); gl.uniform1f(U('uVLift'), P.vLift);
            gl.uniform2f(U('uL'), P.Lx, P.Ly); gl.uniform2f(U('uLa'), P.lax, P.lay); gl.uniform1f(U('uLdiag'), P.ldiag);
            gl.uniform2f(U('uGD'), P.GD0, P.GD1);
            gl.uniform3f(U('uGlow'), P.glow[0], P.glow[1], P.glow[2]);
            gl.uniform3fv(U('uRimC'), P.rimC); gl.uniform3fv(U('uGlowC'), P.glowC);
            gl.uniform1f(U('uWarp'), cfg.CL_WARP); gl.uniform1f(U('uUp'), cfg.CL_UP * P.upK); gl.uniform1f(U('uRand'), cfg.CL_RAND);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            // 2D 스프라이트로 복사(격자 → 스프라이트 크기로 확대). 뷰포트는 캔버스 아래쪽에 있다
            const c = h.out, g = h.ctx;
            g.globalCompositeOperation = 'copy';
            g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            g.drawImage(canvas, 0, canvas.height - H, W, H, 0, 0, c.width, c.height);
            g.globalCompositeOperation = 'source-over';
            h.last = t;
        }

        // duskRender가 엔벨로프를 만든 직후 부른다. a: { m, E, W, H, RS, top, hh, COV, SHARP, SOFT, SC, ABS, UV, UX, seed, o, sunDeg }
        // 반환: duskRender가 돌려주던 것과 같은 모양의 캔버스(첫 장은 즉시 그려져 있다) | null(→ CPU 굽기)
        function add(a) {
            if (!ok) return null;
            const { m, E, W, H, RS, o } = a;
            const sa = a.sunDeg * Math.PI / 180;
            const glow = o.glow ? [o.glow[0] * RS, o.glow[1] * RS, o.glow[2] * RS] : [0, 0, 0];
            const [GD0, GD1] = o.gd ?? [1.2, 0.62];
            const rimC = (o.rimC ?? [255, 217, 178]).map(v => v / 255), glowC = (o.glowC ?? [255, 250, 236]).map(v => v / 255);
            const rampData = new Uint8Array(256 * 2 * 4);
            for (let i = 0; i < 256; i++) {
                const t = i / 255, L = ramp(o.lit, t), S = ramp(o.shade, t);
                rampData.set([L[0], L[1], L[2], 255], i * 4);
                rampData.set([S[0], S[1], S[2], 255], (256 + i) * 4);
            }
            const out = document.createElement('canvas');
            out.width = m.width; out.height = m.height;
            out.w0 = m.w0; out.h0 = m.h0; out.pad = m.pad;
            const h = {
                W, H, E2: smoothEnv(E, W, H, 3), rampData, out, ctx: out.getContext('2d'),
                tOff: (a.seed % 997) * 0.37, dir: (a.seed & 1) ? 1 : -1,
                last: -1e9, seen: 0, dead: false,
                par: {
                    seed: a.seed % 100003, top: a.top, hh: a.hh, COV: a.COV, SHARP: a.SHARP, SOFT: a.SOFT, ABS: a.ABS,
                    UV: a.UV, UX: a.UX, SC: a.SC, live: 1.7 * (1 - 2.15),
                    Lx: Math.cos(sa), Ly: -Math.sin(sa),
                    lax: (m.pad + m.w0 * (o.lx ?? 0.1)) * RS, lay: a.top + a.hh * (o.ly ?? 0), ldiag: Math.hypot(m.w0, m.h0) * RS,
                    glow, GD0, GD1, rimC, glowC, rimK: o.rimK ?? 0.45, fade: o.fade ?? 1,
                    skyBot: o.skyBot ?? 0.55, vLift: o.vLift ?? 0.35, upK: o.upK ?? 1,
                },
            };
            try { upload(h); render(h, 0); }
            catch (e) { console.warn('CloudLive 스프라이트 실패, CPU 굽기로 돌아감', e); release(h); return null; }
            out.__live = h;
            sprites.push(h);
            return out;
        }

        // 그리기 직전에 부른다: 이 스프라이트가 화면 세트에 있다는 표시. 오래 안 쓰여 놓아줬던 것이면 되살린다
        function touch(c, now) {
            const h = c && c.__live;
            if (!h) return;
            h.seen = now;
            if (h.dead && ok) {
                try { upload(h); h.dead = false; sprites.push(h); } catch (e) { /* 마지막 그림 유지 */ }
            }
        }

        // 매 프레임: 최근에 쓰인 스프라이트만 CL_HZ 주기로, 프레임당 몇 장씩 돌아가며 다시 그린다.
        // t: 장면 시계(초), now: performance.now(), C: CFG(CL_* 키)
        function tick(t, now, C) {
            if (!ok || !sprites.length) return;
            for (const k in cfg) if (C && Number.isFinite(+C[k])) cfg[k] = +C[k];
            const minDt = 1 / Math.max(1, cfg.CL_HZ);
            // 10초 넘게 안 그려진 세트(다른 장면)는 GPU 텍스처를 놓아준다. 캔버스엔 마지막 그림이 남는다
            for (let i = sprites.length - 1; i >= 0; i--) {
                const h = sprites[i];
                if (now - h.seen > 10000) { release(h); h.dead = true; sprites.splice(i, 1); }
            }
            if (!sprites.length) return;
            // 화면에 쓰이는 것 중 가장 오래 전에 그린 것부터(굶는 스프라이트 없게)
            const due = sprites.filter(h => now - h.seen <= 400 && t - h.last >= minDt).sort((x, y) => x.last - y.last);
            const t0 = performance.now();
            let done = 0;
            for (const h of due) { if (done >= perFrame) break; render(h, t); done++; }
            // 프레임 예산 맞추기: 4ms 넘으면 줄이고, 여유 있으면 늘린다(1~6장)
            const ms = performance.now() - t0;
            if (done) perFrame = clamp(ms > 4 ? perFrame - 1 : ms < 1.5 ? perFrame + 1 : perFrame, 1, 6);
        }

        return { get ok() { return ok; }, add, touch, tick, get count() { return sprites.length; } };
    }

    window.CloudLive = { create };
})();
