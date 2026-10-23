#!/usr/bin/env node
// 장면 코드가 참조하는 정적 파일 경로 점검 (의존성 없음): node scripts/check-public-paths.mjs
//  1) public/ 최상위 js·html·css와 public/components/ 안의 코드가 임시 폴더(examples/, reference-images/, references/)를
//     참조하면 실패. 이 폴더들은 구조가 수시로 바뀌므로 장면이 쓰는 파일은 public/components/에 복사해 둔다.
//  2) 같은 파일들이 참조하는 상대 경로(슬래시 포함 + 확장자, html의 src/href)가 실제로 없으면 실패.
// 주석(// …, /* … */, <!-- … -->)은 출처 기록 용도라 검사하지 않는다.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const TEMP = /(^|[\/'"`])(examples|reference-images|references)\//;
const EXT = /\.(js|mjs|css|html|svg|png|jpe?g|webp|gif|json|mp4|webm|woff2?|ttf)$/i;

const targets = [];
for (const dir of [PUB, join(PUB, 'components')]) {
  if (!existsSync(dir)) continue;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isFile() && /\.(js|html|css)$/i.test(n)) targets.push(p);
  }
}

// 문자열 안의 //(URL)는 살리고 주석만 공백으로 지운다(줄 번호 유지).
function stripComments(src, isHtml) {
  let out = '', i = 0, q = null;
  const blank = s => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const c = src[i], c2 = src.slice(i, i + 2);
    if (q) {
      out += c;
      if (c === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
      if (c === q || (c === '\n' && q !== '`')) q = null;
      i++; continue;
    }
    if (isHtml && src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); const j = e < 0 ? src.length : e + 3; out += blank(src.slice(i, j)); i = j; continue; }
    if (c2 === '/*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? src.length : e + 2; out += blank(src.slice(i, j)); i = j; continue; }
    if (c2 === '//' && src[i - 1] !== ':') { const e = src.indexOf('\n', i); const j = e < 0 ? src.length : e; out += blank(src.slice(i, j)); i = j; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c; i++;
  }
  return out;
}

const errors = [];
for (const file of targets) {
  const isHtml = file.endsWith('.html');
  const code = stripComments(readFileSync(file, 'utf8'), isHtml);
  const rel = relative(ROOT, file);
  const lines = code.split('\n');
  lines.forEach((line, k) => {
    const at = `${rel}:${k + 1}`;
    if (TEMP.test(line)) errors.push(`${at}  임시 폴더 참조 → public/components/로 복사해 쓸 것: ${line.trim().slice(0, 140)}`);
    const refs = new Set();
    for (const m of line.matchAll(/['"`]([^'"`\s${}()]+)['"`]/g)) if (m[1].includes('/') && EXT.test(m[1])) refs.add(m[1]);
    if (isHtml || file.endsWith('.css')) {
      for (const m of line.matchAll(/\b(?:src|href)=["']([^"'#?]+)/g)) if (EXT.test(m[1])) refs.add(m[1]);
      for (const m of line.matchAll(/url\(\s*['"]?([^'")#?]+)/g)) if (EXT.test(m[1])) refs.add(m[1]);
    }
    for (const r of refs) {
      if (/^(https?:|data:|blob:|\/\/|mailto:)/i.test(r)) continue;
      const p = r.startsWith('/') ? join(PUB, r) : join(dirname(file), r);
      if (!existsSync(p)) errors.push(`${at}  파일 없음: ${r}`);
    }
  });
}

if (errors.length) {
  console.error(`public 경로 점검 실패 (${errors.length}건):\n` + errors.map(e => '  ' + e).join('\n'));
  process.exit(1);
}
console.log(`public 경로 점검 통과 (${targets.length}개 파일)`);
