# -*- coding: utf-8 -*-
"""wallpaper/project.json 생성기 (1회성 프리즈용, 재생성 가능).

읽기만 함 (수정 없음):
  - wallpaper/vendor/tsukuyomi.js  -> CFG 기본값 (정확한 동결 수치)
  - wallpaper/vendor/tsukuyomi.js  -> FISH 기본값 (토리이 수면 상승 물고기, 반사광 tlOn 포함)
  - public/tsukuyomi.debug.js     -> GROUPS (디버그 패널 스키마: min/max/step/rebuild)
                                     FISH_GROUPS / FISH_COLORS (물고기 패널 스키마)

쓰기:
  - wallpaper/project.json        -> WE 사용자 속성 (기본 7종 + 그룹 12종 + CFG 전체 위임)
  - wallpaper/tools/rebuild-map.json -> wallpaper.js와 GROUPS rebuild 대조용

키 규칙 (WE의 표시 순서와 무관하게 카테고리가 뭉치도록):
  - 모든 키에 문자+2자리 순서 접두사. 알파벳순 렌더·파일순 렌더·order 렌더 모두에서 동일 배치.
  - WE 조건식은 식별자 형태(문자 시작)의 키만 해석하므로 숫자로 시작 금지.
  - 기본: a00_scene, a01_intro, a01_fish(밤 계열 노출 콤보), a01_daystars, a01_daytone, a01_daydark,
    a01_roomfront(야치요의 방 선택 시 노출 병풍 정면 뷰),
    a02_show_advanced, a03_snapshot_json (그룹에 속하지 않음. intro/fish는 밤/미러볼,
    daystars/daytone/daydark는 공백 선택 시, roomfront는 방 선택 시 노출)
  - 그룹 헤더: a04 ~ a15 (값 없음, type=group, 그 뒤 속성이 소속)
  - 멤버: <헤더코드>_<CFG키> (예: a04_T_NIGHT)
  - 물고기 그룹: a16 헤더 + a16_fish_<FISH키> (토리이 반사광 켜기 tlOn 체크가 맨 앞, 색은 color)

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


def parse_fish(path: Path) -> dict:
    """vendor 코어의 FISH 기본값 (숫자 + '#rrggbb' 색)."""
    text = path.read_text(encoding="utf-8")
    m = re.search(r"const FISH = \{(.*?)\};", text, re.S)
    if not m:
        raise SystemExit(f"FISH block not found in {path}")
    out = {}
    for key, raw in re.findall(r"\b([a-z][A-Za-z0-9]*)\s*:\s*('#[0-9a-fA-F]{6}'|-?[\d.]+)", m.group(1)):
        out[key] = raw.strip("'") if raw.startswith("'") else float(raw)
    return out


def parse_fish_groups(path: Path):
    """디버그 패널 FISH_GROUPS (슬라이더) + check (체크) + FISH_COLORS (색)."""
    text = path.read_text(encoding="utf-8")
    m = re.search(r"const FISH_GROUPS = \[(.*?)\n\s*\];", text, re.S)
    c = re.search(r"const FISH_COLORS = \[(.*?)\];", text, re.S)
    if not m or not c:
        raise SystemExit(f"FISH_GROUPS/FISH_COLORS not found in {path}")
    checks = re.findall(r"check:\s*\['([a-zA-Z0-9]+)',\s*'([^']+)'\]", m.group(1))
    sliders = [
        {"key": k, "min": float(mn), "max": float(mx), "step": st.strip()}
        for k, mn, mx, st in re.findall(
            r"\['([a-z][A-Za-z0-9]*)',\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]", m.group(1))
    ]
    colors = re.findall(r"\['(c\d)',\s*'([^']+)'\]", c.group(1))
    if not checks or not sliders or not colors:
        raise SystemExit(f"FISH_GROUPS parse failed in {path}")
    return checks, sliders, colors


def hex_to_we(h: str) -> str:
    # WE color 속성 값: "r g b" (0~1 실수, 공백 구분)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return " ".join(f"{v:.4f}".rstrip("0").rstrip(".") if v not in (0, 1) else str(int(v)) for v in (r, g, b))


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
        "text": "장면",
        "type": "combo",
        "value": 3,
        # 표시 순서는 산 계열이 먼저. 값은 기존 1~4(츠쿠요미 바다/황혼/밤/미러볼)를 유지하고 산 2종을 5/6,
        # 지구/야치요의 방/뉴스 3종을 7/8/9로 붙인다 (기존 설치본의 저장값이 그대로 같은 장면을 가리키도록).
        "options": [
            {"label": "산", "value": 5},
            {"label": "산 (노을)", "value": 6},
            {"label": "츠쿠요미 바다", "value": 1},
            {"label": "황혼", "value": 2},
            {"label": "밤", "value": 3},
            {"label": "미러볼", "value": 4},
            {"label": "지구", "value": 7},
            {"label": "야치요의 방", "value": 8},
            {"label": "뉴스 츠쿠요미", "value": 9},
        ],
    })
    add("a01_intro", {
        "text": "밤 / 미러볼 장면 초기 연출 재생",
        "type": "bool",
        "value": True,
        "condition": "a00_scene.value == 3 || a00_scene.value == 4",
    })
    # 물고기 군집: 밤 계열 선택 시 노출되는 일반 옵션 드롭다운 (고급과 무관).
    # 밤에서만 그려지고 다른 장면에서는 값을 유지한 채 효과가 없다 (웹 하단 군집 3버튼과 동일).
    # 기존 UI 텍스트 관행대로 이름만 노출한다 (끔 / 커서 따라가기 / 달에 배치).
    add("a01_fish", {
        "text": "물고기 군집",
        "type": "combo",
        "value": 0,
        "options": [
            {"label": "끔", "value": 0},
            {"label": "커서 따라가기", "value": 1},
            {"label": "달에 배치", "value": 2},
        ],
        "condition": "a00_scene.value == 3 || a00_scene.value == 4",
    })
    # 공백 장면 토글 3종: 그룹 미소속(고급 표시와 무관). 공백 선택 시에만 노출된다.
    # 공백 장면에서만 그려지고 다른 장면에서는 값을 유지한 채 효과가 없다 (웹 하단 btnStars/바다 색감/btnDark와 동일).
    # 색조·밤은 웹과 같이 둘 중 하나만 고른다 (둘 다 켜면 밤이 우선).
    add("a01_daystars", {
        "text": "별 궤적 표시",
        "type": "bool",
        "value": False,
        "condition": "a00_scene.value == 1",
    })
    add("a01_daytone", {
        "text": "파스텔 색조",
        "type": "bool",
        "value": False,
        "condition": "a00_scene.value == 1",
    })
    add("a01_daydark", {
        "text": "밤",
        "type": "bool",
        "value": False,
        "condition": "a00_scene.value == 1",
    })
    # 八 하위장면: 야치요의 방 선택 시 노출되는 일반 옵션 (고급과 무관).
    # 방 장면에서만 그려지고 다른 장면에서는 값을 유지한 채 효과가 없다 (웹 #btnRoomFront와 동일).
    add("a01_roomfront", {
        "text": "병풍 정면 뷰",
        "type": "bool",
        "value": False,
        "condition": "a00_scene.value == 8",
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

    slider_items = grouped

    for g in slider_items:
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

    # 물고기 (토리이 수면 상승) 그룹: 코드 a16. CFG가 아니라 코어 FISH 객체(__TSUKUYOMI__.fish)에 위임한다.
    # 토리이 반사광 켜기(tlOn) 체크를 맨 앞에 둔다. 멤버 키는 a16_fish_<FISH키>.
    fish = parse_fish(VENDOR_JS)
    checks, sliders, colors = parse_fish_groups(DEBUG_JS)
    fcode = f"a{4 + len(group_codes):02d}"
    adv = "a02_show_advanced.value == true"
    add(fcode, {"text": "물고기 (토리이 수면 상승)", "type": "group", "condition": adv})
    for key, label in checks:
        if key not in fish:
            raise SystemExit(f"FISH default missing for: {key}")
        add(f"{fcode}_fish_{key}", {
            "text": label, "condition": adv, "type": "bool", "value": bool(fish[key] >= 0.5),
        })
    for s in sliders:
        key = s["key"]
        if key not in fish:
            raise SystemExit(f"FISH default missing for: {key}")
        step_f = float(s["step"])
        v = min(s["max"], max(s["min"], fish[key]))
        prop = {
            "text": key, "condition": adv, "type": "slider",
            "value": num(v), "min": num(s["min"]), "max": num(s["max"]), "step": num(step_f),
        }
        if step_f < 1:
            prop["fraction"] = True
            prop["precision"] = decimals(s["step"])
        else:
            prop["fraction"] = False
        add(f"{fcode}_fish_{key}", prop)
    for key, label in colors:
        add(f"{fcode}_fish_{key}", {
            "text": f"{key} ({label})", "condition": adv, "type": "color", "value": hex_to_we(fish[key]),
        })

    project = {
        "file": "wallpaper.html",
        # WE Installed 탭 썸네일은 preview.jpg/gif 관례명만 인식한다.
        # thumbnail.png 등 별도명은 무시되므로 반드시 preview.jpg를 지정한다.
        "preview": "preview.jpg",
        "title": "Tsukuyomi 月",
        "description": "산·산(노을)·츠쿠요미 바다·황혼·밤·미러볼·지구·야치요의 방·뉴스 츠쿠요미를 고르는 고요한 토리이 장면. 산 계열은 산정 토리이 세계로, 지구·야치요의 방·뉴스 츠쿠요미는 각 세계로 페이드 전환된다. 하단 시간대 UI는 숨김, 장면은 이 옵션에서 선택. 밤 계열 선택 시 초기 연출과 물고기 군집을 고를 수 있다 (밤: 황혼→밤 / 미러볼: 그 이후 미러볼 전환까지). 공백 장면의 별 궤적·파스텔 색조·공백 밤 토글은 츠쿠요미 바다 선택 시 보이며(고급과 무관), 츠쿠요미 바다에서만 적용된다. 야치요의 방 선택 시 병풍 정면 뷰 토글이 보이며(고급과 무관), 방 장면에서만 적용된다. 고급 옵션을 켜면 웹 디버그 패널의 파라미터(물고기 토리이 수면 상승·토리이 반사광 포함)를 그대로 조절할 수 있다.",
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
    print(f"groups={len(grouped)} categories={len(group_codes)}+fish "
          f"props={len(props)} -> {OUT_JSON.name}")


if __name__ == "__main__":
    sys.exit(main())
