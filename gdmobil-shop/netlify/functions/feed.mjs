// GDMobil – продуктов фийд за Google Merchant Center (Google Shopping) и Meta Commerce Manager
// (Facebook и Instagram Shop). Формат: Google RSS 2.0 (g:), който Meta също приема.
// Основата (dist/feeds/base.json) идва от tools/build_dist.py, а цените, намаленията,
// наличността и скритите продукти се вземат на живо от админ панела (Netlify Blobs).
import { getStore } from "@netlify/blobs";
import { SPEEDY } from "../lib/shipping.mjs";

const X = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const money = (n) => `${Number(n).toFixed(2)} EUR`;

export default async (req) => {
  const origin = new URL(req.url).origin;
  const r = await fetch(origin + "/feeds/base.json");
  if (!r.ok) return new Response("feed base missing", { status: 503 });
  const base = await r.json();
  let o = {};
  try { o = (await getStore({ name: "gdmobil-settings" }).get("overrides", { type: "json" })) || {}; } catch {}
  const prices = o.prices || {}, stock = o.stock || {}, hidden = new Set([...(o.hidden || []), ...(o.deleted || [])]), sale = o.labels?.sale || {};
  const site = (base.site || origin).replace(/\/$/, "");
  const abs = (u) => (/^https?:/.test(u) ? u : `${site}/${u.replace(/^\//, "")}`);
  const fixed = o.store?.shipMode === "fixed";
  const ship = fixed ? (o.store?.deliveryOffice != null && o.store.deliveryOffice !== "" && !isNaN(o.store.deliveryOffice) ? Number(o.store.deliveryOffice) : null)
    : SPEEDY.rows[0][1]; // по тарифа: най-ниската цена до офис (Спиди, до 3 кг)
  const freeOver = Number(o.store?.freeShipOver) || 0;
  const edits = o.edits || {};
  const okImg = (u) => typeof u === "string" && /^(media\/[a-z0-9]+\.(webp|jpg|png)|https:\/\/\S+)$/.test(u);

  const items = [];
  for (const it of base.rows) {
    if (hidden.has(it.s)) continue;
    let price = prices[it.id] != null && prices[it.id] !== "" ? Number(prices[it.id]) : it.p;
    if (!(price > 0)) continue;
    const pct = sale[it.id] ?? sale[it.s] ?? it.d;
    let regular = price, salePrice = null;
    if (pct > 0 && pct < 100) salePrice = Math.round(price * (100 - pct)) / 100;
    else if (it.o > price) { regular = it.o; salePrice = price; }
    const inStock = !(stock[it.id] === 0 || stock[it.s] === 0 || it.st === 0);
    const link = `${site}/p/${it.s}/${it.g ? `?v=${it.id}` : ""}`;
    const e = edits[it.s] || {};
    const title = e.n ? `${e.n}${it.color && !e.n.includes(it.color) ? " " + it.color : ""}` : it.t;
    const desc = typeof e.d === "string" && e.d.trim() ? e.d.trim() : it.desc;
    const img = okImg(e.vimg?.[it.id]) ? e.vimg[it.id] : okImg(e.img) ? e.img : it.im;
    const gal = Array.isArray(e.gal) && e.gal.length ? e.gal.filter(okImg) : it.gal;
    const shipNow = ship != null && freeOver && (salePrice || regular) >= freeOver ? 0 : ship;
    items.push(`<item>
<g:id>${it.id}</g:id>
<g:title>${X(title.slice(0, 150))}</g:title>
<g:description>${X(desc.slice(0, 5000))}</g:description>
<g:link>${X(link)}</g:link>
<g:image_link>${X(abs(img))}</g:image_link>
${gal.slice(0, 10).map((u) => `<g:additional_image_link>${X(abs(u))}</g:additional_image_link>`).join("\n")}
<g:availability>${inStock ? "in_stock" : "out_of_stock"}</g:availability>
<g:price>${money(regular)}</g:price>
${salePrice ? `<g:sale_price>${money(salePrice)}</g:sale_price>` : ""}
<g:condition>new</g:condition>
${it.b ? `<g:brand>${X(it.b)}</g:brand>` : ""}
<g:identifier_exists>no</g:identifier_exists>
<g:google_product_category>${base.gcat[it.c] || "264"}</g:google_product_category>
<g:product_type>${X([base.cats[it.c], it.sub].filter(Boolean).join(" > "))}</g:product_type>
${it.g ? `<g:item_group_id>${X(it.g)}</g:item_group_id>` : ""}
${it.color ? `<g:color>${X(it.color)}</g:color>` : ""}
${shipNow != null ? `<g:shipping><g:country>BG</g:country><g:service>${fixed ? "Еконт / Спиди до офис" : "Спиди до офис"}</g:service><g:price>${money(shipNow)}</g:price></g:shipping>` : ""}
</item>`.replace(/\n{2,}/g, "\n"));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>GDMobil – продукти</title>
<link>${X(site)}/</link>
<description>Телефони, таблети и аксесоари от GDMobil, Гоце Делчев</description>
${items.join("\n")}
</channel>
</rss>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=1800" } });
};

export const config = { path: "/feeds/products.xml" };
