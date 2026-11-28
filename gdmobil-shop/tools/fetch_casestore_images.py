#!/usr/bin/env python3
"""
Сваля снимките на аксесоарите от casestore.bg и ги запазва локално като WebP (400 px),
за да не зависи магазинът от външния сайт (Cloudflare блокира вграждане от чужди домейни).

Употреба:  python3 tools/fetch_casestore_images.py casestore.json
Записва assets/img/products/cs<id>.webp и подменя "im" в JSON файла на "cs<id>".
"""
import concurrent.futures as cf
import io
import json
import os
import ssl
import sys
import time
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "img", "products")
CA = os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
CTX = ssl.create_default_context(cafile=CA) if CA else ssl.create_default_context()
SIZE = 400


def fetch(item):
    im = item.get("im") or ""
    if not im.startswith("cs:"):
        return item["i"], im, "skip"
    path = im[3:]
    pid = path.split("/")[0]
    name = f"cs{pid}"
    dst = os.path.join(OUT, name + ".webp")
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return item["i"], name, "exists"
    url = f"https://casestore.bg/cdn/img/products/{path}{'&' if '?' in path else '?'}width={SIZE}&height={SIZE}"
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8.5.0", "Accept": "image/*"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
                data = r.read()
            img = Image.open(io.BytesIO(data))
            img = img.convert("RGBA") if img.mode in ("P", "LA", "RGBA") else img.convert("RGB")
            img.thumbnail((SIZE, SIZE))
            if img.mode == "RGBA":  # прозрачен фон → бял, както в магазина
                bg = Image.new("RGB", img.size, (255, 255, 255)); bg.paste(img, mask=img.split()[3]); img = bg
            tmp = dst + ".tmp"
            img.save(tmp, "WEBP", quality=78, method=5)
            os.replace(tmp, dst)
            return item["i"], name, "ok"
        except Exception as e:  # noqa: BLE001
            err = str(e)
            time.sleep(1.5 * (attempt + 1))
    return item["i"], im, "fail: " + err[:80]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    data = json.load(open(path, encoding="utf-8"))
    items = data["items"]
    stats, mapping = {}, {}
    with cf.ThreadPoolExecutor(6) as ex:
        for n, (iid, im, st) in enumerate(ex.map(fetch, items), 1):
            key = st.split(":")[0]
            stats[key] = stats.get(key, 0) + 1
            mapping[iid] = im
            if n % 500 == 0:
                print(f"{n}/{len(items)} {stats}", file=sys.stderr, flush=True)
    for it in items:
        new = mapping.get(it["i"], it["im"])
        it["im"] = new if not new.startswith("cs:") else ""  # без снимка, ако свалянето не успее
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print(stats, file=sys.stderr)


if __name__ == "__main__":
    main()
