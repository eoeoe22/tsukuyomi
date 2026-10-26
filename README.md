# Tsukuyomi

넷플릭스 애니메이션 《초 카구야 공주》(2026)의 장면을 웹 기반 월페이퍼로 재현하는 프로젝트.

## 배포판

- 기본 웹 배포판 (`public/tsukuyomi.html`): 기본값 감상용. 별도 설정 없이 기본값 그대로 본다.
- 월페이퍼 배포판 (`wallpaper/`): 웹 배포판의 장면을 그대로 사용하고, UI만 Wallpaper Engine용으로 재구성한 단순 포팅. 상세는 `wallpaper/README.md` 참조.
- 랜딩페이지 (`public/landing.html`): 실험용.

## 미리보기

```sh
wrangler dev
# http://localhost:8787/ -> tsukuyomi.html
# http://localhost:8787/landing -> landing.html
```

월페이퍼 단독 미리보기 (Wallpaper Engine 없이):

```sh
python -m http.server 8788 --directory wallpaper
# http://localhost:8788/wallpaper.html
```

## 구조

```
public/tsukuyomi.html  기본 웹 배포판
public/landing.html    랜딩페이지 (실험용)
public/tsukuyomi.*.js  세계별 장면 (mount·earth·room·news는 지연 로드)
public/components/     장면이 런타임에 쓰는 외부 파일 복사본 (랜턴 iframe 2종, yachiroom·newstile UMD)
packages/              장면 부품 패키지 원본 (yachiroom, newstile, mirrorball 등)
wallpaper/             월페이퍼엔진 포팅 (vendor 동결본 + wallpaper.html/js/css/project.json)
preview-worker.js      "/" -> tsukuyomi.html, "/landing" -> landing.html 매핑
```

## 장면 구현

### 月 — 수면 토리이 (`public/tsukuyomi.js`)
본체는 2D 캔버스 3층(`#scene` 하늘·수면, `#ripple` 복사 왜곡, `#fg` 실물 토리이·비네팅) + rAF 상태머신(`dusk` / `toNight` / `night` / 미러볼). 하늘은 진행도 `p`로 키프레임 팔레트(`SKY` / `SKY_DAY2`)를 보간하고, 태양은 `nk` 경로·소멸, 달·별궤적은 `mt` 상승 곡선으로 동기화한다.
컴포넌트는 모두 절차적이다. 달은 캔버스 본체 캐시 + 후광, 미러볼은 위도별 타일 분할(`mbBuildAll`)을 40초 주기로 자전시켜 본체만 재굽고 줄눈 빛줄기는 하늘에 라이브로 그린다. 토리이는 `Path2D` 스프라이트 1회 래스터 + 뒤집은 반사본, 석등은 `lantern-front.svg` 1회 비트맵화 + 수평선 경량 띠, 구름은 CPU 퍼프 엔벨로프 → `cloud-live.js`(WebGL2 빌로우·음영·끓음 타임랩스)로 넘기고 블룸·림라이트를 합성한다. 수면은 하늘 축소 복사 + 대역 블러 반사, 별은 극점(`POLE`) 중심 회전 궤적, 물고기는 토리이 클릭 상승(`FISH`) + 커서/달 배치 군집(`CURSOR`)을 토리이 전후 레이어로 나눠 그린다.

### 海 — 공백 바다 (月와 같은 엔진·캔버스)
`#sea`는 별도 세계가 아니라 `day` 모드 + 별도 패널이다(`public/tsukuyomi.worlds.js`가 캔버스는 그대로 두고 패널만 교체). 새 낮(`DAY_SCENE=1`) 하늘·청회색 산·주홍 약화 토리이 위에 `day2Clouds` 덩어리 + 수평선 띠를 얹고, 손그림 레이어는 `cloud-overlay.js` 문서(`public/clouds/day-overlay.json`)를 같은 셰이더로 다시 구워 합성한다(편집기는 `tsukuyomi.cloudlayers.js`). 낮 별 궤적(`DS_*`, `bi-stars`), 공백 밤 어둡힘(`DN_*`, `bi-brightness-alt-high-fill`), 수면 반짝임(`glints`, 하늘 썸네일 판정)은 토글로 켠다.

### 山 — 산정 토리이 (`public/tsukuyomi.mount.js`, `#mount` 지연 로드)
본체는 2D 캔버스 단일층 + rAF, `dusk`(땅거미 운해벽·능선)와 `sunset`(운해 수평선 노을태양·역광 능선·토리이) 두 버전을 스냅샷 크로스페이드로 전환한다. 움직이는 것은 구름뿐이며, 능선 바위 음영·태양 플레어는 리사이즈 때 한 번 굽는다. 구름은 月와 같은 방식(퍼프 엔벨로프 CPU + `CloudLive` GPU 타임랩스)을 줄 단위로 쌓아 속도차를 둬 시차를 내고, 원거리 운해 융단·높은 권운은 원근 평면 셰이더(`makePlaneGL`, WebGL2 전체화면)가 맡는다. 처음 보이는 장면만 즉시 만들고 나머지는 유휴 시간에 조금씩 굽는다. WebGL2가 없으면 구름 없이 나머지만 그린다.

### 地 — 역광 지구 + 죽순 (`public/tsukuyomi.earth.js`, `#earth` 지연 로드)
본체는 전체화면 프래그먼트 셰이더 하나(WebGL2: 지구·대기·렌즈플레어) + 2D 오프스크린 죽순 텍스처 합성이다. 죽순은 `createTakenoko`가 실루엣 프로파일(`R_LUT`)·잎집 가림·역광 림라이트를 CPU로 그린다. 로드 시에는 셰이더 컴파일 + 죽순 굽기만 하고, 올릴 때마다 `start()`로 인트로(태양 상승·죽순 후퇴)를 처음부터 재생, 내릴 때 `stop()`한다. WebGL2가 없으면 모듈을 만들지 않아 전환이 실패하고 현재 세계에 남는다. 조절값은 `__EARTH__.cfg`, `?earthT=`로 시간 고정 캡처가 가능하다.

### 八 — 야치요의 방 (`public/tsukuyomi.room.js`, `#room` 지연 로드)
본체는 1600×900 고정 설계 캔버스 하나에 그린 뒤 화면을 꽉 채우도록(cover) `#roomScene`에 옮겨 그린다. 방은 눈높이 1.6m 카메라에서 −z를 보는 미터 단위 원근 투영(`proj`)으로 짓고, 하늘·바다·천장·옆벽(원창)·바닥 문양·뒷벽·우측 단·장지·병풍을 `yachiroom.umd.js` 부품(`buildPrims`/`drawPrims`, 깊이별 배율 + `rot`/`tilt` 근사)으로 1회 래스터해 곱하기로 밤 실내처럼 어둡힌 바탕(`base`)으로 둔다.
등불은 `components/`의 랜턴 iframe 2종(`lantern-frustum.html` 사각뿔대 바닥등 10개, `lantern-cylinder.html` 원통 스탠딩 2개)을 숨겨 띄워 자리마다 기울기·회전을 맞춘 SVG를 받아 이미지로 굽고, 잘림 윤곽이 생기는 자체 후광·빛웅덩이는 빼고 장면 쪽 방사 그라디언트로 대신한다. 원통 랜턴은 등 속 점광원에서 투각·종이창 무늬를 지난 빛을 뒷벽·옆벽·천장·바닥 평면에 투영하며, 고정 무늬(`litLayer`)와 회전하는 종이창 무늬(`paperLayer`, 랜턴 `PERIOD` 주기)를 나눠 매 프레임 후자만 다시 그린다. 움직이는 것은 이 회전뿐이고, 동작 줄이기 설정이면 멈춘다.

### 犬 — 뉴스 츠쿠요미 (`public/tsukuyomi.news.js`, `#news` 지연 로드)
레이어는 뒤 SVG(하늘·햇무리 빛줄기·구름 글리프·파도 언덕·토리이) → 바닥 캔버스 → 앞 SVG(가로등) 세 장이고, 모두 1600×1066 설계 좌표를 `xMidYMid slice`로 공유한다. 구름·파도 봉우리는 고정 시드로 배치해 각자 방향·속도로 흐르고, 토리이 10기는 파도 줄 사이에 끼워 앞줄이 다리를 가린다.
바닥은 지평선 거리로 깊이를 구하는 원근 타일 바닥을 줄 단위 스트립으로 그린다. 가까운 칸은 `newstile` 패키지 타일 애니메이션(`Newstile.internals.drawTile`/`buildTiming`, jsDelivr CDN + integrity, 실패 시 `components/newstile.umd.js` 폴백), 먼 칸(`BAND_ROW` 이후)은 별 패턴 띠로 가로등과 같은 속도(`SLIDE`)로 흐르고 끝에 안개를 깐다. 시간은 내렸다 올려도 이어지며, 동작 줄이기 설정이면 정지 화면이다.

공통: 세계 전환(`public/tsukuyomi.worlds.js`)은 해시(`#sea` / `#mount` / `#earth` / `#room` / `#news`, 없음=月)로 라우팅하고 月↔海는 엔진 모드 전환, 그 외는 단순 페이드 + 미사용 엔진 `stop()`이다. 산·지구·방·뉴스는 첫 진입 때 동적 `<script>` 로드 후 `start()`하고, 드롭다운 호버·포커스·유휴 시간에 미리 데워둔다(`prewarm`). 수치 튜닝은 `__TSUKUYOMI__` / `__TSUKUYOMI_DEBUG__` 브릿지(F12 패널, `public/tsukuyomi.debug.js`)로 라이브 조절한다.

https://vialinks.xyz/tsukuyomi
