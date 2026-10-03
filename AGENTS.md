# 미리보기 (wrangler)

- wrangler는 로컬 미리보기 서버 용도로만 사용. Pages/Workers에 배포하지 않음.
- 실행: `wrangler dev` → http://localhost:8787/
- 정적 파일은 `public/`에 둠. 루트에 두면 `.wrangler/` 감시 루프 발생.
- `/` 접속 시 `preview-worker.js`가 `/tsukuyomi.html`로 매핑.
