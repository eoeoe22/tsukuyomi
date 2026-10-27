// 프로덕션 배포용 정적파일(에셋 바인딩) 전용 Worker.
// 로컬 wrangler dev와 Workers Builds 프리뷰가 같은 파일을 공용한다.
// 경로 매핑:
//   "/"        → tsukuyomi.html (일반 월페이퍼)
//   "/landing" → landing.html  (랜딩페이지, "/landing/"은 "/landing"으로 리디렉션)
//   "/hub"     → hub.html      (랜드마크 인디케이터·설명카드, "/hub/"는 "/hub"로 리디렉션)
// 나머지는 정적 에셋 그대로 서빙한다. API/SSR 없음.
// 에셋 바인딩의 html_handling(auto-trailing-slash)은 "/x.html" 요청을 "/x"로 리디렉션하므로
// 확장자 없는 경로로 리라이트한다("/landing"은 에셋이 landing.html로 바로 서빙).
const ROUTES = {
	"/": "/tsukuyomi",
	"/index.html": "/tsukuyomi",
	"/landing": "/landing",
	"/hub": "/hub",
};

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// 끝 슬래시가 붙으면 상대 경로 에셋(tsukuyomi.css 등)이 /landing/ 아래로 잡히므로 정규화
		if (url.pathname === "/landing/" || url.pathname === "/hub/") {
			url.pathname = url.pathname.slice(0, -1);
			return Response.redirect(url.toString(), 301);
		}

		const target = ROUTES[url.pathname];
		if (target) {
			const rewritten = new Request(new URL(target, url), request);
			const res = await env.ASSETS.fetch(rewritten);
			// HTML은 항상 최신(프로덕션 재배포 즉시 반영)
			const headers = new Headers(res.headers);
			headers.set("Cache-Control", "no-store");
			headers.set("X-Content-Type-Options", "nosniff");
			return new Response(res.body, { status: res.status, headers });
		}
		return env.ASSETS.fetch(request);
	},
};
