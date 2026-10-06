# -*- coding: utf-8 -*-
"""wallpaper 패키지 검증 (읽기 전용, 수정 없음).

검사:
  1. vendor 동결본 == public 현행본 (sha256, 7개 파일)
  2. project.json 유효성 (file/type/기본 4종/전 GROUPS 커버/기본값 일치/타입·조건)
  3. wallpaper.js 내 REBUILD 맵 == tools/rebuild-map.json (GROUPS rebuild와 1:1)
  4. wallpaper.html 참조 무결성 (vendor만 참조, public/debug/cloudedit/bootstrap 금지)
  5. wallpaper.css 숨김 규칙 존재
  6. public·wrangler·preview-worker 무수정 (git status가 wallpaper/ 밖 변경 없음)

실행: python wallpaper/tools/verify-wallpaper.py
성공 시 exit 0 + 요약 출력, 실패 시 exit 1 + 원인 출력.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public"
WP = ROOT / "wallpaper"
VENDOR = WP / "vendor"

FROZEN_FILES = [
    "tsukuyomi.js",
    "tsukuyomi.css",
    "cloud-doc.js",
    "cloud-live.js",
    "lantern-front.svg",
    "assets/icons/icon.svg",
    "clouds/index.json",
]

failures = []


def check(name, cond, detail=""):
    tag = "OK" if cond else "FAIL"
    line = f"[{tag}] {name}" + (f" - {detail}" if detail and not cond else "")
    try:
        print(line)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode("ascii"))
    if not cond:
        failures.append(name)


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    # 1. vendor == public
    for rel in FROZEN_FILES:
        pub, ven = PUB / rel, VENDOR / rel
        if not pub.is_file():
            check(f"public 존재: {rel}", False, "원본 없음")
            continue
        if not ven.is_file():
            check(f"vendor 존재: {rel}", False, "복사본 없음")
            continue
        check(f"동결 일치: {rel}", sha256(pub) == sha256(ven),
              f"public와 vendor 해시 불일치 (동결 깨짐)")

    # 2. project.json
    pj_path = WP / "project.json"
    try:
        pj = json.loads(pj_path.read_text(encoding="utf-8"))
        pj_ok = True
    except Exception as e:
        check("project.json 파싱", False, str(e))
        pj = None
        pj_ok = False
    if pj_ok:
        check("project.json file", pj.get("file") == "wallpaper.html", f"file={pj.get('file')}")
        check("project.json type", pj.get("type") == "web", f"type={pj.get('type')}")
        props = (pj.get("general") or {}).get("properties") or {}
        for k in ("a00_scene", "a01_intro", "a02_show_advanced", "a03_snapshot_json"):
            check(f"project.json 기본 속성: {k}", k in props, "누락")
        sc = props.get("a00_scene", {})
        check("scene 콤보", sc.get("type") == "combo"
              and sorted(o.get("value") for o in sc.get("options", [])) == [1, 2, 3],
              "options 1/2/3 (낮/황혼/밤) 필요")
        check("scene 기본값 밤", sc.get("value") == 3, f"value={sc.get('value')}")
        check("intro 기본값 켜짐", props.get("a01_intro", {}).get("value") is True, "기본값 true 필요")
        check("intro 조건(밤만)", props.get("a01_intro", {}).get("condition") == "a00_scene.value == 3",
              "밤 선택 시에만 표시")
        # WE Installed 탭 썸네일은 preview.jpg/gif 관례만 인식한다 (thumbnail.png 등 별도명 무시됨).
        pv = pj.get("preview")
        check("preview 관례명", isinstance(pv, str) and pv in ("preview.jpg", "preview.gif"),
              f"preview={pv!r}")
        check("preview 파일 존재", isinstance(pv, str) and (WP / pv).is_file(),
              "project.json preview 대상 없음")
        # GROUPS 전수 대조
        dbg = (ROOT / "public" / "tsukuyomi.debug.js").read_text(encoding="utf-8")
        blocks = re.findall(
            r"\{\s*title:\s*'([^']+)'\s*,\s*keys:\s*\[(.*?)\]\s*\}",
            dbg, re.S,
        )
        cat_order, cat_keys = [], {}
        for title, keys_block in blocks:
            cat_order.append(title)
            cat_keys[title] = [m.group(1) for m in
                               re.finditer(r"\['([A-Z0-9_]+)'", keys_block)]
        entries = []
        for title, keys_block in blocks:
            for m in re.finditer(
                    r"\['([A-Z0-9_]+)',\s*([^\],]+),\s*([^\],]+),\s*([^\],]+?)(?:,\s*'([a-z]+)')?\]",
                    keys_block):
                entries.append({
                    "title": title, "key": m.group(1),
                    "min": float(m.group(2)), "max": float(m.group(3)),
                    "step": m.group(4).strip(),
                })
        check("GROUPS 파싱", len(entries) > 100 and len(cat_order) == 12,
              f"{len(entries)}개/{len(cat_order)}종")
        # WE 조건식은 식별자 형태(문자 시작)의 키만 해석한다.
        # 숫자로 시작하는 키는 조건 평가가 실패해 속성이 영구히 숨겨진다 (회귀 방지).
        bad_keys = [k for k in props if not re.match(r"^[A-Za-z][A-Za-z0-9_]*$", k)]
        check("키 식별자 형태(조건식 해석)", not bad_keys, f"{bad_keys[:5]}")
        # 에디터 출력에는 "index"가 없다. 비표준 키가 있으면 WE가 파일을 거부할 수 있다 (회귀 방지).
        no_index = [k for k, p in props.items() if "index" in p]
        check("비표준 index 없음(에디터 출력과 동일)", not no_index, f"{no_index[:5]}")
        # 그룹 헤더 12종: 키 a04~a15, type=group, 조건은 고급 표시
        headers = [k for k, p in props.items() if p.get("type") == "group"]
        check("그룹 헤더 12종", len(headers) == 12, f"{len(headers)}종")
        if len(headers) == 12:
            check("그룹 헤더 키 a04~a15", sorted(headers) == [f"a{i:02d}" for i in range(4, 16)],
                  f"{sorted(headers)[:4]}...")
            htxt = [props[k].get("text") for k in sorted(headers)]
            check("그룹 헤더명==디버그 카테고리", htxt == cat_order, f"{htxt[:3]}...")
        code_of = {t: f"a{4 + i:02d}" for i, t in enumerate(cat_order)}
        expected = {f"{code_of[e['title']]}_{e['key']}": e["title"] for e in entries}
        missing = [k for k in expected if k not in props]
        check("고급 멤버 전수 커버", not missing, f"누락 {len(missing)}개: {missing[:8]}")

        def runs(seq):
            out, prev = [], None
            for k in seq:
                if expected[k] != prev:
                    out.append(expected[k])
                    prev = expected[k]
            return out

        # 카테고리 뭉침: 파일 순서·order 순서·알파벳 순서 모두에서 카테고리 런이 일치
        file_seq = [k for k in props if k in expected]
        order_seq = [k for k in sorted(props, key=lambda k: props[k].get("order", 9999))
                     if k in expected]
        alpha_seq = sorted(expected)
        ok_runs = all(runs(s) == cat_order for s in (file_seq, order_seq, alpha_seq))
        check("카테고리 뭉침(파일/order/알파벳)", ok_runs, "런 분리됨")
        # 헤더가 멤버보다 먼저 오는지 (파일 순서·order 순서·알파벳 순서 모두)
        ok_pos = True
        for keys_in_order in (list(props),
                              sorted(props, key=lambda k: props[k].get("order", 9999)),
                              sorted(props)):
            hpos = {k: keys_in_order.index(k) for k in headers}
            for k in (kk for kk in keys_in_order if kk in expected):
                if hpos[k.split("_")[0]] > keys_in_order.index(k):
                    ok_pos = False
        check("헤더가 멤버보다 먼저", ok_pos, "역전 있음")
        # 기본값 == vendor CFG
        vendor_js = (VENDOR / "tsukuyomi.js").read_text(encoding="utf-8")
        cfg_block = re.search(r"const CFG = \{(.*?)\n\s*\};", vendor_js, re.S).group(1)
        cfg = dict(re.findall(r"([A-Z][A-Z0-9_]*)\s*:\s*(-?[\d.eE+\-]+)", cfg_block))
        bad_defaults = []
        for e in entries:
            k, mn, mx = e["key"], e["min"], e["max"]
            p = props.get(f"{code_of[e['title']]}_{k}")
            if not p:
                continue
            # 기대 기본값 = 동결 CFG를 슬라이더 범위로 클램프한 값
            # (RIP_MAX 20 -> 8: 셰이더 슬롯 상한과 동일 동작)
            exp = min(mx, max(mn, float(cfg[k])))
            if p.get("type") == "bool":
                if bool(exp >= 0.5) != bool(p.get("value")):
                    bad_defaults.append(k)
            else:
                try:
                    if abs(float(p.get("value")) - exp) > 1e-9:
                        bad_defaults.append(k)
                except (TypeError, ValueError):
                    bad_defaults.append(k)
                if abs(float(p.get("min")) - mn) > 1e-9 or abs(float(p.get("max")) - mx) > 1e-9:
                    bad_defaults.append(k + "(range)")
        check("고급 기본값==동결 CFG", not bad_defaults, f"불일치: {bad_defaults[:8]}")
        adv_cond = [k for k in list(expected) + headers
                    if props.get(k, {}).get("condition") != "a02_show_advanced.value == true"]
        check("고급 조건 일괄", not adv_cond, f"조건 없음: {adv_cond[:5]}")
        # 슬라이더 스키마: 에디터 생성 파일과 동일한 키셋 (min/max/step/fraction[/precision])
        bad_schema = []
        for e in entries:
            k = e["key"]
            p = props.get(f"{code_of[e['title']]}_{k}")
            if not p or p.get("type") != "slider":
                continue
            try:
                v, lo, hi, sp = (float(p.get("value")), float(p.get("min")),
                                float(p.get("max")), float(p.get("step")))
                if not (sp > 0 and lo < hi and lo - 1e-12 <= v <= hi + 1e-12):
                    bad_schema.append(k + "(range)")
            except (TypeError, ValueError):
                bad_schema.append(k + "(nan)")
                continue
            if not isinstance(p.get("fraction"), bool):
                bad_schema.append(k + "(fraction)")
            if p["fraction"]:
                pr = p.get("precision")
                if not isinstance(pr, int) or not (0 <= pr <= 4):
                    bad_schema.append(k + "(precision)")
            elif "precision" in p:
                bad_schema.append(k + "(precision-omit)")
        check("슬라이더 스키마(step/fraction/precision/범위)", not bad_schema,
              f"불일치: {bad_schema[:8]}")
        # 콤보 옵션값 유일성 + 조건 참조키 존재
        for k, p in props.items():
            if p.get("type") == "combo":
                vals = [o.get("value") for o in p.get("options", [])]
                if len(vals) < 1 or len(set(map(str, vals))) != len(vals):
                    check(f"콤보 옵션 유일: {k}", False, f"{vals}")
        refs_bad = []
        for k, p in props.items():
            for ref in re.findall(r"([A-Za-z0-9_]+)\.value", str(p.get("condition") or "")):
                if ref not in props:
                    refs_bad.append(f"{k}->{ref}")
        check("조건 참조키 존재", not refs_bad, f"{refs_bad[:5]}")

    # 3. REBUILD 맵 일치
    try:
        rebuild_map = json.loads((WP / "tools" / "rebuild-map.json").read_text(encoding="utf-8"))
    except Exception as e:
        rebuild_map = None
        check("rebuild-map.json 파싱", False, str(e))
    wjs = (WP / "wallpaper.js").read_text(encoding="utf-8")
    m = re.search(r"const REBUILD = \{(.*?)\};", wjs, re.S)
    if not m:
        check("wallpaper.js REBUILD 존재", False, "const REBUILD 블록 없음")
    else:
        embedded = dict(re.findall(r"([A-Z][A-Z0-9_]*)\s*:\s*'([a-z]+)'", m.group(1)))
        if rebuild_map is not None:
            check("REBUILD==rebuild-map.json", embedded == rebuild_map,
                  f"차이: js전용={sorted(set(embedded) - set(rebuild_map))[:5]} "
                  f"map전용={sorted(set(rebuild_map) - set(embedded))[:5]}")

    # 4. wallpaper.html 참조
    html = (WP / "wallpaper.html").read_text(encoding="utf-8")
    for ref in ("vendor/tsukuyomi.js", "vendor/tsukuyomi.css",
                "vendor/cloud-doc.js", "vendor/cloud-live.js",
                "wallpaper.js", "wallpaper.css"):
        check(f"html 참조: {ref}", ref in html, "누락")
    for banned in ("../public", "public/tsukuyomi", "tsukuyomi.debug.js",
                   "tsukuyomi.cloudedit", "tsukuyomi.debug.css", "bootstrap-icons"):
        check(f"html 금지 참조 없음: {banned}", banned not in html, "포함됨")

    # 5. wallpaper.css 숨김
    css = (WP / "wallpaper.css").read_text(encoding="utf-8")
    check("css dock 숨김", ".dock" in css and "display" in css and "none" in css, "")
    check("css panel 숨김", ".panel" in css, "")

    # 6. wallpaper/ 밖 무수정
    try:
        out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                             capture_output=True, text=True, timeout=30)
        lines = [ln for ln in out.stdout.splitlines() if ln.strip()]
        # porcelain: XY + space + path. wallpaper/ 밖 경로만 추림.
        outside = []
        for ln in lines:
            path = ln[3:].strip().strip('"')
            # rename "old -> new" 형태 처리
            if " -> " in path:
                path = path.split(" -> ")[-1].strip().strip('"')
            # dist-we/는 배포 산출물(zip) 보관용으로 웹 배포와 무관하므로 제외
            if not path.startswith("wallpaper/") and not path.startswith("dist-we/"):
                outside.append(ln)
        check("웹 배포 영향 없음 (wallpaper/ 밖 변경 없음)", not outside,
              f"{len(outside)}건: {outside[:5]}")
    except Exception as e:
        check("git status 확인", False, str(e))

    print(f"\n{'PASS' if not failures else 'FAIL'}: {len(failures)}건 실패"
          + (f" ({failures})" if failures else ""))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
