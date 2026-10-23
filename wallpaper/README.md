# Tsukuyomi Wallpaper Engine 패키지

웹 정적 배포와 분리된, Wallpaper Engine 전용 패키지.
코어 로직은 `vendor/`에 동결 복사하고, 월페이퍼 차이는 `wallpaper.html`·`wallpaper.css`·`wallpaper.js`·`project.json`에서만 처리한다.

## 비목적 (보장)

- `public/`·`wrangler.jsonc`·`preview-worker.js`를 수정하지 않는다. 웹 정적 배포는 그대로다.
- 코어(`vendor/tsukuyomi.js` 등)를 분기(fork)하지 않는다. WE 전용 동작은 이미 노출된
  `window.__TSUKUYOMI__` 브릿지를 `wallpaper.js`에서 호출하는 방식으로만 추가한다.
- 이 패키지는 현재 버전 내용 그대로 동결하고, 릴리즈로 별도 업로드한다.
  웹이 바뀌어도 월페이퍼는 바뀌지 않는다. 바꿀 때는 `tools/sync-core.*`로 명시적 재동결.

## 폴더 구조

```
wallpaper/
  project.json        WE 프로젝트 정의 (file=wallpaper.html, 장면/연출/고급 속성)
  wallpaper.html      WE 진입점. 두 세계 DOM(#worldMoon / #worldMount / #worldEarth / #worldRoom / #worldNews) + dock DOM 유지(코어 참조, 표시만 숨김). debug 미로드
  wallpaper.css       WE 전용 오버라이드 (하단 시간대 UI·디버그 잔재 숨김)
  wallpaper.js        WE 브리지 (scene/intro/daystars/daytone/daydark/cfg_*/fish_*/snapshot_json → __TSUKUYOMI__ 호출,
                      月 바깥(山·地·八·犬)은 vendor/tsukuyomi.{mount,earth,room,news}.js 지연 로드 + 페이드 전환)
  vendor/             코어 동결본 (public에서 바이트 복사, 수정 금지)
    tsukuyomi.js / tsukuyomi.css / cloud-live.js / cloud-overlay.js
    tsukuyomi.mount.js (산정 토리이 세계) / tsukuyomi.earth.js (역광 지구 + 죽순)
    tsukuyomi.room.js (야치요의 방) / tsukuyomi.news.js (뉴스 츠쿠요미)
    clouds/day-overlay.json (공백 구름 손그림 레이어 문서)
    lantern-front.svg / assets/icons/icon.svg
  components/         방 장면 런타임 의존 복사본 (public/components와 바이트 동일, 수정 금지)
    lantern-frustum.html / lantern-cylinder.html (랜턴 iframe) / yachiroom.umd.js
  tools/
    generate-project-json.py  project.json 생성기 (vendor CFG + public GROUPS 읽기만)
    rebuild-map.json          GROUPS rebuild 플래그 추출본 (wallpaper.js REBUILD와 대조용)
    verify-wallpaper.py       전체 검증 (아래 검증절 참고)
    sync-core.ps1 / sync-core.sh  명시적 재동결용 (Windows / Linux)
  CORE_VERSION.txt    동결 커밋·날짜·원본 목록
```

`wallpaper.html`은 `../public`을 참조하지 않으며, `tsukuyomi.debug.js`·`tsukuyomi.cloudlayers.js`·`tsukuyomi.markup.js`·`tsukuyomi.focus.js`·
`bootstrap-icons`를 로드하지 않는다 (런타임인 `vendor/cloud-overlay.js`만 로드).

## 동결 버전

- `CORE_VERSION.txt` 참조 (커밋 `789e000`, 바다 색감 3버튼·뉴스/방/지구 세계 포함, 2026-10-23 기준).
- `project.json`의 고급 기본값 194종은 동결 CFG에서 그대로 생성됐다 (공백 장면 DS_*/DN_*/DY_REF_AR/TN_* 18종 포함).
- 물고기 (토리이 수면 상승) 고급 그룹 32종(반사광 켜기 체크 1 + 슬라이더 25 + 색 6)은 동결 FISH에서 생성됐다.
- 검증: `python wallpaper/tools/verify-wallpaper.py` (vendor 해시·기본값·참조·git 범위 검사).

## WE 옵션

기본 8종은 그룹에 속하지 않는다 (장면별 노출: intro·물고기 군집은 밤/미러볼, 공백 토글 3종은 공백 선택 시).
13개 카테고리 그룹(전환 타이밍·레이아웃·토리이/달·별·산·구름·공백 장면·태양·달/안개·
반사·물결·랜턴 + 물고기 (토리이 수면 상승))으로 접어서 보여준다. 키 앞의 영문+숫자 접두사는 카테고리 순서를 고정하며,
WE 조건식이 해석할 수 있도록 반드시 문자 시작으로 쓴다 (숫자 시작 키는 조건 평가 실패로 숨겨진다).
미러볼 본체 파라미터(`tilt`·`step` 등 소문자 MB_*·SHOW_*)는 CFG가 아니라 코어 기본값 그대로 쓴다
(WE 고급 옵션에 노출하지 않는다).

| 키 | 종류 | 기본값 | 설명 |
|---|---|---|---|
| `a00_scene` | 콤보 (표시 순서: 산 5 / 산(노을) 6 / 공백 1 / 황혼 2 / 밤 3 / 밤(미러볼) 4 / 지구 7 / 야치요의 방 8 / 뉴스 9) | 밤(3) | 하단 UI 대신 장면을 선택한다. 1~4는 웹 月 4버튼, 5·6은 웹 山(#mount)의 땅거미/노을, 7~9는 웹 地(#earth)/八(#room)/犬(#news)와 동일. 기존 값 1~6은 그대로라 예전 설치본의 선택이 유지된다 |
| `a01_intro` | 체크 (밤 계열일 때만 표시) | 켜짐 | 초기 진입 연출 재생. 밤=황혼→밤, 미러볼=황혼→밤 이후 미러볼 전환까지. 끄면 밤은 즉시 idle, 미러볼은 즉시 밤에서 전환 연출만 재생 |
| `a01_fish` | 콤보 (끔 0 / 커서 따라가기 1 / 달에 배치 2, 밤 계열일 때만 표시 (고급과 무관)) | 끔(0) | 물고기 군집 (웹 하단 군집 3버튼과 동일, 밤에서만 적용) |
| `a01_daystars` | 체크 (공백 선택 시 표시 (고급과 무관)) | 꺼짐 | 공백 장면에 별 궤적 표시 (웹 btnStars와 동일, 공백에서만 적용) |
| `a01_daytone` | 체크 (공백 선택 시 표시 (고급과 무관)) | 꺼짐 | 공백 장면에 파스텔 색조 (웹 바다 색감 [색조]와 동일, 공백에서만 적용. 밤 토글과 둘 다 켜면 밤이 우선) |
| `a01_daydark` | 체크 (공백 선택 시 표시 (고급과 무관)) | 꺼짐 | 공백 장면을 어둡게 (공백 밤, 웹 btnDark와 동일, 공백에서만 적용) |
| `a02_show_advanced` | 체크 | 꺼짐 | 켜면 아래 13개 고급 그룹이 표시된다 |
| `a03_snapshot_json` | 텍스트 | 비움 | 웹 디버그 패널 "내보내기" JSON을 붙여넣는 탈출구 (cfg+palettes 반영, 장면은 WE 옵션이 우선) |
| `a04_~a15_` + CFG키 194종 | 슬라이더/체크 | 동결값 | 웹 디버그 패널 파라미터를 카테고리별로 위임. 0/1 토글(CL_LIVE·DAY_SCENE·MTN_SHOW·REFL_AUTO·LANTERN_CARD_AVOID)은 체크로 표시 |
| `a16_fish_` + FISH키 32종 | 체크/슬라이더/색 | 동결값 | 웹 디버그 패널 "물고기 (토리이 수면 상승)" 섹션 위임 (`__TSUKUYOMI__.fish`). 맨 앞 `a16_fish_tlOn`이 **토리이 반사광 켜기** (기본 켜짐). 색 c0~c5는 WE color("r g b")를 `#rrggbb`로 변환 |

공백·황혼 선택 시에는 인트로 없이 해당 idle로 바로 진입한다.
산·산(노을)·지구·야치요의 방·뉴스는 각 세계로 단순 페이드(1.1초) 전환하며, 月 바깥에 있는 동안 月 렌더 루프는 멈춘다
(산끼리는 산 엔진의 크로스페이드, 지구·방·뉴스는 올릴 때마다 인트로/베이스부터 시작). 月로 돌아오면 첫 진입처럼 처리한다 (공백·황혼은 즉시 idle, 밤 계열은 인트로 설정을 따름).
토리이 수면 상승 물고기는 밤 계열에서 토리이를 클릭하면 발사된다 (WE 마우스 입력 허용 시).
실행 중 장면을 바꾸면 전환 애니메이션으로 이동한다 (밤+연출 끄기는 즉시 점프,
미러볼로 바꾸면 밤 도착 후 스포트라이트 전환 연출이 붙는다).

이번 project.json은 장면 콤보 3종(지구/야치요의 방/뉴스)·공백 파스텔 색조 토글 추가와
고급 5종(TN_*) 추가로 바뀌었으므로
WE 폴더에 통째로 다시 복사한다.
`wallpaper.js`는 신구 키(`scene`·`intro`·`fish`/`cursor`·`daystars`·`daytone`·`daydark`·`cfg_*`·숫자 시작 키)도 계속 받으므로, 순서를 놓쳐도 장면 전환은 동작한다.

## 고급 스냅샷 사용법

1. 웹(`tsukuyomi.html`)에서 디버그 패널 → 가져오기/내보내기 → 내보내기 → JSON 복사.
2. WE 옵션 `show_advanced` 켜기 → `snapshot_json`에 붙여넣기.
3. cfg+팔레트가 적용된다. 장면(p/state)은 WE의 `scene`·`intro`·`fish`·`daystars`·`daytone`·`daydark`를 따른다.

## 로컬 미리보기 (WE 없이)

```sh
# 정적 서빙 후 브라우저로 열기 (WE 리스너가 없어도 코어 기본값=황혼 idle에서 WE 지정 장면으로 진입)
python -m http.server 8788 --directory wallpaper
# http://localhost:8788/wallpaper.html
# 장면 강제: wallpaper.html?scene=mount / ?scene=mount-sunset / ?scene=earth / ?scene=room / ?scene=news / ?scene=day&stars=1 / ?scene=day&tone=1 / ?scene=day&dark=1 / ?scene=dusk / ?scene=night&intro=0 / ?scene=night&fish=1 / ?scene=mirror&fish=2
node --check wallpaper/wallpaper.js
python wallpaper/tools/verify-wallpaper.py
```

## 배포 패키지 (`dist-we/Tsukuyomi-WE.zip`)

필수 19종만 포함. `tools/`·`README.md`·`CORE_VERSION.txt`는 제외.

- `project.json` (`"preview": "preview.jpg"` 포함), `wallpaper.html`,
  `wallpaper.js`, `wallpaper.css`, `preview.jpg`
- `vendor/` 11종: `tsukuyomi.js`·`tsukuyomi.css`·`cloud-live.js`·`cloud-overlay.js`·
  `tsukuyomi.mount.js`·`tsukuyomi.earth.js`·`tsukuyomi.room.js`·`tsukuyomi.news.js`·
  `clouds/day-overlay.json`·`lantern-front.svg`·`assets/icons/icon.svg`
- `components/` 3종(야치요의 방 런타임 의존): `lantern-frustum.html`·`lantern-cylinder.html`·`yachiroom.umd.js`
- `preview.jpg`는 `thumbnail.png`(원본, 128px)를 300x300 JPEG으로 변환한
  WE용 썸네일이다. WE가 인식하는 썸네일명은 `preview.jpg`/`preview.gif`뿐이므로
  `thumbnail.png`를 직접 지정하면 표시되지 않는다. `thumbnail.png`는 원본 보관용으로
  소스에만 두고 배포 zip에는 넣지 않는다.
- 재생성은 이 19개를 `Tsukuyomi/` 폴더에 담아 zip으로 묶으면 된다.

## Workshop 릴리즈 업로드 (폴더째 복사 방식)

> 주의: 메인 화면 하단의 파일 열기(불러오기)로 `wallpaper.html`만 선택하거나
> 드래그하면 WE가 `project.json`을 새로 생성해 버린다.
> 이때 목록 이름이 `wallpaper.html`로 뜨고, 썸네일·사용자 속성이 사라진다
> (월페이퍼 자체는 돌아가므로 "나머지만 정상"처럼 보인다).
> 배포본 가져오기에는 아래 폴더째 복사 방식을 쓴다.

1. Wallpaper Engine을 완전히 종료한다 (실행 중 복사는 캐시 때문에 반영되지 않는다).
2. `dist-we/Tsukuyomi-WE.zip`을 아무 폴더에나 압축 해제한다.
3. 푼 `Tsukuyomi/` 폴더째
   `wallpaper_engine/projects/myprojects/` 안에 복사한다.
   같은 이름의 기존 폴더가 있으면 먼저 삭제한다
   (WE가 예전 `project.json`/썸네일 캐시를 들고 있을 수 있다).
4. WE 실행 → Installed 탭에서 `Tsukuyomi 月` 선택.
   목록 썸네일이 `preview.jpg`로 뜨고,
   오른쪽 속성 패널에 `장면`이 보이면 정상이다.
   (에디터의 Edit 메뉴가 아니라 Installed 탭에서 확인한다.)
5. 미리보기에서 장면 9종(산·산(노을)·지구·야치요의 방·뉴스 포함) + 연출 켜짐/꺼짐 + 토리이 반사광 켜기/끄기 + 물고기 군집 3종 + 공백 토글 3종을 확인.
6. Workshop에 별도 릴리즈로 업로드. 웹 배포와 버전이 엮이지 않게 릴리즈 노트에 동결 커밋을 적는다.
   썸네일은 `preview.jpg`가 이미 지정되어 있어 별도 등록이 불필요하며,
   퍼블리시 과정에서 WE가 스냅샷을 새로 만들면 그걸로 교체된다.

## 문제 해결: 속성 패널이 빈칸으로 보일 때

1. WE 프로젝트 폴더의 `project.json`을 텍스트로 열어 `a04_T_NIGHT`가 있는지 확인한다.
   없으면 우리 `project.json`이 반영되지 않은 것이다. WE 종료 후 파일을 다시 복사한다.
2. 복사 후에도 비어 있으면 WE 재시작 → Installed 탭에서 월페이퍼를 다시 선택한다.
   (WE는 실행 중에 바꾼 `project.json`을 다시 읽지 않을 수 있다.)
3. 에디터에서 Change Project settings를 열어 OK를 누르면 WE가 `project.json`을
   재작성한다. 고급 속성까지 지워졌다면 `project.json`을 다시 복사한다.
4. 그래도 비어 있으면 `python wallpaper/tools/verify-wallpaper.py`로 스키마를 확인한다.
   슬라이더는 에디터 생성 파일과 동일한 키셋
   (`min`/`max`/`step`/`fraction`, 소수형은 `precision` 추가)을 사용한다.
   `step`이 없는 슬라이더는 WE가 렌더하지 못한다.

## 주의

- Google Fonts는 동결 링크 그대로 둔다. 오프라인에서는 시스템 폰트로 폴백되며 장면 렌더에는 영향이 없다.
- WE의 FPS 제한은 CEF rAF 스로틀로 네이티브 적용되므로 `wallpaper.js`는 기록만 한다 (코어 루프 불변).
- 숨김 패널의 실측 영역이 0이 되므로, 랜턴 하단 회피(`LANTERN_CARD_AVOID`)는 월페이퍼에서만 0으로 덮는다 (웹 기본값 1 유지).
- 재동결은 `powershell -File wallpaper/tools/sync-core.ps1` (또는 `sh wallpaper/tools/sync-core.sh`) 한 번으로 끝내고,
  `CORE_VERSION.txt`의 커밋 해시를 새 값으로 고친 뒤 릴리즈한다.
