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
  wallpaper.html      WE 진입점. dock DOM은 유지(코어 참조) + 표시만 숨김. debug/cloudedit 미로드
  wallpaper.css       WE 전용 오버라이드 (하단 시간대 UI·디버그 잔재 숨김)
  wallpaper.js        WE 브릿지 (scene/intro/cfg_*/snapshot_json → __TSUKUYOMI__ 호출)
  vendor/             코어 동결본 (public에서 바이트 복사, 수정 금지)
    tsukuyomi.js / tsukuyomi.css / cloud-doc.js / cloud-live.js
    lantern-front.svg / assets/icons/icon.svg / clouds/index.json
  tools/
    generate-project-json.py  project.json 생성기 (vendor CFG + public GROUPS 읽기만)
    rebuild-map.json          GROUPS rebuild 플래그 추출본 (wallpaper.js REBUILD와 대조용)
    verify-wallpaper.py       전체 검증 (아래 검증절 참고)
    sync-core.ps1 / sync-core.sh  명시적 재동결용 (Windows / Linux)
  CORE_VERSION.txt    동결 커밋·날짜·원본 목록
```

`wallpaper.html`은 `../public`을 참조하지 않으며, `tsukuyomi.debug.js`·`tsukuyomi.cloudedit.js`·
`bootstrap-icons`를 로드하지 않는다 (숨겨진 dock 아이콘용 외부 CSS 불필요).

## 동결 버전

- `CORE_VERSION.txt` 참고 (커밋 `54d8bac`, 2026-10-06 UTC 기준).
- `project.json`의 고급 기본값 176종은 동결 CFG에서 그대로 생성됐다.
- 검증: `python wallpaper/tools/verify-wallpaper.py` (vendor 해시·기본값·참조·git 범위 검사).

## WE 옵션

기본 4종은 그룹에 속하지 않고 맨 위에 표시된다. 고급 176종은 디버그 패널과 같은
12개 카테고리 그룹(전환 타이밍·레이아웃·토리이/달·별·산·구름·새 낮·태양·달/안개·
반사·물결·랜턴)으로 접어서 보여준다. 키 앞의 영문+숫자 접두사는 카테고리 순서를 고정하며,
WE 조건식이 해석할 수 있도록 반드시 문자 시작으로 쓴다 (숫자 시작 키는 조건 평가 실패로 숨겨진다).

| 키 | 종류 | 기본값 | 설명 |
|---|---|---|---|
| `a00_scene` | 콤보 (낮 1 / 황혼 2 / 밤 3) | 밤(3) | 하단 시간대 UI 대신 장면을 선택한다 |
| `a01_intro` | 체크 (밤일 때만 표시) | 켜짐 | 밤 선택 시 초기 진입 연출(황혼→밤) 재생. 끄면 즉시 밤 idle |
| `a02_show_advanced` | 체크 | 꺼짐 | 켜면 아래 12개 고급 그룹이 표시된다 |
| `a03_snapshot_json` | 텍스트 | 비움 | 웹 디버그 패널 "내보내기" JSON을 붙여넣는 탈출구 (cfg+palettes 반영, 장면은 WE 옵션이 우선) |
| `a04_~a15_` + CFG키 176종 | 슬라이더/체크 | 동결값 | 웹 디버그 패널 파라미터를 카테고리별로 위임. 0/1 토글(CLOUD_DOC·CL_LIVE·DAY_SCENE·MTN_SHOW·REFL_AUTO·LANTERN_CARD_AVOID)은 체크로 표시 |

낮·황혼 선택 시에는 인트로 없이 해당 idle로 바로 진입한다.
실행 중 장면을 바꾸면 전환 애니메이션으로 이동한다 (밤+연출 끄기는 즉시 점프).

이번 project.json은 키 규칙이 바뀌었으므로(그룹 도입) WE 폴더에 통째로 다시 복사한다.
`wallpaper.js`는 구 키(`scene`·`cfg_*`·숫자 시작 키)도 계속 받으므로, 순서를 놓쳐도 장면 전환은 동작한다.

## 고급 스냅샷 사용법

1. 웹(`tsukuyomi.html`)에서 디버그 패널 → 가져오기/내보내기 → 내보내기 → JSON 복사.
2. WE 옵션 `show_advanced` 켜기 → `snapshot_json`에 붙여넣기.
3. cfg+팔레트가 적용된다. 장면(p/state)은 WE의 `scene`·`intro`를 따른다.

## 로컬 미리보기 (WE 없이)

```sh
# 정적 서빙 후 브라우저로 열기 (WE 리스너가 없어도 코어 기본값=밤 인트로로 재생)
python -m http.server 8788 --directory wallpaper
# http://localhost:8788/wallpaper.html
# 장면 강제: wallpaper.html?scene=day / ?scene=dusk / ?scene=night&intro=0
node --check wallpaper/wallpaper.js
python wallpaper/tools/verify-wallpaper.py
```

## 배포 패키지 (`dist-we/Tsukuyomi-WE.zip`)

필수 12종만 포함. `tools/`·`README.md`·`CORE_VERSION.txt`는 제외.

- `project.json` (`"preview": "preview.jpg"` 포함), `wallpaper.html`,
  `wallpaper.js`, `wallpaper.css`, `preview.jpg`
- `vendor/` 7종: `tsukuyomi.js`·`tsukuyomi.css`·`cloud-doc.js`·`cloud-live.js`·
  `lantern-front.svg`·`assets/icons/icon.svg`·`clouds/index.json`
- `preview.jpg`는 `thumbnail.png`(원본, 128px)를 300x300 JPEG으로 변환한
  WE용 썸네일이다. WE가 인식하는 썸네일명은 `preview.jpg`/`preview.gif`뿐이므로
  `thumbnail.png`를 직접 지정하면 표시되지 않는다. `thumbnail.png`는 원본 보관용으로
  소스에만 두고 배포 zip에는 넣지 않는다.
- 재생성은 이 12개를 `Tsukuyomi/` 폴더에 담아 zip으로 묶으면 된다.

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
   오른쪽 속성 패널에 `장면 (하단 시간대 UI 대신)`이 보이면 정상이다.
   (에디터의 Edit 메뉴가 아니라 Installed 탭에서 확인한다.)
5. 미리보기에서 장면 3종 + 연출 켜짐/꺼짐을 확인.
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
