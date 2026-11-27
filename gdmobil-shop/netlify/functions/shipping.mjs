// GDMobil – калкулатор за доставка: GET /api/shipping?c=econt|speedy&d=office|apt|address&o=<код офис>&city=<град>&w=<кг>&cod=<сума €>
// Връща цената на куриера и таксата за наложен платеж по публичните тарифи на Еконт и Спиди.
import { getStore } from "@netlify/blobs";
import { econtQuote, speedyQuote } from "../lib/shipping.mjs";

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });

const cache = new Map(); // ключ → [време, отговор]
const hits = new Map();
const limited = (ip, max = 80) => {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
};
let sender = { at: 0, code: "2900" };
async function senderOffice() {
  if (Date.now() - sender.at < 600_000) return sender.code;
  try {
    const o = (await getStore({ name: "gdmobil-settings" }).get("overrides", { type: "json" })) || {};
    const c = String(o.store?.econtSender || "").replace(/\D/g, "");
    sender = { at: Date.now(), code: c || "2900" };
  } catch { sender.at = Date.now(); }
  return sender.code;
}

export default async (req, context) => {
  if (req.method !== "GET") return json({ error: "method" }, 405);
  const u = new URL(req.url);
  const c = u.searchParams.get("c"), d = u.searchParams.get("d") || "office";
  if (!["econt", "speedy"].includes(c) || !["office", "apt", "address"].includes(d)) return json({ error: "bad_params" }, 400);
  const w = Math.min(31.5, Math.max(0.1, Number(u.searchParams.get("w")) || 0.5));
  const cod = Math.min(20000, Math.max(0, Number(u.searchParams.get("cod")) || 0));
  const office = (u.searchParams.get("o") || "").replace(/\D/g, "").slice(0, 8);
  const city = (u.searchParams.get("city") || "").replace(/[^\p{L}\p{N} .-]/gu, "").trim().slice(0, 60);
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "x";
  if (limited(ip)) return json({ error: "rate_limited" }, 429);

  const key = [c, d, office, city.toLowerCase(), w.toFixed(1), Math.round(cod)].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit[0] < 1_800_000) return json(hit[1], 200, { "cache-control": "public, max-age=600" });
  try {
    const q = c === "speedy"
      ? speedyQuote({ dest: d, weight: w, cod })
      : await econtQuote({ dest: d === "apt" ? "office" : d, office, city, weight: w, cod, sender: await senderOffice() });
    if (cache.size > 2000) cache.clear();
    cache.set(key, [Date.now(), q]);
    return json(q, 200, { "cache-control": "public, max-age=600" });
  } catch (e) {
    return json({ error: "unavailable", detail: String(e.message || e).slice(0, 60) }, 502);
  }
};

export const config = { path: "/api/shipping" };
