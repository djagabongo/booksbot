// GDMobil – поръчки, запитвания, ремонти и абонаменти.
// • Записва всяко изпращане в Netlify Blobs (магазинът вече не губи заявки).
// • Изпраща известие в Telegram, ако са зададени TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.
// • Клиентът проследява статуса по номер + последните 4 цифри от телефона.
// • Админ панелът (ADMIN_PASSWORD) вижда списъка и сменя статусите.
import { getStore } from "@netlify/blobs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { runDaily } from "./daily.mjs";
import { low30For } from "../lib/prices.mjs";
import { sendMail, mailEnabled, layout, rows, itemsTable, storeInfo, siteUrl, eur, when } from "../lib/mail.mjs";

export const STATUSES = {
  order: { new: "Приета", confirmed: "Потвърдена", shipped: "Изпратена", ready: "Готова за вземане", done: "Завършена", cancelled: "Отказана" },
  repair: { new: "Приета", diagnostics: "Диагностика", quote: "Изпратена оферта", repairing: "В ремонт", ready: "Готов за вземане", done: "Завършен", cancelled: "Отказан" },
  inquiry: { new: "Получено", answered: "Отговорено", closed: "Затворено" },
  withdrawal: { new: "Получен", accepted: "Приет", returned: "Стоката е върната", refunded: "Сумата е възстановена", closed: "Затворен" },
};
const TYPE_LABEL = { order: "🛒 Нова поръчка", repair: "🔧 Запитване за ремонт", inquiry: "✉️ Ново запитване", newsletter: "📰 Нов абонат", withdrawal: "↩️ ОТКАЗ ОТ ДОГОВОР", review: "⭐ Нов отзив (чака одобрение)" };

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const clean = (s, n = 2000) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
const digits = (s) => String(s || "").replace(/\D/g, "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hits = new Map();

function passwordOk(given) {
  const real = process.env.ADMIN_PASSWORD || "";
  if (real.length < 8) return false;
  const a = createHash("sha256").update(String(given || "")).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}
function limited(key, max) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 600_000);
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
function newRef(type) {
  const d = new Date();
  const p = type === "order" ? "GD" : type === "repair" ? "R" : type === "withdrawal" ? "W" : "Z";
  return `${p}-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${randomInt(1000, 10000)}`;
}

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
}

const publicView = (o) => ({
  ref: o.ref, type: o.type, status: o.status, statusLabel: STATUSES[o.type]?.[o.status] || o.status, createdAt: o.createdAt,
  history: (o.history || []).map((h) => ({ status: h.status, label: STATUSES[o.type]?.[h.status] || h.status, at: h.at, note: h.note || "" })),
  items: (o.items || []).map((i) => ({ name: i.name, variant: i.variant, qty: i.qty })), total: o.total ?? null,
  delivery: o.delivery || "", tracking: o.tracking || "", device: o.device || "", appointment: o.appointment || "",
});
const SLOT_RX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const summary = (o) => ({ ref: o.ref, type: o.type, status: o.status, createdAt: o.createdAt, name: o.customer?.name || "", phone: o.customer?.phone || "", total: o.total ?? null, title: o.title || "",
  items: (o.items || []).map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })), promo: o.promo?.code || "", discount: o.promo?.discount || 0, appointment: o.appointment || "" });
const KIND = { order: "поръчка", repair: "заявка за ремонт", inquiry: "запитване", withdrawal: "заявление за отказ от договора" };

// ---------- промо кодове (дефинирани в админ панела → Промо кодове) ----------
async function findPromo(store, code) {
  code = String(code || "").trim().toUpperCase();
  if (!code) return null;
  let list = [];
  try { list = ((await getStore({ name: "gdmobil-settings" }).get("overrides", { type: "json" })) || {}).promos || []; } catch {}
  const p = list.find((x) => String(x.code || "").toUpperCase() === code);
  if (!p || p.active === false) return null;
  if (p.until && new Date(p.until + "T23:59:59+02:00") < new Date()) return null;
  if (p.limit > 0) {
    const used = Number(await store.get("promo-uses/" + code)) || 0;
    if (used >= p.limit) return null;
  }
  return { code, kind: p.kind === "fixed" ? "fixed" : "percent", value: Number(p.value) || 0, scope: p.scope || "all", min: Number(p.min) || 0, title: p.title || "" };
}

// ---------- имейли до клиента и магазина ----------
async function mailNew(o) {
  if (!mailEnabled()) return;
  const S = await storeInfo(), site = siteUrl(S);
  const track = `${site}/#/track?ref=${encodeURIComponent(o.ref)}&phone=${digits(o.customer.phone).slice(-4)}`;
  const details = rows([
    ["Номер", o.ref], o.appointment && ["Час в сервиза", when(o.appointment)], o.device && ["Устройство", o.device],
    o.delivery && ["Получаване", o.delivery], o.payment && ["Плащане", o.payment], o.promo && ["Промо код", `${o.promo.code} (−${eur(o.promo.discount)})`],
  ]);
  const jobs = [];
  if (o.customer.email) {
    jobs.push(sendMail({
      to: { email: o.customer.email, name: o.customer.name }, replyTo: S.email,
      subject: o.type === "withdrawal" ? `Потвърждение за отказ от договора ${o.ref}` : o.appointment ? `Час за сервиз ${o.ref} – ${when(o.appointment)}` : `Получихме твоята ${KIND[o.type]} ${o.ref}`,
      html: layout(S, {
        title: o.type === "withdrawal" ? "Получихме отказа ти от договора" : o.appointment ? "Часът ти е запазен" : `Благодарим, ${o.customer.name.split(" ")[0]}!`,
        intro: o.type === "withdrawal" ? `Отказът е получен на ${when(o.createdAt)}. Това писмо е потвърждението на траен носител. Ще се свържем с теб за връщането на стоката; възстановяваме дължимите суми до 14 дни от получаването на отказа, като можем да изчакаме да получим стоката обратно или доказателство, че е изпратена.` : o.type === "order" ? "Получихме заявката ти. Ще ти се обадим, за да потвърдим наличността, сумата и срока." :
          o.appointment ? "Очакваме те в сервиза. Ако не можеш да дойдеш, обади ни се, за да преместим часа." : "Получихме съобщението ти и ще отговорим възможно най-скоро.",
        body: details + itemsTable(o.items, o.total), button: { text: "Проследи статуса", url: track },
        footer: "Отговори на това писмо, ако имаш въпрос.",
      }),
    }));
  }
  jobs.push(sendMail({
    to: process.env.MAIL_OWNER || process.env.MAIL_FROM, replyTo: o.customer.email || undefined,
    subject: `${o.type === "withdrawal" ? "↩️ ОТКАЗ ОТ ДОГОВОР" : o.appointment ? "📅 Час за сервиз" : o.type === "order" ? "🛒 Нова поръчка" : o.type === "repair" ? "🔧 Ремонт" : "✉️ Запитване"} ${o.ref} – ${o.customer.name}${o.total != null ? " – " + eur(o.total) : ""}`,
    html: layout(S, { title: `${o.title || o.ref}`, body: `<pre style="white-space:pre-wrap;font:14px/1.5 Arial,sans-serif;margin:0">${String(o.text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</pre>`,
      button: { text: "Отвори в админ панела", url: `${site}/admin.html` } }),
  }));
  await Promise.all(jobs);
}
async function mailStatus(o, note) {
  if (!mailEnabled() || !o.customer?.email) return false;
  const S = await storeInfo(), site = siteUrl(S);
  const label = STATUSES[o.type]?.[o.status] || o.status;
  return sendMail({
    to: { email: o.customer.email, name: o.customer.name }, replyTo: S.email,
    subject: `${o.ref}: ${label}`,
    html: layout(S, {
      title: `Статус: ${label}`, intro: `Има ново по твоята ${KIND[o.type] || "заявка"} <b>${o.ref}</b>.`,
      body: rows([["Статус", label], note && ["Съобщение", note], o.tracking && ["Товарителница", o.tracking], o.appointment && ["Час", when(o.appointment)]]) + itemsTable(o.items, o.total),
      button: { text: "Виж подробности", url: `${site}/#/track?ref=${encodeURIComponent(o.ref)}&phone=${digits(o.customer.phone).slice(-4)}` },
    }),
  });
}

export default async (req, context) => {
  const store = getStore({ name: "gdmobil-orders", consistency: "strong" });
  const url = new URL(req.url);
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const admin = req.headers.has("x-admin-password");

  // ---------- админ ----------
  if (admin) {
    if (!passwordOk(req.headers.get("x-admin-password"))) { await wait(900); return json({ error: "unauthorized" }, 401); }
    if (req.method === "GET" && url.searchParams.has("list")) {
      const index = (await store.get("index", { type: "json" })) || [];
      return json({ orders: index.slice(0, 1000), statuses: STATUSES });
    }
    if (req.method === "GET" && url.searchParams.has("reviews")) {
      const { blobs } = await store.list({ prefix: "review/" });
      const list = await Promise.all(blobs.map(async (b) => ({ key: b.key, ...(await store.get(b.key, { type: "json" })) })));
      return json({ reviews: list.sort((a, b) => String(b.at).localeCompare(String(a.at))) });
    }
    if (req.method === "POST" && url.searchParams.get("review_del")) {
      const key = url.searchParams.get("review_del");
      if (!key.startsWith("review/")) return json({ error: "bad_request" }, 400);
      await store.delete(key);
      return json({ ok: true });
    }
    if (req.method === "GET" && url.searchParams.has("watches")) {
      const { blobs } = await store.list({ prefix: "watch/" });
      const list = await Promise.all(blobs.map(async (b) => ({ key: b.key, ...(await store.get(b.key, { type: "json" })) })));
      return json({ watches: list });
    }
    if (req.method === "POST" && url.searchParams.has("watch_del")) {
      const body = await req.json().catch(() => ({}));
      const keys = (Array.isArray(body.keys) ? body.keys : []).filter((k) => typeof k === "string" && k.startsWith("watch/")).slice(0, 500);
      await Promise.all(keys.map((k) => store.delete(k)));
      return json({ ok: true, deleted: keys.length });
    }
    if (req.method === "POST" && url.searchParams.has("rundaily")) return json(await runDaily());
    if (req.method === "GET" && url.searchParams.has("mailcheck")) return json({ mail: mailEnabled(), telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) });
    if (req.method === "GET" && url.searchParams.has("promouses")) {
      const { blobs } = await store.list({ prefix: "promo-uses/" });
      const out = {};
      for (const b of blobs) out[b.key.slice(11)] = Number(await store.get(b.key)) || 0;
      return json({ uses: out });
    }
    if (req.method === "GET" && url.searchParams.get("ref")) {
      const o = await store.get("o/" + url.searchParams.get("ref"), { type: "json" });
      return o ? json(o) : json({ error: "not_found" }, 404);
    }
    if (req.method === "POST" && url.searchParams.get("update")) {
      const ref = url.searchParams.get("update");
      const o = await store.get("o/" + ref, { type: "json" });
      if (!o) return json({ error: "not_found" }, 404);
      const body = await req.json().catch(() => ({}));
      const before = { status: o.status, tracking: o.tracking };
      if (body.status && STATUSES[o.type]?.[body.status] && body.status !== o.status) {
        o.status = body.status;
        o.history.push({ status: body.status, at: new Date().toISOString(), note: clean(body.note, 300) });
      } else if (body.note) {
        o.history.push({ status: o.status, at: new Date().toISOString(), note: clean(body.note, 300) });
      }
      if (o.appointment && ["cancelled", "done"].includes(o.status)) await store.delete("slot/" + o.appointment); // освобождава часа
      if (typeof body.tracking === "string") o.tracking = clean(body.tracking, 120);
      if (typeof body.internalNote === "string") o.internalNote = clean(body.internalNote, 2000);
      await store.setJSON("o/" + ref, o);
      const index = (await store.get("index", { type: "json" })) || [];
      const i = index.findIndex((x) => x.ref === ref);
      if (i > -1) index[i] = summary(o);
      await store.setJSON("index", index);
      const changed = before.status !== o.status || before.tracking !== o.tracking || !!clean(body.note, 300);
      const mailed = changed && body.notify !== false ? await mailStatus(o, clean(body.note, 300)) : false;
      return json({ ok: true, order: o, mailed });
    }
    return json({ error: "bad_request" }, 400);
  }

  // ---------- най-ниска цена през 30-те дни преди сегашната (публично) ----------
  if (req.method === "GET" && url.searchParams.get("low30")) {
    const ids = url.searchParams.get("low30").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean).slice(0, 200);
    try { return json(await low30For(ids), 200, { "cache-control": "public, max-age=3600" }); } catch { return json({}); }
  }

  // ---------- проверка на промо код (публично) ----------
  if (req.method === "GET" && url.searchParams.has("promo")) {
    if (limited("promo:" + ip, 20)) return json({ error: "rate_limited" }, 429);
    const p = await findPromo(store, url.searchParams.get("promo"));
    if (!p) { await wait(300); return json({ error: "invalid" }, 404); }
    return json(p);
  }

  // ---------- заети часове за сервиза (публично, без лични данни) ----------
  if (req.method === "GET" && url.searchParams.get("slots")) {
    const day = url.searchParams.get("slots");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "bad_request" }, 400);
    const { blobs } = await store.list({ prefix: "slot/" + day });
    return json({ taken: blobs.map((b) => b.key.slice(-5)) });
  }

  // ---------- проследяване (публично) ----------
  if (req.method === "GET") {
    const ref = clean(url.searchParams.get("ref"), 40).toUpperCase(), phone = digits(url.searchParams.get("phone"));
    if (!ref || phone.length < 4) return json({ error: "bad_request" }, 400);
    if (limited("track:" + ip, 30)) return json({ error: "rate_limited" }, 429);
    const o = await store.get("o/" + ref, { type: "json" });
    if (!o || digits(o.customer?.phone).slice(-4) !== phone.slice(-4)) { await wait(400); return json({ error: "not_found" }, 404); }
    return json(publicView(o));
  }

  // ---------- нова заявка ----------
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (limited("new:" + ip, 12)) return json({ error: "rate_limited" }, 429);
  const b = await req.json().catch(() => null);
  if (!b || !["order", "repair", "inquiry", "newsletter", "review", "watch", "withdrawal", "unsubscribe"].includes(b.type)) return json({ error: "bad_request" }, 400);

  if (b.type === "unsubscribe") { // отписване от бюлетина и от известията за намаление
    const email = clean(b.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "bad_request" }, 400);
    await store.delete("newsletter/" + email);
    const { blobs } = await store.list({ prefix: "watch/" });
    for (const x of blobs) { const w = await store.get(x.key, { type: "json" }); if (w?.email === email) await store.delete(x.key); }
    return json({ ok: true });
  }

  if (b.type === "watch") {
    const email = clean(b.email, 200).toLowerCase();
    const slug = clean(b.slug, 160), id = clean(b.id, 30);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !b.consent || !/^[\w-]+$/.test(slug)) return json({ error: "bad_request" }, 400);
    const h = createHash("sha256").update(email).digest("hex").slice(0, 16);
    await store.setJSON(`watch/${slug}/${h}`, { email, slug, id, name: clean(b.name, 200), variant: clean(b.variant, 120), price: Number(b.price) || null, at: new Date().toISOString() });
    return json({ ok: true });
  }

  if (b.type === "review") {
    const r = { name: clean(b.name, 60), rating: Math.max(1, Math.min(5, parseInt(b.rating) || 5)), text: clean(b.text, 1200), at: new Date().toISOString() };
    if (!r.name || r.text.length < 10 || !b.consent) return json({ error: "bad_request" }, 400);
    await store.setJSON(`review/${Date.now()}-${randomInt(1000, 10000)}`, r);
    await notifyTelegram(`${TYPE_LABEL.review}\n${"★".repeat(r.rating)} ${r.name}\n${r.text}`);
    return json({ ok: true });
  }

  if (b.type === "newsletter") {
    const email = clean(b.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !b.consent) return json({ error: "bad_request" }, 400);
    await store.setJSON("newsletter/" + email, { email, consentAt: new Date().toISOString() });
    await notifyTelegram(`${TYPE_LABEL.newsletter}\n${email}`);
    return json({ ok: true });
  }

  const customer = { name: clean(b.customer?.name, 120), phone: clean(b.customer?.phone, 40), email: clean(b.customer?.email, 200) };
  if (!customer.name || digits(customer.phone).length < 6) return json({ error: "bad_request" }, 400);
  const appointment = b.type === "repair" && SLOT_RX.test(b.appointment || "") ? b.appointment : "";
  if (appointment) {
    if (new Date(appointment + ":00+02:00") < new Date()) return json({ error: "slot_past" }, 400);
    if (await store.get("slot/" + appointment)) return json({ error: "slot_taken" }, 409);
  }
  let promo = null;
  if (b.type === "order" && b.promo) {
    const p = await findPromo(store, b.promo);
    if (!p) return json({ error: "promo_invalid" }, 400);
    promo = { code: p.code, discount: Math.max(0, Math.round((Number(b.discount) || 0) * 100) / 100) };
  }
  let ref = /^(GD|R|Z|W)-\d{6}-\d{4}$/.test(b.ref || "") ? b.ref : newRef(b.type);
  if (await store.get("o/" + ref)) ref = newRef(b.type);
  const now = new Date().toISOString();
  const o = {
    ref, type: b.type, status: "new", createdAt: now, history: [{ status: "new", at: now, note: "" }],
    customer, title: clean(b.title, 200), text: clean(b.text, 6000), device: clean(b.device, 120),
    items: (Array.isArray(b.items) ? b.items : []).slice(0, 50).map((i) => ({ id: clean(i.id, 30), name: clean(i.name, 200), variant: clean(i.variant, 200), qty: Math.max(1, Math.min(99, parseInt(i.qty) || 1)), price: Number(i.price) || 0 })),
    total: typeof b.total === "number" ? b.total : null, delivery: clean(b.delivery, 300), payment: clean(b.payment, 80), tracking: "", appointment, ...(promo ? { promo } : {}),
  };
  if (promo) await store.set("promo-uses/" + promo.code, String((Number(await store.get("promo-uses/" + promo.code)) || 0) + 1));
  if (appointment) await store.setJSON("slot/" + appointment, { ref });
  await store.setJSON("o/" + ref, o);
  const index = (await store.get("index", { type: "json" })) || [];
  index.unshift(summary(o));
  await store.setJSON("index", index.slice(0, 5000));
  const [notified] = await Promise.all([
    notifyTelegram(`${appointment ? "📅 Записан час за сервиз" : TYPE_LABEL[o.type]} ${ref}\n\n${o.text}`),
    mailNew(o),
  ]);
  return json({ ok: true, ref, notified });
};

export const config = { path: "/api/orders" };
