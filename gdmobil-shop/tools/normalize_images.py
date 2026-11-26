#!/usr/bin/env python3
"""
Изравнява снимките на аксесоарите (assets/img/products/cs*.webp): бял квадратен фон 400×400,
продуктът изрязан от белите полета, центриран и с еднакво поле около него.
Снимки с цветен фон (снимки от живо) само се допълват до квадрат, без изрязване.
Безопасно е да се пуска многократно.

Употреба:  python3 tools/normalize_images.py [--dry N]   (--dry: само N примера в /tmp, без промени)
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "assets", "img", "products")
SIZE, MARGIN, WHITE = 400, 0.08, (255, 255, 255)


def flatten(im):
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, WHITE)
        bg.paste(im, mask=im.getchannel("A"))
        return bg
    return im.convert("RGB")


def near_white(px, t=238):
    return all(c >= t for c in px[:3])


def normalize(im):
    im = flatten(im)
    w, h = im.size
    corners = [im.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    if sum(near_white(c) for c in corners) >= 3:
        # маска на всичко, което не е почти бяло
        diff = ImageChops.difference(im, Image.new("RGB", im.size, WHITE)).convert("L").point(lambda v: 255 if v > 18 else 0)
        box = diff.getbbox()
        if box:
            im = im.crop(box)
    w, h = im.size
    inner = int(SIZE * (1 - 2 * MARGIN))
    k = inner / max(w, h)
    im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), WHITE)
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
    return canvas


def run(name, out_dir=None):
    path = os.path.join(DIR, name)
    try:
        with Image.open(path) as src:
            res = normalize(src)
        dst = os.path.join(out_dir, name) if out_dir else path + ".tmp"
        res.save(dst, "WEBP", quality=84, method=5)
        if not out_dir:
            os.replace(dst, path)  # нов файл (не пише през връзки към dist/)
        return True
    except Exception as e:
        print("грешка:", name, e)
        return False


def main():
    files = sorted(f for f in os.listdir(DIR) if f.startswith("cs") and f.endswith(".webp"))
    if "--dry" in sys.argv:
        import random
        n = int(sys.argv[sys.argv.index("--dry") + 1])
        out = sys.argv[sys.argv.index("--dry") + 2] if len(sys.argv) > sys.argv.index("--dry") + 2 else "/tmp"
        os.makedirs(out, exist_ok=True)
        for f in random.sample(files, n):
            run(f, out)
        print(f"примери: {n} в {out}")
        return
    with ThreadPoolExecutor(8) as ex:
        ok = sum(ex.map(run, files))
    print(f"изравнени снимки: {ok} от {len(files)}")


if __name__ == "__main__":
    main()
