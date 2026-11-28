// GDMobil – изпращане на имейли чрез Brevo (безплатно до 300 писма на ден).
// Нужни променливи в Netlify: BREVO_API_KEY и MAIL_FROM (потвърден подател в Brevo, напр. office@gdmobil.bg).
// По избор: MAIL_OWNER – къде да идват известията за нови поръчки (по подразбиране MAIL_FROM).
import { getStore } from "@netlify/blobs";

const API = process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email";
export const mailEnabled = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const eur = (n) => (n == null ? "—" : new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" }).format(n));
export const when = (iso) => new Date(iso).toLocaleString("bg-BG", { timeZone: "Europe/Sofia", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const DEFAULT_STORE = { name: "GDMobil", phone: "0893 933 338", email: "office@gdmobil.bg", address: "ул. „Солун“ 21, Гоце Делчев", siteUrl: "https://gdmobil.bg" };
export async function storeInfo() {
  try {
    const o = (await getStore({ name: "gdmobil-settings" }).get("overrides", { type: "json" })) || {};
    return { ...DEFAULT_STORE, ...Object.fromEntries(Object.entries(o.store || {}).filter(([, v]) => typeof v === "string" && v.trim())) };
  } catch {
    return DEFAULT_STORE;
  }
}
export const siteUrl = (S) => (process.env.URL || S.siteUrl || DEFAULT_STORE.siteUrl).replace(/\/$/, "");

/** Обвивка на писмото: заглавие, параграфи (HTML), бутон, долна част с контакти. */
export function layout(S, { title, intro = "", body = "", button = null, footer = "" }) {
  const site = siteUrl(S);
  return `<!doctype html><html lang="bg"><body style="margin:0;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#141414">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ec;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#0f0f10;padding:18px 24px"><a href="${site}" style="color:#ffffff;font-size:20px;font-weight:bold;text-decoration:none">GD<span style="color:#ff5a1f">Mobil</span></a></td></tr>
<tr><td style="padding:26px 24px 8px"><h1 style="margin:0 0 10px;font-size:22px;line-height:1.25">${esc(title)}</h1>${intro ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3a3a3a">${intro}</p>` : ""}${body}</td></tr>
${button ? `<tr><td style="padding:8px 24px 22px"><a href="${esc(button.url)}" style="display:inline-block;background:#ff5a1f;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${esc(button.text)}</a></td></tr>` : ""}
<tr><td style="padding:16px 24px 22px;border-top:1px solid #eee;font-size:12.5px;line-height:1.6;color:#777">${footer ? footer + "<br>" : ""}GDMobil · ${esc(S.address)} · <a href="tel:${esc(String(S.phone).replace(/\s/g, ""))}" style="color:#777">${esc(S.phone)}</a> · <a href="mailto:${esc(S.email)}" style="color:#777">${esc(S.email)}</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** Таблица с редове [етикет, стойност] */
export const rows = (list) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;margin:6px 0 10px">${list
  .filter((r) => r && r[1] !== "" && r[1] != null)
  .map(([k, v]) => `<tr><td style="padding:5px 0;color:#777;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;font-weight:bold">${esc(v)}</td></tr>`)
  .join("")}</table>`;

export const itemsTable = (items = [], total = null) => items.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.45;margin:6px 0 12px;border-top:1px solid #eee">${items
  .map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${esc(i.name)}${i.variant ? `<br><span style="color:#777;font-size:12.5px">${esc(i.variant)}</span>` : ""}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${i.qty} × ${eur(i.price)}</td></tr>`)
  .join("")}${total != null ? `<tr><td style="padding:10px 0;font-weight:bold">Общо</td><td style="padding:10px 0;text-align:right;font-weight:bold;font-size:16px">${eur(total)}</td></tr>` : ""}</table>` : "";

/** Изпраща писмо. Връща true/false; никога не хвърля грешка. */
export async function sendMail({ to, subject, html, replyTo }) {
  if (!mailEnabled() || !to) return false;
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "GDMobil", email: process.env.MAIL_FROM },
        to: (Array.isArray(to) ? to : [to]).map((e) => (typeof e === "string" ? { email: e } : e)),
        subject, htmlContent: html, ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
