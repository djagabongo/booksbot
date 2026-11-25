// GDMobil – поръчки, запитвания, ремонти и абонаменти.
// • Записва всяко изпращане в Netlify Blobs (магазинът вече не губи заявки).
// • Изпраща известие в Telegram, ако са зададени TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.
// • Клиентът проследява статуса по номер + последните 4 цифри от телефона.
// • Админ панелът (ADMIN_PASSWORD) вижда списъка и сменя статусите.
import { getStore } from "@netlify/blobs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const STATUSES = {
  order: { new: "Приета", confirmed: "Потвърдена", shipped: "Изпратена", ready: "Готова за вземане", done: "Завършена", cancelled: "Отказана" },
  repair: { new: "Приета", diagnostics: "Диагностика", quote: "Изпратена оферта", repairing: "В ремонт", ready: "Готов за вземане", done: "Завършен", cancelled: "Отказан" },
  inquiry: { new: "Получено", answered: "Отговорено", closed: "Затворено" },
};
const TYPE_LABEL = { order: "🛒 Нова поръчка", repair: "🔧 Запитване за ремонт", inquiry: "✉️ Ново запитване", newsletter: "📰 Нов абонат", review: "⭐ Нов отзив (чака одобрение)" };

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
  const p = type === "order" ? "GD" : type === "repair" ? "R" : "Z";
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
const summary = (o) => ({ ref: o.ref, type: o.type, status: o.status, createdAt: o.createdAt, name: o.customer?.name || "", phone: o.customer?.phone || "", total: o.total ?? null, title: o.title || "" });

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
    if (req.method === "GET" && url.searchParams.get("ref")) {
      const o = await store.get("o/" + url.searchParams.get("ref"), { type: "json" });
      return o ? json(o) : json({ error: "not_found" }, 404);
    }
    if (req.method === "POST" && url.searchParams.get("update")) {
      const ref = url.searchParams.get("update");
      const o = await store.get("o/" + ref, { type: "json" });
      if (!o) return json({ error: "not_found" }, 404);
      const body = await req.json().catch(() => ({}));
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
      return json({ ok: true, order: o });
    }
    return json({ error: "bad_request" }, 400);
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
  if (!b || !["order", "repair", "inquiry", "newsletter", "review", "watch"].includes(b.type)) return json({ error: "bad_request" }, 400);

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
  let ref = /^(GD|R|Z)-\d{6}-\d{4}$/.test(b.ref || "") ? b.ref : newRef(b.type);
  if (await store.get("o/" + ref)) ref = newRef(b.type);
  const now = new Date().toISOString();
  const o = {
    ref, type: b.type, status: "new", createdAt: now, history: [{ status: "new", at: now, note: "" }],
    customer, title: clean(b.title, 200), text: clean(b.text, 6000), device: clean(b.device, 120),
    items: (Array.isArray(b.items) ? b.items : []).slice(0, 50).map((i) => ({ id: clean(i.id, 30), name: clean(i.name, 200), variant: clean(i.variant, 200), qty: Math.max(1, Math.min(99, parseInt(i.qty) || 1)), price: Number(i.price) || 0 })),
    total: typeof b.total === "number" ? b.total : null, delivery: clean(b.delivery, 300), payment: clean(b.payment, 80), tracking: "", appointment,
  };
  if (appointment) await store.setJSON("slot/" + appointment, { ref });
  await store.setJSON("o/" + ref, o);
  const index = (await store.get("index", { type: "json" })) || [];
  index.unshift(summary(o));
  await store.setJSON("index", index.slice(0, 5000));
  const notified = await notifyTelegram(`${appointment ? "📅 Записан час за сервиз" : TYPE_LABEL[o.type]} ${ref}\n\n${o.text}`);
  return json({ ok: true, ref, notified });
};

export const config = { path: "/api/orders" };
