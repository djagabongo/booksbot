#!/usr/bin/env python3
"""
Сваля списъка с офиси и автомати на Еконт (публичната номенклатура) в assets/offices-econt.json.
Използва се в поръчката за избор на офис. Пуска се преди tools/build_dist.py; ако няма връзка,
остава последният записан списък.

Употреба:  python3 tools/fetch_offices.py
"""
import json
import os
import sys
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "offices-econt.json")
URL = "https://ee.econt.com/services/Nomenclatures/NomenclaturesService.getOffices.json"


def main():
    req = urllib.request.Request(URL, data=b'{"countryCode":"BGR"}', headers={"Content-Type": "application/json", "User-Agent": "gdmobil-shop"})
    try:
        data = json.load(urllib.request.urlopen(req, timeout=60))
    except Exception as e:  # без връзка – запазваме стария файл
        print(f"Еконт: списъкът не е обновен ({e})", file=sys.stderr)
        return
    rows = []
    for o in data.get("offices", []):
        a = o.get("address") or {}
        city = (a.get("city") or {}).get("name") or ""
        if not city or not o.get("code"):
            continue
        addr = " ".join((a.get("fullAddress") or "").split())
        if addr.startswith(city):
            addr = addr[len(city):].strip(" ,")
        kind = "a" if o.get("isAPS") else "o"  # a = Еконтомат
        rows.append([o["code"], o.get("name") or "", city, (a.get("city") or {}).get("postCode") or "", addr, kind])
    rows.sort(key=lambda r: (r[2], r[5] != "o", r[1]))
    json.dump({"updated": date.today().isoformat(), "offices": rows},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Еконт: {len(rows)} офиса и автомата → assets/offices-econt.json ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
