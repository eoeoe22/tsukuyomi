// 프로덕션 배포용 정적파일(에셋 바인딩) 전용 Worker.
// 로컬 wrangler dev와 Workers Builds 프리뷰가 같은 파일을 공용한다.
// "/" 로 접속해도 tsukuyomi.html이 열리도록 매핑하고,
// 나머지는 정적 에셋 그대로 서빙한다. API/SSR 없음.
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === "/" || url.pathname === "/index.html") {
			const rewritten = new Request(new URL("/tsukuyomi.html", url), request);
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
