// 로컬 미리보기 전용 Worker. 배포용이 아님.
// "/" 로 접속해도 tsukuyomi.html이 열리도록 매핑하고,
// 나머지는 정적 에셋 그대로 서빙한다.
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === "/" || url.pathname === "/index.html") {
			const rewritten = new Request(new URL("/tsukuyomi.html", url), request);
			const res = await env.ASSETS.fetch(rewritten);
			// 로컬 미리보기에서 HTML이 캐시되어 수정이 안 보이는 문제 방지
			const headers = new Headers(res.headers);
			headers.set("Cache-Control", "no-store");
			return new Response(res.body, { status: res.status, headers });
		}
		return env.ASSETS.fetch(request);
	},
};
