# 미리보기 (Windows 작업 환경)

- 로컬 미리보기: `wrangler dev` → http://localhost:8787/
- 연결된 Cloudflare Workers(`tsukuyomi`, Workers Builds)는 개발 중 프리뷰 용도로, 로컬 wrangler dev 서버와 병행 사용.
  - 브랜치/PR 푸시마다 프리뷰 빌드가 만들어지고, PR 봇 코멘트에 Preview URL이 달림.
  - `wrangler.jsonc`의 `name`은 대시보드 Worker 이름(`tsukuyomi`)과 같아야 하고, `previews` 블록(빈 객체 가능)이 있어야 빌드가 통과함.
- 정적 파일은 `public/`에 둠. 루트에 두면 `.wrangler/` 감시 루프 발생.
- `/` 접속 시 `preview-worker.js`가 `/tsukuyomi.html`로 매핑.
- 서버를 직접 실행하지 않기. 대부분의 경우 서버는 항상 실행 중.

# 미리보기 (Claude Code 클라우드 세션 Linux 환경)

- 브랜치 Push 및 PR 생성 시 자동으로 빌드가 진행되며, 별다른 설정은 필요하지 않음.
- Cloudflare Workers/Pages 배포는 개발 도중 편의성 프리뷰 목적이며, 실제 배포는 외부 정적파일 호스팅에서 진행됨.

# 폴더 규칙 (임시 폴더 의존 금지)

- `public/examples/`, `public/reference-images/`, `references/`는 **임시 폴더**로, 구조·파일명이 수시로 바뀜(정리·이동·삭제).
  - 장면 코드(`public/*.js|html|css`)가 이 폴더의 파일을 런타임에 불러오면 안 됨. 주석으로 출처를 남기는 것은 괜찮음.
  - 예: 야치요의 방 랜턴이 `examples/` 정리 후 404로 로드되지 않았던 문제.
- 장면이 실제로 쓰는 외부 파일(iframe 컴포넌트, 라이브러리 등)은 `public/components/`에 **복사본**을 두고 그 경로를 참조.
  - 현재 목록: `lantern-frustum.html`(사각뿔대 랜턴), `lantern-cylinder.html`(원통 스탠딩 랜턴 수평투영), `yachiroom.umd.js` — 모두 `tsukuyomi.room.js`가 사용.
  - `tsukuyomi.markup.js` / `.css`(설명카드 렌더러) — `hub.html`이 사용. 원본은 `markup/`(별도 레포 분리용 보관), 고치면 둘 다 갱신.
  - 초안을 고친 뒤 장면에 반영하려면 `components/`의 복사본도 함께 갱신.
- 경로를 추가·이동했으면 `node scripts/check-public-paths.mjs`로 점검(임시 폴더 참조·없는 파일 참조를 잡아냄, 의존성 없음).
