#!/usr/bin/env python3
"""
Генерира assets/catalog.js от експорта на каталога (catalog-list.json, models.json)
и assets/legal.js от текстовете на правните страници.

Употреба:
    python3 tools/build_catalog.py <папка_с_източници> [--keep-legacy] [--accessories casestore.json] [--min-year 2023]

В папката трябва да има:
    catalog-list.json, models.json, shop.json (по желание)
    legal/<delivery|returns|terms|privacy|cookies>.txt (по желание)
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Аксесоари за много стари устройства (отпреди ~2019 г.) се скриват от каталога.
# Изпълнете скрипта с --keep-legacy, за да ги запазите.
LEGACY = re.compile(r"""(
  \bHTC\b | \bLG\b | BlackBerry | Lumia | \bAsha\b |
  Galaxy\s*(S|Note)\s*([2-9]|10)(?![0-9]) | Galaxy\s*(J[0-9]|Grand|Ace|Core|Young|Trend|Mini|Alpha|Mega|Pocket) | Galaxy\s*A[3578](?![0-9]) |
  \bI?phone\s*(4|4s|5|5s|5c|6|6s|7|8|x|xs|xr)(?![0-9a-z]) |
  Redmi\s*(Note\s*)?[1-7](?![0-9]) | \bXiaomi\s*Mi\s*[1-9](?![0-9]) | \bMi\s*A[12]\b |
  Huawei\s*(P|Mate)\s*([6-9]|10|20)(?![0-9]) | Ascend |
  Pixel\s*[1-3](a|\s*XL)?(?![0-9]) |
  Xperia\s*(Z|E|M|C|XA|XZ|L)[0-9]? (?![0-9]) |
  \bMoto\s*(G[1-6]|E[1-5]|X)(?![0-9])
)""", re.I | re.X)
KEEP_LEGACY = "--keep-legacy" in sys.argv
# Телефони и таблети, представени преди тази година, не се включват (--min-year 0 = без филтър)
MIN_YEAR = int(sys.argv[sys.argv.index("--min-year") + 1]) if "--min-year" in sys.argv else 2023
# Модели без година в данните, за които е известно, че са по-стари
# Марки телефони/таблети, които не се продават в магазина
EXCLUDE_BRANDS = {"maxcom", "evolveo", "gigaset", "mobiola"}
OLD_DEVICES = re.compile(r"\b(LG\s+Cam\s+Plus|Nokia\s+T21|Galaxy\s+Tab\s+Active\s*4)\b", re.I)
ACCESSORIES_FILE = sys.argv[sys.argv.index("--accessories") + 1] if "--accessories" in sys.argv else None

# Корекции на правните текстове, за да отговарят на новия сайт (без лична връзка за проследяване,
# без база данни и броячи; хостинг Netlify; шрифтове и снимки от самия сайт; карта при поискване).
LEGAL_FIXES = [
    ("Магазинът предлага телефони, таблети, аксесоари и камери.", "Магазинът предлага телефони, таблети и аксесоари."),
    ("Не изискваме ЕГН,",
     "При абонамент за бюлетина: имейл адрес и момент на даване на съгласието. Не изискваме ЕГН,"),
    ("Не Ви записваме автоматично за реклама или бюлетин.",
     "Не Ви записваме автоматично за реклама или бюлетин. Ако сами се абонирате за бюлетина, използваме имейла Ви само за новини и оферти от GDMobil въз основа на Вашето съгласие, което можете да оттеглите по всяко време чрез връзката в писмата или на office@gdmobil.bg."),
    ("Данните за заявката и статуса се съхраняват в системата.",
     "Данните за заявката и статуса се съхраняват в защитено хранилище към сайта (Netlify) и се обработват от GDMobil. Собственикът получава известие за новата заявка (напр. в Telegram)."),
    ("След заявяване получавате номер и лична връзка за статус. При изпращане магазинът може да добави номер на товарителница. Не публикувайте личната връзка за проследяване.",
     "След заявяване получавате номер на заявката. Статусът се проверява в страницата „Проследяване“ с номера и последните 4 цифри от телефона, посочен в заявката. При изпращане магазинът може да добави номер на товарителница."),
    ("Данните се записват в защитена база към сайта и са достъпни за упълномощения собственик при обслужването.",
     "Заявките, запитванията за ремонт и абонаментите за бюлетина се записват в защитено хранилище към сайта (Netlify Blobs) и са достъпни само за упълномощения собственик при обслужването. Известието до собственика (Telegram) съдържа данните от заявката. Ако записът не е възможен, заявката се изпраща по имейл от Вашия имейл клиент."),
    ("Сайтът използва инфраструктура на OpenAI Sites и Cloudflare. Някои продуктови изображения се зареждат от външен доставчик и съответният сървър получава техническата заявка.",
     "Сайтът се хоства при Netlify. Шрифтовете и продуктовите изображения се зареждат от самия сайт. Картата в раздел „Контакти“ се зарежда от Google Maps само ако я поискате с бутона „Покажи картата“ – тогава Google получава техническата заявка."),
    (" Личната връзка за поръчката показва статуса, артикулите и сумите на всеки, който я притежава; пазете я и не я споделяйте публично.", ""),
    ("Сайтът изчислява сумите по избраните конфигурации и прилага техническа защита от злоупотреби.",
     "Сайтът изчислява сумите по избраните конфигурации."),
    ("Количката, любимите продукти и списъкът за сравнение се запазват чрез localStorage на устройството Ви.",
     "Количката, любимите продукти, списъкът за сравнение, последно разгледаните продукти, последните търсения и избраната светла или тъмна тема се запазват чрез localStorage на устройството Ви."),
    (" За входа на собственика могат да се използват необходими бисквитки на платформата за идентификация.",
     " За по-бързо зареждане и работа при слаба връзка браузърът пази копие от страниците и снимките на сайта (кеш на приложението). Сайтът не използва бисквитки."),
    ("Не сме добавили Google Analytics, Meta Pixel или рекламни тракери. Собствените броячи отчитат общ брой разглеждания, отваряния на продукти, добавяния в количка и отваряния на поръчка по дни. За тях не се създават бисквитки или идентификатори на посетители и не се записват имена, контакти, търсения или пълни адреси на страници. Общите броячи се пазят до 90 дни; Do Not Track и Global Privacy Control спират изпращането им. За ограничаване на злоупотреби се използва временен хеш на техническия адрес, който не се свързва с тези броячи.",
     "Не сме добавили Google Analytics, Meta Pixel, рекламни тракери или броячи на посещенията. Шрифтовете и изображенията се зареждат от самия сайт. Картата в раздел „Контакти“ се зарежда от Google Maps само след натискане на „Покажи картата“."),
    ("Това премахва запазената количка, любимите и сравненията на съответното устройство,",
     "Това премахва запазената количка, любимите, сравненията и кеша на сайта на съответното устройство,"),
]

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


COLOR_PATTERNS = [
    re.compile(r",?\s*Цвят\s+(?P<c>[^,]{2,40})$", re.I),
    re.compile(r"\s+(?P<c>(?:светло|тъмно)?[а-яё]+)\s+цвят$", re.I),
    re.compile(r",\s*(?P<c>[а-яё]+(?:\s+[а-яё]+)?)$"),
    re.compile(r"\s+-\s+(?P<c>black|white|blue|red|green|pink|purple|gold|silver|gray|grey|transparent|clear|navy|brown|beige)$", re.I),
]


def split_color(name):
    """„Кейс X за iPhone 17, черен“ → („Кейс X за iPhone 17“, „Черен“)"""
    for rx in COLOR_PATTERNS:
        m = rx.search(name)
        if m:
            base = name[: m.start()].rstrip(" ,-–")
            color = m.group("c").strip(" -").strip()
            if base and color and len(base) > 8:
                return base, color[:1].upper() + color[1:]
    return name, None


def group_colors(items):
    """Обединява аксесоари, които се различават само по цвят, в един продукт с избор на цвят."""
    buckets, singles = {}, []
    for it in items:
        base, color = split_color(it["n"])
        if not color:
            singles.append(it)
            continue
        key = (base.lower(), it["sc"], tuple(it["cm"]))
        buckets.setdefault(key, []).append((base, color, it))
    groups = []
    for key, lst in buckets.items():
        colors = {c.lower() for _, c, _ in lst}
        if len(lst) < 2 or len(colors) < 2:
            singles.extend(it for _, _, it in lst)
            continue
        seen, variants = set(), []
        for base, color, it in sorted(lst, key=lambda x: (x[2]["p"] or 0, x[1])):
            if color.lower() in seen:
                singles.append(it)  # същият цвят два пъти – оставяме отделно
                continue
            seen.add(color.lower())
            variants.append([it["i"], "", "", color, "", it["p"], it["im"], "", 0, it.get("st", 1), [], it.get("op")])
        first = lst[0][2]
        groups.append({"s": first["s"], "n": lst[0][0], "b": first["b"], "c": "accessories", "mk": "", "sc": first["sc"], "cm": first["cm"], "v": variants})
    return groups, singles


def build_catalog(src):
    items = json.load(open(os.path.join(src, "catalog-list.json"), encoding="utf-8"))
    models = json.load(open(os.path.join(src, "models.json"), encoding="utf-8"))
    overrides = {}
    shop_path = os.path.join(src, "shop.json")
    if os.path.exists(shop_path):
        overrides = json.load(open(shop_path, encoding="utf-8")).get("overrides", {})

    groups, singles, logos = {}, [], {}
    legacy_hidden = 0
    model_dir = os.path.join(src, "models")
    model_data = {}
    if os.path.isdir(model_dir):
        for f in os.listdir(model_dir):
            if f.endswith(".json"):
                for v in json.load(open(os.path.join(model_dir, f), encoding="utf-8")):
                    model_data[v["id"]] = v
    # година на представяне от данните на модела („Представен: 2024-…“) или от името („(2022)“)
    def release_year(x):
        md = model_data.get(x["id"]) or {}
        for f in md.get("features") or []:
            if f.startswith("Представен:"):
                m = re.search(r"(19|20)\d\d", f)
                if m:
                    return int(m.group(0))
        m = re.search(r"\b(20[12]\d)\b", x.get("familyName") or x["name"])
        return int(m.group(1)) if m else None
    too_old = 0
    img_dir = os.path.join(ROOT, "assets", "img", "products")
    def has_img(ref):
        return os.path.exists(os.path.join(img_dir, ref + ".webp"))
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
        if cat == "accessories" and ACCESSORIES_FILE:
            continue  # аксесоарите идват от casestore.bg (--accessories)
        if cat == "accessories" and not KEEP_LEGACY and LEGACY.search(x["name"]):
            legacy_hidden += 1
            continue
        if cat == "cameras":
            continue  # категорията „Камери“ е премахната
        if cat in ("phones", "tablets") and (x.get("brand") or "").lower() in EXCLUDE_BRANDS:
            too_old += 1
            continue
        if x.get("groupId") and cat in ("phones", "tablets") and MIN_YEAR:
            y = release_year(x)
            if (y and y < MIN_YEAR) or OLD_DEVICES.search(x.get("familyName") or x["name"]):
                too_old += 1
                continue
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
                num(x["price"]), im, "",  # кодът на доставчика не се публикува
                disc or 0, 0 if out_of_stock else 1,
                [r for r in (img_ref(g) for g in (model_data.get(x["id"], {}).get("gallery") or []))
                 if r and r != im and has_img(r)],
            ])
            for r in g["v"][-1][10]:
                if not os.path.exists(os.path.join(img_dir, r + "-sm.webp")):
                    thumbs_missing.add(r)
            md = model_data.get(x["id"])
            if md and md.get("features") and "f" not in g:
                g["f"] = md["features"]
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
    by_name = {g["n"]: g for g in groups.values()}
    for slug, g in list(groups.items()):
        m = re.match(r"^(.*?)\s+\d+\s*[TТ][BВ]$", g["n"])
        if m and m.group(1) in by_name and by_name[m.group(1)] is not g:
            by_name[m.group(1)]["v"].extend(g["v"])
            del groups[slug]
            print(f"сливане: {g['n']} → {m.group(1)}")

    specs = {}
    for g in groups.values():
        g["v"].sort(key=lambda v: (size_order(v[1]), v[5] or 0))
        if not g["sp"]:
            del g["sp"]
        f = g.pop("f", None)
        if f:
            specs[g["s"]] = format_specs(f)
    js = "/* Автоматично генериран от tools/build_catalog.py */\nwindow.SPECS=" + \
        json.dumps(specs, ensure_ascii=False, separators=(",", ":")) + ";\n"
    open(os.path.join(ROOT, "assets", "specs.js"), "w", encoding="utf-8").write(js)
    print(f"specs.js: {len(specs)} модела, {len(js) // 1024} KB")

    if ACCESSORIES_FILE:
        cs = json.load(open(ACCESSORIES_FILE, encoding="utf-8"))
        # свързване на моделите с телефоните/таблетите в магазина (ключовете може да имат 5G/4G в края)
        strip = lambda k: re.sub(r"(5g|4g|lte|wifi|cellular)+$", "", k)
        mk_by_norm = {}
        for g in groups.values():
            if g.get("mk"):
                mk_by_norm.setdefault(strip(g["mk"]), g["mk"])
        remap = lambda k: mk_by_norm.get(strip(k), k)
        merged = {}
        for m in cs["models"]:
            k = remap(m["key"])
            e = merged.setdefault(k, {"key": k, "name": m["name"], "brand": m["brand"], "count": 0})
            e["count"] += m["count"]
        models = sorted(merged.values(), key=lambda m: (m["brand"], m["name"]))
        non_phone = re.compile(r"чанта|\bbag\b|handbag|портфейл|раница|backpack|несесер|purse|tote|клъч|куфар", re.I)
        laptop = re.compile(r"лаптоп|laptop|macbook|\b1[3-7](?:[.,]\d)?\s*(?:\"|”|''|inch|инча)", re.I)
        dropped = [it for it in cs["items"] if (it["sc"] == "Други аксесоари" and non_phone.search(it["n"])) or not it.get("im")
                   or (not it["cm"] and laptop.search(it["n"]) and not re.search(r"ipad|tab|таблет", it["n"], re.I))]
        cs["items"] = [it for it in cs["items"] if it not in dropped]
        print(f"casestore.bg: махнати {len(dropped)} чанти, портфейли, раници, калъфи за лаптоп и продукти без снимка")
        for it in cs["items"]:
            it["cm"] = [remap(k) for k in it["cm"]]
            it.pop("src", None)
        acc_groups, acc_singles = group_colors(cs["items"])
        singles.extend(acc_singles)
        for g in acc_groups:
            groups[g["s"]] = g
        print(f"casestore.bg: {sum(len(g['v']) for g in acc_groups)} аксесоара в {len(acc_groups)} продукта с избор на цвят, {len(acc_singles)} самостоятелни")
        linked = sum(1 for m in models if any(g.get("mk") == m["key"] for g in groups.values()))
        print(f"casestore.bg: {len(cs['items'])} аксесоара, {len(models)} модела (свързани с телефони/таблети в магазина: {linked})")

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
    print(f"catalog.js: {len(groups)} модела, {len(singles)} артикула, {len(js) // 1024} KB"
          f" (скрити аксесоари за стари модели: {legacy_hidden}; варианти на телефони/таблети отпреди {MIN_YEAR}: {too_old})")


SPEC_SECTIONS = [
    ("Дисплей", ["Дисплей размер", "Дисплей тип", "Дисплей резолюция", "Дисплей защита"]),
    ("Производителност", ["Чипсет", "Процесор", "Операционна система", "Карта памет"]),
    ("Камери", ["Камера", "Камера екстри", "Предна камера", "Видеозапис", "Автофокус", "Светкавица"]),
    ("Батерия", ["Батерия 2", "Батерия"]),
    ("Свързаност", ["Мрежа 5G", "Мрежа 4G", "Мрежа 3G", "Мрежа 2G", "SIM карта", "Wi-Fi", "Bluetooth", "NFC", "GPS", "Инфрачервен порт", "Cellular"]),
    ("Корпус и сензори", ["Размер", "Тегло", "Защита вода", "Сензори"]),
]
SPEC_LABEL = {
    "Дисплей размер": "Размер на дисплея", "Дисплей тип": "Тип дисплей", "Дисплей резолюция": "Резолюция",
    "Дисплей защита": "Защита на дисплея", "Камера": "Основна камера", "Камера екстри": "Камери – детайли",
    "Батерия 2": "Капацитет", "Батерия": "Тип батерия", "Размер": "Размери (мм)",
    "Защита вода": "Защита от вода и прах", "Инфрачервен порт": "Инфрачервен порт", "Cellular": "Мобилна мрежа",
}
SKIP = {"Памет", "RAM", "Цвят", "Продуктов тип", "Представен"}


def fmt_val(k, v):
    v = v.strip()
    if k == "Дисплей размер" and re.fullmatch(r"[\d.]+", v):
        return v + "″"
    if k in ("Камера", "Предна камера") and re.fullmatch(r"[\d.]+", v):
        return v + " MP"
    if k == "Батерия 2" and re.fullmatch(r"\d+", v):
        return v + " mAh"
    if k == "Тегло" and re.fullmatch(r"[\d.]+", v):
        return v + " g"
    return v


def format_specs(features):
    kv = {}
    for f in features:
        if ":" not in f:
            continue
        k, v = f.split(":", 1)
        k = k.strip()
        if k in SKIP or k.startswith("pa_") or not v.strip():
            continue
        kv[k] = fmt_val(k, v)
    out, used = [], set()
    for title, keys in SPEC_SECTIONS:
        rows = [[SPEC_LABEL.get(k, k), kv[k]] for k in keys if k in kv]
        used.update(k for k in keys if k in kv)
        if rows:
            out.append([title, rows])
    rest = [[SPEC_LABEL.get(k, k), v] for k, v in kv.items() if k not in used]
    if rest:
        out.append(["Други", rest])
    return out


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
            text = open(p, encoding="utf-8").read()
            for old, new in LEGAL_FIXES:
                text = text.replace(old, new)
            out[name] = parse_legal(text)
    js = "/* Автоматично генериран от tools/build_catalog.py */\nwindow.LEGAL=" + \
        json.dumps(out, ensure_ascii=False, indent=1) + ";\n"
    open(os.path.join(ROOT, "assets", "legal.js"), "w", encoding="utf-8").write(js)
    print("legal.js:", ", ".join(f"{k} ({len(v['sections'])})" for k, v in out.items()))


if __name__ == "__main__":
    args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith("--") and sys.argv[i - 1] not in ("--accessories", "--min-year")]
    if len(args) != 1:
        sys.exit(__doc__)
    build_catalog(args[0])
    build_legal(args[0])
