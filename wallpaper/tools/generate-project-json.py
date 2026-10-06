# -*- coding: utf-8 -*-
"""wallpaper/project.json 생성기 (1회성 프리즈용, 재생성 가능).

읽기만 함 (수정 없음):
  - wallpaper/vendor/tsukuyomi.js  -> CFG 기본값 (정확한 동결 수치)
  - public/tsukuyomi.debug.js     -> GROUPS (디버그 패널 스키마: min/max/step/rebuild)

쓰기:
  - wallpaper/project.json        -> WE 사용자 속성 (기본 4종 + 그룹 12종 + CFG 전체 위임)
  - wallpaper/tools/rebuild-map.json -> wallpaper.js와 GROUPS rebuild 대조용

키 규칙 (WE의 표시 순서와 무관하게 카테고리가 뭉치도록):
  - 모든 키에 문자+2자리 순서 접두사. 알파벳순 렌더·파일순 렌더·order 렌더 모두에서 동일 배치.
  - WE 조건식은 식별자 형태(문자 시작)의 키만 해석하므로 숫자로 시작 금지.
  - 기본: a00_scene, a01_intro, a02_show_advanced, a03_snapshot_json (그룹에 속하지 않음)
  - 그룹 헤더: a04 ~ a15 (값 없음, type=group, 그 뒤 속성이 소속)
  - 멤버: <헤더코드>_<CFG키> (예: a04_T_NIGHT)

실행: python wallpaper/tools/generate-project-json.py
"""
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENDOR_JS = ROOT / "wallpaper" / "vendor" / "tsukuyomi.js"
DEBUG_JS = ROOT / "public" / "tsukuyomi.debug.js"
OUT_JSON = ROOT / "wallpaper" / "project.json"
OUT_MAP = ROOT / "wallpaper" / "tools" / "rebuild-map.json"


def parse_cfg(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.search(r"const CFG = \{(.*?)\n\s*\};", text, re.S)
    if not m:
        raise SystemExit(f"CFG block not found in {path}")
    block = m.group(1)
    cfg = {}
    for key, raw in re.findall(r"([A-Z][A-Z0-9_]*)\s*:\s*(-?[\d.eE+\-]+)", block):
        try:
            cfg[key] = float(raw)
        except ValueError:
            raise SystemExit(f"non-numeric CFG value: {key} = {raw}")
    if not cfg:
        raise SystemExit(f"CFG parse empty in {path}")
    return cfg


def parse_groups(path: Path):
    text = path.read_text(encoding="utf-8")
    titles = re.findall(r"\{\s*title:\s*'([^']+)'", text)
    entries = re.findall(
        r"\['([A-Z0-9_]+)',\s*([^\],]+),\s*([^\],]+),\s*([^\],]+?)(?:,\s*'([a-z]+)')?\]",
        text,
    )
    if not titles or not entries:
        raise SystemExit(f"GROUPS parse failed in {path}")
    # entries를 title 순서대로 묶기: debug.js는 GROUPS 배열 순서대로 keys를 나열하므로,
    # 각 title 블록의 keys 개수를 세어 매핑한다.
    blocks = re.findall(
        r"\{\s*title:\s*'([^']+)'\s*,\s*keys:\s*\[(.*?)\]\s*\}",
        text,
        re.S,
    )
    grouped = []
    for title, keys_block in blocks:
        keys = re.findall(
            r"\['([A-Z0-9_]+)',\s*([^\],]+),\s*([^\],]+),\s*([^\],]+?)(?:,\s*'([a-z]+)')?\]",
            keys_block,
        )
        for k, mn, mx, st, rb in keys:
            grouped.append(
                {
                    "group": title,
                    "key": k,
                    "min": float(mn),
                    "max": float(mx),
                    "step": st.strip(),
                    "rebuild": rb or "",
                }
            )
    return grouped


def decimals(step_str: str) -> int:
    s = step_str.strip()
    if "." not in s:
        return 0
    return min(4, len(s.split(".")[1].rstrip("0")) or 1)


def num(x: float):
    # 에디터 생성 파일과 동일하게 정수값은 int로 기록 (8.0 -> 8)
    if float(x).is_integer():
        return int(x)
    return float(x)


def main() -> None:
    cfg = parse_cfg(VENDOR_JS)
    grouped = parse_groups(DEBUG_JS)

    missing = [g["key"] for g in grouped if g["key"] not in cfg]
    if missing:
        raise SystemExit(f"CFG defaults missing for: {missing}")

    props = {}
    order = 0

    def add(key, prop):
        nonlocal order
        # WE 에디터 출력과 동일한 키셋만 사용한다. "index"는 비표준이므로 기록하지 않는다.
        prop["order"] = order
        order += 1
        props[key] = prop

    # 그룹에 속하지 않는 속성은 첫 그룹보다 앞에 둔다 (WE 그룹 규칙).
    add("a00_scene", {
        "text": "장면 (하단 시간대 UI 대신)",
        "type": "combo",
        "value": 3,
        "options": [
            {"label": "낮", "value": 1},
            {"label": "황혼", "value": 2},
            {"label": "밤", "value": 3},
        ],
    })
    add("a01_intro", {
        "text": "밤 선택 시 초기 연출(황혼→밤) 재생",
        "type": "bool",
        "value": True,
        "condition": "a00_scene.value == 3",
    })
    add("a02_show_advanced", {
        "text": "고급 옵션 표시",
        "type": "bool",
        "value": False,
    })
    add("a03_snapshot_json", {
        "text": "고급 스냅샷 JSON (웹 디버그 내보내기 붙여넣기, 비우면 무시)",
        "type": "textinput",
        "value": "",
        "condition": "a02_show_advanced.value == true",
    })

    # 카테고리 그룹 헤더 12종 (디버그 패널 GROUPS 순서). 코드 a04~a15.
    # 헤더 키(예: "a04")는 멤버 키(예: "a04_T_NIGHT")의 접두사이므로
    # 알파벳순에서도 헤더가 멤버보다 먼저 온다.
    group_codes = {}
    for gi, g in enumerate(grouped):
        title = g["group"]
        if title not in group_codes:
            code = f"a{4 + len(group_codes):02d}"
            group_codes[title] = code
            add(code, {
                "text": title,
                "type": "group",
                "condition": "a02_show_advanced.value == true",
            })

    for g in grouped:
        key = g["key"]
        code = group_codes[g["group"]]
        default = cfg[key]
        step = g["step"]
        step_f = float(step)
        prop_key = f"{code}_{key}"
        base = {
            "text": key,
            "condition": "a02_show_advanced.value == true",
        }
        if g["min"] == 0 and g["max"] == 1 and step_f == 1:
            base.update({"type": "bool", "value": bool(default >= 0.5)})
        else:
            # 실제 에디터 생성 파일과 동일한 키셋: min/max/step/precision/fraction.
            # step 누락 시 WE가 슬라이더를 렌더하지 못하므로 필수.
            # fraction:false(정수형)는 precision 키를 생략한다 (에디터 출력과 동일).
            # value는 범위 안으로 클램프한다 (예: RIP_MAX 동결값 20은
            # 셰이더 슬롯 상한 8로 클램프되어 동작하므로 8과 동일).
            v = min(g["max"], max(g["min"], default))
            base.update({
                "type": "slider",
                "value": num(v),
                "min": num(g["min"]),
                "max": num(g["max"]),
                "step": num(step_f),
            })
            if step_f < 1:
                base["fraction"] = True
                base["precision"] = decimals(step)
            else:
                base["fraction"] = False
        add(prop_key, base)

    project = {
        "file": "wallpaper.html",
        # WE Installed 탭 썸네일은 preview.jpg/gif 관례명만 인식한다.
        # thumbnail.png 등 별도명은 무시되므로 반드시 preview.jpg를 지정한다.
        "preview": "preview.jpg",
        "title": "Tsukuyomi 月",
        "description": "낮·황혼·밤이 이어지는 고요한 수면. 하단 시간대 UI는 숨김, 장면은 이 옵션에서 선택. 밤 선택 시 초기 황혼→밤 연출을 켜거나 끌 수 있다. 고급 옵션을 켜면 웹 디버그 패널의 파라미터를 그대로 조절할 수 있다.",
        "type": "web",
        "general": {"properties": props},
    }
    # 바이트 쓰기로 LF 고정 (Windows 텍스트 쓰기의 CRLF 변환 방지).
    OUT_JSON.write_bytes(
        (json.dumps(project, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )
    rebuild = {g["key"]: g["rebuild"] for g in grouped if g["rebuild"]}
    OUT_MAP.write_bytes(
        (json.dumps(rebuild, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8"),
    )
    print(f"groups={len(grouped)} categories={len(group_codes)} "
          f"props={len(props)} -> {OUT_JSON.name}")


if __name__ == "__main__":
    sys.exit(main())
