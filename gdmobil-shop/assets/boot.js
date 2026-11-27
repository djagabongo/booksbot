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
      ["deliveryOffice", "deliveryAddress", "freeShipOver"].forEach((k) => { if (k in st) S[k] = st[k] === "" || st[k] == null ? null : Number(st[k]); });
      if (st.shipMode === "fixed" || st.shipMode === "tariff") S.shipMode = st.shipMode;
      if (typeof st.codFeeShown === "boolean") S.codFeeShown = st.codFeeShown;
      if (Array.isArray(st.hours) && st.hours.length === 3) S.hours = st.hours.map((r) => [String(r[0]), String(r[1])]);
      if (Array.isArray(st.featured) && st.featured.length) S.featured = st.featured.map(String);
      if (Array.isArray(st.heroSlides) && st.heroSlides.length) S.heroSlides = st.heroSlides.filter((x) => x && typeof x === "object");
      if (st.social && typeof st.social === "object") S.social = { ...S.social, ...st.social };
      if (Array.isArray(st.repairPrices) && st.repairPrices.length) window.REPAIR_PRICES = st.repairPrices.filter((r) => r && r.m && Array.isArray(r.p));
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
    const prices = o.prices || {}, stock = o.stock || {}, hidden = new Set([...(o.hidden || []), ...(o.deleted || [])]);
    if (C) {
      // варианти от админ панела: нови (vadd), променени текстове (vedits), изтрити (vdel)
      const vadd = o.vadd || {}, vedits = o.vedits || {}, vdel = new Set((o.vdel || []).map(String));
      const VI = { storage: 1, ram: 2, color: 3, conn: 4, model: 12 };
      // продукти, добавени ръчно от админ панела
      const padd = o.padd && typeof o.padd === "object" ? o.padd : {};
      for (const s in padd) {
        const d = padd[s];
        if (!d || !d.n || C.groups.some((g) => g.s === s) || !/^[a-z0-9-]{3,90}$/.test(s)) continue;
        C.groups.push({ s, n: String(d.n).slice(0, 160), b: String(d.b || "").slice(0, 40), c: ["phones", "tablets", "accessories"].includes(d.c) ? d.c : "accessories",
          mk: "", sc: String(d.sc || "").slice(0, 40), cm: Array.isArray(d.cm) ? d.cm.map(String) : [], v: [] });
      }
      const str = (x) => String(x ?? "").slice(0, 80);
      C.groups.forEach((g) => {
        (Array.isArray(vadd[g.s]) ? vadd[g.s] : []).forEach((x) => {
          if (!x || !x.id) return;
          g.v.push([Number(x.id), str(x.storage), str(x.ram), str(x.color), str(x.conn), null, x.img || (g.v[0] && g.v[0][6]) || "", "", 0, 1, [], null, str(x.model), str(x.vmk)]);
        });
        g.v.forEach((v) => { const e = vedits[v[0]]; if (e && typeof e === "object") for (const k in VI) if (k in e) v[VI[k]] = str(e[k]); });
        if (vdel.size) g.v = g.v.filter((v) => !vdel.has(String(v[0])));
      });
      C.groups = C.groups.filter((g) => g.v.length);
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
    // 3а) редакции от админ панела: име, описание, снимки
    const ed = o.edits && typeof o.edits === "object" ? o.edits : {};
    if (C) {
      const ok = (u) => typeof u === "string" && /^(media\/[a-z0-9]+\.(webp|jpg|png)|https:\/\/[^\s"'<>]+)$/.test(u);
      const gal = (e) => (Array.isArray(e.gal) ? e.gal.filter(ok) : null);
      C.groups.forEach((g) => {
        const e = ed[g.s]; if (!e) return;
        if (e.n && String(e.n).trim()) g.n = String(e.n).trim();
        if (typeof e.d === "string" && e.d.trim()) g.d = e.d.trim();
        const gl = gal(e);
        g.v.forEach((v) => {
          const vi = e.vimg && e.vimg[v[0]];
          if (ok(vi)) v[6] = vi; else if (ok(e.img)) v[6] = e.img;
          if (gl) v[10] = gl;
        });
      });
      C.items.forEach((i) => {
        const e = ed[i.s]; if (!e) return;
        if (e.n && String(e.n).trim()) i.n = String(e.n).trim();
        if (typeof e.d === "string" && e.d.trim()) i.d = e.d.trim();
        if (ok(e.img)) i.im = e.img;
        const gl = gal(e); if (gl) i.gl = gl;
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
  // Винаги се взимат актуалните настройки от сървъра (изтрити/скрити продукти, цени).
  // Запомнените се ползват само ако сървърът не отговори до 1,2 с или няма връзка.
  // Ако админ панелът в този браузър току-що е записал промени (до 2 мин.), те се ползват веднага.
  const box = read(), cached = box && box.t ? box.o : box;
  let done = false;
  const go = (o) => { if (!done) { done = true; start(o); } };
  if (box && box.admin && Date.now() - box.t < 120000) go(cached);
  const timer = setTimeout(() => go(cached), 1200);
  fetch("/api/settings", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((o) => { if (o) write({ t: Date.now(), o }); clearTimeout(timer); go(o || cached); })
    .catch(() => { clearTimeout(timer); go(cached); });
})();
