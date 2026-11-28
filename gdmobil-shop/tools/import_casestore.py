#!/usr/bin/env python3
"""
Внася аксесоарите от casestore.bg (собствен магазин на фирмата) в каталога на GDMobil.

1) Сваляне на списъците (по 96 продукта, с пауза 3 сек. според robots.txt):
       for n in $(seq 1 121); do curl -s -o pages/$n.html "https://casestore.bg/products?page=$n"; sleep 3; done
2) Разчитане и филтриране само за новите модели устройства:
       python3 tools/import_casestore.py <папка_със_страници> > casestore.json
   Продукт без конкретен модел в името (зарядно, кабел, power bank…) се запазва като универсален.
3) tools/build_catalog.py използва casestore.json вместо старите аксесоари (виж --accessories).
"""
import glob
import html
import json
import os
import re
import sys

# ---------- нови модели (приблизително от 2023–2024 г. нататък) ----------
NEW = [
    # Apple
    r"iphone\s*(1[5-9])(\s*(pro\s*max|pro|plus|mini|e))?\b", r"iphone\s*(air|duo|16e|17e)", r"iphone\s*1[6-9]e",
    r"ipad\s*(pro|air)[^,]*\b(m[2-5])\b", r"ipad\s*(11|mini\s*7|a16)\b", r"ipad[^,]*\(?(2024|2025|2026)\)?",
    r"apple\s*watch[^,]*(series\s*(9|1[0-2])|ultra\s*[23]|\bs(9|1[0-2])\b|se\s*3)", r"airpods\s*(pro\s*[23]|4)",
    # Samsung
    r"galaxy\s*s2[4-9]", r"galaxy\s*z\s*(fold|flip)\s*[6-9]", r"galaxy\s*a(1[6-9]|2[6-9]|3[6-9]|5[6-9]|0[67])\b",
    r"galaxy\s*m(1[6-9]|3[6-9]|5[6-9])\b", r"galaxy\s*tab\s*s(9|1[0-2])", r"galaxy\s*tab\s*a(9|1[01])",
    r"galaxy\s*watch\s*(6|7|8|ultra)", r"galaxy\s*buds\s*(3|4|fe)",
    # Google
    r"pixel\s*(9|1[0-2])(\s*(pro\s*xl|pro\s*fold|pro|a|xl))?\b", r"pixel\s*watch\s*[34]",
    # Xiaomi / Redmi / Poco
    r"xiaomi\s*(1[4-9])(t|\s*t|\s*pro|\s*ultra)?\b", r"redmi\s*note\s*(1[4-9])", r"redmi\s*(1[4-9])c?\b", r"redmi\s*a[3-9]\b",
    r"redmi\s*pad\s*(2|pro|se\s*8)", r"poco\s*(f[6-9]|x[7-9]|m[7-9]|c7\d|c8\d|c9\d)", r"xiaomi\s*pad\s*[6-9]",
    # Huawei / Honor
    r"pura\s*[789]0", r"nova\s*1[3-9]", r"mate\s*[7-9]0", r"huawei\s*p70", r"honor\s*(4[0-9]0|[56]00|x[6-9]\w?|200|90)\b",
    r"magic\s*[6-9]", r"honor\s*magic\s*v[3-9]",
    # Motorola
    r"edge\s*[5-7]0", r"razr\s*([5-7]0|fold)", r"moto\s*g\s*?(0[5-9]|1[5-9]|[3-8][5-9])\b", r"moto\s*g\d*[^,]*\(?(2024|2025|2026)\)?",
    # OnePlus / OPPO / Realme / Vivo / Nothing / Nokia-HMD / Infinix
    r"oneplus\s*(1[2-9]|nord\s*[4-9]|nord\s*ce\s*[4-9])", r"find\s*x[7-9]", r"reno\s*1[2-9]", r"oppo\s*a[5-9][0-9]\b",
    r"realme\s*(1[3-9]|gt\s*[6-9]|c[67]\d|note\s*[6-9]0)", r"vivo\s*(x[1-3]00|v[3-6]0|y[0-3]\d\b)", r"nothing\s*phone\s*\(?[2-9]", r"cmf\s*phone",
    r"infinix\s*(note|hot)\s*(4|5)\d", r"hmd\s*\w+",
]
NEW_RE = re.compile("|".join(f"(?:{x})" for x in NEW), re.I)

# Ако в името има някой от тези маркери, продуктът е за конкретен модел/линия устройства.
DEVICE_RE = re.compile(r"iphone|ipad|apple\s*watch|airpods|galaxy|pixel|xiaomi|redmi|poco|huawei|pura|nova|mate|honor|motorola|moto\s|razr|edge\s*\d|"
                       r"oneplus|oppo|reno|find\s*x|realme|vivo|nothing\s*phone|nokia|hmd|infinix|tecno|zte|blackview|ulefone|sony|xperia|"
                       r"lg\b|htc|watch\s|smartwatch|playstation|garmin|amazfit|fitbit|tab\s", re.I)
# Универсални: споменават само платформа или конектор, не конкретен модел
GENERIC_HINT = re.compile(r"\bза\s+(iphone|ipad|apple|samsung|android|смартфон|телефон|таблет|лаптоп|всички)\s*[,.)\-]?\s*($|,|цвят)", re.I)

SUB = [
    ("Калъфи", r"кейс|калъф|гръб|case|cover|книга|кожен|силиконов|флип|wallet"),
    ("Протектори", r"протектор|стъкло|хидрогел|glass|фолио|lens|камера\s*протект"),
    ("Зарядни", r"зарядн|адаптер|charger|magsafe\s*заряд|безжично\s*зареждане"),
    ("Кабели", r"кабел|cable|преходник|разклонител|адаптер\s*usb"),
    ("Слушалки", r"слушалк|earbuds|headphones|buds|airpods(?!.*кейс)"),
    ("Power Bank", r"power\s*bank|пауър\s*банк|външна\s*батерия"),
    ("Стойки", r"стойк|държач|holder|stand|трипод|селфи"),
    ("Каишки за часовник", r"каишк|верижк|strap|band\b"),
]
SUB_RE = [(n, re.compile(r, re.I)) for n, r in SUB]

BRANDS = [("Apple", r"iphone|ipad|apple|airpods|magsafe"), ("Samsung", r"samsung|galaxy"), ("Google", r"pixel|google"),
          ("Xiaomi", r"xiaomi|redmi|poco"), ("Huawei", r"huawei|pura|\bnova\b|\bmate\b"), ("Honor", r"honor"), ("Motorola", r"motorola|moto\s|razr"),
          ("OnePlus", r"oneplus"), ("OPPO", r"oppo|reno|find\s*x"), ("Realme", r"realme"), ("Vivo", r"vivo"), ("Nothing", r"nothing"),
          ("Nokia", r"nokia|hmd"), ("Sony", r"sony|xperia|playstation")]
BRAND_RE = [(n, re.compile(r, re.I)) for n, r in BRANDS]


def money(s):
    m = re.search(r"([\d\s.]+,\d{2})\s*€", s)
    return round(float(m.group(1).replace(" ", "").replace(".", "").replace(",", ".")), 2) if m else None


# Шаблони за разпознаване на конкретен модел навсякъде в името → (марка, показвано име)
def _t(x):
    return re.sub(r"\s+", " ", x).strip()


def _cap(x):
    return " ".join(w.upper() if re.fullmatch(r"(fe|xl|se|ce|cmf)", w, re.I) else w if any(c.isdigit() for c in w) and len(w) > 2 and not w.isdigit() else w.capitalize() for w in _t(x).split())


MODEL_PATTERNS = [
    ("Apple", re.compile(r"\biphone\s*(\d{2}e|\d{2}|air|duo|se)(?:\s*(pro\s*max|pro|plus|\+|mini))?", re.I),
     lambda m: "iPhone " + m.group(1).capitalize().replace("E", "e") + (" " + _cap(m.group(2).replace("+", "Plus")) if m.group(2) else "")),
    ("Apple", re.compile(r"\bipad\s*(pro|air|mini)?\s*(\d{1,2}(?:[.,]\d)?)?[^,]{0,25}?\b(m[1-5]|\(?20\d\d\)?|a16|\d{1,2}(?:th|-то)?\s*(?:gen|поколение))", re.I),
     lambda m: _t("iPad " + (m.group(1) or "").capitalize() + " " + (m.group(2) or "") + " " + m.group(3).upper().strip("()"))),
    ("Apple", re.compile(r"\bapple\s*watch[^,]{0,30}?(ultra\s*\d?|series\s*\d{1,2}|se\s*\d?|s\d{1,2}\b)", re.I), lambda m: "Apple Watch " + _cap(m.group(1))),
    ("Apple", re.compile(r"\bairpods\s*(pro\s*\d|max|\d)?", re.I), lambda m: _t("AirPods " + _cap(m.group(1) or ""))),
    ("Samsung", re.compile(r"(?:galaxy\s*|samsung\s*|\b)z\s*(fold|flip)\s*(\d)(?:\s*(ultra|fe|5g))?", re.I),
     lambda m: f"Galaxy Z {m.group(1).capitalize()} {m.group(2)}" + (" " + _cap(m.group(3)) if m.group(3) and m.group(3).lower() != "5g" else "")),
    ("Samsung", re.compile(r"(?:galaxy\s*|samsung\s*|\b)s(\d{2})(?:\s*(ultra|plus|\+|fe|edge))?\b", re.I),
     lambda m: f"Galaxy S{m.group(1)}" + ({"plus": "+", "+": "+"}.get((m.group(2) or "").lower(), " " + _cap(m.group(2)) if m.group(2) else ""))),
    ("Samsung", re.compile(r"(?:galaxy|samsung)\s*([am]\d{2})(?:\s*(5g|4g|s))?\b", re.I), lambda m: f"Galaxy {m.group(1).upper()}"),
    ("Samsung", re.compile(r"galaxy\s*tab\s*(s\d{1,2}|a\d{1,2})(?:\s*(ultra|fe\+?|lite|\+|plus))?", re.I),
     lambda m: _t(f"Galaxy Tab {m.group(1).upper()} " + _cap((m.group(2) or "").replace("+", "Plus")))),
    ("Samsung", re.compile(r"galaxy\s*watch\s*(\d|ultra)(?:\s*(classic|pro))?", re.I), lambda m: _t(f"Galaxy Watch {_cap(m.group(1))} " + _cap(m.group(2) or ""))),
    ("Samsung", re.compile(r"galaxy\s*buds\s*(\d|fe|pro|live)(?:\s*(pro))?", re.I), lambda m: _t(f"Galaxy Buds {_cap(m.group(1))} " + _cap(m.group(2) or ""))),
    ("Google", re.compile(r"\bpixel\s*(\d{1,2}a?)(?:\s*(pro\s*xl|pro\s*fold|pro|xl|fold))?", re.I), lambda m: _t("Pixel " + m.group(1) + " " + _cap(m.group(2) or ""))),
    ("Xiaomi", re.compile(r"\bredmi\s*note\s*(\d{2})(?:\s*(pro\s*\+|pro\s*plus|pro|s|r))?", re.I),
     lambda m: _t("Redmi Note " + m.group(1) + " " + _cap((m.group(2) or "").replace(" ", "").replace("plus", "+")))),
    ("Xiaomi", re.compile(r"\bredmi\s*(pad\s*\w*|a\d|\d{2}c?)\b", re.I), lambda m: "Redmi " + _cap(m.group(1))),
    ("Xiaomi", re.compile(r"\bpoco\s*([fxmc]\d{1,2})(?:\s*(pro|ultra|gt))?", re.I), lambda m: _t("Poco " + m.group(1).upper() + " " + _cap(m.group(2) or ""))),
    ("Xiaomi", re.compile(r"\bxiaomi\s*(?:mi\s*)?(\d{2}t?|pad\s*\d)(?:\s*(pro|ultra|lite))?", re.I), lambda m: _t("Xiaomi " + m.group(1).upper() + " " + _cap(m.group(2) or ""))),
    ("Huawei", re.compile(r"\b(pura|nova|mate|p)\s*(\d{2})(?:\s*(pro\+?|ultra|se|i|lite|plus))?\b", re.I),
     lambda m: _t(("Huawei P" if m.group(1).lower() == "p" else "Huawei " + m.group(1).capitalize() + " ") + m.group(2) + " " + _cap(m.group(3) or ""))),
    ("Honor", re.compile(r"\bhonor\s*(magic\s*v?\d|x\d{1,2}\w?|\d{2,3})(?:\s*(pro|lite|smart))?", re.I), lambda m: _t("Honor " + _cap(m.group(1)) + " " + _cap(m.group(2) or ""))),
    ("Motorola", re.compile(r"\b(edge|razr)\s*(\d{2}|fold)(?:\s*(pro|fusion|neo|ultra|plus|\+))?", re.I),
     lambda m: _t("Motorola " + m.group(1).capitalize() + " " + m.group(2) + " " + _cap(m.group(3) or ""))),
    ("Motorola", re.compile(r"\bmoto\s*([ge])\s*(\d{1,2})", re.I), lambda m: f"Moto {m.group(1).upper()}{m.group(2)}"),
    ("OnePlus", re.compile(r"\boneplus\s*(nord\s*ce\s*\d|nord\s*\d|\d{1,2}r?)", re.I), lambda m: "OnePlus " + _cap(m.group(1))),
    ("OPPO", re.compile(r"\b(find\s*[xn]\d|reno\s*\d{1,2})(?:\s*(pro|ultra|f|fs))?", re.I), lambda m: _t("OPPO " + _cap(m.group(1)) + " " + _cap(m.group(2) or ""))),
    ("Realme", re.compile(r"\brealme\s*(gt\s*\d|note\s*\d{2}|c\d{2}|\d{2})(?:\s*(pro\s*\+|pro|t))?", re.I), lambda m: _t("Realme " + _cap(m.group(1)) + " " + _cap(m.group(2) or ""))),
    ("Nothing", re.compile(r"\bnothing\s*phone\s*\(?(\d)(a)?\)?(?:\s*(pro))?", re.I), lambda m: _t(f"Nothing Phone ({m.group(1)}{m.group(2) or ''}) " + _cap(m.group(3) or ""))),
    ("Old", re.compile(r"lumia|blackberry|\bhtc\b|\blg\b|xperia|nokia\s*\d|asha", re.I), lambda m: m.group(0)),
]


def device_of(name):
    """Намира първия конкретен модел в името → (марка, показвано име, ключ)"""
    best = None
    for brand, rx, fmt in MODEL_PATTERNS:
        m = rx.search(name)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), brand, fmt(m))
    if not best:
        return None, None, None
    _, brand, label = best
    key = re.sub(r"[^a-z0-9]", "", label.lower().replace("+", "plus"))
    key = re.sub(r"^(huawei|motorola|oneplus|oppo|realme|nothing|xiaomi|honor)", "", key)
    return brand, label, key


def parse_pages(folder):
    out, seen = [], set()
    for f in sorted(glob.glob(os.path.join(folder, "*.html")), key=lambda x: int(re.sub(r"\D", "", os.path.basename(x)) or 0)):
        s = open(f, encoding="utf-8", errors="ignore").read()
        for b in re.split(r'<div class="_product product-details-js', s)[1:]:
            pid = re.search(r'data-product-id="(\d+)"', b)
            url = re.search(r'href="https://casestore\.bg/product/([^"?#]+)"', b)
            name = re.search(r'_product-name-tag"><a[^>]*>([^<]+)', b)
            img = re.search(r'data-src="(https://casestore\.bg/cdn/img/products/[^"]+)"', b)
            price_block = re.search(r'_product-price.*?</div></div>', b, re.S)
            if not (pid and url and name) or pid.group(1) in seen:
                continue
            seen.add(pid.group(1))
            prices = re.findall(r'bgn2eur-primary-currency">([^<]+)<', price_block.group(0) if price_block else "")
            vals = [money(p) for p in prices if money(p) is not None]
            ribbon = re.findall(r'_product-ribbon[^"]*"[^>]*>([^<]+)<', b)
            out.append({
                "id": int(pid.group(1)), "slug": url.group(1), "name": html.unescape(name.group(1)).strip(),
                "img": html.unescape(img.group(1)) if img else "", "prices": vals, "ribbons": [r.strip() for r in ribbon],
                "disabled": bool(re.search(r'add-cart-product[^"]*"[^>]*\bdisabled\b', b)) and "js-loading" not in b,
            })
    return out


def classify(p):
    n = p["name"]
    sub = next((name for name, r in SUB_RE if r.search(n)), "Други аксесоари")
    brand, label, key = device_of(n)
    if brand == "Old":
        return sub, None, None, True, False, "Други"
    specific = label is not None
    is_new = specific and bool(NEW_RE.search(label if brand not in ("Huawei", "Motorola", "OPPO", "Realme", "Honor", "OnePlus", "Nothing") else label.lower()))
    if not specific and DEVICE_RE.search(n) and not GENERIC_HINT.search(n):
        # споменава устройство, но не успяхме да разпознаем модела – по-сигурно е да не се внася
        return sub, None, None, True, False, "Други"
    if not brand:
        brand = next((b for b, r in BRAND_RE if r.search(n)), "Универсални")
    return sub, label, key, specific, is_new, brand


def short_img(u):
    """https://casestore.bg/cdn/img/products/131705/x.jpeg?width=600&height=600&v=1 → cs:131705/x.jpeg?v=1"""
    u = html.unescape(u or "")
    m = re.match(r"https://casestore\.bg/cdn/img/products/([^?]+)(?:\?(.*))?$", u)
    if not m:
        return u
    v = re.search(r"(?:^|&)v=([^&]+)", m.group(2) or "")
    return "cs:" + m.group(1) + (f"?v={v.group(1)}" if v else "")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    prods = parse_pages(sys.argv[1])
    keep, stats = [], {"всички": len(prods), "нови модели": 0, "универсални": 0, "стари модели (пропуснати)": 0, "без цена (пропуснати)": 0}
    models = {}
    for p in prods:
        sub, dev, key, specific, is_new, brand = classify(p)
        if not p["prices"]:
            stats["без цена (пропуснати)"] += 1
            continue
        if specific and not is_new:
            stats["стари модели (пропуснати)"] += 1
            continue
        stats["нови модели" if specific else "универсални"] += 1
        price = min(p["prices"])
        old = max(p["prices"]) if len(p["prices"]) > 1 and max(p["prices"]) > price else None
        compat = []
        if specific and dev and key:
            compat = [key]
            m = models.setdefault(key, {"key": key, "name": dev, "brand": brand, "count": 0})
            m["count"] += 1
        keep.append({"i": 900000000 + p["id"], "s": "cs-" + p["slug"], "n": p["name"], "b": brand, "c": "accessories", "sc": sub,
                     "p": price, "op": old, "im": short_img(p["img"]), "cm": compat, "d": "", "dc": 0, "st": 1,
                     "src": f"https://casestore.bg/product/{p['slug']}"})
    print(json.dumps({"items": keep, "models": sorted(models.values(), key=lambda m: (m["brand"], m["name"]))}, ensure_ascii=False))
    print(json.dumps(stats, ensure_ascii=False), file=sys.stderr)


if __name__ == "__main__":
    main()
