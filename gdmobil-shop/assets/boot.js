/* GDMobil – зарежда настройките от админ панела и стартира магазина.
   Настройките идват от /api/settings (Netlify Blobs). Ако не са достъпни
   (локално отваряне, без интернет), магазинът тръгва с данните по подразбиране. */
(() => {
  "use strict";
  const KEY = "gdm2_overrides";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

  function apply(o) {
    if (!o || typeof o !== "object") return;
    const S = window.STORE, L = (window.LABELS = window.LABELS || {}), C = window.CATALOG;
    // 1) магазин: контакти, работно време, доставка, начална страница, социални мрежи
    if (o.store && typeof o.store === "object") {
      const st = o.store;
      ["phone", "email", "address", "viber", "orderEndpoint", "heroSlug", "tagline"].forEach((k) => { if (typeof st[k] === "string" && st[k].trim()) S[k] = st[k].trim(); });
      if (typeof st.viber === "string") S.viber = st.viber.trim();
      if (typeof st.orderEndpoint === "string") S.orderEndpoint = st.orderEndpoint.trim();
      ["deliveryOffice", "deliveryAddress"].forEach((k) => { if (k in st) S[k] = st[k] === "" || st[k] == null ? null : Number(st[k]); });
      if (Array.isArray(st.hours) && st.hours.length === 3) S.hours = st.hours.map((r) => [String(r[0]), String(r[1])]);
      if (Array.isArray(st.featured) && st.featured.length) S.featured = st.featured.map(String);
      if (Array.isArray(st.heroSlides) && st.heroSlides.length) S.heroSlides = st.heroSlides.filter((x) => x && typeof x === "object");
      if (st.social && typeof st.social === "object") S.social = { ...S.social, ...st.social };
      if (typeof st.aiChat === "boolean") S.aiChat = st.aiChat;
      if (st.heroImage === "auto" || (st.heroSlug && st.heroSlug !== "samsung-galaxy-s26-ultra-model-119473")) S.heroImage = "";
      if (st.phone) S.phoneIntl = "+359" + st.phone.replace(/\D/g, "").replace(/^0/, "");
    }
    // 2) етикети и намаления
    if (o.labels && typeof o.labels === "object") {
      if (Array.isArray(o.labels.new)) L.new = o.labels.new;
      if (Array.isArray(o.labels.hot)) L.hot = o.labels.hot;
      if (o.labels.sale && typeof o.labels.sale === "object") L.sale = o.labels.sale;
      if (Array.isArray(o.labels.newAdd)) L.newAdd = o.labels.newAdd;
      if (Array.isArray(o.labels.newRemove)) L.newRemove = o.labels.newRemove;
    }
    // 3) цени, наличност и скрити продукти в каталога
    const prices = o.prices || {}, stock = o.stock || {}, hidden = new Set(o.hidden || []);
    if (C) {
      C.groups = C.groups.filter((g) => !hidden.has(g.s));
      C.items = C.items.filter((i) => !hidden.has(i.s));
      C.groups.forEach((g) => g.v.forEach((v) => {
        if (prices[v[0]] != null && prices[v[0]] !== "") v[5] = Number(prices[v[0]]);
        if (stock[v[0]] === 0 || stock[g.s] === 0) v[9] = 0;
      }));
      C.items.forEach((i) => {
        if (prices[i.i] != null && prices[i.i] !== "") i.p = Number(prices[i.i]);
        if (stock[i.i] === 0 || stock[i.s] === 0) i.st = 0;
      });
    }
    // 4) отзиви и статистика
    if (o.reviews && typeof o.reviews === "object") window.REVIEWS = o.reviews;
    if (o.analytics && typeof o.analytics === "object") window.ANALYTICS = o.analytics;
  }

  function start(o) {
    apply(o);
    const s = document.createElement("script");
    s.src = (document.querySelector("base") ? "/" : "") + "assets/app.js";
    document.body.appendChild(s);
  }

  if (!/^https?:$/.test(location.protocol)) return start(null);
  // Запазените настройки (до 30 мин.) се ползват веднага – страницата не чака сървъра.
  // Иначе се чака най-много 0,8 с. Новите настройки винаги се записват за следващото отваряне.
  const box = read(), fresh = box && box.t && Date.now() - box.t < 30 * 60 * 1000;
  const cached = box && box.t ? box.o : box;
  let done = false;
  const go = (o) => { if (!done) { done = true; start(o); } };
  if (fresh) go(cached);
  const timer = setTimeout(() => go(cached), 800);
  fetch("/api/settings", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((o) => { if (o) write({ t: Date.now(), o }); clearTimeout(timer); go(o || cached); })
    .catch(() => { clearTimeout(timer); go(cached); });
})();
