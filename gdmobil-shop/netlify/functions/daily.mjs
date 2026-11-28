// GDMobil – ежедневна задача (Netlify Scheduled Function, всеки ден в 17:05 българско време).
// 0) Записва цените за деня (история за правилото „най-ниска цена през последните 30 дни“).
// 1) Напомня по имейл за утрешните часове в сервиза.
// 2) Пише на абонатите от „Кажи ми при намаление“, ако цената е паднала, и ги изтрива от списъка.
// Работи само ако са зададени BREVO_API_KEY и MAIL_FROM (виж netlify/lib/mail.mjs).
import { getStore } from "@netlify/blobs";
import { sendMail, mailEnabled, layout, rows, storeInfo, siteUrl, eur, when } from "../lib/mail.mjs";
import { snapshotPrices } from "../lib/prices.mjs";

const sofiaDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" }).format(d); // YYYY-MM-DD

export async function runDaily() {
  const report = { reminders: 0, priceAlerts: 0, skipped: !mailEnabled(), low30: 0 };
  const S = await storeInfo(), site = siteUrl(S);
  // ---------- 0) история на цените (за „най-ниска цена за 30 дни“) – винаги ----------
  try { report.low30 = await snapshotPrices(site); } catch (e) { report.priceError = String(e).slice(0, 120); }
  if (!mailEnabled()) return report;
  const store = getStore({ name: "gdmobil-orders", consistency: "strong" });

  // ---------- 1) напомняния за утре ----------
  const tomorrow = sofiaDay(new Date(Date.now() + 24 * 3600 * 1000));
  const { blobs: slots } = await store.list({ prefix: "slot/" + tomorrow });
  for (const s of slots) {
    const ref = (await store.get(s.key, { type: "json" }))?.ref;
    const o = ref && (await store.get("o/" + ref, { type: "json" }));
    if (!o || !o.customer?.email || o.reminded || ["cancelled", "done"].includes(o.status)) continue;
    const ok = await sendMail({
      to: { email: o.customer.email, name: o.customer.name }, replyTo: S.email,
      subject: `Напомняне: утре в ${o.appointment.slice(11)} ч. в сервиза на GDMobil`,
      html: layout(S, {
        title: "Очакваме те утре", intro: `Напомняме за часа ти в сервиза. Ако не можеш да дойдеш, обади се на ${S.phone}, за да го преместим.`,
        body: rows([["Час", when(o.appointment)], ["Устройство", o.device], ["Адрес", S.address], ["Номер", o.ref]]),
        button: { text: "Упътване", url: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("GDMobil " + S.address) },
      }),
    });
    if (ok) { o.reminded = new Date().toISOString(); await store.setJSON("o/" + ref, o); report.reminders++; }
  }

  // ---------- 2) известия при намаление ----------
  const { blobs: watches } = await store.list({ prefix: "watch/" });
  if (watches.length) {
    let base = null;
    try { base = await (await fetch(site + "/feeds/base.json")).json(); } catch {}
    let o = {};
    try { o = (await getStore({ name: "gdmobil-settings" }).get("overrides", { type: "json" })) || {}; } catch {}
    const byId = new Map((base?.rows || []).map((r) => [String(r.id), r]));
    const prices = o.prices || {}, sale = o.labels?.sale || {}, hidden = new Set(o.hidden || []);
    const now = (w) => {
      const r = byId.get(String(w.id)) || (base?.rows || []).find((x) => x.s === w.slug);
      if (!r || hidden.has(r.s)) return null;
      const p = prices[r.id] != null && prices[r.id] !== "" ? Number(prices[r.id]) : r.p;
      const pct = sale[r.id] ?? sale[r.s];
      return pct > 0 && pct < 100 ? Math.round(p * (100 - pct)) / 100 : p;
    };
    for (const b of watches) {
      const w = await store.get(b.key, { type: "json" });
      const price = w && now(w);
      if (!w || price == null || !(w.price > 0) || price >= w.price - 0.009) continue;
      const ok = await sendMail({
        to: w.email, replyTo: S.email, subject: `Намаление: ${w.name} – вече ${eur(price)}`,
        html: layout(S, {
          title: "Цената падна!", intro: `Продуктът, който следиш, вече е по-евтин.`,
          body: rows([["Продукт", w.name], w.variant && ["Вариант", w.variant], ["Беше", eur(w.price)], ["Сега", eur(price)]]),
          button: { text: "Виж продукта", url: `${site}/p/${w.slug}/${w.id ? "?v=" + w.id : ""}` },
          footer: `Получаваш това писмо, защото поиска известие при намаление. Имейлът ти вече е изтрит от списъка. <a href="${site}/unsubscribe/?email=${encodeURIComponent(w.email)}" style="color:#777">Отписване от всички известия</a>`,
        }),
      });
      if (ok) { await store.delete(b.key); report.priceAlerts++; }
    }
  }
  return report;
}

export default async () => {
  const report = await runDaily();
  console.log("daily", JSON.stringify(report));
};

// 15:05 UTC = 17:05 зимно / 18:05 лятно българско време
export const config = { schedule: "5 15 * * *" };
