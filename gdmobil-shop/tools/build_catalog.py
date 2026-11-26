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
import zlib
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
EXCLUDE_BRANDS = {"maxcom", "evolveo", "gigaset", "mobiola", "oppo", "ulefone", "google", "oneplus", "nothing", "vivo", "cat", "blackview"}
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
     "Заявките, запитванията за ремонт, записаните часове, абонаментите за бюлетина и за известие при намаление (имейл и продукт – изтриват се след известието) се записват в защитено хранилище към сайта (Netlify Blobs) и са достъпни само за упълномощения собственик при обслужването. Известието до собственика (Telegram или имейл) съдържа данните от заявката. Ако посочите имейл, потвърждението, промените в статуса, напомнянето за записан час и известието при намаление се изпращат чрез доставчика на имейли Brevo. Ако записът не е възможен, заявката се изпраща по имейл от Вашия имейл клиент."),
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


# Марки на аксесоарите (производител), разпознати в името
MAKERS = ["Karl Lagerfeld", "Mercedes", "Ferrari", "Lacoste", "Guess", "DKNY", "BMW", "AMG", "Spigen", "Hoco", "PITAKA",
          "Nimmy", "BLUEO", "ROAR", "Mr.Monkey", "Baseus", "Ugreen", "Puro", "Tech-Protect", "ESR", "Nillkin", "Uniq",
          "Ringke", "Otterbox", "UAG", "Mophie", "Belkin", "Anker", "JBL", "Xiaomi", "Samsung", "Apple", "Huawei", "Tactical",
          "Joyroom", "Borofone", "Red Bull", "Energea", "USAMS", "Devia", "Kingxbar", "Hama", "Defender", "Remax", "Forcell", "Tumi", "Adidas", "Puma", "Moschino", "Hello Kitty", "Disney", "Marvel"]
_MAKER_RX = [(m, re.compile(r"(?<![\w-])" + re.escape(m) + r"(?![\w-])", re.I)) for m in MAKERS]
# Устройство в името: „за SAMSUNG S26 Ultra“, „iPhone 17 Pro Max 6.9"“, „Galaxy Tab S11“ …
_DEV = r"(?:apple\s+|samsung\s+|xiaomi\s+|google\s+|huawei\s+)?(?:iphone|ipad|galaxy|samsung|xiaomi|redmi|poco|honor|pixel|oppo|realme|motorola|moto|nothing\s+phone|oneplus|huawei|airpods|apple\s+watch)"
_TOK = r"(?:\s*(?:/|\+|&|,(?=\s*\d)|\((?:[a-z]?\d+\w*|\d+/\d+(?:/\d+)*mm)\)|\d+(?:[.,]\d+)?\s*(?:\"|”|''|mm|inch)|[a-z]?\d+[a-z+]*|pro|max|plus|ultra|mini|air|lite|fe|edge|neo|5g|4g|lte|fold\s*\d*|flip\s*\d*|z|note|tab|s|a|e|se|classic|series|reno|nord|find|razr|mate|pura|nova|magic|gt|redmi|poco|gen(?:eration)?|20\d\d)(?![\w]))*"
DEVICE_RX = re.compile(r"(?:\s+(?:за|for|съвместим\s+с)(?=\s))?\s+" + _DEV + _TOK, re.I)


def norm_color(c):
    c = re.sub(r"^(тъмно|светло)\s+", r"\1", (c or "").strip(), flags=re.I)
    return c[:1].upper() + c[1:].lower() if c else ""


def maker_of(name):
    for m, rx in _MAKER_RX:
        if rx.search(name):
            return m
    return ""


# Полски думи в имената от доставчика → български
PL_WORDS = [(r"\bDържач Uchwyt\b", "Държач"), (r"\bMagnetyczny uchwyt/podstawka\b", "Магнитен държач/поставка"), (r"\bUchwyt magnetyczny\b", "Магнитен държач"),
            (r"\bUchwyt rowerowy\b", "Държач за велосипед"), (r"\bUchwyt\b", "Държач"), (r"\bTorebka na telefon\b", "Чантичка за телефон"),
            (r"\bna telefon\b", "за телефон"), (r"\buniwersalny", "универсален "), (r"\bbiała\b", "бял"), (r"\bczarny\b", "черен"),
            (r"\bszary\b", "сив"), (r"\bbrazowy\b", "кафяв"), (r"\bmarmur\b", "мрамор"), (r"\bJeleń\b", "Елен"), (r"\bKoń\b", "Кон"), (r"\bOrzeł\b", "Орел"), (r"\bEtui\b", "Кейс")]


# Фабрични кодове в имената (EP-T1510NBEGEU, GUCBMSLRD, MWTY3ZM/A …) се махат – остават в артикулния номер
SKU_KEEP={'MAGSAFE','USB','LED','HD','MAG','PD','QC','TWS','ANC','ENC','IML','PRO','MAX','ROAR','BLUEO','PITAKA','NIMMY','CLEAR','SMART','BOOK','FANCY','MAGNETO','COLORFUL','JELLY','DEFENDER','BLINK','TENDER','SENSITIVE','ELECTRO','HOCO','UAG','DKNY','BMW','AMG','ALL','DAY','FULL','BOX','SILK','ARMOR','SLIM','LITE','STRONG','MATT','GLASS','PRIVACY','EZ','FIT','OG','ESD','NFC','GPS','AUX','RGB','IPHONE','SAMSUNG','XIAOMI','REDMI','HONOR','MAGNETIC','CARBON','KEVLAR','SPIGEN','GUESS','LACOSTE','FERRARI','MERCEDES','KARL','HYBRID','CRYSTAL','LIQUID','TOUGH','RUGGED','ULTRA','AIR','CASE','MINI','PLUS','SE','FE','QI2','QI','STARRY','GALAXY'}
def is_code(t):
    w=t.strip('()[],.;:"“”')
    if len(w)<6 or w.upper() in SKU_KEEP: return False
    if '/' in w: return bool(re.fullmatch(r'[A-Z0-9]{4,}[A-Z]{2}/A', w))  # код на Apple, напр. MWTY3ZM/A
    if not re.fullmatch(r'[A-Z0-9][A-Z0-9\-]+', w): return False
    letters=re.sub(r'[^A-Z]','',w); digits=re.sub(r'\D','',w)
    vowels=len(re.findall(r'[AEIOUY]',letters))
    if digits and letters and len(w)>=7: return True
    if not digits and len(letters)>=7 and vowels<=1: return True
    if digits and not letters and len(w)>=8: return True
    return False
def strip_codes(n):
    n=re.sub(r'(\d+W)(?=[A-Za-zА-Яа-я])',r'\1 ',n)
    s=' '.join(t for t in n.split(' ') if not is_code(t))
    s=re.sub(r'(?<!\d)\s+бр\.?(?=\s|$)','',s)
    s=re.sub(r'\(\s*\)','',s)
    return re.sub(r'\s{2,}',' ',s).strip(' ,-–/')


def tidy_name(name):
    for rx, rep in PL_WORDS:
        name = re.sub(rx, rep, name)
    name = re.sub(r"^Кейс за телефон\s+", "Кейс ", name)
    name = strip_codes(name)
    name = re.sub(r"\s{2,}", " ", name).strip(" ,-–/")
    return name


def split_device(name):
    """„Кейс BLINK за SAMSUNG S26 Ultra“ → („Кейс BLINK“, „SAMSUNG S26 Ultra“)."""
    best = None
    for m in DEVICE_RX.finditer(name):
        if best is None or len(m.group(0)) > len(best.group(0)):
            best = m
    if not best:
        return name, ""
    phrase = re.sub(r"^\s*(?:за|for|съвместим\s+с)\s+", "", best.group(0).strip(), flags=re.I).strip(" ,/")
    base = (name[: best.start()] + " " + name[best.end():]).strip()
    return base, phrase


def group_accessories(items, model_names):
    """Обединява аксесоари, които се различават само по цвят и/или модел устройство, в един продукт
    с избор „За модел“ и „Цвят“. Всеки аксесоар става продукт с варианти (дори с един вариант),
    за да се показват цветът и моделът отделно от името."""
    buckets, old = {}, []
    for it in items:
        base, color = split_color(it["n"])
        base2, phrase = split_device(base)
        if not color:
            base2, color = split_color(base2)
        color = norm_color(color)
        mk = it["cm"][0] if it["cm"] else ""
        if not mk and phrase and re.search(r"\d", phrase):
            old.append(it["n"])  # устройство, което не е сред моделите в магазина (стар модел)
            continue
        model = model_names.get(mk) or phrase
        if not model or len(base2) < 6:
            base2 = base
        key = (re.sub(r"[^\w]+", " ", base2.lower()).strip(), it["sc"])
        buckets.setdefault(key, []).append((base2, color or "", model, mk, it))
    groups = []
    for key, lst in buckets.items():
        seen, variants, cms, rest = set(), [], [], []
        for base, color, model, mk, it in sorted(lst, key=lambda x: (x[2], x[4]["p"] or 0, x[1])):
            k = (model.lower(), color.lower())
            if k in seen:
                rest.append((base, color, model, mk, it))
                continue
            seen.add(k)
            if mk and mk not in cms:
                cms.append(mk)
            variants.append([it["i"], "", "", color, "", it["p"], it["im"], "", 0, it.get("st", 1), [], it.get("op"), model, mk])
        if len({v[12] for v in variants}) <= 1:
            for v in variants:
                v[12] = ""  # един модел – няма избор, моделът остава в името
            base_name = split_color(lst[0][4]["n"])[0]
        else:
            base_name = lst[0][0]
        first = lst[0][4]
        groups.append({"s": first["s"], "n": tidy_name(base_name), "b": maker_of(lst[0][0]) or (maker_of(first["n"]) if first["sc"] not in ("Калъфи", "Протектори") else ""), "c": "accessories", "mk": "",
                       "sc": first["sc"], "cm": cms, "v": variants})
        for base, color, model, mk, it in rest:  # дубликати (същият модел и цвят) – отделни продукти
            groups.append({"s": it["s"], "n": tidy_name(split_color(it["n"])[0]), "b": maker_of(it["n"]), "c": "accessories", "mk": "",
                           "sc": it["sc"], "cm": it["cm"], "v": [[it["i"], "", "", color, "", it["p"], it["im"], "", 0, it.get("st", 1), [], it.get("op"), "", mk]]})
    print(f"casestore.bg: махнати {len(old)} аксесоара за стари модели, които не са в магазина (напр. {old[:2]})")
    return groups


OG_PRICE = 10
# (slug, име, снимка, галерия, начало на артикулните номера)
OG_PRODUCTS = [
    ("og-premium-strong-steklen-protektor", "Стъклен протектор OG Premium Strong – Full Glass", "cs98610", [], 950_000_000),
    ("og-premium-privacy-steklen-protektor", "Стъклен протектор Privacy OG Premium – със затъмняващ ефект", "cs98609", [], 960_000_000),
]


def merge_same_name(groups):
    """Обединява аксесоари с еднакво име и вид (един модел в различни цветове или копия) в един продукт.
    Повтарящите се модел+цвят остават веднъж – с по-ниската цена."""
    by, out = {}, []
    for g in groups:
        k = (re.sub(r"\W+", " ", g["n"].lower()).strip(), g["sc"])
        if k in by:
            t = by[k]
            t["v"].extend(g["v"])
            t["cm"] = list(dict.fromkeys(t["cm"] + g["cm"]))
        else:
            by[k] = g
            out.append(g)
    merged = 0
    for g in out:
        best = {}
        for v in sorted(g["v"], key=lambda v: (v[5] is None, v[5] or 0)):
            best.setdefault(((v[12] or "").lower(), (v[3] or "").lower()), v)
        if len(best) < len(g["v"]):
            merged += len(g["v"]) - len(best)
        g["v"] = list(best.values())
    print(f"casestore.bg: обединени {len(groups) - len(out)} продукта с еднакво име, махнати {merged} повторения")
    return out


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
        excluded_mk = {k for k, m in merged.items() if m["brand"].lower() in EXCLUDE_BRANDS}
        models = sorted((m for k, m in merged.items() if k not in excluded_mk), key=lambda m: (m["brand"], m["name"]))
        non_phone = re.compile(r"чанта|\bbag\b|handbag|портфейл|раница|backpack|несесер|purse|tote|клъч|куфар|torebka", re.I)
        laptop = re.compile(r"лаптоп|laptop|macbook|\b1[3-7](?:[.,]\d)?\s*(?:\"|”|''|inch|инча)", re.I)
        dropped = [it for it in cs["items"] if (it["sc"] == "Други аксесоари" and non_phone.search(it["n"])) or re.search(r"torebka", it["n"], re.I) or not it.get("im")
                   or (not it["cm"] and laptop.search(it["n"]) and not re.search(r"ipad|tab|таблет", it["n"], re.I))]
        cs["items"] = [it for it in cs["items"] if it not in dropped]
        print(f"casestore.bg: махнати {len(dropped)} чанти, портфейли, раници, калъфи за лаптоп и продукти без снимка")
        for it in cs["items"]:
            it["cm"] = [remap(k) for k in it["cm"]]
            it.pop("src", None)
        before = len(cs["items"])
        cs["items"] = [it for it in cs["items"] if not (it["cm"] and all(k in excluded_mk for k in it["cm"]))]
        for it in cs["items"]:
            it["cm"] = [k for k in it["cm"] if k not in excluded_mk]
        print(f"casestore.bg: махнати {before - len(cs['items'])} аксесоара за марки, които не се продават ({', '.join(sorted(EXCLUDE_BRANDS))})")
        # OG Premium и Privacy OG Premium – собствени продукти за ВСИЧКИ телефони в магазина (цена OG_PRICE);
        # отделните OG протектори от casestore.bg се заменят с тях.
        og_rx = re.compile(r"\bOG\b.*(premium|strong|lite)|OG Premium", re.I)
        before = len(cs["items"])
        cs["items"] = [it for it in cs["items"] if not (it["sc"] == "Протектори" and og_rx.search(it["n"]))]
        print(f"casestore.bg: махнати {before - len(cs['items'])} отделни OG протектора (заменени с общи продукти)")
        acc_groups = merge_same_name(group_accessories(cs["items"], {m["key"]: m["name"] for m in models}))
        phones = sorted((g for g in groups.values() if g["c"] == "phones" and g.get("mk")),
                        key=lambda g: (g["b"].lower() != "apple", g["b"].lower() != "samsung", g["b"].lower(), g["n"].lower()))
        for slug, name, img, gal, base_id in OG_PRODUCTS:
            variants = []
            for g in phones:
                label = re.sub(r"^" + re.escape(g["b"]) + r"\s+", "", g["n"]) if g["b"] in ("Apple", "Samsung") else g["n"]
                vid = base_id + zlib.crc32(g["n"].encode()) % 9_000_000
                variants.append([vid, "", "", "", "", OG_PRICE, img, "", 0, 1, gal, None, label, g["mk"]])
            acc_groups.insert(0, {"s": slug, "n": name, "b": "OG Premium", "c": "accessories", "mk": "", "sc": "Протектори",
                                  "cm": [g["mk"] for g in phones], "v": variants})
        print(f"OG Premium: {len(OG_PRODUCTS)} продукта × {len(phones)} модела телефони по {OG_PRICE} €")
        for g in acc_groups:
            groups[g["s"]] = g
        multi_model = sum(1 for g in acc_groups if any(v[12] for v in g["v"]))
        multi_color = sum(1 for g in acc_groups if len({v[3] for v in g["v"]}) > 1)
        print(f"casestore.bg: {len(cs['items'])} аксесоара → {len(acc_groups)} продукта "
              f"(с избор на модел: {multi_model}, с избор на цвят: {multi_color}, с марка: {sum(1 for g in acc_groups if g['b'])})")
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


# Допълнения към правните текстове (законови изисквания към онлайн търговията в България и ЕС)
LEGAL_VERSION = "26 ноември 2026 г."
LEGAL_ADD = {
    "terms": [
        {"h": "Функция за отказ от договора", "p": [
            "Потребителят може да упражни правото си на отказ и чрез функцията „Отказ от договора“ в сайта (връзката е в долната част на всяка страница и на адрес /withdraw): попълва номера на поръчката и данните си и потвърждава с бутона „Потвърждавам отказа от договора“.",
            "Веднага след това на екрана се показва потвърждение с датата и часа на получаване на отказа, а когато е посочен имейл – потвърждението се изпраща и по имейл (траен носител)."]},
        {"h": "Цени, намаления и двойно обозначаване", "p": [
            "Цените са крайни, в евро, с включен ДДС. Цената за доставка се посочва отделно преди потвърждаване на поръчката.",
            "До 31.12.2026 г. включително цените се показват и в лева по фиксирания обменен курс 1 € = 1,95583 лв.",
            "При обявено намаление на страницата на продукта се посочва и най-ниската цена, прилагана за стоката през последните 30 дни преди намалението, когато има данни за нея. Зачертаната цена е предишната цена на стоката."]},
        {"h": "Сключване на договора", "p": [
            "Изпращането на заявка през сайта не създава задължение за плащане. Договорът се счита за сключен, когато търговецът потвърди наличността, крайната сума и срока и клиентът ги приеме (по телефона, по имейл или в магазина). Документът за покупка се издава при плащането."]},
        {"h": "Алтернативно решаване на спорове", "p": [
            "При спор, който не е решен пряко с търговеца, потребителят може да се обърне към Комисията за защита на потребителите (https://kzp.bg), включително към Общата помирителна комисия и секторните помирителни комисии към нея, както и към друг орган за алтернативно решаване на потребителски спорове. Потребителят запазва правото си да се обърне към съда."]},
    ],
    "returns": [
        {"h": "Отказ онлайн с един бутон", "p": [
            "Освен с имейл или писмено, можеш да се откажеш и чрез функцията „Отказ от договора“ в сайта (/withdraw). Получаваш потвърждение с дата и час на екрана и по имейл, ако го посочиш."]},
    ],
    "privacy": [
        {"h": "Обработващи и получатели на данни", "p": [
            "Netlify, Inc. – хостинг на сайта и защитено хранилище за заявките (сървъри в ЕС и САЩ).",
            "Brevo (Sendinblue SAS, Франция) – изпращане на имейли с потвърждения, статуси, напомняния и известия за намаление, когато е посочен имейл.",
            "Telegram – известие до собственика за нова заявка, което съдържа данните от заявката.",
            "Anthropic PBC (САЩ) – генериране на отговори в чата на сайта, само за написаните в чата въпроси.",
            "Куриерите Еконт Експрес и Спиди – името, телефонът и адресът или офисът за доставка, когато изберете доставка с куриер.",
            "Google – картата в „Контакти“, само ако я заредите или сте дали съгласие за външно съдържание.",
            "При предаване на данни извън ЕИП се прилагат решение на Европейската комисия за адекватно ниво на защита или стандартни договорни клаузи (чл. 45–46 от Регламент (ЕС) 2016/679)."]},
        {"h": "Срокове за съхранение (конкретно)", "p": [
            "Поръчки и документи за покупка – докато е необходимо за договора, гаранцията и рекламациите и за сроковете по счетоводното и данъчното законодателство.",
            "Запитвания, заявки за ремонт и записани часове – до приключването им и до 2 години след това за евентуални претенции, освен ако не са станали част от договор.",
            "Абонамент за бюлетина – до оттегляне на съгласието (отписване на /unsubscribe или на имейл). Известия „Кажи ми при намаление“ – до изпращане на известието или отписване.",
            "Въпроси от чата, препратени към служител – до 30 дни. Заявления за отказ от договора – колкото е нужно за уреждане на връщането и евентуални спорове."]},
        {"h": "Жалба до надзорния орган", "p": [
            "Ако смятате, че обработването нарушава правата Ви, можете да подадете жалба до Комисията за защита на личните данни – https://www.cpdp.bg, гр. София 1592, бул. „Проф. Цветан Лазаров“ 2."]},
    ],
}

COOKIES_PAGE = {
    "title": "Бисквитки и локални настройки",
    "intro": "Сайтът не използва рекламни бисквитки или бисквитки за проследяване. В браузъра се пазят само данни, необходими за магазина, и – с Ваше съгласие – някои предпочитания.",
    "sections": [
        {"h": "Необходими (винаги включени)", "p": [
            "Количката, любимите продукти, списъкът за сравнение, избраната светла или тъмна тема, номерата на последните Ви заявки (за проследяване), запазените настройки на магазина и Вашият избор за бисквитките се пазят в локалното хранилище (localStorage) на браузъра. За по-бърза работа браузърът пази и копие на страниците и снимките (кеш на приложението).",
            "Тези данни са строго необходими, за да работят функциите, които сами използвате, и не изискват съгласие (чл. 4а от Закона за електронните съобщения, чл. 5, пар. 3 от Директива 2002/58/ЕО). Не се изпращат към трети страни."]},
        {"h": "Предпочитания (по избор)", "p": [
            "С Ваше съгласие запомняме последно разгледаните продукти, последните търсения и модела на телефона Ви, за да Ви показваме подходящи аксесоари. Без съгласие тези данни не се записват, а вече записаните се изтриват."]},
        {"h": "Статистика (по избор)", "p": [
            "Ако в сайта е включена статистика за посещенията, тя е без бисквитки и без профил на посетителя и се зарежда само с Ваше съгласие. Името на услугата е посочено по-долу, когато е включена."]},
        {"h": "Външно съдържание (по избор)", "p": [
            "Картата в „Контакти“ се зарежда от Google Maps. Без съгласие тя се показва само след натискане на „Покажи картата“; със съгласие – автоматично. При зареждане Google получава техническа заявка от браузъра Ви (IP адрес и данни за браузъра)."]},
        {"h": "Как да промените избора", "p": [
            "Изборът се пази 12 месеца. Можете да го промените по всяко време от връзката „Настройки за бисквитки“ в долната част на всяка страница. Можете също да изтриете данните от настройките на браузъра – това премахва и количката, любимите и сравненията на съответното устройство, но не заличава вече изпратени заявки."]},
    ],
}

ACCESSIBILITY_PAGE = {
    "title": "Декларация за достъпност",
    "intro": "Стремим се сайтът да може да се ползва от всички, включително от хора с увреждания, в съответствие с WCAG 2.1, ниво AA.",
    "sections": [
        {"h": "Какво сме направили", "p": [
            "Текстът има достатъчен контраст, а заглавията и формите са подредени логично и с етикети.",
            "Всички функции работят с клавиатура, а бутоните и връзките имат текстови описания за екранни четци.",
            "Сайтът се преоразмерява до 200% и работи на телефон, таблет и компютър, в светла и тъмна тема. Анимациите се изключват, ако в устройството е зададено „намалено движение“.",
            "При последната проверка (ноември 2026 г.) автоматичният тест за достъпност (Lighthouse/axe) показа 100 от 100 за основните страници."]},
        {"h": "Известни ограничения", "p": [
            "Част от продуктовите снимки и описания идват от доставчици и може да нямат подробни текстови описания.",
            "Картата на Google Maps е външна услуга и не е под наш контрол – адресът е посочен и като текст."]},
        {"h": "Обратна връзка", "p": [
            "Ако срещнете затруднение при ползване на сайта, пишете ни на office@gdmobil.bg или се обадете на 0893 933 338 – ще съдействаме с поръчката и ще отстраним проблема.",
            "Можете да подадете сигнал и до Комисията за защита на потребителите (https://kzp.bg)."]},
    ],
}


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
    for name, extra in LEGAL_ADD.items():
        if name in out:
            have = {x["h"] for x in out[name]["sections"]}
            out[name]["sections"].extend(x for x in extra if x["h"] not in have)
    if "terms" in out:
        out["terms"]["intro"] = re.sub(r"Версия от [^.]+\.", f"Версия от {LEGAL_VERSION}.", out["terms"]["intro"])
    out["cookies"] = COOKIES_PAGE
    out["accessibility"] = ACCESSIBILITY_PAGE
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
