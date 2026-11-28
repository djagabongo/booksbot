// GDMobil – снимки, качени от админ панела (Netlify Blobs „gdmobil-media“).
//   POST /api/media            – качване (само с паролата на админ панела); тялото е самата снимка (webp/jpeg/png, до 3 MB)
//   GET  /media/<id>.<ext>     – показване в сайта (публично, кешира се дълго – всяка снимка има уникално име)
import { getStore } from "@netlify/blobs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const MAX = 3_000_000;

function passwordOk(given) {
  const real = process.env.ADMIN_PASSWORD || "";
  if (real.length < 8) return false;
  const a = createHash("sha256").update(String(given || "")).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });

// проверка по първите байтове, а не само по заглавката
function sniff(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

export default async (req) => {
  const store = getStore({ name: "gdmobil-media" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const m = url.pathname.match(/^\/media\/([a-z0-9]{16,40})\.(webp|jpg|png)$/);
    if (!m) return new Response("Not found", { status: 404 });
    const r = await store.getWithMetadata(m[1], { type: "arrayBuffer" });
    if (!r) return new Response("Not found", { status: 404 });
    return new Response(r.data, { headers: { "content-type": r.metadata?.type || "image/webp", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  }

  if (req.method === "POST" && url.pathname === "/api/media") {
    if (!passwordOk(req.headers.get("x-admin-password"))) return json({ error: "unauthorized" }, 401);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty" }, 400);
    if (buf.byteLength > MAX) return json({ error: "too_large" }, 413);
    const type = sniff(buf);
    if (!TYPES[type]) return json({ error: "bad_type" }, 415);
    const id = createHash("sha256").update(new Uint8Array(buf)).digest("hex").slice(0, 20) + randomBytes(2).toString("hex");
    await store.set(id, buf, { metadata: { type, size: buf.byteLength, at: new Date().toISOString() } });
    return json({ ok: true, url: `media/${id}.${TYPES[type]}` });
  }
  return json({ error: "method" }, 405);
};

export const config = { path: ["/media/*", "/api/media"] };
