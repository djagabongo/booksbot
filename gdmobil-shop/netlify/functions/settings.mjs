// GDMobil – настройки от админ панела (цени, намаления, етикети, контакти, отзиви, статистика).
// Съхраняват се в Netlify Blobs. Четенето е публично, записът изисква паролата
// от променливата на средата ADMIN_PASSWORD (Netlify → Site configuration → Environment variables).
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const KEY = "overrides";
const MAX_BYTES = 400_000;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...headers },
  });

function passwordOk(given) {
  const real = process.env.ADMIN_PASSWORD || "";
  if (real.length < 8) return false;
  const a = createHash("sha256").update(String(given || "")).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req) => {
  const store = getStore({ name: "gdmobil-settings", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const data = (await store.get(KEY, { type: "json" })) || {};
    // кратък кеш, за да се виждат промените бързо
    return json(data, 200, { "cache-control": "public, max-age=10, stale-while-revalidate=60" });
  }

  if (req.method === "POST") {
    if ((process.env.ADMIN_PASSWORD || "").length < 8) return json({ error: "not_configured" }, 503);
    if (!passwordOk(req.headers.get("x-admin-password"))) {
      await wait(900); // забавяне срещу налучкване на паролата
      return json({ error: "unauthorized" }, 401);
    }
    if (url.searchParams.has("check")) return json({ ok: true });

    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ error: "too_large" }, 413);
    let data;
    try { data = JSON.parse(text); } catch { return json({ error: "bad_json" }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "bad_json" }, 400);

    data._savedAt = new Date().toISOString();
    await store.setJSON(KEY, data);
    await store.setJSON(`history/${data._savedAt}`, data); // история на промените
    return json({ ok: true, savedAt: data._savedAt }, 200, { "cache-control": "no-store" });
  }

  return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST" });
};

export const config = { path: "/api/settings" };
