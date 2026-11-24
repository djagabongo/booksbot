#!/usr/bin/env python3
"""
Генерира assets/catalog.js от експорта на каталога (catalog-list.json, models.json)
и assets/legal.js от текстовете на правните страници.

Употреба:
    python3 tools/build_catalog.py <папка_с_източници>

В папката трябва да има:
    catalog-list.json, models.json, shop.json (по желание)
    legal/<delivery|returns|terms|privacy|cookies>.txt (по желание)
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT_MAP = {"Телефони": "phones", "Таблети": "tablets", "Аксесоари": "accessories", "Камери": "cameras"}
UNSET = {"Не е посочена", "Неуточнен цвят", "Стандартна версия", ""}


def img_ref(path):
    """'/assets/products/abc.webp' -> 'abc' ; друго -> относителен път."""
    if not path:
        return ""
    m = re.match(r"^/assets/products/([0-9a-f]+)\.webp$", path)
    if m:
        return m.group(1)
    return "assets/img/" + path.removeprefix("/assets/")


def num(v):
    if v is None:
        return None
    return int(v) if float(v).is_integer() else round(float(v), 2)


def build_catalog(src):
    items = json.load(open(os.path.join(src, "catalog-list.json"), encoding="utf-8"))
    models = json.load(open(os.path.join(src, "models.json"), encoding="utf-8"))
    overrides = {}
    shop_path = os.path.join(src, "shop.json")
    if os.path.exists(shop_path):
        overrides = json.load(open(shop_path, encoding="utf-8")).get("overrides", {})

    groups, singles, logos = {}, [], {}
    thumbs_missing = set()
    for x in items:
        cat = CAT_MAP.get(x["cat"], "accessories")
        if x.get("brandLogo"):
            logos.setdefault(x["brand"], img_ref(x["brandLogo"]))
        im = img_ref(x.get("img"))
        if x.get("img") and not x.get("thumb"):
            thumbs_missing.add(im)
        ov = overrides.get(str(x["id"]), {})
        disc = ov.get("discountPercent")
        out_of_stock = ov.get("stockStatus") not in (None, "in_stock")
        if x.get("groupId"):
            g = groups.setdefault(x["groupSlug"], {
                "s": x["groupSlug"], "n": x["familyName"], "b": x["brand"], "c": cat,
                "mk": x.get("modelKey", ""), "sp": {}, "v": [],
            })
            o = x.get("options", {})
            g["v"].append([
                x["id"],
                "" if o.get("storage") in UNSET else o.get("storage", ""),
                "" if o.get("ram") in UNSET else o.get("ram", ""),
                "" if o.get("color") in UNSET else o.get("color", ""),
                "" if o.get("connection") in UNSET else o.get("connection", ""),
                num(x["price"]), im, x.get("brosCode", ""),
                disc or 0, 0 if out_of_stock else 1,
            ])
            if len(x.get("specs", {})) > len(g["sp"]):
                g["sp"] = {k: v for k, v in x["specs"].items() if k not in ("Памет", "RAM")}
        else:
            singles.append({
                "i": x["id"], "s": x["slug"], "n": x["name"], "b": x["brand"], "c": cat,
                "sc": (x.get("subcategories") or [""])[0], "p": num(x["price"]), "im": im,
                "cm": x.get("compatibleModels") or [], "d": x.get("spec", ""),
                "dc": disc or 0, "st": 0 if out_of_stock else 1,
            })

    size_order = lambda s: (0 if not s else 1, float(re.sub(r"[^\d.]", "", s) or 0) * (1024 if "TB" in s else 1 if "GB" in s else 1 / 1024))
    for g in groups.values():
        g["v"].sort(key=lambda v: (size_order(v[1]), v[5] or 0))
        if not g["sp"]:
            del g["sp"]

    data = {
        "groups": sorted(groups.values(), key=lambda g: g["n"]),
        "items": singles,
        "models": models,
        "logos": logos,
        "noThumb": sorted(thumbs_missing),
    }
    js = "/* Автоматично генериран от tools/build_catalog.py – не редактирайте ръчно. */\nwindow.CATALOG=" + \
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    path = os.path.join(ROOT, "assets", "catalog.js")
    open(path, "w", encoding="utf-8").write(js)
    print(f"catalog.js: {len(groups)} модела, {len(singles)} артикула, {len(js) // 1024} KB")


def parse_legal(text):
    """Разделя текста на правна страница на заглавие, подзаглавие и раздели."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if "/" in lines[:3]:
        lines = lines[lines.index("/") + 2:]
    title, intro = lines[0], lines[1]
    i = lines.index("На тази страница")
    j = i + 1
    heads = []
    while j < len(lines) and lines[j] not in heads[:1]:
        heads.append(lines[j])
        j += 1
    sections, cur = [], None
    for line in lines[j:]:
        if line.startswith("Нужда от съдействие") or line.startswith("Изтегли образец"):
            break
        if line in heads:
            cur = {"h": line, "p": []}
            sections.append(cur)
        elif cur:
            cur["p"].append(line)
    return {"title": title, "intro": intro, "sections": sections}


def build_legal(src):
    d = os.path.join(src, "legal")
    if not os.path.isdir(d):
        return
    out = {}
    for name in ["terms", "delivery", "returns", "privacy", "cookies"]:
        p = os.path.join(d, name + ".txt")
        if os.path.exists(p):
            out[name] = parse_legal(open(p, encoding="utf-8").read())
    js = "/* Автоматично генериран от tools/build_catalog.py */\nwindow.LEGAL=" + \
        json.dumps(out, ensure_ascii=False, indent=1) + ";\n"
    open(os.path.join(ROOT, "assets", "legal.js"), "w", encoding="utf-8").write(js)
    print("legal.js:", ", ".join(f"{k} ({len(v['sections'])})" for k, v in out.items()))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    build_catalog(sys.argv[1])
    build_legal(sys.argv[1])
