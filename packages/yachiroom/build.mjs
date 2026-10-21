// 의존성 없이 dist 생성: ESM 복사 + UMD 래핑. `node build.mjs`
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src", "yachiroom.js");
const outDir = join(root, "dist");
mkdirSync(outDir, { recursive: true });

const esm = readFileSync(src, "utf8");
writeFileSync(join(outDir, "yachiroom.esm.js"), esm);

const stripped = esm
  .replace(/^\s*export\s+default\s+/m, "")
  .replace(/^\s*export\s+(?=const|let|var|function|class|async function)/gm, "")
  .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");
const umd = `(function (global) {
"use strict";
${stripped}
global.YachiRoom = { YachiRoom, createYachiRoom, mount, DEFAULTS, PARTS, PART_LABEL, buildPrims };
if (typeof module !== "undefined" && module.exports) module.exports = global.YachiRoom;
})(typeof globalThis !== "undefined" ? globalThis : window);
`;
writeFileSync(join(outDir, "yachiroom.umd.js"), umd);
writeFileSync(join(outDir, "yachiroom.umd.min.js"), umd);
console.log("dist done:", ["yachiroom.esm.js", "yachiroom.umd.js", "yachiroom.umd.min.js"].join(", "));
