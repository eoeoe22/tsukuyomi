# 미리보기 (wrangler)

- 로컬 미리보기: `wrangler dev` → http://localhost:8787/
- 연결된 Cloudflare Workers(`tsukuyomi`, Workers Builds)는 개발 중 프리뷰 용도로, 로컬 wrangler dev 서버와 병행 사용.
  - 브랜치/PR 푸시마다 프리뷰 빌드가 만들어지고, PR 봇 코멘트에 Preview URL이 달림.
  - `wrangler.jsonc`의 `name`은 대시보드 Worker 이름(`tsukuyomi`)과 같아야 하고, `previews` 블록(빈 객체 가능)이 있어야 빌드가 통과함.
- 정적 파일은 `public/`에 둠. 루트에 두면 `.wrangler/` 감시 루프 발생.
- `/` 접속 시 `preview-worker.js`가 `/tsukuyomi.html`로 매핑.
- 서버를 직접 실행하지 않기. 대부분의 경우 서버는 항상 실행 중.
