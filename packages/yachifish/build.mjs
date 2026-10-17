// 의존성 없이 dist 생성: ESM 복사 + UMD 래핑. `node build.mjs`
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src", "yachifish.js");
const outDir = join(root, "dist");
mkdirSync(outDir, { recursive: true });

const esm = readFileSync(src, "utf8");
writeFileSync(join(outDir, "yachifish.esm.js"), esm);

// UMD: export 문 제거 후 전역에 바인딩. src에 import가 없다는 전제.
const stripped = esm
  .replace(/^\s*export\s+default\s+\w+\s*;\s*$/gm, "")
  .replace(/^\s*export\s+(?=const|let|var|function|class|async function)/gm, "")
  .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");
const umd = `(function (global) {
"use strict";
${stripped}
global.yachifish = yachifish;
if (typeof module !== "undefined" && module.exports) module.exports = yachifish;
})(typeof globalThis !== "undefined" ? globalThis : window);
`;
writeFileSync(join(outDir, "yachifish.umd.js"), umd);
// .min은 jsDelivr가 자동 압축 서빙하므로 복사본으로 둠 (추후 esbuild 도입 시 교체)
writeFileSync(join(outDir, "yachifish.umd.min.js"), umd);
console.log("dist done:", ["yachifish.esm.js", "yachifish.umd.js", "yachifish.umd.min.js"].join(", "));
