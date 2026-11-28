// GDMobil – история на цените за правилото „най-ниска цена през последните 30 дни преди намалението“
// (Директива (ЕС) 2019/2161 – Omnibus, чл. 6а от Директива 98/6/ЕО).
// Всеки ден се записва крайната цена на всеки артикул; от историята се изчислява:
//   since – от кога важи сегашната цена; low30 – най-ниската цена през 30-те дни преди това.
import { getStore } from "@netlify/blobs";

const sofiaDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" }).format(d);

/** Текущи крайни цени {id: цена} от каталога (feeds/base.json) и настройките от админ панела. */
export async function currentPrices(site) {
  const base = await (await fetch(site + "/feeds/base.json", { signal: AbortSignal.timeout(15000) })).json();
  let o = {};
  try { o = (await getStore({ name: "gdmobil-settings" }).get("overrides", { type: "json" })) || {}; } catch {}
  const prices = o.prices || {}, sale = o.labels?.sale || {}, hidden = new Set([...(o.hidden || []), ...(o.deleted || [])]);
  const out = {};
  for (const r of base.rows || []) {
    if (hidden.has(r.s)) continue;
    let p = prices[r.id] != null && prices[r.id] !== "" ? Number(prices[r.id]) : r.p;
    const pct = sale[r.id] ?? sale[r.s];
    if (pct > 0 && pct < 100) p = Math.round(p * (100 - pct)) / 100;
    if (p > 0) out[r.id] = p;
  }
  return out;
}

/** Записва днешните цени и преизчислява low30. Връща броя артикули с известна по-ниска цена. */
export async function snapshotPrices(site) {
  const store = getStore({ name: "gdmobil-prices", consistency: "strong" });
  const today = sofiaDay(new Date());
  const now = await currentPrices(site);
  await store.setJSON("day/" + today, now);
  // последните 62 дни (30 дни + време на действие на намалението)
  const { blobs } = await store.list({ prefix: "day/" });
  const keys = blobs.map((b) => b.key).sort();
  const limit = sofiaDay(new Date(Date.now() - 400 * 864e5));
  for (const k of keys) if (k.slice(4) < limit) await store.delete(k); // пазим до ~13 месеца
  const recent = keys.filter((k) => k.slice(4) >= sofiaDay(new Date(Date.now() - 120 * 864e5)));
  const days = [];
  for (const k of recent) days.push([k.slice(4), (await store.get(k, { type: "json" })) || {}]);
  const result = computeLow30(days, now, today);
  await store.setJSON("low30", result);
  return Object.keys(result).length;
}

/** Чиста функция: days = [[YYYY-MM-DD, {id: цена}], …] по ред; now = днешните цени. */
export function computeLow30(days, now, today) {
  const result = {};
  for (const [id, price] of Object.entries(now)) {
    // назад до деня, в който цената е била различна → начало на сегашната цена
    let i = days.length - 1;
    while (i >= 0 && Math.abs((days[i][1][id] ?? price) - price) < 0.005) i--;
    if (i < 0) continue; // няма история с друга цена
    const since = days[i + 1]?.[0] || today;
    const from = sofiaDay(new Date(Date.parse(since + "T12:00:00Z") - 30 * 864e5));
    let low = Infinity;
    for (const [d, m] of days) if (d >= from && d < since && m[id] != null) low = Math.min(low, m[id]);
    if (low !== Infinity) result[id] = [low, since];
  }
  return result;
}

/** Най-ниската цена през 30-те дни преди сегашната цена за дадени артикули. */
export async function low30For(ids) {
  const store = getStore({ name: "gdmobil-prices", consistency: "strong" });
  const all = (await store.get("low30", { type: "json" })) || {};
  const out = {};
  for (const id of ids) if (all[id]) out[id] = { low: all[id][0], since: all[id][1] };
  return out;
}
