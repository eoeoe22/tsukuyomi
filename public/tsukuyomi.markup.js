/* 포커스 카드용 위키 마크업 렌더러 — Cloudwiki 렌더러의 백엔드 비의존 부분 포크.
 *
 * 출처: eoeoe22/cloudwiki @ 368dd33 (2026-10-02)
 *   packages/wiki-shared/src/render/render.ts
 *   packages/wiki-shared/src/markup/transclusion.ts (scanCodeSpan / findParamRefEnd)
 * Cloudwiki 본체와는 분리된 포크다. 이식 후 독자적으로 수정하며 역동기화하지 않는다.
 *
 * 이식 범위(원본 기준 대략의 줄 범위):
 *   - marked 인라인 확장(highlight/underline/customImage/wikiFootnote/wikiButton/wikiEmbed) 37-364
 *   - :::meta 문서 변수 + {{{@이름}}} 1333-1396, 파이프 분리/파라미터 참조 409-564
 *   - 헤딩 {collapse} + 섹션 접기 1629-1656, 2014-2127
 *   - 각주 2309-2457, 인라인 아이콘 {bi:}/{icon:} 2130-2247(아이콘 부분만)
 *   - 색/팔레트 3057-3226, ::: 블록 디렉티브 3228-3922, 인라인 컴포넌트 3933-4361
 *   - 타임스탬프/타이머/:::after·:::until 4363-4734, 체크박스·진행도 4755-4800
 *   - 표 옵션 토큰·셀 병합·정렬 4802-5033, 5306-5506
 *   - 렌더 파이프라인 renderWikiContent 5036-6155(위키 전용 단계 제외)
 *   - ```chart 6931-7155
 *
 * 제외(위키·백엔드 의존 또는 불필요): 트랜스클루전 {{틀}}·파서 함수·익스텐션 {{이름:인자}},
 *   [[위키링크]]·멘션·카테고리 목록·이미지 문서 링크·커스텀 팔레트(appConfig),
 *   헤딩 번호·목차·섹션 링크 복사, Mermaid, {mdi:} 아이콘, 미리보기 상태 키(data-state-key),
 *   외부 링크 확인 팝업(Swal) — 외부 링크는 새 탭으로 연다.
 *
 * Bootstrap 의존 대체: 탭은 자체 스크립트, 아코디언은 <details>, 각주 팝오버는 자체 툴팁,
 *   콜아웃/체크박스 아이콘은 MDI 대신 Bootstrap Icons.
 *
 * 전역 의존: marked(18.x UMD), DOMPurify(3.x). 둘 중 하나라도 없으면 원문을 평문으로 표시한다.
 * Prism(코드 하이라이트)·Chart.js(```chart)는 해당 문법이 있을 때만 CDN에서 지연 로드한다.
 *
 * API: window.TsukuyomiMarkup
 *   render(src, el, opts) → { meta }   el 내용을 교체. opts.dark: 차트 색 테마(기본 OS 설정)
 *   teardown(el)                        타이머·차트·툴팁 정리
 *   extractMeta(src) → meta             렌더 없이 :::meta 값만 추출
 */
(() => {
  const CDN = {
    prismCore: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js',
    prismAutoloader: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js',
    prismComponentsBase: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/',
    chartJs: 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
    codeFont: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Nanum+Gothic+Coding:wght@400;700&display=swap',
  };

  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── 공용 헬퍼 (Cloudwiki ui/html.ts, ui/url.ts) ──
  function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isSafeUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch (e) {
      return false;
    }
  }

  // ── 렌더 단위 상태 ──
  // render()는 동기라 렌더 중에는 다른 렌더와 섞이지 않는다. 매 render() 시작 시 초기화.
  let _codeSpans = null;          // WIKICODEFPH 복원용 스냅샷 (블록 제목 렌더에서 참조)
  let _anchorIds = Object.create(null); // {id:이름} 중복 제거
  let _blockSeq = 0;              // 탭/아코디언 DOM id 시퀀스 (페이지 전역 유일)

  // ── 백틱 코드 스팬 / {{{...}}} 스캐너 (Cloudwiki markup/transclusion.ts) ──
  function _scanCodeSpan(text, i) {
    if (text[i] !== '`') return -1;
    if (i > 0 && text[i - 1] === '`') return -1;
    let backslashes = 0;
    let bk = i - 1;
    while (bk >= 0 && text[bk] === '\\') { backslashes++; bk--; }
    if (backslashes % 2 === 1) return -1;
    let n = 1;
    while (i + n < text.length && text[i + n] === '`') n++;
    let j = i + n;
    while (j < text.length) {
      if (text[j] !== '`') { j++; continue; }
      let k = 1;
      while (j + k < text.length && text[j + k] === '`') k++;
      if (k === n) return j + k;
      j += k;
    }
    return -1;
  }

  function _findParamRefEnd(text, contentStart) {
    const stack = ['tri'];
    let i = contentStart;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '`') {
        const end = _scanCodeSpan(text, i);
        if (end > 0) { i = end; continue; }
      }
      if (ch === '{') {
        if (text[i + 1] === '{' && text[i + 2] === '{') { stack.push('tri'); i += 3; continue; }
        if (text[i + 1] === '{') { stack.push('dbl'); i += 2; continue; }
        stack.push('sgl');
        i++;
        continue;
      }
      if (ch === '}') {
        const top = stack[stack.length - 1];
        if (top === 'tri' && text[i + 1] === '}' && text[i + 2] === '}') {
          stack.pop();
          i += 3;
          if (stack.length === 0) return { contentEnd: i - 3, fullEnd: i };
          continue;
        }
        if (top === 'dbl' && text[i + 1] === '}') {
          stack.pop();
          i += 2;
          if (stack.length === 0) return { contentEnd: i - 2, fullEnd: i };
          continue;
        }
        if (top === 'sgl') {
          stack.pop();
          i++;
          if (stack.length === 0) return { contentEnd: i - 1, fullEnd: i };
          continue;
        }
        i++;
        continue;
      }
      i++;
    }
    return null;
  }

  // 최상위 '|' 로만 분리. {..}/{{..}}/{{{..}}}/[[..]] 와 코드 스팬 내부의 '|' 는 무시.
  function _splitPipeTopLevel(raw) {
    const parts = [];
    let depth = 0;
    let singleBrace = 0;
    let start = 0;
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '`') {
        const end = _scanCodeSpan(raw, i);
        if (end > 0) { i = end; continue; }
      }
      if (ch === '{') {
        if (raw[i + 1] === '{') {
          depth++;
          i += (raw[i + 2] === '{') ? 3 : 2;
          continue;
        }
        singleBrace++;
        i++;
        continue;
      }
      if (ch === '}') {
        if (singleBrace > 0) { singleBrace--; i++; continue; }
        if (raw[i + 1] === '}') {
          if (depth > 0) depth--;
          i += (raw[i + 2] === '}') ? 3 : 2;
          continue;
        }
        i++;
        continue;
      }
      if (ch === '[' && raw[i + 1] === '[') { depth++; i += 2; continue; }
      if (ch === ']' && raw[i + 1] === ']') { if (depth > 0) depth--; i += 2; continue; }
      if (ch === '|' && depth === 0 && singleBrace === 0) {
        parts.push(raw.substring(start, i));
        start = i + 1;
      }
      i++;
    }
    parts.push(raw.substring(start));
    return parts;
  }

  function _findParamRefs(text) {
    const refs = [];
    let i = 0;
    while (i < text.length - 2) {
      if (text[i] === '`') {
        const end = _scanCodeSpan(text, i);
        if (end > 0) { i = end; continue; }
      }
      if (text[i] === '{' && text[i + 1] === '{' && text[i + 2] === '{') {
        const end = _findParamRefEnd(text, i + 3);
        if (end) {
          refs.push({ start: i, fullEnd: end.fullEnd, raw: text.substring(i + 3, end.contentEnd) });
          i = end.fullEnd;
          continue;
        }
      }
      i++;
    }
    return refs;
  }

  // ── 색상 ──
  const _colorRgbCache = new Map();
  function _wikiColorToRgb(value) {
    if (!value || typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    if (_colorRgbCache.has(key)) return _colorRgbCache.get(key);
    let rgb = null;
    let m = key.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
    if (m) {
      const h = m[1];
      if (h.length === 3 || h.length === 4) {
        rgb = [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
      } else {
        rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
    } else if ((m = key.match(/^rgba?\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)/))) {
      rgb = [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
    } else if (document.body) {
      try {
        const el = document.createElement('div');
        el.style.color = value;
        if (el.style.color) {
          el.style.position = 'absolute';
          el.style.visibility = 'hidden';
          document.body.appendChild(el);
          const c = getComputedStyle(el).color;
          document.body.removeChild(el);
          const mm = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
          if (mm) rgb = [+mm[1], +mm[2], +mm[3]];
        }
      } catch (e) { rgb = null; }
    }
    _colorRgbCache.set(key, rgb);
    return rgb;
  }

  // 배경색 상대휘도 기반 자동 글자색(WCAG 휘도 공식).
  function _wikiAutoContrastColor(bg) {
    const rgb = _wikiColorToRgb(bg);
    if (!rgb) return null;
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    return lum > 0.5 ? '#1a1a1a' : '#f5f5f5';
  }

  function _isSafeCssColor(value) {
    if (!value || typeof value !== 'string') return false;
    const lower = value.toLowerCase().replace(/\s/g, '');
    // 빌트인 팔레트 토큰 참조만 예외 허용(임의 var() 주입은 아래에서 차단).
    if (/^var\(--wiki-palette-[a-z]+-(?:bg|text)\)$/.test(lower)) return true;
    if (lower.includes('url(') || lower.includes('expression(') || lower.includes('var(') || lower.includes('env(')) return false;
    if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('color', value);
    return /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(rgb|hsl)a?\([0-9,.\s/%]+\))$/.test(value);
  }

  // 빌트인 팔레트 7종. 실제 색은 tsukuyomi.markup.css 의 --wiki-palette-* 토큰이 정한다.
  // (Cloudwiki 의 커스텀 팔레트는 appConfig 의존이라 제외)
  const BUILTIN_PALETTE_NAMES = new Set(['primary', 'secondary', 'success', 'info', 'warning', 'danger', 'muted']);

  // {fs:크기} 채널 enum — .wiki-fs-* 클래스와 1:1 대응.
  const WIKI_FS_SIZES = new Set(['xs', 'sm', 'lg', 'xl', 'xxl']);

  // {palette:이름} → {bg:var(..)}{color:var(..)}. 미등록 이름은 원문 유지(뒤 파서가 무시).
  function _resolvePaletteTokens(text) {
    if (!text || typeof text !== 'string') return text;
    if (text.indexOf('{palette:') === -1) return text;
    return text.replace(/\{palette:\s*([^}\s][^}]*?)\s*\}/g, (match, nameRaw) => {
      const name = nameRaw.trim();
      if (!BUILTIN_PALETTE_NAMES.has(name)) return match;
      return `{bg:var(--wiki-palette-${name}-bg)}{color:var(--wiki-palette-${name}-text)}`;
    });
  }

  // ── marked 인스턴스 (전역 marked 설정을 건드리지 않도록 별도 인스턴스) ──
  let _md = null;
  function _getMd() {
    if (_md) return _md;
    if (typeof marked === 'undefined' || !marked.Marked) return null;
    const md = new marked.Marked();
    md.use({
      gfm: true,
      breaks: true,
      extensions: [
        {
          // [{palette|bg|color|fs:..}]*==text== — 선행 스타일 토큰을 흡수하는 강조.
          name: 'highlight',
          level: 'inline',
          start(src) {
            let min = -1;
            for (const needle of ['==', '{color:', '{bg:', '{palette:', '{fs:']) {
              const idx = src.indexOf(needle);
              if (idx >= 0 && (min === -1 || idx < min)) min = idx;
            }
            return min;
          },
          tokenizer(src) {
            const match = src.match(/^((?:\{(?:palette|bg|color|fs):[^}]+\})*)==([^=]+)==/);
            if (match && match[2]) {
              const token = { type: 'highlight', raw: match[0], prefix: match[1] || '', text: match[2], tokens: [] };
              this.lexer.inline(token.text, token.tokens);
              return token;
            }
          },
          childTokens: ['tokens'],
          renderer(token) {
            // 채널별 소스: 뒤 토큰이 앞을 덮어쓴다. 빌트인 {palette:} 는 클래스, {bg:}/{color:} 는 인라인.
            let bgCh = null, colorCh = null;
            let fsVal = '';
            if (token.prefix) {
              const re = /\{(palette|bg|color|fs):\s*([^}]+?)\s*\}/g;
              let m;
              while ((m = re.exec(token.prefix)) !== null) {
                const kind = m[1];
                const val = m[2].trim();
                if (kind === 'bg') bgCh = { kind: 'literal', value: val };
                else if (kind === 'color') colorCh = { kind: 'literal', value: val };
                else if (kind === 'fs') { if (WIKI_FS_SIZES.has(val)) fsVal = val; }
                else if (BUILTIN_PALETTE_NAMES.has(val)) {
                  bgCh = { kind: 'palette', value: val };
                  colorCh = { kind: 'palette', value: val };
                }
              }
            }
            const inner = this.parser.parseInline(token.tokens);
            const classes = [];
            if (fsVal) classes.push('wiki-fs-' + fsVal);
            let style = '';
            let hasBg = false, hasColor = false;
            if (bgCh) {
              if (bgCh.kind === 'palette') { classes.push('wiki-palette-' + bgCh.value); hasBg = true; }
              else if (_isSafeCssColor(bgCh.value)) { style += `background-color:${bgCh.value};`; hasBg = true; }
            }
            if (colorCh) {
              if (colorCh.kind === 'palette') { classes.push('wiki-palette-' + colorCh.value); hasColor = true; }
              else if (_isSafeCssColor(colorCh.value)) { style += `color:${colorCh.value};`; hasColor = true; }
            }
            // 글자색만: 형광펜 없는 <span>
            if (hasColor && !hasBg && colorCh.kind === 'literal') {
              const fsClassAttr = fsVal ? ` class="wiki-fs-${fsVal}"` : '';
              return `<span${fsClassAttr} style="color:${colorCh.value};">` + inner + '</span>';
            }
            // 크기만: <span>
            if (fsVal && !hasBg && !hasColor) return `<span class="wiki-fs-${fsVal}">` + inner + '</span>';
            // 스타일 토큰이 하나도 적용되지 않은 ==텍스트== 는 강조 없이 본문만.
            if (!classes.length && !style) return inner;
            const classAttr = classes.length ? ` class="${[...new Set(classes)].join(' ')}"` : '';
            const styleAttr = style ? ` style="${style}"` : '';
            return `<mark${classAttr}${styleAttr}>` + inner + '</mark>';
          },
        },
        {
          name: 'underline',
          level: 'inline',
          start(src) { return src.indexOf('__'); },
          tokenizer(src) {
            const match = src.match(/^__([^_]+(?:_[^_]+)*)__/);
            if (match) {
              const token = { type: 'underline', raw: match[0], text: match[1], tokens: [] };
              this.lexer.inline(token.text, token.tokens);
              return token;
            }
          },
          childTokens: ['tokens'],
          renderer(token) {
            return '<u>' + this.parser.parseInline(token.tokens) + '</u>';
          },
        },
        {
          // ![alt](url){size:..}{align:..}{caption:..} — 접미 토큰 순서 무관.
          name: 'customImage',
          level: 'inline',
          start(src) { return src.indexOf('!['); },
          tokenizer(src) {
            const match = src.match(/^!\[([^\]]*)\]\(([^)]+)\)((?:\{size:\s*(?:icon|small|medium|full)\s*\}|\{align:\s*(?:left|center|right)\s*\}|\{caption:[^}\n]*\})+)/);
            if (match) {
              const tokenStr = match[3];
              const size = (tokenStr.match(/\{size:\s*(icon|small|medium|full)\s*\}/) || [])[1] || '';
              const align = (tokenStr.match(/\{align:\s*(left|center|right)\s*\}/) || [])[1] || '';
              const capM = tokenStr.match(/\{caption:([^}\n]*)\}/);
              return {
                type: 'customImage', raw: match[0], text: match[1], href: match[2],
                size, align, caption: capM ? capM[1].trim() : '',
              };
            }
          },
          renderer(token) {
            let style = '';
            if (token.size === 'icon') style = 'height: 1.2em; width: auto; display: inline-block; vertical-align: middle; margin: 0 2px;';
            else if (token.size === 'small') style = 'max-width: 25%; height: auto;';
            else if (token.size === 'medium') style = 'max-width: 50%; height: auto;';
            else if (token.size === 'full') style = 'max-width: 100%; height: auto;';
            const sizeAttr = token.size ? ` data-size="${token.size}"` : '';
            const alignAttr = token.align ? ` data-align="${token.align}"` : '';
            const captionAttr = token.caption ? ` data-caption="${escapeHtml(token.caption)}"` : '';
            return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}" style="${style}"${sizeAttr}${alignAttr}${captionAttr}>`;
          },
        },
        {
          // 각주: [* 내용] 익명 / [*이름 내용] 이름 있는 정의 / [*이름] 재참조.
          name: 'wikiFootnote',
          level: 'inline',
          start(src) { return src.indexOf('[*'); },
          tokenizer(src) {
            if (src.charCodeAt(0) !== 91 || src.charCodeAt(1) !== 42) return;
            const m = src.match(/^\[\*((?:[^\[\]\n]|\[[^\[\]\n]*\]|\[)*)\](?!\()/);
            if (!m) return;
            const body = m[1];
            let name = '', content = '', isRef = false;
            if (/^\s/.test(body)) {
              content = body.replace(/^\s+/, '');
              if (content === '') return;
            } else {
              const sp = body.search(/\s/);
              if (sp === -1) { name = body.trim(); isRef = true; }
              else { name = body.slice(0, sp).trim(); content = body.slice(sp + 1).replace(/^\s+/, ''); }
              if (!name || !/^[\w.\-À-￿]+$/.test(name)) return;
            }
            const token = { type: 'wikiFootnote', raw: m[0], fnName: name, fnRef: isRef, text: content, tokens: [] };
            if (!isRef && content) this.lexer.inline(content, token.tokens);
            return token;
          },
          childTokens: ['tokens'],
          renderer(token) {
            const nameAttr = token.fnName ? ` data-fn-name="${escapeHtml(token.fnName)}"` : '';
            if (token.fnRef) return `<sup class="wiki-fn-marker"${nameAttr} data-fn-ref="1"></sup>`;
            const innerHtml = this.parser.parseInline(token.tokens);
            return `<sup class="wiki-fn-marker" data-fn-html="${escapeHtml(innerHtml)}"${nameAttr}></sup>`;
          },
        },
        {
          // {button:텍스트|url} 을 GFM 자동 링크로부터 보호. 실제 변환은 _processInlineLayoutTokens.
          name: 'wikiButton',
          level: 'inline',
          start(src) { return src.indexOf('{button:'); },
          tokenizer(src) { return _scanBracedToken(src, '{button:', 'wikiButton'); },
          renderer(token) { return token.raw; },
        },
        {
          // {embed:URL} 도 같은 이유로 보호.
          name: 'wikiEmbed',
          level: 'inline',
          start(src) { return src.indexOf('{embed:'); },
          tokenizer(src) { return _scanBracedToken(src, '{embed:', 'wikiEmbed'); },
          renderer(token) { return token.raw; },
        },
      ],
      renderer: {
        html(token) {
          const htmlStr = typeof token === 'string' ? token : (token.text || token.raw || '');
          // HTML 주석은 통과(작성자 메모용) — DOMPurify 가 최종적으로 제거한다. 그 외 raw HTML 은 escape.
          if (/^\s*<!--[\s\S]*?-->\s*$/.test(htmlStr)) return htmlStr;
          return escapeHtml(htmlStr);
        },
      },
    });
    _md = md;
    return md;
  }

  // 중괄호 균형 스캔: 중첩 {..} 를 포함한 토큰 전체를 raw 로. '<'/개행/미종결이면 포기.
  function _scanBracedToken(src, open, type) {
    if (!src.startsWith(open)) return;
    const openLen = open.length;
    let depth = 1;
    for (let i = openLen; i < src.length; i++) {
      const ch = src[i];
      if (ch === '<' || ch === '\n') return;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          if (i === openLen) return;
          return { type, raw: src.slice(0, i + 1), text: src.slice(openLen, i) };
        }
      }
    }
  }

  // ── :::meta 문서 변수 ──
  // :::meta 블록의 `키 = 값` 을 수집해 제거하고 {{{@키}}} / {{{@키|기본값}}} 를 치환한다.
  // 수집한 값은 카드 제목/리드 등 호출자도 쓰도록 반환한다(Cloudwiki 대비 추가).
  function _applyDocMetaVars(content) {
    const meta = {};
    if (typeof content !== 'string') return { text: '', meta };
    let text = content.replace(/\r\n?/g, '\n');
    if (text.indexOf(':::meta') === -1 && text.indexOf('{{{@') === -1) return { text, meta };

    const codeBlocks = [];
    const md = _getMd();
    if (md) {
      try {
        const tokens = md.lexer(text);
        md.walkTokens(tokens, token => {
          if (token.type === 'code' || token.type === 'codespan') {
            const raw = token.raw;
            if (text.includes(raw)) {
              const idx = codeBlocks.length;
              codeBlocks.push(raw);
              text = text.replace(raw, `\x00METACODE_${idx}\x00`);
            }
          }
        });
      } catch (e) { /* lexer 실패 시 보호 없이 진행 */ }
    }

    text = text.replace(/^:::meta[ \t]*\n([\s\S]*?)\n:::[ \t]*$\n?/gm, (whole, bodyText) => {
      bodyText.split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq === -1) return;
        const key = line.slice(0, eq).trim();
        if (!key) return;
        meta[key] = line.slice(eq + 1).trim();
      });
      return '';
    });

    if (text.indexOf('{{{@') !== -1) {
      const refs = _findParamRefs(text);
      if (refs.length > 0) {
        let out = '';
        let cursor = 0;
        for (const ref of refs) {
          out += text.substring(cursor, ref.start);
          const parts = _splitPipeTopLevel(ref.raw);
          const key = (parts.shift() || '').trim();
          if (key.charCodeAt(0) === 64 /* @ */) {
            const name = key.slice(1);
            const def = parts.length > 0 ? parts.join('|') : undefined;
            if (Object.prototype.hasOwnProperty.call(meta, name)) out += meta[name];
            else if (def !== undefined) out += def;
          } else {
            out += text.substring(ref.start, ref.fullEnd);
          }
          cursor = ref.fullEnd;
        }
        out += text.substring(cursor);
        text = out;
      }
    }

    text = text.replace(/\x00METACODE_(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i, 10)]);
    return { text, meta };
  }

  // ── 헤딩 {collapse} + 섹션 접기 ──
  const WIKI_COLLAPSE_TOKEN_RE = /\s*\{\s*collapse\s*\}\s*#*\s*$/;
  const HEADING_SEL = 'h1, h2, h3, h4, h5, h6';

  // 헤딩 끝의 {collapse} 를 제거하고 기본 접힘 마커를 단다. 하나라도 있으면 true.
  function _applyHeadingCollapseTokens(containerEl) {
    let any = false;
    containerEl.querySelectorAll(HEADING_SEL).forEach(h => {
      if (h.closest('.wiki-footnotes')) return;
      const last = h.lastChild;
      if (!last || last.nodeType !== 3) return;
      const val = last.nodeValue || '';
      if (!WIKI_COLLAPSE_TOKEN_RE.test(val)) return;
      const stripped = val.replace(WIKI_COLLAPSE_TOKEN_RE, '');
      if (stripped === '') h.removeChild(last);
      else last.nodeValue = stripped;
      h.dataset.wikiCollapseDefault = '1';
      any = true;
    });
    return any;
  }

  function _makeCollapsibleSections(containerEl) {
    const headings = Array.from(containerEl.children).filter(el => /^H[1-6]$/.test(el.tagName));
    if (headings.length < 1) return;
    const minLevel = Math.min(...headings.map(h => parseInt(h.tagName[1], 10)));
    _wrapLevelSections(containerEl, minLevel);
  }

  function _wrapLevelSections(containerEl, level) {
    if (level > 6) return;
    const tagName = 'H' + level;
    const children = Array.from(containerEl.childNodes);
    const inners = [];
    let i = 0;
    while (i < children.length) {
      const child = children[i];
      if (child.nodeName !== tagName) { i++; continue; }

      // flex 헤딩에서 텍스트/코드가 따로 줄바꿈되지 않도록 단일 span 으로 감싼다.
      let textWrapper = child.querySelector(':scope > .wiki-section-heading-text');
      if (!textWrapper) {
        textWrapper = document.createElement('span');
        textWrapper.className = 'wiki-section-heading-text';
        while (child.firstChild) textWrapper.appendChild(child.firstChild);
        child.appendChild(textWrapper);
      }
      if (!textWrapper.querySelector(':scope > .wiki-section-toggle-icon')) {
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'wiki-section-toggle-icon';
        toggleIcon.innerHTML = '<i class="bi bi-chevron-down"></i>';
        textWrapper.insertBefore(toggleIcon, textWrapper.firstChild);
      }
      child.classList.add('wiki-section-heading');

      const section = document.createElement('div');
      section.className = 'wiki-section wiki-section-level-' + level;
      if (child.dataset && child.dataset.wikiCollapseDefault === '1') section.classList.add('wiki-section-collapsed');
      child.parentNode.insertBefore(section, child);
      section.appendChild(child);

      const body = document.createElement('div');
      body.className = 'wiki-section-body';
      section.appendChild(body);
      const bodyInner = document.createElement('div');
      bodyInner.className = 'wiki-section-body-inner';
      body.appendChild(bodyInner);
      inners.push(bodyInner);

      let j = i + 1;
      while (j < children.length) {
        const sibling = children[j];
        const m = sibling.nodeName.match(/^H(\d)$/);
        if (m && parseInt(m[1], 10) <= level) break;
        let isHigherOrEqualSection = false;
        if (sibling.nodeType === 1 && sibling.classList.contains('wiki-section')) {
          for (let l = 1; l <= level; l++) {
            if (sibling.classList.contains('wiki-section-level-' + l)) { isHigherOrEqualSection = true; break; }
          }
        }
        if (isHigherOrEqualSection) break;
        bodyInner.appendChild(sibling);
        j++;
      }

      child.setAttribute('tabindex', '0');
      child.setAttribute('role', 'button');
      const syncExpanded = () => child.setAttribute('aria-expanded', section.classList.contains('wiki-section-collapsed') ? 'false' : 'true');
      syncExpanded();
      const toggle = () => { section.classList.toggle('wiki-section-collapsed'); syncExpanded(); };
      child.addEventListener('click', e => {
        if (e.target.closest('a, button')) return;
        toggle();
      });
      child.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
      i = j;
    }
    inners.forEach(inner => _wrapLevelSections(inner, level + 1));
    _wrapLevelSections(containerEl, level + 1);
  }

  // ── 인라인 아이콘 {bi:이름} / {icon:bi-이름} ──
  // (Cloudwiki processWikiLinks 의 아이콘 부분. 위키링크·{mdi:} 는 제외)
  function _processInlineIcons(contentEl) {
    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement && node.parentElement.closest('code, pre')) continue;
      const val = node.nodeValue;
      if (val.includes('{bi:') || val.includes('{icon:')) textNodes.push(node);
    }
    textNodes.forEach(node => {
      const parts = node.nodeValue.split(/((?<!\{)\{bi:[\w-]+\}(?!\})|(?<!\{)\{icon:[\w-]+\}(?!\}))/g).filter(Boolean);
      if (parts.length === 1) return;
      const frag = document.createDocumentFragment();
      parts.forEach(part => {
        let cls = '';
        if (part.startsWith('{bi:') && part.endsWith('}')) cls = 'bi bi-' + part.slice(4, -1);
        else if (part.startsWith('{icon:bi-') && part.endsWith('}')) cls = 'bi ' + part.slice(6, -1);
        if (cls) {
          const i = document.createElement('i');
          i.className = cls;
          i.setAttribute('aria-hidden', 'true');
          frag.appendChild(i);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  // ── 각주 ──
  let _fnUniqueCounter = 0;
  const _FN_ALLOWED_TAGS = ['strong', 'em', 'code', 's', 'del', 'a', 'span', 'i', 'b', 'u', 'mark', 'sup', 'sub', 'br'];
  const _FN_ALLOWED_ATTR = ['href', 'title', 'class', 'style', 'target', 'rel'];

  // 각주 원문은 속성으로 보호돼 문서 전체 토큰 패스를 거치지 않았으므로 여기서 적용한다.
  // 블록 컴포넌트(stat/progress)는 아래 허용 목록에 div 가 없어 텍스트만 남는다.
  function _sanitizeFootnoteHtml(html) {
    const src = _processTimestampsInHtml(_processInlineLayoutTokens(html == null ? '' : String(html)));
    if (typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(src, { ALLOWED_TAGS: _FN_ALLOWED_TAGS, ALLOWED_ATTR: _FN_ALLOWED_ATTR });
    }
    return escapeHtml(src);
  }

  function _fnBackLabel(i) {
    return i < 26 ? String.fromCharCode(97 + i) : String(i + 1);
  }

  function _processFootnotes(contentEl) {
    const markers = Array.from(contentEl.querySelectorAll('sup.wiki-fn-marker[data-fn-html], sup.wiki-fn-marker[data-fn-ref]'));
    if (markers.length === 0) return;

    // 번호는 문서상 첫 등장 순. 이름 있는 각주는 번호·내용을 공유하고 참조마다 백링크를 갖는다.
    let footnoteIndex = 0;
    const order = [];
    const namedEntries = new Map();
    markers.forEach(marker => {
      const name = marker.getAttribute('data-fn-name');
      const rawHtml = marker.hasAttribute('data-fn-html') ? (marker.getAttribute('data-fn-html') || '') : null;
      if (!name) {
        footnoteIndex++;
        order.push({ num: footnoteIndex, html: _sanitizeFootnoteHtml(rawHtml || ''), refs: [marker] });
      } else {
        let entry = namedEntries.get(name);
        if (!entry) {
          footnoteIndex++;
          entry = { num: footnoteIndex, html: null, refs: [] };
          namedEntries.set(name, entry);
          order.push(entry);
        }
        if (rawHtml != null && entry.html == null) entry.html = _sanitizeFootnoteHtml(rawHtml);
        entry.refs.push(marker);
      }
    });

    order.forEach(entry => {
      const uniqueId = ++_fnUniqueCounter;
      entry.fnId = `wiki-fn-${entry.num}-${uniqueId}`;
      entry.refIds = entry.refs.map((_, i) => `wiki-fn-ref-${entry.num}-${uniqueId}-${i}`);
    });

    order.forEach(entry => {
      const multi = entry.refs.length > 1;
      entry.refs.forEach((marker, i) => {
        const sup = document.createElement('sup');
        sup.className = 'wiki-fn-ref';
        const a = document.createElement('a');
        a.href = `#${entry.fnId}`;
        a.id = entry.refIds[i];
        a.textContent = multi ? `[${entry.num}-${_fnBackLabel(i)}]` : `[${entry.num}]`;
        // 툴팁 내용(이미 정화된 HTML)은 속성 대신 프로퍼티로 보관한다.
        if (entry.html) a._wikiFnHtml = entry.html;
        a.addEventListener('click', e => {
          e.preventDefault();
          // 터치 환경은 탭 = 툴팁 토글, 그 외는 각주 목록으로 스크롤.
          if (_isCoarsePointer() && a._wikiFnHtml) _toggleFnTip(a);
          else _scrollToTarget(document.getElementById(entry.fnId));
        });
        sup.appendChild(a);
        if (marker.parentNode) marker.parentNode.replaceChild(sup, marker);
      });
    });

    const fnSection = document.createElement('div');
    fnSection.className = 'wiki-footnotes';
    fnSection.innerHTML = '<hr><h4><i class="bi bi-card-text" aria-hidden="true"></i> 각주</h4>';
    const ol = document.createElement('ol');
    order.forEach(entry => {
      const li = document.createElement('li');
      li.id = entry.fnId;
      li.value = entry.num;
      const backTargets = entry.refs.length === 1 ? [entry.refIds[0]] : entry.refIds;
      backTargets.forEach((rid, i) => {
        const backLink = document.createElement('a');
        backLink.href = `#${rid}`;
        if (entry.refs.length === 1) {
          backLink.className = 'wiki-fn-back';
          backLink.innerHTML = '<i class="bi bi-arrow-return-left"></i>';
          backLink.title = '본문으로 돌아가기';
        } else {
          backLink.className = 'wiki-fn-back wiki-fn-back-multi';
          backLink.textContent = _fnBackLabel(i);
          backLink.title = '이 참조 위치로 돌아가기';
        }
        backLink.addEventListener('click', e => {
          e.preventDefault();
          _scrollToTarget(document.getElementById(rid));
        });
        li.appendChild(backLink);
      });
      const span = document.createElement('span');
      span.innerHTML = ' ' + (entry.html != null ? entry.html : '<span class="wiki-muted">(내용 없음)</span>');
      li.appendChild(span);
      ol.appendChild(li);
    });
    fnSection.appendChild(ol);
    contentEl.appendChild(fnSection);
  }

  // ── 각주 툴팁 (Bootstrap Popover 대체) ──
  // 카드가 overflow 스크롤 컨테이너라 툴팁은 body 에 fixed 로 띄운다(잘림 방지).
  let _fnTip = null;
  let _fnTipAnchor = null;

  function _isCoarsePointer() {
    return !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  }

  function _ensureFnTip() {
    if (_fnTip) return _fnTip;
    _fnTip = document.createElement('div');
    _fnTip.className = 'wiki-fn-tip';
    _fnTip.setAttribute('role', 'tooltip');
    _fnTip.hidden = true;
    document.body.appendChild(_fnTip);
    const hide = () => _hideFnTip();
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('pointerdown', e => {
      if (_fnTipAnchor && e.target !== _fnTipAnchor && !_fnTip.contains(e.target)) _hideFnTip();
    });
    return _fnTip;
  }

  function _showFnTip(a) {
    if (!a._wikiFnHtml || !a.isConnected) return;
    const tip = _ensureFnTip();
    tip.innerHTML = a._wikiFnHtml;
    tip.hidden = false;
    _fnTipAnchor = a;
    const r = a.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const margin = 8;
    let top = r.top - th - margin;
    if (top < margin) top = r.bottom + margin;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  }

  function _hideFnTip() {
    if (!_fnTip || _fnTip.hidden) return;
    _fnTip.hidden = true;
    _fnTip.innerHTML = '';
    _fnTipAnchor = null;
  }

  function _toggleFnTip(a) {
    if (_fnTipAnchor === a) _hideFnTip();
    else _showFnTip(a);
  }

  function _bindFootnoteTips(root) {
    root.querySelectorAll('sup.wiki-fn-ref > a').forEach(a => {
      if (!a._wikiFnHtml) return;
      a.addEventListener('mouseenter', () => { if (!_isCoarsePointer()) _showFnTip(a); });
      a.addEventListener('mouseleave', () => { if (!_isCoarsePointer()) _hideFnTip(); });
      a.addEventListener('focus', () => _showFnTip(a));
      a.addEventListener('blur', () => _hideFnTip());
    });
  }

  // 접힌 조상(details·섹션·탭)을 펼친 뒤 카드 안에서 대상으로 스크롤.
  function _scrollToTarget(el) {
    if (!el) return;
    let node = el.parentElement;
    while (node) {
      if (node.tagName === 'DETAILS' && !node.open) node.open = true;
      if (node.classList && node.classList.contains('wiki-section-collapsed')) node.classList.remove('wiki-section-collapsed');
      if (node.classList && node.classList.contains('wiki-tab-pane') && node.hidden) {
        const btn = document.querySelector(`[data-wiki-tab="${CSS.escape(node.id)}"]`);
        if (btn) _activateTab(btn);
      }
      node = node.parentElement;
    }
    el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' });
  }

  // ── ::: 블록 디렉티브 ──
  function _nextBlockId(prefix) {
    _blockSeq++;
    return `${prefix}-${_blockSeq}`;
  }

  function _dedupAnchorDomId(name) {
    const n = _anchorIds[name] || 0;
    _anchorIds[name] = n + 1;
    return n === 0 ? name : `${name}-${n + 1}`;
  }

  // 컨테이너 블록 innerText 의 WIKIBLOCKPH<i>XEND 를 순서대로 자식 블록으로 수집.
  function _collectWikiChildBlocks(parentInnerText, blockData, allowedTypes) {
    if (!parentInnerText) return [];
    const re = /WIKIBLOCKPH(\d+)XEND/g;
    const out = [];
    let m;
    while ((m = re.exec(parentInnerText)) !== null) {
      const child = blockData[parseInt(m[1], 10)];
      if (!child) continue;
      if (allowedTypes && !allowedTypes.includes(child.type)) continue;
      out.push(child);
    }
    return out;
  }

  // 스키마에 있는 토큰만 추출해 제목에서 제거. enum 검증으로 자유 CSS 를 막는다.
  function _extractStrictTokens(titleLine, schema) {
    let t = titleLine || '';
    const found = {};
    for (const key of Object.keys(schema)) {
      const spec = schema[key];
      if (spec.type === 'enum') {
        const m = t.match(new RegExp(`\\{${key}:\\s*([^}\\s]+)\\s*\\}`));
        if (m) {
          const v = m[1].trim();
          if (spec.values.includes(v)) found[key] = v;
          t = t.replace(m[0], '');
        }
      } else if (spec.type === 'flag') {
        const m = t.match(new RegExp(`\\{${key}\\}`));
        if (m) { found[key] = true; t = t.replace(m[0], ''); }
      } else if (spec.type === 'icon') {
        const m = t.match(new RegExp(`\\{${key}:\\s*([a-zA-Z0-9_-]+)\\s*\\}`));
        if (m) {
          const v = m[1].trim();
          if (/^bi-[a-zA-Z0-9_-]+$/.test(v)) found[key] = v;
          t = t.replace(m[0], '');
        }
      } else if (spec.type === 'id') {
        const m = t.match(new RegExp(`\\{${key}:\\s*([a-zA-Z0-9_-]+)\\s*\\}`));
        if (m) { found[key] = m[1].trim(); t = t.replace(m[0], ''); }
      }
    }
    return { cleanTitle: t.replace(/\s+/g, ' ').trim(), tokens: found };
  }

  // marked 결과에 공통 후처리(체크박스 아이콘, {size:} 접미, 중첩 블록 치환)를 적용.
  function _parseBlockMarkdown(innerText, blockData) {
    const md = _getMd();
    let html = md.parse(innerText || '');
    html = _replaceTaskCheckboxesWithIcons(html);
    html = html.replace(/<img([^>]*)>\s*\{size:([a-zA-Z0-9_-]+)\}/g, (_, attrs, size) => `<img${attrs} data-size="${size.trim()}">`);
    html = html.replace(/(?:<p>)?WIKIBLOCKPH(\d+)XEND(?:<\/p>)?/g, (m, i) => {
      const sub = blockData[parseInt(i, 10)];
      return sub ? _renderBlockHtml(sub, blockData) : '';
    });
    return html;
  }

  function _iconHtmlFromToken(iconCode) {
    if (!iconCode || !iconCode.startsWith('bi-')) return '';
    return `<i class="bi ${escapeHtml(iconCode)}" aria-hidden="true"></i>`;
  }

  function _restoreCodeSpans(text) {
    if (!text || !_codeSpans) return text;
    return text.replace(/WIKICODEFPH(\d+)XEND/g, (m, i) => {
      const src = _codeSpans[parseInt(i, 10)];
      return src === undefined ? m : src;
    });
  }

  // 평문 라벨 채널(탭/아코디언/스텝 라벨, 펼치기 요약)용 escape + 코드 스팬만 <code> 승격.
  function _escapeLabelWithCodeSpans(text) {
    const esc = escapeHtml(text || '');
    return esc.replace(/`([^`\n]+)`/g, (m, code) => `<code>${code}</code>`);
  }

  // 라인 기반 스택 파서: `:::type 제목` 오프너와 단독 `:::` 클로저. 미종결 블록은 원문 복원.
  function _preprocessBlockDirectives(text) {
    if (!text || text.indexOf(':::') === -1) return { text, blockData: [] };
    const lines = text.split('\n');
    const blockData = [];
    const root = { contentLines: [] };
    const stack = [root];
    const openRe = /^:::([a-zA-Z][a-zA-Z0-9_-]*)(?:[ \t]+(.*))?[ \t]*$/;
    const closeRe = /^:::[ \t]*$/;
    for (const line of lines) {
      const om = line.match(openRe);
      if (om) {
        stack.push({ type: om[1], titleLine: (om[2] || '').trim(), contentLines: [] });
        continue;
      }
      if (closeRe.test(line) && stack.length > 1) {
        const frame = stack.pop();
        const idx = blockData.length;
        blockData.push({ type: frame.type, titleLine: frame.titleLine, innerText: frame.contentLines.join('\n') });
        stack[stack.length - 1].contentLines.push(`\n\nWIKIBLOCKPH${idx}XEND\n\n`);
        continue;
      }
      stack[stack.length - 1].contentLines.push(line);
    }
    while (stack.length > 1) {
      const orphan = stack.pop();
      const literal = `:::${orphan.type}${orphan.titleLine ? ' ' + orphan.titleLine : ''}\n` + orphan.contentLines.join('\n');
      stack[stack.length - 1].contentLines.push(literal);
    }
    return { text: root.contentLines.join('\n'), blockData };
  }

  // 제목 줄의 {palette:}/{bg:}/{color:} 를 흡수.
  function _extractBlockStyleTokens(titleLine) {
    let t = _resolvePaletteTokens(titleLine || '');
    let bg = '', color = '';
    let replaced = true;
    while (replaced) {
      replaced = false;
      const bm = t.match(/\{bg:\s*([^}]+)\}/);
      if (bm) { bg = bm[1].trim(); t = t.replace(bm[0], ''); replaced = true; }
      const cm = t.match(/\{color:\s*([^}]+)\}/);
      if (cm) { color = cm[1].trim(); t = t.replace(cm[0], ''); replaced = true; }
    }
    t = t.replace(/\{palette:\s*[^}]*\}/g, '');
    return { cleanTitle: t.trim(), bg, color };
  }

  // 인포박스: 구분 행 없는 `| 키 | 값 |` 나열에 구분 행을 합성해 GFM 표로 만든다.
  function _normalizeBareTableRows(src) {
    if (!src || src.indexOf('|') === -1) return src;
    const lines = src.split('\n');
    const out = [];
    let inFence = false;
    const rowRe = /^\s*\|.*\|\s*$/;
    const delimRe = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(```|~~~)/.test(line.trim())) { inFence = !inFence; out.push(line); continue; }
      const isBareFirstRow = !inFence && rowRe.test(line)
        && !(i > 0 && rowRe.test(lines[i - 1]))
        && !delimRe.test(i + 1 < lines.length ? lines[i + 1] : '');
      if (!isBareFirstRow) { out.push(line); continue; }
      if (i > 0 && lines[i - 1].trim() !== '') out.push('');
      out.push(line);
      const cols = line.replace(/\\\|/g, '\x00').trim().replace(/^\|/, '').replace(/\|$/, '').split('|').length;
      out.push('|' + new Array(cols).fill(' --- ').join('|') + '|');
    }
    return out.join('\n');
  }

  const WIKI_FLOAT_TOKEN_SCHEMA = {
    left: { type: 'flag' },
    right: { type: 'flag' },
    span: { type: 'enum', values: ['3', '4', '5', '6'] },
  };

  const CALLOUT_META = {
    info: { icon: 'bi-info-circle', title: '정보' },
    tip: { icon: 'bi-lightbulb', title: '팁' },
    success: { icon: 'bi-check-circle', title: '성공' },
    warning: { icon: 'bi-exclamation-triangle', title: '주의' },
    danger: { icon: 'bi-exclamation-octagon', title: '위험' },
    note: { icon: 'bi-journal-text', title: '노트' },
  };

  function _renderInlineTitle(text) {
    if (!text) return '';
    return _processInlineLayoutTokens(_getMd().parseInline(text));
  }

  function _renderBlockHtml(block, blockData) {
    const type = block.type;
    const { cleanTitle, bg, color } = _extractBlockStyleTokens(block.titleLine);
    let innerText = block.innerText || '';
    if (type === 'infobox') innerText = _normalizeBareTableRows(innerText);
    // 색 토큰은 헤더 줄에서만 흡수한다. 본문 줄의 색 토큰은 인라인 컴포넌트 프리픽스로 남는다.
    const innerHtml = _parseBlockMarkdown(innerText, blockData);

    let style = '';
    if (bg && _isSafeCssColor(bg)) style += `background-color:${bg};`;
    if (color && _isSafeCssColor(color)) style += `color:${color};`;
    const styleAttr = style ? ` style="${style}"` : '';
    // 옵션 토큰 추출 뒤에 코드 스팬을 복원한다(제목의 인라인 코드가 옵션으로 소비되지 않게).
    const titleHtml = _renderInlineTitle(_restoreCodeSpans(cleanTitle));

    switch (type) {
      case 'card': {
        // 제목이 있으면 헤더에, 없으면 본문에 색을 입힌다.
        const headerStyleAttr = titleHtml ? styleAttr : '';
        const bodyStyleAttr = titleHtml ? '' : styleAttr;
        return `<div class="wiki-card">` +
          (titleHtml ? `<div class="wiki-card-header"${headerStyleAttr}>${titleHtml}</div>` : '') +
          `<div class="wiki-card-body"${bodyStyleAttr}>${innerHtml}</div>` +
          `</div>`;
      }
      case 'grid': {
        const { tokens: gt } = _extractStrictTokens(block.titleLine, {
          cols: { type: 'enum', values: ['2', '3', '4', '5', '6'] },
          template: { type: 'enum', values: ['1-1', '1-2', '2-1', '1-3', '3-1', '1-1-1', '1-2-1', '2-1-1', '1-1-2', '1-1-1-1'] },
          gap: { type: 'enum', values: ['sm', 'md', 'lg'] },
          align: { type: 'enum', values: ['start', 'center', 'stretch'] },
        });
        // 화이트리스트 밖 정수 비율({template:8-4} 등)은 인라인 grid-template-columns 로.
        let customCols = '';
        if (!gt.template) {
          const cm = block.titleLine.match(/\{template:\s*([0-9]+(?:-[0-9]+)+)\s*\}/);
          if (cm) {
            const parts = cm[1].split('-').map(n => parseInt(n, 10));
            if (parts.length >= 2 && parts.length <= 6 && parts.every(n => n >= 1 && n <= 12)) {
              customCols = parts.map(n => `${n}fr`).join(' ');
            }
          }
        }
        const gridCls = ['wiki-grid'];
        if (customCols) gridCls.push('wiki-grid--grid');
        else if (gt.template) gridCls.push('wiki-grid--grid', `wiki-grid--tpl-${gt.template}`);
        else if (gt.cols) gridCls.push('wiki-grid--grid', `wiki-grid--cols-${gt.cols}`);
        if (gt.gap) gridCls.push(`wiki-grid--gap-${gt.gap}`);
        if (gt.align) gridCls.push(`wiki-grid--align-${gt.align}`);
        const gridStyle = customCols ? `${style}grid-template-columns:${customCols};` : style;
        const gridStyleAttr = gridStyle ? ` style="${gridStyle}"` : '';
        return `<div class="${gridCls.join(' ')}"${gridStyleAttr}>${innerHtml}</div>`;
      }
      case 'row':
        return `<div class="wiki-row"${styleAttr}>${innerHtml}</div>`;
      case 'canvas': {
        // 12컬럼 자유 배치. 자식 :::area {span:N} 이 폭을 선언한다.
        const { tokens: ct } = _extractStrictTokens(block.titleLine, {
          gap: { type: 'enum', values: ['sm', 'md', 'lg'] },
        });
        const children = _collectWikiChildBlocks(block.innerText, blockData, ['area']);
        if (children.length === 0) return `<div class="wiki-canvas-empty"></div>`;
        const canvasCls = ['wiki-canvas'];
        if (ct.gap) canvasCls.push(`wiki-canvas--gap-${ct.gap}`);
        const spanValues = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
        const areas = children.map(child => {
          const meta = _extractStrictTokens(child.titleLine, {
            span: { type: 'enum', values: spanValues },
            'span-md': { type: 'enum', values: spanValues },
            order: { type: 'enum', values: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] },
            sticky: { type: 'flag' },
            panel: { type: 'flag' },
          });
          const cs = _extractBlockStyleTokens(child.titleLine);
          let areaStyle = '';
          if (cs.bg && _isSafeCssColor(cs.bg)) areaStyle += `background-color:${cs.bg};`;
          if (cs.color && _isSafeCssColor(cs.color)) areaStyle += `color:${cs.color};`;
          const areaStyleAttr = areaStyle ? ` style="${areaStyle}"` : '';
          const cls = ['wiki-area'];
          if (meta.tokens.span) cls.push(`wiki-area--span-${meta.tokens.span}`);
          if (meta.tokens['span-md']) cls.push(`wiki-area--span-md-${meta.tokens['span-md']}`);
          if (meta.tokens.order) cls.push(`wiki-area--order-${meta.tokens.order}`);
          if (meta.tokens.sticky) cls.push('wiki-area--sticky');
          if (meta.tokens.panel) cls.push('wiki-area--panel');
          return `<div class="${cls.join(' ')}"${areaStyleAttr}>${_parseBlockMarkdown(child.innerText, blockData)}</div>`;
        });
        return `<div class="${canvasCls.join(' ')}">${areas.join('')}</div>`;
      }
      case 'float':
      case 'infobox': {
        // 본문이 옆을 감싸는 좌/우 패널. 좁은 폭에서는 CSS 가 float 를 해제한다.
        const { cleanTitle: floatTitleRaw, tokens: ft } = _extractStrictTokens(cleanTitle, WIKI_FLOAT_TOKEN_SCHEMA);
        const side = (ft.left && !ft.right) ? 'left' : 'right';
        const floatCls = `wiki-float wiki-float--${side} wiki-float--span-${ft.span || '4'}`;
        const floatTitleHtml = _renderInlineTitle(_restoreCodeSpans(floatTitleRaw));
        if (type === 'float') {
          return `<aside class="${floatCls}"${styleAttr}>` +
            (floatTitleHtml ? `<div class="wiki-float-title">${floatTitleHtml}</div>` : '') +
            innerHtml +
            `</aside>`;
        }
        return `<aside class="${floatCls} wiki-infobox">` +
          (floatTitleHtml ? `<div class="wiki-infobox-title"${styleAttr}>${floatTitleHtml}</div>` : '') +
          `<div class="wiki-infobox-body">${innerHtml}</div>` +
          `</aside>`;
      }
      case 'gallery': {
        // 본문에서 <img> 만 모아 정사각 썸네일 그리드로. 캡션은 alt.
        const { tokens: galTokens } = _extractStrictTokens(block.titleLine, {
          cols: { type: 'enum', values: ['2', '3', '4', '5', '6'] },
        });
        const imgTagRe = /<img\b[^>]*>/g;
        const galleryImgs = [];
        let imgTagM;
        while ((imgTagM = imgTagRe.exec(innerHtml)) !== null) {
          // marked 출력에서 뽑은 값이라 이미 attribute-escape 상태.
          const src = (imgTagM[0].match(/src="([^"]*)"/) || [])[1];
          if (!src) continue;
          const alt = (imgTagM[0].match(/alt="([^"]*)"/) || [])[1] || '';
          galleryImgs.push({ src, alt });
        }
        if (galleryImgs.length === 0) return `<div class="wiki-gallery-empty"></div>`;
        const galItems = galleryImgs.map(im =>
          `<a class="wiki-gallery-item" href="${im.src}">` +
          `<span class="wiki-gallery-thumb"><img src="${im.src}" alt="${im.alt}"></span>` +
          (im.alt ? `<span class="wiki-gallery-caption">${im.alt}</span>` : '') +
          `</a>`);
        return `<div class="wiki-gallery wiki-gallery--cols-${galTokens.cols || '3'}">${galItems.join('')}</div>`;
      }
      case 'tabs': {
        // Bootstrap Tab 대체: 버튼 data-wiki-tab → 패널 id. 동작은 _bindTabs.
        const children = _collectWikiChildBlocks(block.innerText, blockData, ['tab']);
        if (children.length === 0) return `<div class="wiki-tabs-empty"></div>`;
        const groupId = _nextBlockId('wiki-tabs');
        const navItems = [];
        const panes = [];
        children.forEach((child, i) => {
          const meta = _extractStrictTokens(child.titleLine, { icon: { type: 'icon' }, id: { type: 'id' } });
          const tabId = `${groupId}-pane-${i}`;
          const navId = `${groupId}-tab-${i}`;
          const isActive = i === 0;
          const iconHtml = meta.tokens.icon ? _iconHtmlFromToken(meta.tokens.icon) + ' ' : '';
          const labelEsc = _escapeLabelWithCodeSpans(_restoreCodeSpans(meta.cleanTitle) || `탭 ${i + 1}`);
          const anchorMarker = meta.tokens.id
            ? `<span class="wiki-anchor-target" id="${escapeHtml(_dedupAnchorDomId(meta.tokens.id))}"></span>`
            : '';
          navItems.push(
            `<button class="wiki-tab-btn${isActive ? ' active' : ''}" id="${navId}" type="button" ` +
            `role="tab" data-wiki-tab="${tabId}" aria-controls="${tabId}" aria-selected="${isActive ? 'true' : 'false'}" ` +
            `tabindex="${isActive ? '0' : '-1'}">${iconHtml}${labelEsc}</button>`
          );
          panes.push(
            `<div class="wiki-tab-pane${isActive ? ' active' : ''}" id="${tabId}" role="tabpanel" ` +
            `aria-labelledby="${navId}"${isActive ? '' : ' hidden'}>${anchorMarker}${_parseBlockMarkdown(child.innerText, blockData)}</div>`
          );
        });
        return `<div class="wiki-tabs">` +
          `<div class="wiki-tabs-nav" role="tablist">${navItems.join('')}</div>` +
          `<div class="wiki-tabs-content">${panes.join('')}</div>` +
          `</div>`;
      }
      case 'accordion': {
        // Bootstrap Collapse 대체: <details>. 단일 열림은 _bindAccordions 가 형제를 닫는다.
        const { tokens } = _extractStrictTokens(block.titleLine, { multiple: { type: 'flag' } });
        const children = _collectWikiChildBlocks(block.innerText, blockData, ['item']);
        if (children.length === 0) return `<div class="wiki-accordion-empty"></div>`;
        const allowMultiple = !!tokens.multiple;
        let openSeen = false;
        const items = children.map((child, i) => {
          const meta = _extractStrictTokens(child.titleLine, { open: { type: 'flag' }, icon: { type: 'icon' }, id: { type: 'id' } });
          let isOpen = !!meta.tokens.open;
          if (isOpen && !allowMultiple) {
            if (openSeen) isOpen = false;
            else openSeen = true;
          }
          const iconHtml = meta.tokens.icon ? _iconHtmlFromToken(meta.tokens.icon) + ' ' : '';
          const labelEsc = _escapeLabelWithCodeSpans(_restoreCodeSpans(meta.cleanTitle) || `항목 ${i + 1}`);
          const anchorMarker = meta.tokens.id
            ? `<span class="wiki-anchor-target" id="${escapeHtml(_dedupAnchorDomId(meta.tokens.id))}"></span>`
            : '';
          return `<details class="wiki-acc-item"${isOpen ? ' open' : ''}>` +
            `<summary class="wiki-acc-summary">${iconHtml}${labelEsc}</summary>` +
            `<div class="wiki-acc-body">${anchorMarker}${_parseBlockMarkdown(child.innerText, blockData)}</div>` +
            `</details>`;
        });
        return `<div class="wiki-accordion"${allowMultiple ? '' : ' data-single="1"'}>${items.join('')}</div>`;
      }
      case 'steps': {
        const children = _collectWikiChildBlocks(block.innerText, blockData, ['step']);
        if (children.length === 0) return `<div class="wiki-steps-empty"></div>`;
        const items = children.map((child, i) => {
          const meta = _extractStrictTokens(child.titleLine, { status: { type: 'enum', values: ['done', 'current', 'todo'] } });
          const status = meta.tokens.status || 'todo';
          const labelEsc = _escapeLabelWithCodeSpans(_restoreCodeSpans(meta.cleanTitle) || `${i + 1}단계`);
          const ariaCurrent = status === 'current' ? ' aria-current="step"' : '';
          const iconCls = status === 'done' ? 'bi-check-circle-fill'
            : status === 'current' ? 'bi-circle-fill'
            : 'bi-circle';
          return `<li class="wiki-step wiki-step-${status}"${ariaCurrent}>` +
            `<div class="wiki-step-marker"><span class="wiki-step-num">${i + 1}</span>` +
            `<i class="bi ${iconCls} wiki-step-icon" aria-hidden="true"></i></div>` +
            `<div class="wiki-step-content">` +
            `<div class="wiki-step-title">${labelEsc}</div>` +
            `<div class="wiki-step-body">${_parseBlockMarkdown(child.innerText, blockData)}</div>` +
            `</div></li>`;
        });
        return `<ol class="wiki-steps">${items.join('')}</ol>`;
      }
      case 'tab':
      case 'item':
      case 'step':
      case 'area':
        // 부모 블록 밖 단독 사용: 일반 블록으로 폴백.
        return `<div class="wiki-block wiki-block-${escapeHtml(type)}"${styleAttr}>` +
          (titleHtml ? `<div class="wiki-block-title">${titleHtml}</div>` : '') +
          innerHtml +
          `</div>`;
      case 'after':
      case 'until': {
        // :::after <시각> 은 그 이후에만, :::until <시각> 은 그 이전에만 표시.
        // 시각: 유닉스 초 또는 YYYY-MM-DD[ HH:MM](뷰어 로컬). 해석 실패 시 항상 표시.
        const boundaryMs = _parseTemporalBoundary(block.titleLine);
        if (boundaryMs === null) {
          return `<div class="wiki-block wiki-block-${escapeHtml(type)}"${styleAttr}>${innerHtml}</div>`;
        }
        const passed = Date.now() >= boundaryMs;
        const visible = type === 'until' ? !passed : passed;
        return `<div class="wiki-temporal wiki-temporal-${type}"${visible ? '' : ' hidden'} ` +
          `data-temporal-ms="${boundaryMs}" data-temporal-mode="${type}">${innerHtml}</div>`;
      }
      case 'embed': {
        const accentRaw = (bg && _isSafeCssColor(bg)) ? bg
          : (color && _isSafeCssColor(color)) ? color
          : '';
        const accentStyle = accentRaw ? ` style="border-left-color:${accentRaw};"` : '';
        return `<div class="wiki-embed"${accentStyle}>` +
          (titleHtml ? `<div class="wiki-embed-title">${titleHtml}</div>` : '') +
          `<div class="wiki-embed-body">${innerHtml}</div>` +
          `</div>`;
      }
      case 'info':
      case 'tip':
      case 'success':
      case 'warning':
      case 'danger':
      case 'note': {
        const cm = CALLOUT_META[type];
        return `<div class="wiki-callout wiki-callout-${type}" role="note">` +
          `<div class="wiki-callout-header">` +
          `<i class="bi ${cm.icon} wiki-callout-icon" aria-hidden="true"></i>` +
          `<span class="wiki-callout-title">${titleHtml || escapeHtml(cm.title)}</span>` +
          `</div>` +
          `<div class="wiki-callout-body">${innerHtml}</div>` +
          `</div>`;
      }
      default:
        // :::left / :::center / :::right 정렬 블록을 포함한 제네릭 폴백.
        return `<div class="wiki-block wiki-block-${escapeHtml(type)}"${styleAttr}>${innerHtml}</div>`;
    }
  }

  // 문자열 토큰 패스에서 건드리면 안 되는 구간(<pre>, <code>, 텍스트를 담는 속성값)을 보호.
  // 속성값: DOMPurify 직렬화는 속성 안의 '<' 를 escape 하지 않아 각주 원문(data-fn-html) 등에
  // 토큰 치환 결과(따옴표 포함)가 들어가면 태그가 깨진다(Cloudwiki 원본에도 있는 문제).
  // 각주 내용의 토큰은 _processFootnotes 가 따로 처리한다.
  const _PROTECT_RES = [
    /<pre[\s\S]*?<\/pre>/gi,
    /<code[^>]*>[\s\S]*?<\/code>/gi,
    /\s(?:data-fn-html|data-caption|alt|title)="[^"]*"/gi,
  ];
  function _protectSpans(html, tag) {
    const prot = [];
    for (const re of _PROTECT_RES) {
      html = html.replace(re, m => { prot.push(m); return `\x00${tag}${prot.length - 1}\x00`; });
    }
    const restore = s => s.replace(new RegExp(`\\x00${tag}(\\d+)\\x00`, 'g'), (_, i) => prot[parseInt(i, 10)]);
    return { html, restore };
  }

  // ── 인라인 레이아웃 토큰 ──
  // {badge:} {tag:} {button:텍스트|url} {embed:URL} {stat:값|라벨} {kbd:} {progress:} {hr}
  // 선행 {palette:}/{bg:}/{color:}/{fs:} 와 아이콘 토큰({bi:}/{icon:bi-}/{img:})을 흡수한다.
  function _processInlineLayoutTokens(input) {
    if (!input || typeof input !== 'string') return input;
    const guarded = _protectSpans(input, 'ILTPROT');
    let html = guarded.html;

    function parseStylePrefix(prefix) {
      let t = _resolvePaletteTokens(prefix || '');
      let bg = '', color = '', fs = '';
      let replaced = true;
      while (replaced) {
        replaced = false;
        const bm = t.match(/\{bg:\s*([^}]+)\}/);
        if (bm) { bg = bm[1].trim(); t = t.replace(bm[0], ''); replaced = true; }
        const cm = t.match(/\{color:\s*([^}]+)\}/);
        if (cm) { color = cm[1].trim(); t = t.replace(cm[0], ''); replaced = true; }
        const fm = t.match(/\{fs:\s*([^}]+)\}/);
        if (fm) {
          const v = fm[1].trim();
          if (WIKI_FS_SIZES.has(v)) fs = v;
          t = t.replace(fm[0], ''); replaced = true;
        }
      }
      return { bg, color, fs };
    }
    function buildStyleAttr(bg, color) {
      let s = '';
      if (bg && _isSafeCssColor(bg)) s += `background-color:${bg};`;
      if (color && _isSafeCssColor(color)) s += `color:${color};`;
      return s ? ` style="${s}"` : '';
    }
    function fsClass(fs) {
      return fs ? ` wiki-fs-${fs}` : '';
    }

    // ![](url){size:icon} 이 컴포넌트 앞에 오면 {img:src} 프리픽스로 정규화.
    html = html.replace(
      /<img\b([^>]*)>(?=\s*\{(?:stat|badge|tag|button|progress):[^}]*\})/g,
      (m, attrs) => {
        if (!/data-size="icon"/.test(attrs)) return m;
        const srcMatch = attrs.match(/src="([^"]*)"/);
        if (!srcMatch) return m;
        const rawSrc = srcMatch[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#0?39;/g, "'")
          .replace(/&amp;/g, '&');
        return `{img:${rawSrc}}`;
      }
    );

    const COMPONENT_TOKEN_RE = /^\{(?:palette|bg|color|fs|bi|icon|img):[^}]+\}$/;
    const ICON_TOKEN_RE = /^\{(bi|icon|img):\s*([^}]+?)\s*\}$/;
    const CLASS_NAME_RE = /^[a-zA-Z0-9\-_]+$/;

    function extractIconHtml(prefix) {
      let iconHtml = '';
      const tokenRe = /\{(?:palette|bg|color|fs|bi|icon|img):[^}]+\}/g;
      let tm;
      while ((tm = tokenRe.exec(prefix)) !== null) {
        const im = tm[0].match(ICON_TOKEN_RE);
        if (!im) continue;
        const type = im[1];
        const name = im[2];
        if (type === 'bi') {
          if (CLASS_NAME_RE.test(name)) iconHtml = `<i class="bi bi-${escapeHtml(name)}" aria-hidden="true"></i>`;
        } else if (type === 'icon') {
          // bi-* 클래스가 포함된 경우만 허용(유틸리티 클래스 혼용 가능).
          const classes = name.split(/\s+/).filter(Boolean);
          if (classes.length > 0 && classes.every(c => CLASS_NAME_RE.test(c)) && classes.some(c => c.startsWith('bi-'))) {
            iconHtml = `<i class="bi ${escapeHtml(name)}" aria-hidden="true"></i>`;
          }
        } else if (type === 'img') {
          if (isSafeUrl(name)) iconHtml = `<img src="${escapeHtml(name)}" class="wiki-icon-img" data-size="icon" alt="" aria-hidden="true">`;
        }
        if (iconHtml) break;
      }
      return iconHtml;
    }

    // 컴포넌트 토큰 앞의 연속된 스타일/아이콘 토큰을 역방향으로 수집(선형 시간).
    function collectPrefixStart(s, startIdx, minIdx) {
      let pStart = startIdx;
      while (pStart > minIdx) {
        let j = pStart;
        while (j > minIdx && /\s/.test(s[j - 1])) j--;
        if (j <= minIdx || s[j - 1] !== '}') break;
        let k = j - 2;
        while (k >= minIdx && s[k] !== '{' && s[k] !== '}') k--;
        if (k < minIdx || s[k] !== '{') break;
        if (!COMPONENT_TOKEN_RE.test(s.slice(k, j))) break;
        pStart = k;
      }
      return pStart;
    }

    function scanComponent(source, tokenRe, render) {
      let out = '';
      let lastIdx = 0;
      let m;
      tokenRe.lastIndex = 0;
      while ((m = tokenRe.exec(source)) !== null) {
        const start = m.index;
        const end = tokenRe.lastIndex;
        const pStart = collectPrefixStart(source, start, lastIdx);
        const built = render(source.slice(pStart, start), m);
        if (built === null) continue;
        out += source.slice(lastIdx, pStart) + built;
        lastIdx = end;
      }
      out += source.slice(lastIdx);
      return out;
    }

    // 칩 텍스트: escape 후 타임스탬프 토큰만 다시 살린다.
    function renderChipValue(raw) {
      return _processTimestampsInHtml(escapeHtml(raw == null ? '' : String(raw)));
    }

    // 중괄호 균형 스캐너: {stat:{dday:..}|라벨} 같은 중첩 토큰 지원.
    function scanComponentBalanced(source, name, render, opts) {
      const rejectTopLevelPipe = !!(opts && opts.rejectTopLevelPipe);
      const open = '{' + name + ':';
      let out = '';
      let lastIdx = 0;
      let searchFrom = 0;
      while (true) {
        const start = source.indexOf(open, searchFrom);
        if (start === -1) break;
        let depth = 1;
        let i = start + open.length;
        let closeIdx = -1;
        while (i < source.length) {
          const ch = source[i];
          if (ch === '<' || ch === '\n') break;
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) { closeIdx = i; break; }
          }
          i++;
        }
        if (closeIdx === -1) { searchFrom = start + open.length; continue; }
        const arg = source.slice(start + open.length, closeIdx);
        const end = closeIdx + 1;
        if (arg.length === 0 || (rejectTopLevelPipe && _splitPipeTopLevel(arg).length > 1)) {
          searchFrom = start + open.length;
          continue;
        }
        const pStart = collectPrefixStart(source, start, lastIdx);
        const built = render(source.slice(pStart, start), arg);
        if (built === null) { searchFrom = end; continue; }
        out += source.slice(lastIdx, pStart) + built;
        lastIdx = end;
        searchFrom = end;
      }
      out += source.slice(lastIdx);
      return out;
    }

    const chip = cls => (prefix, arg) => {
      const { bg, color, fs } = parseStylePrefix(prefix);
      const iconHtml = extractIconHtml(prefix);
      const text = arg.trim();
      const inner = iconHtml
        ? `${iconHtml}<span class="${cls}-label">${renderChipValue(text)}</span>`
        : renderChipValue(text);
      return `<span class="${cls}${fsClass(fs)}"${buildStyleAttr(bg, color)}>${inner}</span>`;
    };
    html = scanComponentBalanced(html, 'badge', chip('wiki-badge'), { rejectTopLevelPipe: true });
    html = scanComponentBalanced(html, 'tag', chip('wiki-tag'), { rejectTopLevelPipe: true });

    html = scanComponentBalanced(html, 'button', (prefix, arg) => {
      const { bg, color, fs } = parseStylePrefix(prefix);
      const iconHtml = extractIconHtml(prefix);
      const parts = _splitPipeTopLevel(arg).map(s => s.trim());
      const text = parts[0] || '';
      const url = parts[1] || '';
      if (!text || !url) return null;
      const inner = iconHtml
        ? `${iconHtml}<span class="wiki-button-label">${renderChipValue(text)}</span>`
        : renderChipValue(text);
      const href = isSafeUrl(url) ? url : '#';
      const cls = ((bg || color) ? 'wiki-button wiki-button-custom' : 'wiki-button') + fsClass(fs);
      return `<a class="${cls}" href="${escapeHtml(href)}"${buildStyleAttr(bg, color)}>${inner}</a>`;
    });

    // {embed:URL} → a.wiki-media-embed. iframe 승격은 _processEmbeds.
    html = scanComponentBalanced(html, 'embed', (prefix, arg) => {
      const url = arg.trim();
      if (!url || !isSafeUrl(url)) return null;
      return `${prefix}<a class="wiki-media-embed" href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
    });

    html = scanComponentBalanced(html, 'stat', (prefix, arg) => {
      const { bg, color, fs } = parseStylePrefix(prefix);
      const iconHtml = extractIconHtml(prefix);
      const parts = _splitPipeTopLevel(arg).map(s => s.trim());
      const value = renderChipValue(parts[0] || '');
      const label = parts[1] ? renderChipValue(parts[1]) : '';
      const valueInner = iconHtml ? `${iconHtml}<span class="wiki-stat-value-text">${value}</span>` : value;
      // 글자색 없이 배경만 있으면 휘도 기반 대비색을 컨테이너에 적용.
      const safeBg = bg && _isSafeCssColor(bg) ? bg : '';
      let resolvedColor = color && _isSafeCssColor(color) ? color : '';
      if (!resolvedColor && safeBg) resolvedColor = _wikiAutoContrastColor(safeBg) || '';
      let containerStyle = '';
      if (safeBg) containerStyle += `background-color:${safeBg};`;
      if (resolvedColor) containerStyle += `color:${resolvedColor};`;
      const containerStyleAttr = containerStyle ? ` style="${containerStyle}"` : '';
      const labelStyleAttr = resolvedColor ? ` style="color:${resolvedColor};opacity:0.75;"` : '';
      return `<div class="wiki-stat${fsClass(fs)}"${containerStyleAttr}>` +
        `<div class="wiki-stat-value">${valueInner}</div>` +
        (label ? `<div class="wiki-stat-label"${labelStyleAttr}>${label}</div>` : '') +
        `</div>`;
    });

    html = scanComponent(html, /\{kbd:([^}<\n]+)\}/g, (prefix, m) => {
      const { bg, color, fs } = parseStylePrefix(prefix);
      const keys = m[1].split('+').map(s => s.trim()).filter(Boolean);
      if (keys.length === 0) return null;
      const keyStyleAttr = buildStyleAttr(bg, color);
      const parts = keys.map(k => `<kbd class="wiki-kbd"${keyStyleAttr}>${escapeHtml(k)}</kbd>`);
      return `<span class="wiki-kbd-card${fsClass(fs)}">` +
        `<span class="wiki-kbd-combo">${parts.join('<span class="wiki-kbd-plus">+</span>')}</span>` +
        `</span>`;
    });

    html = scanComponentBalanced(html, 'progress', (prefix, arg) => {
      const { bg, color, fs } = parseStylePrefix(prefix);
      const iconHtml = extractIconHtml(prefix);
      const parts = _splitPipeTopLevel(arg).map(s => s.trim());
      const valueStr = parts[0] || '';
      const label = parts[1] || '';
      const rootStyle = (color && _isSafeCssColor(color)) ? ` style="color:${color};"` : '';
      const bgFill = (bg && _isSafeCssColor(bg)) ? `background-color:${bg};` : '';
      const labelHtml = (iconHtml || label)
        ? `<span class="wiki-progress-label">${iconHtml}${label ? `<span class="wiki-progress-label-text">${renderChipValue(label)}</span>` : ''}</span>`
        : '';
      const build = (extraCls, extraAttr, width, valueText) =>
        `<div class="wiki-progress${extraCls}${fsClass(fs)}"${extraAttr}${rootStyle}>` +
        `<div class="wiki-progress-header">${labelHtml}<span class="wiki-progress-value">${valueText}</span></div>` +
        `<div class="wiki-progress-track"><div class="wiki-progress-fill" style="width:${width}%;${bgFill}"></div></div>` +
        `</div>`;

      // {progress:auto|라벨}: 같은 블록 안 체크리스트 완료율을 _fillAutoProgressBars 가 채운다.
      if (valueStr.toLowerCase() === 'auto') return build(' wiki-progress-auto', ' data-progress-auto="1"', 0, '');

      let percent = null;
      let valueDisplay = '';
      const fracMatch = valueStr.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
      if (fracMatch) {
        const a = parseFloat(fracMatch[1]);
        const b = parseFloat(fracMatch[2]);
        if (b > 0 && a >= 0 && a <= b) {
          percent = (a / b) * 100;
          valueDisplay = `${fracMatch[1]}/${fracMatch[2]}`;
        }
      } else {
        const n = parseFloat(valueStr);
        if (!isNaN(n) && n >= 0 && n <= 100 && /^-?\d+(?:\.\d+)?%?$/.test(valueStr.replace(/\s/g, ''))) {
          percent = n;
          valueDisplay = `${n}%`;
        }
      }
      if (percent === null) return null;
      return build('', '', Math.max(0, Math.min(100, percent)), escapeHtml(valueDisplay));
    });

    // 블록 컴포넌트(stat/progress)를 감싼 <p>/<br> 를 벗겨 블록으로 승격(빈 그리드 셀 방지).
    html = html.replace(/<br\s*\/?>\s*(?=<div class="wiki-(?:stat|progress)\b)/g, '');
    html = html.replace(/<p>([\s\S]*?)<\/p>/g, (m, inner) =>
      /<div class="wiki-(?:stat|progress)\b/.test(inner) ? inner : m);

    html = html.replace(/(?:<p>)?\{hr\}(?:<\/p>)?/g, '<hr class="wiki-block-hr">');

    return guarded.restore(html);
  }

  // ── 타임스탬프 ──
  // {dday:YYYY-MM-DD} → n일 남음/D-Day/n일 지남, {dday:MM-DD} → 다음 해당일까지
  function _computeDdayText(dateStr) {
    const parts = dateStr.split('-');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parts.length === 2) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      if (isNaN(month) || isNaN(day)) return null;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
      if (day > maxDay) return null;
      // 02-29 는 다음 윤년까지(세기 경계 최대 8년) 탐색.
      const year = today.getFullYear();
      let target = null;
      for (let i = 0; i <= 8; i++) {
        const candidate = new Date(year + i, month - 1, day);
        candidate.setHours(0, 0, 0, 0);
        const valid = candidate.getMonth() === month - 1 && candidate.getDate() === day;
        if (valid && candidate >= today) { target = candidate; break; }
      }
      if (target === null) return null;
      const diff = Math.round((target - today) / 86400000);
      return diff === 0 ? 'D-Day' : `${diff}일 남음`;
    }
    if (parts.length !== 3) return null;
    const target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    target.setHours(0, 0, 0, 0);
    if (isNaN(target.getTime())) return null;
    const diff = Math.round((target - today) / 86400000);
    if (diff > 0) return `${diff}일 남음`;
    if (diff === 0) return 'D-Day';
    return `${Math.abs(diff)}일 지남`;
  }

  function _formatUnixTime(unixSec) {
    const d = new Date(unixSec * 1000);
    if (isNaN(d.getTime())) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // {timer:UNIX} → "n년 n달 n일 n시간 n분 n초 남음/지남" (0인 단위 생략)
  function _computeTimerText(unixSec) {
    const diff = unixSec - Math.floor(Date.now() / 1000);
    const s = Math.abs(diff);
    const units = [
      [Math.floor(s / (365 * 86400)), '년'],
      [Math.floor((s % (365 * 86400)) / (30 * 86400)), '달'],
      [Math.floor((s % (30 * 86400)) / 86400), '일'],
      [Math.floor((s % 86400) / 3600), '시간'],
      [Math.floor((s % 3600) / 60), '분'],
    ];
    const parts = units.filter(([n]) => n > 0).map(([n, u]) => `${n}${u}`);
    const seconds = s % 60;
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}초`);
    return parts.join(' ') + (diff >= 0 ? ' 남음' : ' 지남');
  }

  function _computeAge(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const birth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (age < 0) return null;
    return `${age}세`;
  }

  function _processTimestampsInHtml(input) {
    const guarded = _protectSpans(input, 'TSPROT');
    let html = guarded.html;

    html = html.replace(/\{dday:(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})\}/g, (match, dateStr) => {
      const text = _computeDdayText(dateStr);
      if (text === null) return match;
      const cls = text === 'D-Day' ? 'wiki-dday wiki-dday-today'
        : text.endsWith('남음') ? 'wiki-dday wiki-dday-future'
        : 'wiki-dday wiki-dday-past';
      return `<span class="${cls}" title="${dateStr}">${text}</span>`;
    });
    html = html.replace(/\{time:(\d+)\}/g, (match, unixStr) => {
      const text = _formatUnixTime(parseInt(unixStr, 10));
      if (text === null) return match;
      return `<span class="wiki-timestamp" title="Unix: ${unixStr}">${text}</span>`;
    });
    html = html.replace(/\{timer:(\d+)\}/g, (match, unixStr) => {
      const unix = parseInt(unixStr, 10);
      return `<span class="wiki-timer" data-unix="${unix}" title="Unix: ${unixStr}">${_computeTimerText(unix)}</span>`;
    });
    html = html.replace(/\{age:(\d{4}-\d{2}-\d{2})\}/g, (match, dateStr) => {
      const text = _computeAge(dateStr);
      if (text === null) return match;
      return `<span class="wiki-age" title="${dateStr}">${text}</span>`;
    });
    html = html.replace(/\{calendar:(?:(\d{4})-)?(\d{2})-(\d{2})\}/g, (match, yearStr, monthStr, dayStr) => {
      const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
      const dowClass = dow => dow === 0 ? ' wiki-cal-sun' : dow === 6 ? ' wiki-cal-sat' : '';
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);
      if (month < 1 || month > 12) return match;
      if (yearStr) {
        const year = parseInt(yearStr, 10);
        const d = new Date(year, month - 1, day);
        if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return match;
        return `<span class="wiki-calendar-box" title="${yearStr}-${monthStr}-${dayStr}">` +
          `<span class="wiki-cal-month">${month}월</span>` +
          `<span class="wiki-cal-day">${day}</span>` +
          `<span class="wiki-cal-dow${dowClass(d.getDay())}">${dayNames[d.getDay()]}</span>` +
          `<span class="wiki-cal-year">${year}</span>` +
          `</span>`;
      }
      // 연도 생략: 올해 기준으로 존재하는 날짜일 때만 요일 표시.
      const currentYear = new Date().getFullYear();
      const d = new Date(currentYear, month - 1, day);
      const isValidDate = !isNaN(d.getTime()) && d.getFullYear() === currentYear && d.getMonth() === month - 1 && d.getDate() === day;
      const dowHtml = isValidDate
        ? `<span class="wiki-cal-dow${dowClass(d.getDay())}">${dayNames[d.getDay()]}</span>`
        : `<span class="wiki-cal-dow">&nbsp;</span>`;
      return `<span class="wiki-calendar-box wiki-calendar-box--no-year" title="${monthStr}-${dayStr}">` +
        `<span class="wiki-cal-month">${month}월</span>` +
        `<span class="wiki-cal-day">${day}</span>` +
        dowHtml +
        `</span>`;
    });

    return guarded.restore(html);
  }

  // ── :::after / :::until ──
  function _parseTemporalBoundary(raw) {
    const s = (raw || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const sec = parseInt(s, 10);
      return Number.isFinite(sec) ? sec * 1000 : null;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(s);
    if (!m) return null;
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
    const hh = m[4] !== undefined ? parseInt(m[4], 10) : 0;
    const mm = m[5] !== undefined ? parseInt(m[5], 10) : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
    const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
    if (isNaN(dt.getTime()) || dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt.getTime();
  }

  function _applyTemporalState(el) {
    const ms = parseInt(el.getAttribute('data-temporal-ms'), 10);
    if (isNaN(ms)) return null;
    const passed = Date.now() >= ms;
    el.hidden = el.getAttribute('data-temporal-mode') === 'until' ? passed : !passed;
    return ms;
  }

  // 숨김 분기에서만 참조되는 각주 항목을 목록에서도 숨긴다.
  function _updateTemporalFootnoteVisibility(root) {
    root.querySelectorAll('.wiki-footnotes').forEach(section => {
      section.querySelectorAll(':scope > ol > li[id]').forEach(li => {
        const refs = root.querySelectorAll(`sup.wiki-fn-ref > a[href="#${CSS.escape(li.id)}"]`);
        if (refs.length === 0) return;
        let anyVisible = false;
        refs.forEach(a => { if (!a.closest('.wiki-temporal[hidden]')) anyVisible = true; });
        li.hidden = !anyVisible;
      });
    });
  }

  function _syncTemporalDerivedVisibility(root) {
    _updateTemporalFootnoteVisibility(root);
    _fillAutoProgressBars(root);
  }

  // setTimeout 32비트 상한(~24.8일) 회피: 그보다 먼 경계는 타이머 없이 다음 렌더에서 재계산.
  const _TEMPORAL_MAX_DELAY_MS = 24 * 86400000;
  let _temporalVisibilityHooked = false;

  function _initTemporal(containerEl, state) {
    const els = containerEl.querySelectorAll('.wiki-temporal[data-temporal-ms]');
    if (els.length === 0) return;
    const now = Date.now();
    els.forEach(el => {
      const ms = _applyTemporalState(el);
      if (ms === null) return;
      const delay = ms - now;
      if (delay > 0 && delay <= _TEMPORAL_MAX_DELAY_MS) {
        state.timeouts.push(setTimeout(() => {
          _applyTemporalState(el);
          _syncTemporalDerivedVisibility(containerEl);
        }, delay + 50));
      }
    });
    _syncTemporalDerivedVisibility(containerEl);
    // 백그라운드 탭 스로틀링 대비: 탭 복귀 시 문서 전체 재계산(리스너는 1회만).
    if (!_temporalVisibilityHooked) {
      _temporalVisibilityHooked = true;
      const recompute = () => {
        if (document.visibilityState === 'hidden') return;
        document.querySelectorAll('.wiki-temporal[data-temporal-ms]').forEach(_applyTemporalState);
        _syncTemporalDerivedVisibility(document);
      };
      document.addEventListener('visibilitychange', recompute);
      window.addEventListener('focus', recompute);
    }
  }

  function _initTimers(containerEl, state) {
    const timerEls = containerEl.querySelectorAll('.wiki-timer[data-unix]');
    if (timerEls.length === 0) return;
    const tick = () => {
      timerEls.forEach(el => {
        const unix = parseInt(el.getAttribute('data-unix'), 10);
        if (!isNaN(unix)) el.textContent = _computeTimerText(unix);
      });
    };
    tick();
    state.interval = setInterval(tick, 1000);
  }

  // ── 체크박스 / 진행도 ──
  // GFM task list 체크박스 → Bootstrap Icons. 진행 중(- [~] / - [/])은 순환 아이콘.
  function _replaceTaskCheckboxesWithIcons(html) {
    html = html.replace(
      /<input\b[^>]*\btype="checkbox"[^>]*>\s*WIKITASKPROGRESSPH/gi,
      () => `<i class="bi bi-arrow-repeat wiki-task-checkbox wiki-task-progress" aria-hidden="true"></i>`
    );
    return html.replace(/<input\b([^>]*?)\btype="checkbox"([^>]*?)>/gi, (match, before, after) => {
      if (/\bchecked\b/i.test(before + after)) {
        return `<i class="bi bi-check-square-fill wiki-task-checkbox wiki-task-done" aria-hidden="true"></i>`;
      }
      return `<i class="bi bi-square wiki-task-checkbox" aria-hidden="true"></i>`;
    });
  }

  // {progress:auto}: 가장 가까운 블록 스코프 안 체크박스의 완료율(숨김 temporal 제외).
  function _fillAutoProgressBars(containerEl) {
    containerEl.querySelectorAll('.wiki-progress-auto[data-progress-auto]').forEach(bar => {
      const scope = bar.closest(
        '.wiki-temporal, .wiki-block, .wiki-fold-content, .wiki-acc-body, .wiki-tab-pane, ' +
        '.wiki-embed-body, .wiki-callout-body, .wiki-card-body, .wiki-area, .wiki-float, .wiki-section-body-inner'
      ) || containerEl;
      const boxes = Array.from(scope.querySelectorAll('.wiki-task-checkbox')).filter(b => !b.closest('.wiki-temporal[hidden]'));
      const total = boxes.length;
      const done = boxes.filter(b => b.classList.contains('wiki-task-done')).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const fill = bar.querySelector('.wiki-progress-fill');
      if (fill) fill.style.width = pct + '%';
      const valEl = bar.querySelector('.wiki-progress-value');
      if (valEl) valEl.textContent = total > 0 ? `${done}/${total} · ${pct}%` : '—';
    });
  }

  // ── 표 옵션 토큰 ──
  // 표 윗줄 단독 토큰 라인({table:정렬}{w:너비}{caption:제목}{sticky-header}{sortable}{row-header})과
  // 구분 행 셀의 {w:NN%} 를 marked 이전에 소비해 placeholder 문단으로 남기고, 렌더 후 표에 적용.
  const _WIKI_TABLE_WIDTH_ENUM = new Set(['50%', '60%', '70%', '80%', '90%', '100%']);

  function _parseWikiTableOptionLine(line) {
    const trimmed = line.trim();
    if (trimmed[0] !== '{' || trimmed[trimmed.length - 1] !== '}') return null;
    if (trimmed.replace(/\{[^{}]*\}/g, '').trim() !== '') return null;
    const opts = {};
    const re = /\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(trimmed))) {
      const body = m[1].trim();
      let tok;
      if ((tok = body.match(/^table\s*:\s*(left|center|right)$/i))) { opts.align = tok[1].toLowerCase(); continue; }
      if ((tok = body.match(/^w\s*:\s*(\d{2,3}\s*%)$/i))) {
        const width = tok[1].replace(/\s+/g, '');
        if (!_WIKI_TABLE_WIDTH_ENUM.has(width)) return null;
        opts.width = width;
        continue;
      }
      if ((tok = body.match(/^caption\s*:\s*(\S[\s\S]*)$/i))) { opts.caption = tok[1].trim(); continue; }
      if (/^sticky-header$/i.test(body)) { opts.stickyHeader = true; continue; }
      if (/^sortable$/i.test(body)) { opts.sortable = true; continue; }
      if (/^row-header$/i.test(body)) { opts.rowHeader = true; continue; }
      return null;
    }
    return Object.keys(opts).length > 0 ? opts : null;
  }

  function _extractWikiTableDelimWidths(line) {
    if (line.indexOf('|') === -1 || line.indexOf('-') === -1) return null;
    if (/^ {4,}/.test(line)) return null;
    const trimmed = line.trim();
    let parts = trimmed.split('|');
    if (trimmed.startsWith('|')) parts = parts.slice(1);
    if (trimmed.endsWith('|')) parts = parts.slice(0, -1);
    if (parts.length === 0) return null;
    const widths = [];
    let hasToken = false;
    const cleaned = [];
    for (const cell of parts) {
      const m = cell.trim().match(/^(:?-+:?)(?:\s+\{w\s*:\s*(\d{1,3}\s*%)\s*\})?$/i);
      if (!m) return null;
      if (m[2]) {
        const width = m[2].replace(/\s+/g, '');
        const pct = parseInt(width, 10);
        widths.push(pct >= 1 && pct <= 100 ? width : null);
        if (widths[widths.length - 1]) hasToken = true;
      } else {
        widths.push(null);
      }
      cleaned.push(m[1]);
    }
    return { line: '| ' + cleaned.join(' | ') + ' |', widths: hasToken ? widths : null };
  }

  function _preprocessWikiTableTokens(text) {
    const data = [];
    if (text.indexOf('{') === -1) return { text, data };
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^ {0,3}\{/.test(line)) {
        const opts = _parseWikiTableOptionLine(line);
        if (opts && i + 2 < lines.length && lines[i + 1].indexOf('|') !== -1) {
          const delim = _extractWikiTableDelimWidths(lines[i + 2]);
          if (delim) {
            if (delim.widths) opts.colWidths = delim.widths;
            const idx = data.push(opts) - 1;
            out.push('', `WIKITBLOPTPH${idx}XEND`, '', lines[i + 1], delim.line);
            i += 2;
            continue;
          }
        }
      }
      if (line.indexOf('{w') !== -1 && i > 0 && out.length > 0 && lines[i - 1].indexOf('|') !== -1) {
        const delim = _extractWikiTableDelimWidths(line);
        if (delim) {
          if (delim.widths) {
            const idx = data.push({ colWidths: delim.widths }) - 1;
            const header = out.pop();
            out.push('', `WIKITBLOPTPH${idx}XEND`, '', header, delim.line);
          } else {
            out.push(delim.line);
          }
          continue;
        }
      }
      out.push(line);
    }
    return { text: out.join('\n'), data };
  }

  function _applyWikiTableOptions(containerEl, data) {
    if (!data || data.length === 0) return;
    containerEl.querySelectorAll('p').forEach(p => {
      const m = (p.textContent || '').trim().match(/^WIKITBLOPTPH(\d+)XEND$/);
      if (!m) return;
      const opts = data[parseInt(m[1], 10)];
      const next = p.nextElementSibling;
      p.remove();
      if (!opts || !next || next.tagName !== 'TABLE') return;
      const table = next;
      if (opts.align) table.classList.add('wiki-table-align-' + opts.align);
      if (opts.width) table.style.width = opts.width;
      if (opts.caption) {
        const cap = document.createElement('caption');
        cap.className = 'wiki-table-caption';
        cap.textContent = opts.caption;
        table.insertBefore(cap, table.firstChild);
      }
      if (opts.colWidths) {
        const colgroup = document.createElement('colgroup');
        opts.colWidths.forEach(w => {
          const col = document.createElement('col');
          if (w) col.style.width = w;
          colgroup.appendChild(col);
        });
        const cap = table.querySelector(':scope > caption');
        table.insertBefore(colgroup, cap ? cap.nextSibling : table.firstChild);
      }
      if (opts.rowHeader) {
        table.classList.add('wiki-table-row-header');
        let carry = 0;
        table.querySelectorAll(':scope > tbody > tr').forEach(tr => {
          if (carry > 0) { carry--; return; }
          const first = tr.cells[0];
          if (!first) return;
          carry = ((parseInt(first.getAttribute('rowspan') || '1', 10) || 1) - 1);
          if (first.tagName !== 'TD') return;
          const th = document.createElement('th');
          Array.from(first.attributes).forEach(a => th.setAttribute(a.name, a.value));
          th.innerHTML = first.innerHTML;
          th.setAttribute('scope', 'row');
          first.replaceWith(th);
        });
      }
      if (opts.stickyHeader) table.classList.add('wiki-table-sticky-header');
      if (opts.sortable) _initWikiSortableTable(table);
    });
  }

  function _initWikiSortableTable(table) {
    // 병합 셀이 있으면 행 재배열이 구조를 깨므로 비활성.
    const hasMerge = Array.from(table.querySelectorAll('td, th')).some(c =>
      (parseInt(c.getAttribute('colspan') || '1', 10) || 1) > 1 ||
      (parseInt(c.getAttribute('rowspan') || '1', 10) || 1) > 1);
    if (hasMerge) return;
    const thead = table.querySelector(':scope > thead');
    const tbody = table.querySelector(':scope > tbody');
    if (!thead || !tbody || thead.rows.length === 0) return;
    const headRow = thead.rows[0];
    table.classList.add('wiki-table-sortable');
    Array.from(headRow.cells).forEach((th, colIdx) => {
      th.tabIndex = 0;
      const onSort = () => _sortWikiTableByColumn(table, headRow, colIdx);
      th.addEventListener('click', onSort);
      th.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(); }
      });
    });
  }

  function _sortWikiTableByColumn(table, headRow, colIdx) {
    const tbody = table.querySelector(':scope > tbody');
    const th = headRow.cells[colIdx];
    if (!tbody || !th) return;
    const asc = th.getAttribute('aria-sort') !== 'ascending';
    Array.from(headRow.cells).forEach(c => c.removeAttribute('aria-sort'));
    th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
    const dir = asc ? 1 : -1;
    // "+5%" / "1,200원" 같은 표기의 선두 숫자 우선 비교
    const numOf = s => {
      const nm = s.replace(/[,\s]/g, '').match(/^[+\-−]?\d+(?:\.\d+)?/);
      return nm ? parseFloat(nm[0].replace('−', '-').replace('+', '')) : NaN;
    };
    const keyed = Array.from(tbody.rows).map(tr => {
      const cell = tr.cells[colIdx];
      const text = cell ? cell.textContent.trim() : '';
      return { tr, text, num: numOf(text) };
    });
    const nonEmpty = keyed.filter(k => k.text !== '');
    const numeric = nonEmpty.length > 0 && nonEmpty.every(k => !isNaN(k.num));
    keyed.sort((a, b) => {
      if (a.text === '' && b.text === '') return 0;
      if (a.text === '') return 1;
      if (b.text === '') return -1;
      const cmp = numeric ? (a.num - b.num) : a.text.localeCompare(b.text, 'ko');
      return cmp * dir;
    });
    keyed.forEach(k => tbody.appendChild(k.tr));
  }

  // 셀 선두의 {palette:}/{bg:}/{color:} → 셀 스타일.
  function _applyTableCellColors(containerEl) {
    containerEl.querySelectorAll('td, th').forEach(cell => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.parentElement && node.parentElement.closest('code, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      const firstTextNode = walker.nextNode();
      if (!firstTextNode) return;
      let val = firstTextNode.nodeValue;
      let replaced = true;
      while (replaced) {
        replaced = false;
        const palMatch = val.match(/^(\s*)\{palette:\s*([^}\s][^}]*?)\s*\}/);
        if (palMatch) {
          const expanded = _resolvePaletteTokens(`{palette:${palMatch[2]}}`);
          // 미등록 팔레트는 토큰만 제거(무한 루프 방지)
          val = palMatch[1] + (expanded === `{palette:${palMatch[2]}}` ? '' : expanded) + val.slice(palMatch[0].length);
          replaced = true;
          continue;
        }
        const bgMatch = val.match(/^(\s*)\{bg:\s*([^}]+)\}/);
        if (bgMatch) {
          const v = bgMatch[2].trim();
          if (_isSafeCssColor(v)) cell.style.backgroundColor = v;
          val = val.replace(bgMatch[0], '');
          replaced = true;
        }
        const colorMatch = val.match(/^(\s*)\{color:\s*([^}]+)\}/);
        if (colorMatch) {
          const v = colorMatch[2].trim();
          if (_isSafeCssColor(v)) cell.style.color = v;
          val = val.replace(colorMatch[0], '');
          replaced = true;
        }
      }
      firstTextNode.nodeValue = val;
    });
  }

  // 셀 병합 마커: {<} 왼쪽, {>} 오른쪽, {^} 위쪽, {><} 양쪽 반분할.
  function _applyTableCellMerges(containerEl) {
    containerEl.querySelectorAll('table').forEach(table => {
      const matchMergeMarker = cell => {
        if (cell.children.length > 0) return null;
        const m = cell.textContent.trim().match(/^\{(><|[<>^])\}$/);
        return m ? m[1] : null;
      };

      // {^} 가 thead/tbody 경계를 넘으면 rowspan 이 동작하지 않으므로 thead 를 tbody 로 내린다.
      const thead = table.querySelector(':scope > thead');
      const tbody = table.querySelector(':scope > tbody');
      if (thead && tbody) {
        const hasVerticalMerge = Array.from(tbody.querySelectorAll('td, th')).some(cell => matchMergeMarker(cell) === '^');
        if (hasVerticalMerge) {
          Array.from(thead.querySelectorAll('tr')).forEach(tr => {
            Array.from(tr.querySelectorAll('th')).forEach(th => {
              const td = document.createElement('td');
              td.innerHTML = th.innerHTML;
              Array.from(th.attributes).forEach(attr => td.setAttribute(attr.name, attr.value));
              td.style.fontWeight = 'bold';
              td.style.textAlign = th.style.textAlign || 'center';
              th.replaceWith(td);
            });
            tbody.insertBefore(tr, tbody.firstChild);
          });
          thead.remove();
        }
      }

      const rows = Array.from(table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr'));
      if (rows.length === 0) return;
      const grid = rows.map(row => Array.from(row.cells));
      const markers = grid.map(row => row.map(cell => matchMergeMarker(cell)));
      if (!markers.some(row => row.some(Boolean))) return;
      const toRemove = grid.map(row => row.map(() => false));
      const span = (cell, attr) => parseInt(cell.getAttribute(attr) || '1', 10);

      for (let r = 0; r < grid.length; r++) {
        for (let c = 1; c < grid[r].length; c++) {
          if (markers[r][c] !== '<') continue;
          let target = c - 1;
          while (target >= 0 && markers[r][target] === '<') target--;
          if (target >= 0 && !toRemove[r][target]) {
            grid[r][target].setAttribute('colspan', span(grid[r][target], 'colspan') + 1);
            toRemove[r][c] = true;
          }
        }
      }
      for (let r = 0; r < grid.length; r++) {
        for (let c = grid[r].length - 2; c >= 0; c--) {
          if (markers[r][c] !== '>') continue;
          let target = c + 1;
          while (target < grid[r].length && markers[r][target] === '>') target++;
          if (target < grid[r].length && !toRemove[r][target]) {
            grid[r][target].setAttribute('colspan', span(grid[r][target], 'colspan') + 1);
            toRemove[r][c] = true;
          }
        }
      }
      for (let r = 1; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          if (markers[r][c] !== '^' || toRemove[r][c]) continue;
          let target = r - 1;
          while (target >= 0 && markers[target][c] === '^') target--;
          if (target >= 0 && c < grid[target].length) {
            grid[target][c].setAttribute('rowspan', span(grid[target][c], 'rowspan') + 1);
            toRemove[r][c] = true;
          }
        }
      }
      if (markers.some(row => row.some(m => m === '><'))) {
        // 모든 셀 colspan 을 2배로 늘려 반분할 가능하게 한 뒤 마커 셀 공간을 양옆에 분배.
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < grid[r].length; c++) grid[r][c].setAttribute('colspan', span(grid[r][c], 'colspan') * 2);
        }
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < grid[r].length; c++) {
            if (markers[r][c] !== '><') continue;
            let left = c - 1;
            while (left >= 0 && (toRemove[r][left] || markers[r][left] === '><')) left--;
            let right = c + 1;
            while (right < grid[r].length && (toRemove[r][right] || markers[r][right] === '><')) right++;
            const hasLeft = left >= 0;
            const hasRight = right < grid[r].length;
            if (hasLeft && hasRight) {
              grid[r][left].setAttribute('colspan', span(grid[r][left], 'colspan') + 1);
              grid[r][right].setAttribute('colspan', span(grid[r][right], 'colspan') + 1);
            } else if (hasLeft) {
              grid[r][left].setAttribute('colspan', span(grid[r][left], 'colspan') + 2);
            } else if (hasRight) {
              grid[r][right].setAttribute('colspan', span(grid[r][right], 'colspan') + 2);
            }
            toRemove[r][c] = true;
          }
        }
      }
      for (let r = 0; r < grid.length; r++) {
        for (let c = grid[r].length - 1; c >= 0; c--) {
          const cell = grid[r][c];
          if (toRemove[r][c]) { cell.remove(); continue; }
          if (span(cell, 'colspan') > 1 || span(cell, 'rowspan') > 1) {
            if (!cell.style.textAlign) cell.style.textAlign = 'center';
            if (!cell.style.verticalAlign) cell.style.verticalAlign = 'middle';
          }
        }
      }
    });
  }

  // ── 미디어 임베드 (YouTube / 니코니코 / Spotify / Google Maps) ──
  // 명시적 옵트인({embed:URL} 또는 :::embed 블록 안의 단독 링크)만 iframe 으로 승격.
  function _processEmbeds(containerEl) {
    containerEl.querySelectorAll('a').forEach(a => {
      let href = a.getAttribute('href');
      if (!href) return;
      if (!a.classList.contains('wiki-media-embed') && !a.closest('.wiki-embed')) return;

      // {size:small|medium} 접미: href 안(오토링크가 삼킨 경우) 또는 뒤 텍스트.
      const embedSizeRe = /\{size:\s*(small|medium)\s*\}\s*$/;
      const embedSizeEncRe = /%7Bsize:(small|medium)%7D\s*$/i;
      let embedSize = '';
      let hrefSizeM = href.match(embedSizeRe);
      if (hrefSizeM) {
        embedSize = hrefSizeM[1];
        href = href.replace(embedSizeRe, '');
      } else if ((hrefSizeM = href.match(embedSizeEncRe))) {
        embedSize = hrefSizeM[1].toLowerCase();
        href = href.replace(embedSizeEncRe, '');
      }

      const parent = a.parentElement;
      if (!parent || parent.tagName !== 'P') return;
      const stripEmbedSize = s => (s || '').trim().replace(embedSizeRe, '').trim();
      if (stripEmbedSize(parent.textContent) !== stripEmbedSize(a.textContent)) return;
      if (!embedSize) {
        const pSizeM = (parent.textContent || '').trim().match(embedSizeRe);
        if (pSizeM) embedSize = pSizeM[1];
      }
      if (a.closest('code, pre') || a.closest('.wiki-fn-ref')) return;

      // 커스텀 라벨 링크([label](url))는 임베드하지 않는다.
      const textContent = a.textContent.trim();
      let textLooksLikeGoogleMaps = false;
      try {
        const h = new URL(textContent).hostname;
        textLooksLikeGoogleMaps = ['www.google.com', 'google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl'].includes(h);
      } catch (e) { /* URL 아님 */ }
      if (!textContent.includes('youtube.com') && !textContent.includes('youtu.be') && !textContent.includes('nicovideo.jp') && !textContent.includes('spotify.com') && !textLooksLikeGoogleMaps) return;

      const frame = (kind, src, attrs) => {
        const wrap = document.createElement('div');
        wrap.className = `wiki-embed-frame wiki-embed-frame--${kind}` + (embedSize ? ` wiki-embed-size-${embedSize}` : '');
        const iframe = document.createElement('iframe');
        iframe.setAttribute('src', src);
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('frameborder', '0');
        Object.keys(attrs || {}).forEach(k => iframe.setAttribute(k, attrs[k]));
        wrap.appendChild(iframe);
        parent.replaceWith(wrap);
      };

      if (href.includes('open.spotify.com')) {
        try {
          const url = new URL(href, window.location.origin);
          const pathParts = url.pathname.split('/').filter(Boolean);
          const allowedTypes = ['track', 'album', 'playlist', 'artist', 'show', 'episode'];
          if (pathParts.length >= 2 && allowedTypes.includes(pathParts[0])) {
            const type = pathParts[0];
            const short = type === 'track' || type === 'episode';
            frame(short ? 'spotify-short' : 'spotify', `https://open.spotify.com/embed/${type}/${encodeURIComponent(pathParts[1])}${url.search}`, {
              allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
            });
            return;
          }
        } catch (e) { /* 무시 */ }
      }

      try {
        const mapUrl = new URL(href);
        const mh = mapUrl.hostname;
        const isGoogleMapsHost = (
          ((mh === 'www.google.com' || mh === 'google.com' || mh === 'maps.google.com') && mapUrl.pathname.startsWith('/maps')) ||
          (mh === 'goo.gl' && mapUrl.pathname.startsWith('/maps')) ||
          mh === 'maps.app.goo.gl'
        );
        if (isGoogleMapsHost) {
          if (!mapUrl.pathname.startsWith('/maps/embed')) mapUrl.searchParams.set('output', 'embed');
          frame('map', mapUrl.toString(), { allowfullscreen: '', referrerpolicy: 'no-referrer-when-downgrade' });
          return;
        }
      } catch (e) { /* 무시 */ }

      if (href.includes('youtube.com') || href.includes('youtu.be')) {
        try {
          const url = new URL(href, window.location.origin);
          const path = url.pathname.replace(/\/+$/, '') || '/';
          const listId = url.searchParams.get('list');
          const siParam = url.searchParams.get('si');
          const start = url.searchParams.get('t');
          const ytAttrs = {
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            referrerpolicy: 'strict-origin-when-cross-origin',
            allowfullscreen: '',
          };
          let videoId = '';
          if (url.hostname.includes('youtu.be')) videoId = url.pathname.slice(1);
          else if (path === '/watch') videoId = url.searchParams.get('v');
          else if (path.startsWith('/shorts/') || path.startsWith('/live/')) videoId = path.split('/')[2];
          else if ((path === '/playlist' || path === '/embed/videoseries') && listId) {
            const params = [`list=${encodeURIComponent(listId)}`, 'listType=playlist'];
            if (siParam) params.push(`si=${encodeURIComponent(siParam)}`);
            frame('video', `https://www.youtube.com/embed/videoseries?${params.join('&')}`, Object.assign({ title: 'YouTube playlist player' }, ytAttrs));
            return;
          }
          if (videoId) {
            const queryParams = [];
            if (start) {
              // 1m30s 또는 90 형식
              let seconds;
              const timeMatch = start.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
              if (timeMatch && (timeMatch[1] || timeMatch[2] || timeMatch[3])) {
                seconds = (parseInt(timeMatch[1] || 0, 10) * 3600) + (parseInt(timeMatch[2] || 0, 10) * 60) + parseInt(timeMatch[3] || 0, 10);
              } else {
                seconds = parseInt(start, 10);
              }
              if (!isNaN(seconds)) queryParams.push(`start=${seconds}`);
            }
            if (listId) queryParams.push(`list=${encodeURIComponent(listId)}`);
            if (siParam) queryParams.push(`si=${encodeURIComponent(siParam)}`);
            const query = queryParams.length > 0 ? '?' + queryParams.join('&') : '';
            frame('video', `https://www.youtube.com/embed/${encodeURIComponent(videoId)}${query}`, Object.assign({ title: 'YouTube video player' }, ytAttrs));
            return;
          }
        } catch (e) { /* 무시 */ }
      }

      const nicoMatch = href.match(/^https?:\/\/(?:www\.)?nicovideo\.jp\/watch\/([a-zA-Z0-9_-]+)(.*)$/);
      if (nicoMatch) {
        const timeMatch = (nicoMatch[2] || '').match(/[?&]from=(\d+)/);
        const query = timeMatch ? `?from=${parseInt(timeMatch[1], 10)}` : '';
        frame('video', `https://embed.nicovideo.jp/watch/${encodeURIComponent(nicoMatch[1])}${query}`, {
          referrerpolicy: 'strict-origin-when-cross-origin',
          allowfullscreen: '',
        });
      }
    });
  }

  // ── 이미지 {align:}/{caption:}: 단독 문단 이미지를 <figure> 로 승격 ──
  function _processImageFigures(containerEl) {
    containerEl.querySelectorAll('img').forEach(img => {
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
    });
    containerEl.querySelectorAll('img[data-align], img[data-caption]').forEach(img => {
      const align = img.getAttribute('data-align') || '';
      const caption = img.getAttribute('data-caption') || '';
      if (!align && !caption) return;
      const p = img.parentElement;
      if (!p || p.tagName !== 'P') return;
      if ((p.textContent || '').trim() !== '') return;
      if (p.querySelectorAll('img').length !== 1) return;
      const figure = document.createElement('figure');
      figure.className = 'wiki-img-figure' + (align ? ` wiki-img-align-${align}` : '');
      figure.appendChild(img);
      if (caption) {
        const figcap = document.createElement('figcaption');
        figcap.className = 'wiki-img-caption';
        figcap.textContent = caption;
        figure.appendChild(figcap);
      }
      p.replaceWith(figure);
    });
  }

  // ── 링크: 외부 링크는 새 탭 (Cloudwiki 의 Swal 확인 팝업 대체) ──
  function _processLinks(containerEl) {
    containerEl.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      const external = /^https?:\/\//i.test(href) && a.hostname && a.hostname !== window.location.hostname;
      if (external || a.classList.contains('wiki-gallery-item')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  // ── 탭 / 아코디언 동작 (Bootstrap JS 대체) ──
  function _activateTab(btn) {
    const nav = btn.closest('.wiki-tabs-nav');
    const tabs = btn.closest('.wiki-tabs');
    if (!nav || !tabs) return;
    nav.querySelectorAll(':scope > .wiki-tab-btn').forEach(b => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
    const targetId = btn.getAttribute('data-wiki-tab');
    tabs.querySelectorAll(':scope > .wiki-tabs-content > .wiki-tab-pane').forEach(p => {
      const on = p.id === targetId;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
  }

  function _bindTabs(root) {
    root.querySelectorAll('.wiki-tabs-nav').forEach(nav => {
      const btns = Array.from(nav.querySelectorAll(':scope > .wiki-tab-btn'));
      btns.forEach((btn, i) => {
        btn.addEventListener('click', () => _activateTab(btn));
        btn.addEventListener('keydown', e => {
          let next = -1;
          if (e.key === 'ArrowRight') next = (i + 1) % btns.length;
          else if (e.key === 'ArrowLeft') next = (i - 1 + btns.length) % btns.length;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = btns.length - 1;
          if (next < 0) return;
          e.preventDefault();
          _activateTab(btns[next]);
          btns[next].focus();
        });
      });
    });
  }

  function _bindAccordions(root) {
    root.querySelectorAll('.wiki-accordion[data-single]').forEach(acc => {
      const items = Array.from(acc.querySelectorAll(':scope > .wiki-acc-item'));
      items.forEach(item => {
        item.addEventListener('toggle', () => {
          if (!item.open) return;
          items.forEach(other => { if (other !== item && other.open) other.open = false; });
        });
      });
    });
  }

  // ── 코드 블록: 복사 버튼 + Prism 지연 로드 ──
  const _scriptPromises = {};
  function _loadScript(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve();
    if (_scriptPromises[src]) return _scriptPromises[src];
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        // 실패는 캐시하지 않아 다음 렌더에서 재시도한다.
        delete _scriptPromises[src];
        s.remove();
        reject(new Error('스크립트 로드 실패: ' + src));
      };
      document.head.appendChild(s);
    });
    _scriptPromises[src] = p;
    return p;
  }

  function _ensureCodeFont() {
    if (document.getElementById('wiki-code-font-link')) return;
    const link = document.createElement('link');
    link.id = 'wiki-code-font-link';
    link.rel = 'stylesheet';
    link.href = CDN.codeFont;
    document.head.appendChild(link);
  }

  function _loadPrism() {
    if (window.Prism && window.Prism.plugins && window.Prism.plugins.autoloader) return Promise.resolve();
    // 코어가 로드 즉시 문서 전체를 자동 하이라이트하지 않도록 수동 모드.
    window.Prism = window.Prism || { manual: true };
    return _loadScript(CDN.prismCore)
      .then(() => _loadScript(CDN.prismAutoloader))
      .then(() => { window.Prism.plugins.autoloader.languages_path = CDN.prismComponentsBase; });
  }

  function _processCodeBlocks(containerEl) {
    let requirePrism = false;
    containerEl.querySelectorAll('pre').forEach(pre => {
      const codeEl = pre.querySelector('code');
      if (codeEl && Array.from(codeEl.classList).some(cls => cls.startsWith('language-') && cls !== 'language-')) requirePrism = true;
      if (pre.parentNode.classList.contains('wiki-code-wrapper')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'wiki-code-wrapper';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'wiki-copy-code';
      copyBtn.title = '코드 복사';
      copyBtn.setAttribute('aria-label', '코드 복사');
      copyBtn.innerHTML = '<i class="bi bi-copy"></i>';
      const flash = () => {
        copyBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
        setTimeout(() => { copyBtn.innerHTML = '<i class="bi bi-copy"></i>'; }, 2000);
      };
      copyBtn.addEventListener('click', async () => {
        const textToCopy = pre.innerText || pre.textContent;
        try {
          await navigator.clipboard.writeText(textToCopy);
          flash();
        } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = textToCopy;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); flash(); } catch (e) { /* 무시 */ }
          ta.remove();
        }
      });
      wrapper.appendChild(copyBtn);
    });
    if (!requirePrism) return;
    _ensureCodeFont();
    _loadPrism()
      .then(() => {
        if (!containerEl.isConnected) return;
        containerEl.querySelectorAll('pre code[class*="language-"]').forEach(el => window.Prism.highlightElement(el));
      })
      .catch(err => console.warn('[markup]', err.message));
  }

  // ── ```chart (Chart.js) ──
  // type: bar|line|pie|doughnut|radar / labels: [..] / series: 들여쓴 `이름: [숫자, ..]` 줄들
  const WIKI_CHART_TYPES = ['bar', 'line', 'pie', 'doughnut', 'radar'];
  const WIKI_CHART_SERIES_COLORS = {
    light: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'],
    dark: ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'],
  };

  function _wikiChartAlpha(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function _parseWikiChartSource(src) {
    const lines = (src || '').split('\n');
    let type = '';
    let labels = null;
    const series = [];
    let inSeries = false;
    const parseList = (v, what) => {
      const m = v.trim().match(/^\[(.*)\]$/);
      if (!m) throw new Error(`${what} 값은 [a, b, c] 형식이어야 합니다.`);
      return m[1].split(',').map(s => s.trim()).filter(s => s !== '');
    };
    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;
      const indented = /^[ \t]/.test(rawLine);
      const line = rawLine.trim();
      if (inSeries && indented) {
        const ci = line.indexOf(':');
        const name = ci === -1 ? '' : line.slice(0, ci).trim();
        if (!name) throw new Error(`시리즈 항목 형식 오류: "${line}" — "이름: [숫자, ...]" 형식이어야 합니다.`);
        const nums = parseList(line.slice(ci + 1), `시리즈 "${name}"`).map(Number);
        if (nums.length === 0 || nums.some(n => !Number.isFinite(n))) {
          throw new Error(`시리즈 "${name}" 값은 숫자 목록([120, 150, ...])이어야 합니다.`);
        }
        series.push({ label: name, data: nums });
        continue;
      }
      inSeries = false;
      const ci = line.indexOf(':');
      if (ci === -1) throw new Error(`알 수 없는 줄: "${line}"`);
      const key = line.slice(0, ci).trim().toLowerCase();
      const value = line.slice(ci + 1).trim();
      if (key === 'type') {
        if (!WIKI_CHART_TYPES.includes(value)) throw new Error(`지원하지 않는 type: "${value}" — bar·line·pie·doughnut·radar 중 하나여야 합니다.`);
        type = value;
      } else if (key === 'labels') {
        labels = parseList(value, 'labels');
      } else if (key === 'series') {
        if (value) throw new Error('series: 다음 줄부터 들여쓰기로 "이름: [숫자, ...]" 를 나열합니다.');
        inSeries = true;
      } else {
        throw new Error(`알 수 없는 키: "${key}" — type·labels·series 만 지원합니다(시리즈 항목은 들여쓰기 필요).`);
      }
    }
    if (!type) throw new Error('type 이 필요합니다 (bar·line·pie·doughnut·radar).');
    if (!labels || labels.length === 0) throw new Error('labels 가 필요합니다 (예: labels: [1Q, 2Q, 3Q, 4Q]).');
    if (series.length === 0) throw new Error('series 항목이 최소 1개 필요합니다.');
    if (series.length > 8) throw new Error('시리즈는 최대 8개까지 지원합니다.');
    if ((type === 'pie' || type === 'doughnut') && labels.length > 8) throw new Error('pie/doughnut 차트는 항목(labels)을 최대 8개까지 지원합니다.');
    for (const s of series) {
      if (s.data.length !== labels.length) {
        throw new Error(`시리즈 "${s.label}" 값 개수(${s.data.length})가 labels 개수(${labels.length})와 일치해야 합니다.`);
      }
    }
    return { type, labels, series };
  }

  function _buildWikiChartConfig(parsed, dark) {
    const colors = WIKI_CHART_SERIES_COLORS[dark ? 'dark' : 'light'];
    const inkRgb = dark ? [196, 200, 210] : [82, 90, 102];
    const surface = dark ? 'rgb(18, 20, 26)' : 'rgb(255, 255, 255)';
    const ink = `rgb(${inkRgb.join(', ')})`;
    const grid = `rgba(${inkRgb.join(', ')}, ${dark ? 0.24 : 0.22})`;
    const axisLine = `rgba(${inkRgb.join(', ')}, ${dark ? 0.45 : 0.38})`;
    const isPieish = parsed.type === 'pie' || parsed.type === 'doughnut';
    const datasets = parsed.series.map((s, i) => {
      const c = colors[i % colors.length];
      if (isPieish) {
        return {
          label: s.label, data: s.data,
          backgroundColor: parsed.labels.map((_, li) => colors[li % colors.length]),
          borderColor: surface, borderWidth: 2,
        };
      }
      if (parsed.type === 'line') {
        return {
          label: s.label, data: s.data, borderColor: c, backgroundColor: c,
          borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.3, fill: false,
        };
      }
      if (parsed.type === 'radar') {
        return {
          label: s.label, data: s.data, borderColor: c, backgroundColor: _wikiChartAlpha(c, 0.15),
          borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
        };
      }
      return { label: s.label, data: s.data, backgroundColor: c, borderRadius: 4, maxBarThickness: 48 };
    });
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: REDUCED ? false : undefined,
      plugins: {
        legend: {
          display: isPieish || parsed.series.length > 1,
          labels: { color: ink, usePointStyle: true, boxWidth: 8, boxHeight: 8 },
        },
      },
    };
    if (parsed.type === 'bar' || parsed.type === 'line') {
      options.scales = {
        x: { ticks: { color: ink }, grid: { display: false }, border: { color: axisLine } },
        y: { beginAtZero: true, ticks: { color: ink }, grid: { color: grid }, border: { color: axisLine } },
      };
    } else if (parsed.type === 'radar') {
      options.scales = {
        r: {
          angleLines: { color: grid }, grid: { color: grid },
          pointLabels: { color: ink }, ticks: { color: ink, backdropColor: 'transparent' },
        },
      };
    }
    return { type: parsed.type, data: { labels: parsed.labels, datasets }, options };
  }

  function _chartError(fig, html) {
    fig.innerHTML = `<div class="wiki-chart-error">${html}</div>`;
  }

  function _renderWikiChartFigure(fig, dark, state) {
    let parsed;
    try {
      parsed = _parseWikiChartSource(fig.dataset.src || '');
    } catch (err) {
      _chartError(fig, `<strong>차트 오류</strong><br><span>${escapeHtml(err && err.message ? err.message : String(err))}</span>`);
      return;
    }
    fig.innerHTML = '';
    const canvas = document.createElement('canvas');
    fig.appendChild(canvas);
    if (!fig.getAttribute('aria-label')) fig.setAttribute('aria-label', `차트: ${parsed.series.map(s => s.label).join(', ')}`);
    try {
      state.charts.push(new window.Chart(canvas, _buildWikiChartConfig(parsed, dark)));
    } catch (err) {
      console.error('[markup] 차트 렌더 실패:', err);
      _chartError(fig, '차트를 렌더링하지 못했습니다.');
    }
  }

  function _processCharts(containerEl, dark, state) {
    const figures = [];
    containerEl.querySelectorAll('pre > code.language-chart').forEach(codeEl => {
      const pre = codeEl.parentElement;
      if (!pre || !pre.parentNode) return;
      const figure = document.createElement('figure');
      figure.className = 'wiki-chart-figure';
      figure.setAttribute('role', 'img');
      figure.dataset.src = codeEl.textContent || '';
      figure.innerHTML = '<div class="wiki-chart-loading">차트 렌더링 중…</div>';
      pre.parentNode.replaceChild(figure, pre);
      figures.push(figure);
    });
    if (figures.length === 0) return;
    _loadScript(CDN.chartJs, 'Chart')
      .then(() => {
        // 로드 대기 중 재렌더로 교체됐을 수 있으므로 연결된 figure 만.
        figures.forEach(fig => { if (fig.isConnected) _renderWikiChartFigure(fig, dark, state); });
      })
      .catch(err => {
        console.error('[markup] Chart.js 로드 실패:', err);
        figures.forEach(fig => _chartError(fig, '차트 라이브러리를 불러오지 못했습니다.'));
      });
  }

  // ── 정화 설정 ──
  const PURIFY_OPTS = {
    ADD_TAGS: ['i', 'span', 'details', 'summary', 'div', 'aside', 'figure', 'figcaption', 'kbd', 'mark', 'u'],
    ADD_ATTR: [
      'class', 'style', 'data-bg', 'data-color', 'data-size', 'data-align', 'data-caption', 'data-unix',
      'data-temporal-ms', 'data-temporal-mode', 'hidden', 'data-fn-html', 'data-fn-name', 'data-fn-ref',
      'data-progress-auto', 'data-wiki-tab', 'data-single', 'colspan', 'rowspan', 'title', 'open',
      'role', 'tabindex', 'aria-controls', 'aria-selected', 'aria-labelledby', 'aria-hidden', 'aria-current',
    ],
  };

  function _sanitize(html) {
    return DOMPurify.sanitize(html, PURIFY_OPTS);
  }

  // ── 요소별 런타임 상태 (타이머·temporal 타임아웃·차트) ──
  const _states = new WeakMap();

  function teardown(el) {
    if (!el) return;
    const st = _states.get(el);
    if (st) {
      if (st.interval) clearInterval(st.interval);
      st.timeouts.forEach(id => clearTimeout(id));
      st.charts.forEach(c => { try { c.destroy(); } catch (e) { /* 무시 */ } });
      _states.delete(el);
    }
    if (_fnTipAnchor && el.contains(_fnTipAnchor)) _hideFnTip();
  }

  function _isDark(opts) {
    if (typeof opts.dark === 'boolean') return opts.dark;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ── 렌더 파이프라인 (Cloudwiki renderWikiContent 에서 위키 전용 단계를 뺀 순서 그대로) ──
  function render(src, el, opts) {
    opts = opts || {};
    if (!el) return { meta: {} };
    teardown(el);
    const state = { interval: 0, timeouts: [], charts: [] };
    _states.set(el, state);

    const md = _getMd();
    const { text: content, meta } = _applyDocMetaVars(String(src == null ? '' : src));
    el.classList.add('wiki-content');
    if (!md || typeof DOMPurify === 'undefined') {
      // 파서/정화기가 없으면 원문을 평문으로(실패 시 닫힘).
      console.warn('[markup] marked 또는 DOMPurify 가 없어 평문으로 표시합니다.');
      el.textContent = content;
      return { meta };
    }

    _anchorIds = Object.create(null);

    // 코드 펜스(``` / ~~~)와 인라인 코드를 placeholder 로 보호. 펜스 구분자 앞 제로폭 문자 허용.
    const codeBlocks = [];
    let text = content.replace(/^[​﻿]*([`~]{3,})[^\n]*\n[\s\S]*?\n[​﻿]*\1[ \t]*$|`[^`\n]+`/gm, m => {
      const idx = codeBlocks.length;
      codeBlocks.push(m.replace(/^[​﻿]+/, '').replace(/\n[​﻿]+([`~]{3,}[ \t]*)$/, '\n$1'));
      return `WIKICODEFPH${idx}XEND`;
    });
    _codeSpans = codeBlocks;
    const restoreCode = s => s.replace(/WIKICODEFPH(\d+)XEND/g, (_, i) => codeBlocks[parseInt(i, 10)]);

    // 줄 시작 제로폭 문자 제거(IME·붙여넣기 유입 시 줄 시작 문법이 깨진다).
    text = text.replace(/^[​﻿]+/gm, '');

    const tableTokenResult = _preprocessWikiTableTokens(text);
    text = tableTokenResult.text;

    // {br} → placeholder. raw HTML 은 escape 되므로 sanitize 이후 <br> 로 복원한다.
    text = text.replace(/\{br\}/g, 'WIKIBRPHEND');

    // "- []" → "- [ ]", 진행 중 "- [~]" / "- [/]" → 빈 체크박스 + 진행 표식.
    text = text.replace(/^(\s*[-*+] )\[\](?=[ \t]|$)/gm, '$1[ ]');
    {
      const progLines = text.split('\n');
      const progRe = /^(\s*(?:[-*+]|\d+\.) )\[[~/]\](?=[ \t]|$)/;
      const indentOf = ln => (ln.match(/^[ \t]*/)[0]).replace(/\t/g, '    ').length;
      for (let pi = 0; pi < progLines.length; pi++) {
        if (!progRe.test(progLines[pi])) continue;
        const indent = indentOf(progLines[pi]);
        // 4칸 이상 들여쓴 줄은 상위 리스트 항목이 있을 때만(아니면 들여쓰기 코드 블록).
        let inList = indent < 4;
        for (let pj = pi - 1; pj >= 0 && !inList; pj--) {
          if (/^\s*$/.test(progLines[pj])) continue;
          if (indentOf(progLines[pj]) >= indent) continue;
          inList = /^[ \t]*(?:[-*+]|\d+\.)\s/.test(progLines[pj]);
          break;
        }
        if (inList) progLines[pi] = progLines[pi].replace(progRe, '$1[ ] WIKITASKPROGRESSPH');
      }
      text = progLines.join('\n');
    }

    // 줄 시작 공백을 NBSP 로 보존(트리 구조 등). 리스트/인용/헤딩/표 줄은 제외.
    text = text.split('\n').map(line => {
      const m = /^([ \t]+)(\S.*)$/.exec(line);
      if (!m) return line;
      const rest = m[2];
      if (/^([-*+]|\d+\.)\s/.test(rest)) return line;
      if (rest[0] === '>' || rest[0] === '|') return line;
      if (/^#{1,6}\s/.test(rest)) return line;
      return ' '.repeat(m[1].length) + rest;
    }).join('\n');

    // 펼치기 [+ 요약] ... [-]
    const foldRegex = /^\[\+\s*(.*?)\s*\][ \t]*\n((?:(?!^\[-\][ \t]*$)[\s\S])*?)\n\[-\][ \t]*$/gm;
    const foldBlocks = [];
    text = text.replace(foldRegex, (match, titleLine, foldContent) => {
      foldContent = foldContent.replace(/^\n+|\n+$/g, '');
      let summaryText = _resolvePaletteTokens(titleLine);
      let bgOpt = '';
      let colorOpt = '';
      let replaced = true;
      while (replaced) {
        replaced = false;
        const bgMatch = summaryText.match(/\{bg:\s*([^}]+)\}/);
        if (bgMatch) { bgOpt = bgMatch[1].trim(); summaryText = summaryText.replace(bgMatch[0], ''); replaced = true; }
        const colorMatch = summaryText.match(/\{color:\s*([^}]+)\}/);
        if (colorMatch) { colorOpt = colorMatch[1].trim(); summaryText = summaryText.replace(colorMatch[0], ''); replaced = true; }
      }
      summaryText = summaryText.replace(/\{palette:\s*[^}]*\}/g, '');
      summaryText = _escapeLabelWithCodeSpans(_restoreCodeSpans(summaryText).trim());

      const foldBlockResult = _preprocessBlockDirectives(foldContent);
      const foldBlockData = foldBlockResult.blockData;
      foldBlockData.forEach(bd => { bd.innerText = restoreCode(bd.innerText); });
      const contentHtml = _sanitize(_parseBlockMarkdown(restoreCode(foldBlockResult.text), foldBlockData));

      const idx = foldBlocks.length;
      foldBlocks.push({ summaryText, bg: bgOpt, color: colorOpt, contentHtml });
      return `\n\nWIKIFOLDPH${idx}XEND\n\n`;
    });

    // ::: 블록 디렉티브. 펼치기 placeholder 는 불투명 텍스트로 취급.
    const blockResult = _preprocessBlockDirectives(text);
    const blockData = blockResult.blockData;
    blockData.forEach(bd => { bd.innerText = restoreCode(bd.innerText); });
    let rawHtml = _parseBlockMarkdown(restoreCode(blockResult.text), blockData);

    rawHtml = rawHtml.replace(/(?:<p>)?WIKIFOLDPH(\d+)XEND(?:<\/p>)?/g, (m, idx) => {
      const block = foldBlocks[parseInt(idx, 10)];
      if (!block) return '';
      const bgAttr = block.bg ? ` data-bg="${escapeHtml(block.bg)}"` : '';
      const colorAttr = block.color ? ` data-color="${escapeHtml(block.color)}"` : '';
      return `<details class="wiki-fold"${bgAttr}${colorAttr}>` +
        `<summary class="wiki-fold-summary">${block.summaryText}</summary>` +
        `<div class="wiki-fold-content">${block.contentHtml}</div>` +
        `</details>`;
    });
    _codeSpans = null;

    let html = _sanitize(rawHtml);
    html = _processInlineLayoutTokens(html);
    html = _processTimestampsInHtml(html);
    html = html.replace(/WIKIBRPHEND/g, '<br>');
    el.innerHTML = html;

    // ── DOM 후처리 ──
    _applyTableCellColors(el);
    _applyTableCellMerges(el);
    _applyWikiTableOptions(el, tableTokenResult.data);

    el.querySelectorAll('.wiki-fold').forEach(fold => {
      const bg = fold.getAttribute('data-bg');
      const color = fold.getAttribute('data-color');
      if (bg && _isSafeCssColor(bg)) fold.style.backgroundColor = bg;
      if (color && _isSafeCssColor(color)) {
        const summary = fold.querySelector('summary');
        if (summary) summary.style.color = color;
      }
    });

    _processInlineIcons(el);
    _processFootnotes(el);
    _bindFootnoteTips(el);
    _processEmbeds(el);
    _processLinks(el);

    el.querySelectorAll('table').forEach(t => {
      const wrapper = document.createElement('div');
      wrapper.className = 'wiki-table-wrapper';
      if (t.style.width || /\bwiki-table-align-/.test(t.className)) wrapper.classList.add('wiki-table-wrapper-full');
      if (t.classList.contains('wiki-table-sticky-header')) wrapper.classList.add('wiki-table-wrapper-scroll');
      t.parentNode.insertBefore(wrapper, t);
      wrapper.appendChild(t);
    });

    _processImageFigures(el);
    _processCharts(el, _isDark(opts), state);
    _processCodeBlocks(el);
    _bindTabs(el);
    _bindAccordions(el);

    // {collapse} 헤딩이 하나라도 있으면 섹션 접기를 켠다. 각주 목록은 섹션 밖 맨 아래로.
    if (_applyHeadingCollapseTokens(el)) {
      _makeCollapsibleSections(el);
      const footnotesEl = el.querySelector('.wiki-footnotes');
      if (footnotesEl && footnotesEl.parentElement !== el) el.appendChild(footnotesEl);
    }

    _initTimers(el, state);
    _initTemporal(el, state);
    _fillAutoProgressBars(el);

    return { meta };
  }

  function extractMeta(src) {
    return _applyDocMetaVars(String(src == null ? '' : src)).meta;
  }

  window.TsukuyomiMarkup = { render, teardown, extractMeta };
})();
