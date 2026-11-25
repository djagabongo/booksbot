/* ========== GDMobil – логика на магазина ========== */
(() => {
  "use strict";

  const S = window.STORE;
  const C = window.CATALOG;
  const LEGAL = window.LEGAL || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt0 = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const fmt2 = new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = (n, exact) => (n == null ? "" : exact || n % 1 ? fmt2.format(n) : fmt0.format(n));
  const plural = (n, one, many) => `${n.toLocaleString("bg-BG")} ${n === 1 ? one : many}`;
  const tel = S.phoneIntl || S.phone.replace(/\s/g, "");

  /* ---------- безопасно localStorage ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("gdm2_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("gdm2_" + k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- каталог ---------- */
  const noThumb = new Set(C.noThumb || []);
  const csImg = (h, w) => `https://casestore.bg/cdn/img/products/${h.slice(3)}${h.includes("?") ? "&" : "?"}width=${w}&height=${w}`;
  const full = (h) => (!h ? "assets/img/camera.svg" : h.startsWith("cs:") ? csImg(h, 600) : /^(assets\/|https:)/.test(h) ? h : `assets/img/products/${h}.webp`);
  const thumb = (h) => (h && h.startsWith("cs:") ? csImg(h, 300) : h && h.startsWith("https:") ? h.replace(/width=\d+&height=\d+/, "width=300&height=300")
    : !h || h.startsWith("assets/") || /^cs\d+$/.test(h) || noThumb.has(h) ? full(h) : `assets/img/products/${h}-sm.webp`);
  const finalPrice = (base, disc) => (base == null ? null : disc ? Math.round(base * (100 - disc)) / 100 : base);
  const CAT_NAMES = Object.fromEntries(window.CATEGORIES.map((c) => [c.key, c.name]));
  const MODEL_NAMES = Object.fromEntries(C.models.map((m) => [m.key, `${m.brand} ${m.name}`]));

  const PRODUCTS = [];
  const BY_SLUG = new Map();
  const BY_ID = new Map();
  const OPT_KEYS = ["model", "storage", "color", "ram", "conn"];
  const OPT_LABEL = { model: "За модел", storage: "Вградена памет", color: "Цвят", ram: "RAM", conn: "Свързаност" };
  let cardModel = ""; // избран модел в каталога → картата отваря продукта с този модел

  const L = window.LABELS || {};
  const SALE = L.sale || {};
  const NEW_RE = (L.new || []).length ? new RegExp((L.new || []).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
  const HOT = new Set(L.hot || []);
  const NEW_ADD = new Set(L.newAdd || []), NEW_REMOVE = new Set(L.newRemove || []);

  function addProduct(p) {
    p.variants.forEach((v) => {
      const pct = SALE[v.id] ?? SALE[p.slug];
      if (pct > 0 && pct < 100) v.disc = pct;
      v.price = finalPrice(v.base, v.disc);
      // реална стара цена от източника (напр. casestore.bg) → етикет „-X%“ и зачеркната цена
      if (!v.disc && v.old > v.price) { v.disc = Math.round((1 - v.price / v.old) * 100); v.base = v.old; }
      BY_ID.set(v.id, { p, v });
    });
    const priced = p.variants.filter((v) => v.price != null);
    p.min = priced.length ? Math.min(...priced.map((v) => v.price)) : null;
    p.def = p.variants[0];
    p.img = p.def.img;
    p.opts = {};
    for (const k of OPT_KEYS) {
      const vals = [...new Set(p.variants.map((v) => v[k]).filter(Boolean))];
      if (vals.length) p.opts[k] = vals;
    }
    p.disc = Math.max(0, ...p.variants.map((v) => v.disc || 0));
    p.tags = {
      new: NEW_ADD.has(p.slug) || (!NEW_REMOVE.has(p.slug) && !!NEW_RE && (p.cat === "phones" || p.cat === "tablets") && NEW_RE.test(p.name)),
      hot: HOT.has(p.slug),
      sale: p.disc > 0,
    };
    p.search = norm(`${p.brand} ${p.name} ${p.sub || ""} ${(p.compat || []).map((k) => MODEL_NAMES[k] || "").join(" ")}`);
    PRODUCTS.push(p);
    BY_SLUG.set(p.slug, p);
  }

  for (const g of C.groups) {
    addProduct({
      kind: "g", slug: g.s, name: g.n, brand: g.b, cat: g.c, mk: g.mk, specs: g.sp || {}, sub: g.sc, compat: g.cm,
      variants: g.v.map((a) => ({ id: a[0], storage: a[1], ram: a[2], color: a[3], conn: a[4], base: a[5], img: a[6], code: a[7], disc: a[8], stock: a[9], gal: a[10] || [], old: a[11], model: a[12] || "", vmk: a[13] || "" })),
    });
  }
  for (const i of C.items) {
    addProduct({
      kind: "i", slug: i.s, name: i.n, brand: i.b, cat: i.c, sub: i.sc, compat: i.cm, desc: i.d, specs: {},
      variants: [{ id: i.i, base: i.p, disc: i.dc, stock: i.st, img: i.im, old: i.op }],
    });
  }
  const FEATURED = S.featured.map((s) => BY_SLUG.get(s)).filter(Boolean);
  const featuredRank = new Map(FEATURED.map((p, i) => [p, i]));

  /* ---------- търсене ---------- */
  function norm(s) {
    return String(s).toLowerCase().replace(/[„“"'()+,]/g, " ").replace(/\s+/g, " ");
  }
  const ALIASES = [
    [/айфон|ифон/g, "iphone"], [/айпад/g, "ipad"], [/самсунг/g, "samsung"], [/галакси/g, "galaxy"],
    [/ксиаоми|шаоми|сяоми/g, "xiaomi"], [/редми/g, "redmi"], [/гугъл|пиксел/g, "pixel"], [/хуауей|хуавей/g, "huawei"],
    [/моторола/g, "motorola"], [/нокия/g, "nokia"], [/хонор/g, "honor"], [/еърподс|ейрподс/g, "airpods"],
    [/(^| )про(?= |$)/g, "$1pro"], [/(^| )макс(?= |$)/g, "$1max"], [/(^| )ултра(?= |$)/g, "$1ultra"], [/(^| )плюс(?= |$)/g, "$1plus"],
    [/(^| )мини(?= |$)/g, "$1mini"], [/(^| )фолд(?= |$)/g, "$1fold"], [/(^| )флип(?= |$)/g, "$1flip"], [/(^| )ейр(?= |$)/g, "$1air"],
    [/зарядно/g, "заряд"], [/кейс|калъфче/g, "калъф"], [/стъкло/g, "протектор"], [/слушалка/g, "слушалк"],
  ];
  function tokens(q) {
    let s = norm(q);
    for (const [re, to] of ALIASES) s = s.replace(re, to);
    return s.split(" ").filter(Boolean);
  }
  const matches = (p, toks) => toks.every((t) => p.search.includes(t));

  /* ---------- цветове ---------- */
  const COLORS = [
    [/прозрач|transparent|clear|кристал/i, "linear-gradient(135deg,#ffffff,#d9e4ee)"],
    [/многоцвет|multi|rainbow|дъга/i, "conic-gradient(#ff5a5a,#ffd84d,#5ad17a,#4f9cff,#b36bff,#ff5a5a)"],
    [/мента|тюркоаз|mint|turquoise/i, "#7fd1c0"],
    [/кафяв|бежов|brown|beige|camel/i, "#a47e5b"],
    [/черен|black|obsidian|graphite|midnight|night|charcoal|onyx|pitch|mulberry|scarab|hematite/i, "#1f2023"],
    [/бял|white|porcelain|cream|ivory|frost|cloud dancer|silk/i, "#f1f0ec"],
    [/сребр|silver|moonstone|meteor/i, "#d4d6da"],
    [/сив|gray|grey|titanium|stellar|fog/i, "#8d9096"],
    [/бордо|burgundy|berry|wine/i, "#6e1f2e"],
    [/червен|red|coral|hibiscus/i, "#d8433c"],
    [/оранж|orange|canyon|sunset|blossom/i, "#e3793b"],
    [/злат|gold|sand|dune|mocha|cocoa|brown|umber/i, "#d6b98a"],
    [/розов|pink|rose|blush/i, "#efb6c5"],
    [/лилав|violet|purple|lavender|lilac|lotus/i, "#9a86c9"],
    [/зелен|green|olive|sage|mint|jade|pistachio|lemongrass|sprout|teal|trail|mountain/i, "#7fa37a"],
    [/син|blue|navy|indigo|denim|glacier|sky|ultramarine|icy|aqua|ice/i, "#4f74b8"],
    [/жълт|yellow/i, "#f2d04b"],
  ];
  const colorHex = (n) => (COLORS.find(([re]) => re.test(n)) || [0, "linear-gradient(135deg,#e8e8e8,#9a9a9a)"])[1];

  /* ---------- състояние ---------- */
  const state = {
    cart: store.get("cart", []),
    favs: store.get("favs", []),
    compare: store.get("compare", []),
    recent: store.get("recent", []),
  };
  const saveState = (k) => store.set(k, state[k]);

  /* ---------- икони ---------- */
  const IC = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    heart: '<path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 7 4.5c2 0 3.5 1 5 2.8 1.5-1.8 3-2.8 5-2.8 3.6 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21z"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    store: '<path d="M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9zM5 13v8h14v-8M10 21v-5h4v5"/>',
    truck: '<path d="M1 4h14v12H1zM15 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    filter: '<path d="M3 5h18M6 12h12M10 19h4"/>',
    zoom: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    screen: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="m9 8 3 3 3-5"/>',
    battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4"/>',
    back: '<rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="10" cy="6.5" r="1.5"/>',
    camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
    buttons: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M4 7v4M20 7v2"/>',
    software: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L2 10l8-8z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    bag: '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  };
  const icon = (n, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

  /* ---------- общи UI елементи ---------- */
  const imgTag = (h, alt, cls = "", big) =>
    `<img class="${cls}" src="${esc(big ? full(h) : thumb(h))}" data-full="${esc(full(h))}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="if(this.src.indexOf(this.dataset.full)<0)this.src=this.dataset.full">`;
  const isFav = (slug) => state.favs.includes(slug);
  const inCmp = (slug) => state.compare.includes(slug);
  const canCompare = (p) => p.cat === "phones" || p.cat === "tablets";
  const priceHtml = (p) =>
    p.min == null
      ? `<span class="price price--ask">Цена при запитване</span>`
      : `<span class="price">${p.kind === "g" && p.variants.length > 1 ? "<small>от</small> " : ""}${eur(p.min)}</span>${
          p.disc ? `<span class="old">${eur(oldOf(p))}</span>` : ""}`;
  function oldOf(p) {
    const v = p.variants.find((x) => x.price === p.min) || p.def;
    return v.disc ? v.base : Math.round((p.min / (1 - p.disc / 100)) * 100) / 100;
  }

  function badgesHtml(p, cls) {
    const b = [
      p.tags.sale && `<span class="badge badge--sale">-${p.disc}%</span>`,
      p.tags.new && `<span class="badge badge--new">Ново</span>`,
      p.tags.hot && `<span class="badge badge--hot">Хит</span>`,
    ].filter(Boolean);
    return b.length ? `<div class="${cls}">${b.join("")}</div>` : "";
  }

  function card(p) {
    let opts = "";
    if (p.kind === "g") {
      const st = p.opts.storage || [];
      const cols = p.opts.color || [];
      opts = `<div class="card__opts">
        ${cols.length ? `<span class="dots" title="${esc(cols.join(", "))}">${cols.slice(0, 5).map((c) => `<i style="background:${colorHex(c)}"></i>`).join("")}${cols.length > 5 ? `<em>+${cols.length - 5}</em>` : ""}</span>` : ""}
        ${st.length ? `<span class="card__mem">${esc(st[0])}${st.length > 1 ? ` – ${esc(st[st.length - 1])}` : ""}</span>` : ""}
      </div>${p.cat === "accessories" ? `<div class="card__sub">${esc(p.sub || "")}${accModelsTxt(p)}</div>` : ""}`;
    } else {
      opts = `<div class="card__sub">${esc(p.sub || CAT_NAMES[p.cat] || "")}${p.compat && p.compat.length ? ` · ${esc(MODEL_NAMES[p.compat[0]] || "")}${p.compat.length > 1 ? ` +${p.compat.length - 1}` : ""}` : ""}</div>`;
    }
    const mv = cardModel && p.variants.find((v) => v.vmk === cardModel);
    const href = `#/p/${p.slug}${mv && mv !== p.def ? `?v=${mv.id}` : ""}`;
    const action =
      p.kind === "g" && p.variants.length > 1
        ? `<a class="card__go" href="${href}" aria-label="Избери вариант на ${esc(p.name)}">${icon("arrow")}</a>`
        : p.min == null
          ? `<a class="card__go" href="#/inquiries?topic=${encodeURIComponent(p.name)}" aria-label="Запитване за ${esc(p.name)}">${icon("mail")}</a>`
          : `<button class="card__go card__go--add" data-add="${p.def.id}" aria-label="Добави ${esc(p.name)} в количката">${icon("plus")}</button>`;
    return `<article class="card">
      <a class="card__media" href="${href}" tabindex="-1" aria-hidden="true">${imgTag(p.img, p.name)}</a>
      ${badgesHtml(p, "badges")}
      <div class="card__tools">
        <button class="card__tool ${isFav(p.slug) ? "on" : ""}" data-fav="${p.slug}" aria-label="Любими" aria-pressed="${isFav(p.slug)}">${icon("heart")}</button>
        ${canCompare(p) ? `<button class="card__tool ${inCmp(p.slug) ? "on" : ""}" data-cmp="${p.slug}" aria-label="Сравни" title="Сравни">${icon("swap")}</button>` : ""}
        <button class="card__tool card__tool--qv" data-qv="${p.slug}" aria-label="Бърз преглед на ${esc(p.name)}" title="Бърз преглед">${icon("eye")}</button>
      </div>
      <div class="card__body">
        <span class="card__brand">${esc(p.brand || p.sub || "")}</span>
        <a class="card__title" href="${href}">${esc(p.name.replace(new RegExp("^" + p.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i"), ""))}</a>
        ${opts}
        <div class="card__foot"><div class="card__price">${priceHtml(p)}</div>${action}</div>
      </div>
    </article>`;
  }

  function accModelsTxt(p) {
    const ms = p.opts.model || [];
    if (ms.length > 1) return ` · ${cardModel && MODEL_NAMES[cardModel] ? esc(MODEL_NAMES[cardModel].replace(/^\S+\s/, "")) + " и още " + (ms.length - 1) : ms.length + " модела"}`;
    const k = (p.compat || [])[0];
    return k && MODEL_NAMES[k] && !norm(p.name).includes(norm(MODEL_NAMES[k].replace(/^\S+\s/, ""))) ? ` · ${esc(MODEL_NAMES[k])}` : "";
  }

  const crumbs = (items) =>
    `<nav class="crumbs" aria-label="Навигация"><a href="#/">Начало</a>${items.map(([t, h]) => ` <span>/</span> ${h ? `<a href="${h}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`}`).join("")}</nav>`;

  const view = $("#view");
  function setTitle(t) { document.title = t ? `${t} | GDMobil` : "GDMobil — Телефони, аксесоари и сервиз в Гоце Делчев"; }

  /* ================= НАЧАЛО ================= */
  function pageHome(scrollTo) {
    setTitle("");
    const hero = BY_SLUG.get(S.heroSlug);
    const second = BY_SLUG.get(S.featured[1]);
    const counts = Object.fromEntries(window.CATEGORIES.map((c) => [c.key, PRODUCTS.filter((p) => p.cat === c.key).length]));
    const brandCounts = {};
    PRODUCTS.filter((p) => p.cat === "phones").forEach((p) => (brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1));
    const brands = Object.entries(brandCounts).filter(([b]) => C.logos[b]).sort((a, b) => a[0].localeCompare(b[0]));
    const recent = state.recent.map((s) => BY_SLUG.get(s)).filter(Boolean);
    const hasSale = PRODUCTS.some((p) => p.tags.sale && p.cat === "phones");
    const topTabs = ["Всички", "Нови", ...(hasSale ? ["Намалени"] : []), "Apple", "Samsung", "Xiaomi", "Honor"];
    const accModels = [...new Set(FEATURED.map((p) => p.mk).filter((k) => k && PRODUCTS.some((x) => x.cat === "accessories" && (x.compat || []).includes(k))))].slice(0, 2);
    const accTabs = [["Препоръчани", "all"], ["Намаления", "sale"], ...accModels.map((k) => ["За " + (MODEL_NAMES[k] || k).replace(/^\S+\s/, ""), "model", k])];

    view.innerHTML = `
    <section class="container bento">
      ${hero ? `<a class="tile tile--hero" href="#/p/${hero.slug}">
        <div class="tile__glow"></div>
        <div class="tile__copy">
          <span class="eyebrow eyebrow--dark">Магазин и сервиз · Гоце Делчев</span>
          <h1 class="display">Новият ти телефон <em>е тук.</em></h1>
          <p>${esc(hero.name)} – избери памет и цвят. Вземи го от магазина без такса или с доставка до теб.</p>
          <div class="tile__row">
            <span class="btn btn--ember">Виж модела ${icon("arrow")}</span>
            <span class="tile__price"><small>от</small> ${eur(hero.min)}</span>
          </div>
        </div>
        ${S.heroImage ? `<img src="${esc(S.heroImage)}" alt="${esc(hero.name)}" class="tile__phone" width="630" height="640" fetchpriority="high">`
          : `<span class="tile__phone tile__phone--plinth"><img src="${esc(full(hero.img))}" alt="${esc(hero.name)}" fetchpriority="high"></span>`}
      </a>` : ""}
      ${second ? `<a class="tile tile--light tile--wide" href="#/p/${second.slug}">
        <div class="tile__copy">
          <span class="eyebrow">Ново · ${esc(second.brand)}</span>
          <h2>${esc(second.name.replace(second.brand + " ", ""))}</h2>
          <p class="muted">${plural((second.opts.color || []).length, "цвят", "цвята")} · ${esc((second.opts.storage || []).join(" / "))}</p>
          <span class="tile__price"><small>от</small> ${eur(second.min)}</span>
        </div>
        <span class="plinth"><img src="${esc(full(second.img))}" alt="${esc(second.name)}"></span>
      </a>` : ""}
      <a class="tile tile--ember" href="#/service">
        <span class="eyebrow eyebrow--dark">Сервиз</span>
        <h3>Счупен екран?<br>Слаба батерия?</h3>
        <p>Ремонт от <b>15 €</b> с оферта преди ремонта</p>
        <span class="tile__cta">Запитване за ремонт ${icon("arrow")}</span>
      </a>
      <a class="tile tile--ink" href="#/c/accessories">
        <span class="eyebrow eyebrow--dark">Аксесоари</span>
        <h3>${counts.accessories.toLocaleString("bg-BG")} аксесоара</h3>
        <p>Калъфи, протектори, зарядни, слушалки</p>
        <img src="assets/img/airpods.png" alt="" class="tile__acc" loading="lazy">
      </a>
    </section>

    <section class="container">
      <div class="ticker">
        <span>${icon("store")}<b>Вземане без такса</b></span>
        <span>${icon("truck")}<b>Еконт и Спиди</b></span>
        <span>${icon("shield")}<b>14 дни за отказ</b></span>
        <span>${icon("wrench")}<b>Сервиз на място</b></span>
      </div>
    </section>

    <section class="container section">
      <div class="section__head"><div><span class="eyebrow">Категории</span><h2>Какво търсиш?</h2></div><a href="#/c/all" class="link">Целият каталог ${icon("arrow")}</a></div>
      <div class="cats">
        ${window.CATEGORIES.map((c) => `<a class="cat" href="#/c/${c.key}">
          <span class="cat__img"><img src="${esc(c.img)}" alt="" loading="lazy"></span>
          <b>${esc(c.name)}</b><small>${plural(counts[c.key], "продукт", "продукта")}</small></a>`).join("")}
        <a class="cat cat--svc" href="#/service"><span class="cat__img"><img src="assets/img/service-hero.svg" alt="" loading="lazy"></span>
          <b>Сервиз</b><small>Ремонт с ясна цена</small></a>
      </div>
    </section>

    <section class="section section--brands">
      <div class="container section__head"><div><span class="eyebrow">Марки</span><h2>Пазарувай по марка</h2></div><a href="#/c/phones" class="link">Всички телефони ${icon("arrow")}</a></div>
      ${logoMarquee(brands.map(([b, n]) => ({ name: b, logo: C.logos[b], href: `#/c/phones?brand=${encodeURIComponent(b)}`, sub: plural(n, "модел", "модела") })))}
    </section>

    <section class="container section">
      <div class="section__head"><div><span class="eyebrow">Топ модели</span><h2>Подбрани смартфони</h2></div>
        <div class="seg seg--tabs" role="tablist" id="topTabs">${topTabs.map((t, i) => `<button role="tab" aria-selected="${i === 0}" data-top="${t}">${t}</button>`).join("")}</div>
      </div>
      <div class="grid grid--4" id="topGrid"></div>
      <div class="more"><a class="btn btn--ghost" id="topMore" href="#/c/phones">Всички телефони ${icon("arrow")}</a></div>
    </section>

    <section class="container section">
      <div class="section__head"><div><span class="eyebrow">Аксесоари</span><h2>Хитове в аксесоарите</h2></div>
        <div class="seg seg--tabs" role="tablist" id="accTabs">${accTabs.map(([t], i) => `<button role="tab" aria-selected="${i === 0}" data-acc="${i}">${esc(t)}</button>`).join("")}</div>
      </div>
      <div class="grid grid--4" id="accGrid"></div>
      <div class="more"><a class="btn btn--ghost" id="accMore" href="#/c/accessories">Всички аксесоари ${icon("arrow")}</a></div>
    </section>

    <section class="container section">
      <div class="finder">
        <div class="finder__copy">
          <span class="eyebrow">Съвместимост</span>
          <h2>Аксесоари за твоя модел</h2>
          <p class="muted">Избери модел и разгледай калъфи, протектори и други предложения, в чието описание е посочен твоят телефон.</p>
        </div>
        <form class="finder__form" id="finderForm">
          <label class="lbl" for="finderModel">Твоят модел</label>
          ${modelSelect("finderModel", "")}
          <button class="btn btn--primary btn--block" type="submit">Покажи аксесоарите ${icon("arrow")}</button>
          <small class="muted">Провери точния модел и съвместимостта преди покупка.</small>
        </form>
      </div>
    </section>

    ${recent.length ? `<section class="container section">
      <div class="section__head"><div><span class="eyebrow">За теб</span><h2>Последно разгледани</h2></div></div>
      <div class="rail">${recent.slice(0, 8).map(card).join("")}</div></section>` : ""}

    <section class="band">
      <div class="container band__inner">
        <div class="band__copy">
          <span class="eyebrow eyebrow--dark">Сервиз GDMobil</span>
          <h2>Ремонт с ясна цена – още преди да започнем.</h2>
          <p>Изпрати модел и описание на проблема. Получаваш ориентировъчна цена и срок, а крайната оферта потвърждаваш след преглед.</p>
          <div class="tile__row"><a class="btn btn--ember" href="#/service#form">Запитване за ремонт ${icon("arrow")}</a><a class="btn btn--glass" href="#/service#prices">Всички цени</a></div>
        </div>
        <ul class="band__prices">${window.REPAIRS.slice(0, 6).map((r) => `<li><span class="band__ic">${icon(r.icon)}</span><span>${esc(r.title)}</span><b>${esc(r.price)}</b></li>`).join("")}</ul>
      </div>
    </section>



    ${contactBlock()}`;

    const drawTop = (brand) => {
      const byTag = { Нови: "new", Намалени: "sale" }[brand];
      const list = brand === "Всички" ? FEATURED
        : PRODUCTS.filter((p) => p.cat === "phones" && p.min != null && (byTag ? p.tags[byTag] : p.brand === brand)).sort((a, b) => (featuredRank.get(a) ?? 99) - (featuredRank.get(b) ?? 99) || b.min - a.min).slice(0, 8);
      $("#topGrid").innerHTML = list.map(card).join("");
      $("#topMore").href = brand === "Всички" ? "#/c/phones" : byTag ? `#/c/phones?tag=${byTag}` : `#/c/phones?brand=${encodeURIComponent(brand)}`;
      $("#topMore").innerHTML = `${brand === "Всички" ? "Всички телефони" : byTag ? (byTag === "new" ? "Всички нови модели" : "Всички намалени") : "Всички " + esc(brand)} ${icon("arrow")}`;
      $$("#topTabs [data-top]").forEach((b) => b.setAttribute("aria-selected", b.dataset.top === brand));
    };
    $("#topTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-top]"); if (b) drawTop(b.dataset.top); });
    drawTop("Всички");

    const drawAcc = (i) => {
      const [, kind, val] = accTabs[i];
      const all = PRODUCTS.filter((p) => p.cat === "accessories" && p.min != null);
      const list = (kind === "sale" ? all.filter((p) => p.disc >= 10) : kind === "model" ? all.filter((p) => (p.compat || []).includes(val)) : all)
        .sort((a, b) => accRank(a) - accRank(b));
      cardModel = kind === "model" ? val : "";
      $("#accGrid").innerHTML = (kind === "all" ? mixSubs(list) : diversify(list.slice(0, 60)).slice(0, 8)).map((x) => card(x)).join("");
      cardModel = "";
      $("#accMore").href = kind === "sale" ? "#/c/accessories?tag=sale&sort=sale" : kind === "model" ? `#/c/accessories?model=${encodeURIComponent(val)}` : "#/c/accessories";
      $$("#accTabs [data-acc]").forEach((b) => b.setAttribute("aria-selected", b.dataset.acc === String(i)));
    };
    $("#accTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-acc]"); if (b) drawAcc(+b.dataset.acc); });
    drawAcc(0);

    $("#finderForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#finderModel").value;
      if (!v) return toast("Избери модел");
      go(`#/c/accessories?model=${encodeURIComponent(v)}`);
    });
    if (scrollTo) requestAnimationFrame(() => $("#" + scrollTo)?.scrollIntoView({ behavior: "smooth" }));
  }

  function modelSelect(id, sel, attrs = "") {
    const byBrand = {};
    C.models.forEach((m) => (byBrand[m.brand] = byBrand[m.brand] || []).push(m));
    return `<select class="select" id="${id}" name="model" ${attrs}><option value="">Избери устройство</option>
      ${Object.entries(byBrand).map(([b, ms]) => `<optgroup label="${esc(b)}">${ms.map((m) => `<option value="${m.key}" ${m.key === sel ? "selected" : ""}>${esc(m.brand)} ${esc(m.name)} (${m.count})</option>`).join("")}</optgroup>`).join("")}
    </select>`;
  }

  function contactBlock() {
    return `<section class="container section" id="contact">
      <div class="contact">
        <div class="contact__info">
          <span class="eyebrow">Магазин в Гоце Делчев</span>
          <h2>Заповядай при нас</h2>
          <p class="muted">${esc(S.tagline)} Вземане на поръчки без такса, консултация и сервиз на място.</p>
          <ul class="contact__list">
            <li><span class="ic-box">${icon("phone")}</span><div><small>Телефон</small><a href="tel:${tel}"><b>${esc(S.phone)}</b></a></div></li>
            <li><span class="ic-box">${icon("mail")}</span><div><small>Имейл</small><a href="mailto:${esc(S.email)}"><b>${esc(S.email)}</b></a></div></li>
            <li><span class="ic-box">${icon("pin")}</span><div><small>Адрес</small><a href="${esc(S.maps)}" target="_blank" rel="noopener"><b>${esc(S.address)}</b></a></div></li>
          </ul>
        </div>
        <div class="contact__hours">
          <h3>${icon("clock")} Работно време</h3>
          <dl class="hours">${hoursHtml()}</dl>
          <a class="btn btn--primary btn--block" href="${esc(S.maps)}" target="_blank" rel="noopener">${icon("pin")} Упътване в Google Maps</a>
          <a class="btn btn--ghost btn--block" href="#/inquiries">Изпрати запитване</a>
          <button class="btn btn--ghost btn--block" data-open-chat>Попитай асистента</button>
        </div>
        <div class="map" id="map">
          <div class="map__ph">${icon("pin")}<b>${esc(S.address)}</b><span class="muted">Картата се зарежда от Google Maps само при поискване.</span>
            <button class="btn btn--primary btn--sm" data-loadmap>Покажи картата</button></div>
        </div>
      </div>
    </section>`;
  }
  const hoursHtml = () => S.hours.map(([d, h]) => `<div><dt>${esc(d)}</dt><dd>${esc(h)}</dd></div>`).join("");

  /* ================= КАТАЛОГ ================= */
  const PAGE = 24;
  const moreObs = "IntersectionObserver" in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && cat) { moreObs.disconnect(); cat.shown += PAGE; refreshCatalog(); } }), { rootMargin: "400px" })
    : { observe() {}, disconnect() {} };
  let cat = null;

  function pageCatalog(key, q) {
    const catKey = CAT_NAMES[key] ? key : "all";
    cat = {
      key: catKey,
      brands: new Set((q.get("brand") || "").split(",").filter(Boolean)),
      sub: q.get("sub") || "",
      model: q.get("model") || "",
      mem: new Set((q.get("mem") || "").split(",").filter(Boolean)),
      q: q.get("q") || "",
      sort: q.get("sort") || "rec",
      tags: new Set((q.get("tag") || "").split(",").filter(Boolean)),
      max: +q.get("max") || 0,
      shown: PAGE,
    };
    const title = cat.q ? `Резултати за „${cat.q}“` : catKey === "all" ? "Целият каталог" : CAT_NAMES[catKey];
    setTitle(title);
    $("#searchInput").value = cat.q;

    view.innerHTML = `<section class="container page">
      ${crumbs(catKey === "all" ? [["Каталог"]] : [["Каталог", "#/c/all"], [CAT_NAMES[catKey]]])}
      <div class="cat-head"><h1>${esc(title)}</h1><p class="muted" id="resCount"></p></div>
      <div class="tabs">
        ${[["all", "Всички"], ...window.CATEGORIES.map((c) => [c.key, c.name])].map(([k, n]) => `<a class="chip ${k === catKey ? "active" : ""}" ${k === catKey ? 'aria-current="page"' : ""} href="#/c/${k}${cat.q ? "?q=" + encodeURIComponent(cat.q) : ""}">${esc(n)}</a>`).join("")}
      </div>
      <div class="cat-layout">
        <aside class="filters" id="filtersAside" aria-label="Филтри"></aside>
        <div class="cat-main">
          <div class="cat-toolbar">
            <button class="btn btn--ghost btn--sm filters-btn" id="openFilters">${icon("filter")} Филтри <span id="fCount"></span></button>
            <label class="search search--inline">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
              <input type="search" id="catSearch" placeholder="Търси в ${esc(catKey === "all" ? "каталога" : CAT_NAMES[catKey].toLowerCase())}" value="${esc(cat.q)}" aria-label="Търси в категорията">
            </label>
            <select class="select" id="sortSel" aria-label="Подреждане">
              <option value="rec">Препоръчани</option><option value="asc">Цена: ниска → висока</option>
              <option value="desc">Цена: висока → ниска</option><option value="new">Първо новите</option>
              <option value="sale">Най-голямо намаление</option><option value="name">Име: А → Я</option>
            </select>
          </div>
          <div class="active-f" id="activeF"></div>
          <div class="grid" id="grid"></div>
          <div class="more" id="more"></div>
        </div>
      </div>
    </section>`;
    $("#sortSel").value = cat.sort;
    $("#sortSel").addEventListener("change", (e) => { cat.sort = e.target.value; refreshCatalog(); });
    let t;
    $("#catSearch").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { cat.q = e.target.value; cat.shown = PAGE; refreshCatalog(); }, 180); });
    $("#openFilters").addEventListener("click", () => openDrawer("filterDrawer"));
    refreshCatalog(true);
  }

  function baseList() {
    const toks = tokens(cat.q);
    return PRODUCTS.filter((p) => (cat.key === "all" || p.cat === cat.key) && (!toks.length || matches(p, toks)));
  }
  function filteredList(base) {
    const list = base.filter((p) =>
      (!cat.brands.size || cat.brands.has(p.brand)) &&
      (!cat.sub || p.sub === cat.sub) &&
      (!cat.model || (p.compat || []).includes(cat.model) || p.mk === cat.model) &&
      (!cat.mem.size || (p.opts.storage || []).some((s) => cat.mem.has(s))) &&
      (!cat.max || (p.min != null && p.min <= cat.max)) &&
      (!cat.tags.size || [...cat.tags].every((t) => p.tags[t])));
    const pr = (p) => (p.min == null ? Infinity : p.min);
    if (cat.sort === "asc") list.sort((a, b) => pr(a) - pr(b));
    else if (cat.sort === "desc") list.sort((a, b) => (b.min ?? -1) - (a.min ?? -1));
    else if (cat.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "bg"));
    else if (cat.sort === "new") list.sort((a, b) => b.tags.new - a.tags.new || (b.min ?? -1) - (a.min ?? -1));
    else if (cat.sort === "sale") list.sort((a, b) => b.disc - a.disc || (a.min ?? 1e9) - (b.min ?? 1e9));
    else {
      const catRank = { phones: 0, tablets: 1, accessories: 2, cameras: 3 };
      list.sort((a, b) =>
        (featuredRank.get(a) ?? 99) - (featuredRank.get(b) ?? 99) ||
        catRank[a.cat] - catRank[b.cat] ||
        (a.cat === "accessories" ? accRank(a) - accRank(b) || a.name.localeCompare(b.name, "bg") : (b.min ?? -1) - (a.min ?? -1)));
      if (cat.key === "accessories") return diversify(list);
    }
    return list;
  }

  // аксесоари: първо за подбраните модели, после калъфи/протектори, после нови модели, накрая универсални
  const FEAT_MK = new Set(FEATURED.map((p) => p.mk).filter(Boolean));
  const SUB_RANK = { "Калъфи": 0, "Протектори": 1, "Зарядни": 2, "Слушалки": 3, "Кабели": 4, "Power Bank": 5, "Стойки": 6 };
  const NEW_MODEL_RE = /iphone (1[78]|air|duo)|galaxy (s2[56]|z (fold|flip) ?7|a[3-5][67])|redmi note 15|pixel 1[01]|xiaomi 1[56]/i;
  const accCache = new Map();
  function accRank(p) {
    if (accCache.has(p)) return accCache.get(p);
    const ks = p.compat || [];
    const model = ks.some((k) => FEAT_MK.has(k)) ? 0 : ks.some((k) => NEW_MODEL_RE.test(MODEL_NAMES[k] || "")) ? 1 : ks.length ? 3 : 4;
    // по-малко = по-напред: модел → вид → известна марка → повече варианти/модели → намаление
    const r = model * 1000 + (SUB_RANK[p.sub] ?? 9) * 60 + (p.brand ? 0 : 30) - Math.min(p.variants.length, 20) - (p.disc > 0 ? 8 : 0);
    accCache.set(p, r);
    return r;
  }
  // „Препоръчани“ на началната страница: калъфи, протектори, зарядни, слушалки… вместо само калъфи
  function mixSubs(list) {
    const order = ["Калъфи", "Протектори", "Зарядни", "Калъфи", "Слушалки", "Power Bank", "Калъфи", "Кабели"];
    const used = new Set(), out = [], brands = new Set();
    for (const sub of order) {
      const x = list.find((p) => p.sub === sub && !used.has(p) && !brands.has(p.brand + sub)) || list.find((p) => p.sub === sub && !used.has(p));
      if (x) { used.add(x); brands.add(x.brand + sub); out.push(x); }
    }
    return out.concat(list.filter((p) => !used.has(p))).slice(0, 8);
  }
  // разбърква подредбата, за да не стоят една до друга карти от една марка и вид
  function diversify(list) {
    const out = [], pool = list.slice(), last = [];
    while (pool.length) {
      let i = pool.findIndex((x, j) => j < 14 && !last.includes((x.brand || "") + "|" + x.sub));
      if (i < 0) i = 0;
      const [x] = pool.splice(i, 1);
      out.push(x);
      last.push((x.brand || "") + "|" + x.sub);
      if (last.length > 2) last.shift();
      if (out.length > 300) return out.concat(pool); // по-надолу няма нужда
    }
    return out;
  }

  function facet(base, fn) {
    const m = new Map();
    base.forEach((p) => [].concat(fn(p) || []).forEach((v) => v && m.set(v, (m.get(v) || 0) + 1)));
    return [...m.entries()];
  }

  function filtersHtml(base) {
    const brands = facet(base, (p) => p.brand).sort((a, b) => a[0].localeCompare(b[0], "bg"));
    const subs = facet(base, (p) => p.sub).sort((a, b) => b[1] - a[1]);
    const memOrder = (s) => parseFloat(s) * (s.includes("TB") ? 1024 : s.includes("MB") ? 1 / 1024 : 1);
    const mems = facet(base, (p) => p.opts.storage).filter(([v]) => !/MB/i.test(v)).sort((a, b) => memOrder(a[0]) - memOrder(b[0]));
    const prices = base.map((p) => p.min).filter((x) => x != null);
    const maxP = prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 0;
    const check = (name, val, n, on) =>
      `<label class="check"><input type="checkbox" data-f="${name}" value="${esc(val)}" ${on ? "checked" : ""}><span>${esc(val)}</span><em>${n}</em></label>`;
    const clip = brands.length > 10;
    const TAGS = [["new", "Ново"], ["sale", "Намаление"], ["hot", "Хит"]].map(([k, n]) => [k, n, base.filter((p) => p.tags[k]).length]).filter((t) => t[2]);
    return `
      ${TAGS.length ? `<div class="fgroup"><h4>Етикети</h4><div class="tagf">${TAGS.map(([k, n, c]) => `<label class="tagf__chip tagf__chip--${k}"><input type="checkbox" data-f="tag" value="${k}" ${cat.tags.has(k) ? "checked" : ""}><span>${n} <em>${c}</em></span></label>`).join("")}</div></div>` : ""}
      ${subs.length > 1 ? `<div class="fgroup"><h4>Вид аксесоар</h4>
        <label class="check"><input type="radio" name="fsub" data-f="sub" value="" ${!cat.sub ? "checked" : ""}><span>Всички</span></label>
        ${subs.map(([v, n]) => `<label class="check"><input type="radio" name="fsub" data-f="sub" value="${esc(v)}" ${cat.sub === v ? "checked" : ""}><span>${esc(v)}</span><em>${n}</em></label>`).join("")}</div>` : ""}
      ${cat.key === "accessories" || cat.model ? `<div class="fgroup"><h4>За модел</h4>${modelSelect("", cat.model, 'data-f="model" aria-label="За модел"')}</div>` : ""}
      ${brands.length > 1 ? `<div class="fgroup ${clip ? "fgroup--clip" : ""}"><h4>Марка</h4>
        ${brands.map(([v, n]) => check("brand", v, n, cat.brands.has(v))).join("")}
        ${clip ? `<button class="link-btn" data-expand>Покажи всички (${brands.length})</button>` : ""}</div>` : ""}
      ${mems.length > 1 ? `<div class="fgroup"><h4>Вградена памет</h4><div class="mem-grid">${mems.map(([v, n]) => check("mem", v, n, cat.mem.has(v))).join("")}</div></div>` : ""}
      ${maxP ? `<div class="fgroup"><h4>Максимална цена</h4>
        <input type="range" data-f="max" min="0" max="${maxP}" step="${maxP > 500 ? 10 : 1}" value="${cat.max || maxP}" aria-label="Максимална цена">
        <div class="range-l"><span>0 €</span><b data-maxl>${eur(cat.max || maxP)}</b></div></div>` : ""}
      <button class="btn btn--ghost btn--block btn--sm" data-reset>Изчисти филтрите</button>`;
  }

  function refreshCatalog(first) {
    if (!cat || !$("#grid")) return;
    const base = baseList();
    const list = filteredList(base);
    const fh = filtersHtml(base);
    $("#filtersAside").innerHTML = fh;
    $("#filterBody").innerHTML = fh.replaceAll('name="fsub"', 'name="fsub2"');
    $("#resCount").textContent = plural(list.length, "продукт", "продукта");
    cardModel = cat.model || "";
    $("#grid").innerHTML = list.slice(0, cat.shown).map((x) => card(x)).join("") ||
      `<div class="empty"><p>😕 Няма продукти по тези критерии.</p><button class="btn btn--ghost" data-reset>Изчисти филтрите</button>
       <p class="muted">Не намираш търсеното? <a class="link" href="#/inquiries${cat.q ? "?topic=" + encodeURIComponent(cat.q) : ""}">Изпрати запитване</a></p></div>`;
    cardModel = "";
    const left = list.length - cat.shown;
    $("#more").innerHTML = left > 0 ? `<button class="btn btn--ghost" id="moreBtn">Покажи още ${Math.min(left, PAGE)} <small class="muted">(остават ${left})</small></button>` : "";
    $("#moreBtn")?.addEventListener("click", () => { cat.shown += PAGE; refreshCatalog(); });
    moreObs.disconnect();
    if ($("#moreBtn") && cat.shown < PAGE * 6) moreObs.observe($("#moreBtn"));
    const nf = cat.tags.size + cat.brands.size + cat.mem.size + (cat.sub ? 1 : 0) + (cat.model ? 1 : 0) + (cat.max ? 1 : 0);
    $("#fCount").textContent = nf ? `(${nf})` : "";
    $("#filterApply").textContent = `Покажи ${plural(list.length, "резултат", "резултата")}`;
    const chips = [
      ...[...cat.tags].map((t) => ["tag", t, { new: "Ново", sale: "Намаление", hot: "Хит" }[t]]),
      ...[...cat.brands].map((b) => ["brand", b, b]),
      ...[...cat.mem].map((m) => ["mem", m, m]),
      cat.sub && ["sub", cat.sub, cat.sub],
      cat.model && ["model", cat.model, "За " + (MODEL_NAMES[cat.model] || cat.model)],
      cat.max && ["max", "", "до " + eur(cat.max)],
    ].filter(Boolean);
    $("#activeF").innerHTML = chips.map(([k, v, t]) => `<button class="chip chip--x" data-unf="${k}" data-v="${esc(v)}">${esc(t)} ${icon("close")}</button>`).join("");
    const qs = new URLSearchParams();
    if (cat.q) qs.set("q", cat.q);
    if (cat.tags.size) qs.set("tag", [...cat.tags].join(","));
    if (cat.brands.size) qs.set("brand", [...cat.brands].join(","));
    if (cat.sub) qs.set("sub", cat.sub);
    if (cat.model) qs.set("model", cat.model);
    if (cat.mem.size) qs.set("mem", [...cat.mem].join(","));
    if (cat.max) qs.set("max", cat.max);
    if (cat.sort !== "rec") qs.set("sort", cat.sort);
    const h = `#/c/${cat.key}${qs.toString() ? "?" + qs : ""}`;
    if (!first && location.hash !== h) { history.replaceState(null, "", h); lastPath = routeKey(); }
  }

  function onFilterChange(e) {
    const t = e.target;
    const f = t.dataset.f;
    if (!f || !cat) return;
    if (f === "brand" || f === "mem" || f === "tag") {
      const set = f === "brand" ? cat.brands : f === "mem" ? cat.mem : cat.tags;
      t.checked ? set.add(t.value) : set.delete(t.value);
    } else if (f === "sub") cat.sub = t.value;
    else if (f === "model") cat.model = t.value;
    else if (f === "max") {
      if (e.type === "input") { $$("[data-maxl]").forEach((l) => (l.textContent = eur(+t.value))); return; }
      cat.max = +t.value >= +t.max ? 0 : +t.value;
    }
    cat.shown = PAGE;
    refreshCatalog();
  }

  /* ================= ПРОДУКТ ================= */
  const galleryOf = (p, v) => [v.img, ...(v.gal || [])].filter(Boolean);
  let specsPromise;
  function loadSpecs() {
    return (specsPromise ||= new Promise((res) => {
      if (window.SPECS) return res(window.SPECS);
      const s = document.createElement("script");
      s.src = "assets/specs.js";
      s.onload = () => res(window.SPECS || {});
      s.onerror = () => res({});
      document.head.appendChild(s);
    }));
  }

  function pickVariant(p, cur, k, val) {
    const prio = OPT_KEYS.filter((o) => o !== k);
    const score = (v) => prio.reduce((s, o, i) => s + (v[o] === cur[o] ? 8 >> i : 0), 0);
    return p.variants.filter((v) => v[k] === val).sort((a, b) => score(b) - score(a) || (a.price ?? 1e9) - (b.price ?? 1e9))[0] || cur;
  }

  function configHtml(p, cur, compact) {
    if (p.kind !== "g") return "";
    const keys = Object.keys(p.opts).filter((k) => p.opts[k].length > 1 || k === "color");
    return `${compact ? "" : `<div class="config__head"><b>Конфигурация</b><small class="muted">${plural(p.variants.length, "вариант", "варианта")}</small></div>`}
      ${keys.map((k) => k === "model" && p.opts.model.length > 6 ? `<div class="config__row">
        <div class="config__label"><span>${OPT_LABEL[k]} <small class="muted">(${p.opts.model.length})</small></span><b>${esc(cur.model || "—")}</b></div>
        <select class="select" data-optsel="model" aria-label="Избери модел">${p.opts.model.map((val) => `<option ${cur.model === val ? "selected" : ""}>${esc(val)}</option>`).join("")}</select></div>` : `<div class="config__row">
        <div class="config__label"><span>${OPT_LABEL[k]}</span><b>${esc(cur[k] || "—")}</b></div>
        <div class="opts ${k === "color" ? "opts--color" : ""}">${p.opts[k].map((val) => {
          const target = pickVariant(p, cur, k, val);
          const exact = target[k] === val && OPT_KEYS.every((o) => o === k || target[o] === cur[o]);
          const showPrice = k !== "color" && target.price != null;
          return `<button class="opt ${cur[k] === val ? "active" : ""} ${exact ? "" : "opt--alt"}" data-opt="${k}" data-val="${esc(val)}" aria-pressed="${cur[k] === val}" ${exact ? "" : 'title="Ще смени и други опции"'}>
            ${k === "color" ? `<i class="sw" style="background:${colorHex(val)}"></i>` : ""}<span>${esc(val)}</span>${showPrice ? `<small>${eur(target.price)}</small>` : ""}</button>`;
        }).join("")}</div></div>`).join("")}
`;
  }

  function buyHtml(p, cur) {
    return cur.price == null
      ? `<div class="pd__price"><span class="price price--ask">Цена при запитване</span></div>
         <a class="btn btn--primary btn--lg btn--block" href="#/inquiries?topic=${encodeURIComponent(p.name)}">Изпрати запитване</a>`
      : `<div class="pd__price"><span class="price">${eur(cur.price, true)}</span><small class="muted">с ДДС</small>
          ${cur.disc ? `<span class="old">${eur(cur.base, true)}</span>` : ""}</div>
         <p class="stock ${cur.stock ? "" : "stock--no"}"><i></i>${cur.stock ? "В наличност" : "По заявка"}</p>
         <button class="btn btn--primary btn--lg btn--block" data-add="${cur.id}">${icon("bag")} Добави в количката</button>`;
  }

  function pageProduct(slug, q) {
    const p = BY_SLUG.get(slug);
    if (!p) return pageNotFound();
    let cur = p.variants.find((v) => v.id === +q.get("v")) || p.def;
    let gi = 0;
    setTitle(p.name);
    state.recent = [slug, ...state.recent.filter((s) => s !== slug)].slice(0, 12);
    saveState("recent");
    setProductLd(p);

    const compatAcc = p.kind === "g" && p.mk ? PRODUCTS.filter((x) => (x.compat || []).includes(p.mk) && x.min != null) : [];
    const similar = PRODUCTS.filter((x) => x !== p && x.cat === p.cat && (p.cat === "accessories" ? x.sub === p.sub && (x.compat || []).some((k) => (p.compat || []).includes(k)) : x.brand === p.brand))
      .sort((a, b) => Math.abs((a.min ?? 0) - (p.min ?? 0)) - Math.abs((b.min ?? 0) - (p.min ?? 0))).slice(0, 8);
    const recent = state.recent.slice(1).map((s) => BY_SLUG.get(s)).filter(Boolean).slice(0, 8);
    const keySpecs = ["Дисплей", "Основна камера", "Батерия", "Процесор"].filter((k) => p.specs[k]);

    view.innerHTML = `<section class="container page">
      ${crumbs([[CAT_NAMES[p.cat], `#/c/${p.cat}`], [p.name]])}
      <div class="pd">
        <div class="pd__gallery">
          <div class="pd__main" id="pdMain">
            <button class="pd__stage" id="pdZoom" aria-label="Увеличи снимката"><img id="pdImg" alt="${esc(p.name)}"></button>
            <button class="pd__nav pd__nav--prev" data-gal="-1" aria-label="Предишна снимка">${icon("chevL")}</button>
            <button class="pd__nav pd__nav--next" data-gal="1" aria-label="Следваща снимка">${icon("chevR")}</button>
            <span class="pd__count" id="pdCount"></span>
            <span class="pd__zoom">${icon("zoom")} Увеличи</span>
          </div>
          <div class="pd__thumbs" id="pdThumbs"></div>
        </div>
        <div class="pd__info">
          <div class="pd__brand">${C.logos[p.brand] ? `<img src="${esc(C.logos[p.brand])}" alt="">` : ""}<span>${esc([p.brand, CAT_NAMES[p.cat], p.sub].filter(Boolean).join(" / "))}</span></div>
          ${badgesHtml(p, "pd__badges")}
          <h1>${esc(p.name)}</h1>
          <p class="muted pd__codes" id="pdCodes"></p>
          ${p.desc ? `<p class="muted">${esc(p.desc)}</p>` : ""}
          <div class="config" id="config"></div>
          <div class="pd__buy" id="pdBuy"></div>
          ${keySpecs.length ? `<div class="keyspecs">${keySpecs.map((k) => `<div><small>${esc(k)}</small><b>${esc(p.specs[k])}</b></div>`).join("")}</div>` : ""}
          <div class="pd__tools">
            <button class="btn btn--ghost btn--sm" data-fav="${p.slug}" id="pdFav">${icon("heart")} <span></span></button>
            ${canCompare(p) ? `<button class="btn btn--ghost btn--sm" data-cmp="${p.slug}" id="pdCmp">${icon("swap")} <span></span></button>` : ""}
            <button class="btn btn--ghost btn--sm" id="pdShare">${icon("share")} Сподели</button>
            ${p.min != null ? `<button class="btn btn--ghost btn--sm" id="pdWatch">${icon("bell")} ${store.get("watch", []).includes(p.slug) ? "Следиш цената" : "Кажи ми при намаление"}</button>` : ""}
          </div>
          <div class="pd__perks">
            <div>${icon("store")}<span><b>Вземи от магазина</b><small>Без такса · ${esc(S.address)}</small></span></div>
            <div>${icon("truck")}<span><b>Еконт или Спиди</b><small>До офис или адрес · наложен платеж</small></span></div>
            <div>${icon("shield")}<span><b>Гаранция и 14 дни за отказ</b><small><a href="#/legal/returns">Условия</a></small></span></div>
          </div>
        </div>
      </div>

      <div class="pd-section" id="specsSec"></div>

      ${p.compat && p.compat.length ? `<div class="pd-section"><h2>Съвместими модели</h2><div class="tags">${p.compat.map((k) => `<a class="chip" href="#/c/accessories?model=${k}">${esc(MODEL_NAMES[k] || k)}</a>`).join("")}</div>
        <p class="muted small">Провери точния модел и съвместимостта преди покупка.</p></div>` : ""}

      ${compatAcc.length ? `<div class="pd-section"><div class="section__head"><div><span class="eyebrow">Допълни</span><h2>Аксесоари за ${esc(p.name.replace(p.brand + " ", ""))}</h2></div>
        <a class="link" href="#/c/accessories?model=${p.mk}">Всички ${compatAcc.length} ${icon("arrow")}</a></div>
        <div class="rail">${((cardModel = p.mk), "")}${compatAcc.slice(0, 12).map((x) => card(x)).join("")}${((cardModel = ""), "")}</div></div>` : ""}

      ${similar.length ? `<div class="pd-section"><div class="section__head"><div><span class="eyebrow">${p.cat === "accessories" ? "За същия модел" : "Още от " + esc(p.brand)}</span><h2>Подобни продукти</h2></div></div><div class="rail">${similar.map(card).join("")}</div></div>` : ""}
      ${recent.length ? `<div class="pd-section"><div class="section__head"><div><span class="eyebrow">За теб</span><h2>Последно разгледани</h2></div></div><div class="rail">${recent.map(card).join("")}</div></div>` : ""}
    </section>
    <div class="sticky-buy" id="stickyBuy"></div>`;

    const drawGallery = () => {
      const g = galleryOf(p, cur);
      gi = Math.max(0, Math.min(gi, g.length - 1));
      const img = $("#pdImg");
      img.classList.remove("swap"); void img.offsetWidth; img.classList.add("swap");
      img.src = full(g[gi]);
      $("#pdCount").textContent = g.length > 1 ? `${gi + 1} / ${g.length}` : "";
      $("#pdMain").classList.toggle("multi", g.length > 1);
      if (g.length > 1) {
        $("#pdThumbs").innerHTML = g.map((h, i) => `<button class="${i === gi ? "on" : ""}" data-gi="${i}" aria-label="Снимка ${i + 1}">${imgTag(h, "")}</button>`).join("");
      } else {
        const byColor = [];
        p.variants.forEach((v) => { if (v.img && !byColor.some((x) => x.img === v.img)) byColor.push(v); });
        $("#pdThumbs").innerHTML = byColor.length > 1
          ? byColor.map((v) => `<button class="${v.img === cur.img ? "on" : ""}" data-timg="${v.id}" aria-label="${esc(v.color || "Снимка")}">${imgTag(v.img, v.color || p.name)}</button>`).join("")
          : "";
      }
    };
    const draw = (keepGallery) => {
      if (!keepGallery) gi = 0;
      drawGallery();
      $("#pdCodes").textContent = `Артикул № ${cur.id}`;
      $("#config").innerHTML = configHtml(p, cur);
      $("#pdBuy").innerHTML = buyHtml(p, cur);
      $("#stickyBuy").innerHTML = cur.price == null ? "" : `<div><b>${eur(cur.price, true)}</b><small>${esc([cur.storage, cur.color].filter(Boolean).join(" · ") || p.name)}</small></div><button class="btn btn--primary" data-add="${cur.id}">${icon("bag")} В количката</button>`;
      drawSpecs();
      syncProductTools(p);
      history.replaceState(null, "", `#/p/${p.slug}${cur !== p.def ? "?v=" + cur.id : ""}`);
      lastPath = routeKey();
    };
    const drawSpecs = () => {
      const base = [
        cur.storage && ["Вградена памет", cur.storage], cur.ram && ["RAM", cur.ram], cur.color && ["Цвят", cur.color], cur.conn && ["Свързаност", cur.conn],
        ["Артикул №", cur.id],
      ].filter(Boolean);
      const render = (sections) => {
        const secs = [["Избрана конфигурация", base], ...sections];
        $("#specsSec").innerHTML = `<div class="section__head"><div><span class="eyebrow">Всичко за модела</span><h2>Технически характеристики</h2></div></div>
          <div class="specgrid">${secs.map(([t, rows]) => `<section class="specbox"><h3>${esc(t)}</h3><dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>`).join("")}</div>`;
      };
      if (p.kind !== "g") {
        const rows = Object.entries(p.specs);
        return render(rows.length ? [["Характеристики", rows]] : []);
      }
      render(Object.keys(p.specs).length ? [["Основни", Object.entries(p.specs)]] : []);
      loadSpecs().then((all) => { if (all[p.slug] && $("#specsSec") && BY_SLUG.get(parseRoute().parts[1]) === p) render(all[p.slug]); });
    };

    $("#config").addEventListener("click", (e) => { const b = e.target.closest("[data-opt]"); if (b) { cur = pickVariant(p, cur, b.dataset.opt, b.dataset.val); draw(); } });
    $("#config").addEventListener("change", (e) => { const s = e.target.closest("[data-optsel]"); if (s) { cur = pickVariant(p, cur, s.dataset.optsel, s.value); draw(); } });
    $("#pdThumbs").addEventListener("click", (e) => {
      const t = e.target.closest("[data-gi]");
      if (t) { gi = +t.dataset.gi; return drawGallery(); }
      const b = e.target.closest("[data-timg]");
      if (!b) return;
      const v = BY_ID.get(+b.dataset.timg).v;
      cur = v.color ? pickVariant(p, cur, "color", v.color) : v;
      draw();
    });
    const step = (d) => { const n = galleryOf(p, cur).length; if (n > 1) { gi = (gi + d + n) % n; drawGallery(); } };
    $$("[data-gal]").forEach((b) => b.addEventListener("click", () => step(+b.dataset.gal)));
    let sx = null;
    $("#pdMain").addEventListener("pointerdown", (e) => { sx = e.clientX; });
    $("#pdMain").addEventListener("pointerup", (e) => { if (sx != null && Math.abs(e.clientX - sx) > 40) { step(e.clientX < sx ? 1 : -1); $("#pdMain").dataset.swiped = "1"; } sx = null; });
    $("#pdZoom").addEventListener("click", () => {
      if ($("#pdMain").dataset.swiped) { delete $("#pdMain").dataset.swiped; return; }
      openZoom(galleryOf(p, cur), gi, p.name);
    });
    $("#pdShare").addEventListener("click", (e) => { e.stopPropagation(); shareMenu(p, e.currentTarget); });
    $("#pdWatch")?.addEventListener("click", () => openWatch(p, cur));
    draw();
  }

  function openZoom(list, start, alt) {
    let i = start;
    const render = () => {
      $("#zoomImg").src = full(list[i]);
      $("#zoomCount").textContent = list.length > 1 ? `${i + 1} / ${list.length}` : "";
    };
    openModal(`<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
      <div class="zoom"><img id="zoomImg" alt="${esc(alt)}">
      ${list.length > 1 ? `<button class="pd__nav pd__nav--prev" data-z="-1" aria-label="Предишна">${icon("chevL")}</button><button class="pd__nav pd__nav--next" data-z="1" aria-label="Следваща">${icon("chevR")}</button>` : ""}
      <span class="pd__count" id="zoomCount"></span></div>`, "modal__box--img");
    render();
    $("#modalBox").onclick = (e) => { const b = e.target.closest("[data-z]"); if (b) { i = (i + +b.dataset.z + list.length) % list.length; render(); } };
    $("#modalBox").onkeydown = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { i = (i + (e.key === "ArrowRight" ? 1 : -1) + list.length) % list.length; render(); } };
  }

  /* ---------- бърз преглед ---------- */
  function openQuick(slug) {
    const p = BY_SLUG.get(slug);
    if (!p) return;
    let cur = p.def;
    const render = () => {
      $("#modalBox").innerHTML = `<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
        <div class="qv">
          <div class="qv__media"><img src="${esc(full(cur.img))}" alt="${esc(p.name)}" id="qvImg"></div>
          <div class="qv__info">
            <span class="card__brand">${esc(p.brand)}</span>
            ${badgesHtml(p, "pd__badges")}
            <h2>${esc(p.name)}</h2>
            ${p.kind === "g" ? `<div class="config config--compact">${configHtml(p, cur, true)}</div>` : `<p class="muted">${esc(p.sub || CAT_NAMES[p.cat])}</p>`}
            <div class="pd__buy">${buyHtml(p, cur)}</div>
            <a class="link" href="#/p/${p.slug}${cur !== p.def ? "?v=" + cur.id : ""}">Всички детайли и характеристики ${icon("arrow")}</a>
          </div>
        </div>`;
    };
    openModal("", "modal__box--wide");
    render();
    $("#modalBox").onclick = (e) => { const b = e.target.closest("[data-opt]"); if (b) { cur = pickVariant(p, cur, b.dataset.opt, b.dataset.val); render(); } };
    $("#modalBox").onchange = (e) => { const s = e.target.closest("[data-optsel]"); if (s) { cur = pickVariant(p, cur, s.dataset.optsel, s.value); render(); } };
  }

  function syncProductTools(p) {
    const f = $("#pdFav"), c = $("#pdCmp");
    if (f) { f.classList.toggle("on", isFav(p.slug)); f.querySelector("span").textContent = isFav(p.slug) ? "В любими" : "Запази в любими"; }
    if (c) { c.classList.toggle("on", inCmp(p.slug)); c.querySelector("span").textContent = inCmp(p.slug) ? "В сравнението" : "Добави за сравнение"; }
  }

  function share(p) {
    const url = location.href;
    if (navigator.share) navigator.share({ title: p.name, text: `${p.name} – GDMobil`, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast("🔗 Линкът е копиран"), () => toast(url));
  }

  /* ================= СРАВНЕНИЕ ================= */
  function pageCompare() {
    setTitle("Сравнение");
    const items = state.compare.map((s) => BY_SLUG.get(s)).filter(Boolean);
    const keys = [...new Set(items.flatMap((p) => Object.keys(p.specs)))];
    view.innerHTML = `<section class="container page">${crumbs([["Сравнение"]])}
      <div class="cat-head"><h1>Сравнение</h1><p class="muted">${items.length ? `${items.length} от 4 модела` : ""}</p>
        ${items.length > 1 ? `<label class="switch"><input type="checkbox" id="diffOnly"><span></span>Само разликите</label>` : ""}</div>
      ${items.length ? `<div class="cmp-wrap"><table class="cmp">
        <tr><th></th>${items.map((p) => `<td><button class="icon-btn icon-btn--sm cmp__rm" data-cmp="${p.slug}" aria-label="Премахни ${esc(p.name)}">${icon("close")}</button>
          <a href="#/p/${p.slug}">${imgTag(p.img, p.name, "cmp__img")}<b>${esc(p.name)}</b></a></td>`).join("")}</tr>
        <tr><th>Цена</th>${items.map((p) => `<td>${priceHtml(p)}</td>`).join("")}</tr>
        <tr><th>Памет</th>${items.map((p) => `<td>${esc((p.opts.storage || []).join(" / ") || "—")}</td>`).join("")}</tr>
        <tr><th>Цветове</th>${items.map((p) => `<td><div class="dots">${(p.opts.color || []).map((c) => `<i title="${esc(c)}" style="background:${colorHex(c)}"></i>`).join("")}</div></td>`).join("")}</tr>
        ${keys.map((k) => { const vals = items.map((p) => p.specs[k] || "—"); return `<tr ${new Set(vals).size === 1 ? 'data-same="1"' : ""}><th>${esc(k)}</th>${vals.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`; }).join("")}
        <tr><th></th>${items.map((p) => `<td><a class="btn btn--primary btn--sm" href="#/p/${p.slug}">Избери вариант</a></td>`).join("")}</tr>
      </table></div>` : `<div class="empty"><p>Няма добавени модели за сравнение.</p><a class="btn btn--primary" href="#/c/phones">Към телефоните</a></div>`}
    </section>`;
  }

  document.addEventListener("change", (e) => { if (e.target.id === "diffOnly") $(".cmp")?.classList.toggle("diff", e.target.checked); });

  /* ================= СЕРВИЗ ================= */
  // Илюстрации на ремонтите (вградени SVG)
  function repairArt(type) {
    const body = '<rect x="34" y="8" width="52" height="104" rx="11" class="ra-body"/>';
    const screen = '<rect x="39" y="15" width="42" height="90" rx="6" class="ra-screen"/>';
    const art = {
      screen: `${body}${screen}<path class="ra-crack" d="M52 15 58 40 49 52 62 66 55 84 63 105M58 40l14 8 9-6M62 66l19 4M49 52 39 58"/>`,
      battery: `${body}${screen}<rect x="48" y="44" width="24" height="40" rx="4" class="ra-line"/><rect x="55" y="40" width="10" height="4" rx="1" class="ra-fill"/><rect x="51" y="72" width="18" height="9" rx="2" class="ra-warn"/><path class="ra-bolt" d="M61 50 54 62h6l-2 8 8-12h-6z"/>`,
      plug: `${body}${screen}<rect x="52" y="104" width="16" height="5" rx="2" class="ra-fill"/><path class="ra-line" d="M60 112v4c0 4-3 6-8 6"/><rect x="55" y="116" width="10" height="6" rx="2" class="ra-fill" transform="translate(0 0)"/><path class="ra-spark" d="M46 98l-6-4M74 98l6-4M60 96v-6"/>`,
      back: `${body}<rect x="40" y="14" width="22" height="26" rx="6" class="ra-screen"/><circle cx="47" cy="21" r="3.5" class="ra-lens"/><circle cx="47" cy="32" r="3.5" class="ra-lens"/><circle cx="56" cy="26" r="3.5" class="ra-lens"/><path class="ra-crack" d="M86 60 70 66 74 80 58 90 64 112M70 66 60 58M74 80l12 6"/>`,
      camera: `${body}<rect x="40" y="14" width="40" height="40" rx="10" class="ra-screen"/><circle cx="60" cy="34" r="12" class="ra-lens"/><circle cx="60" cy="34" r="5" class="ra-fill"/><path class="ra-spark" d="M20 50c-4 6-4 14 0 20M12 44c-7 10-7 22 0 32M100 50c4 6 4 14 0 20M108 44c7 10 7 22 0 32"/>`,
      buttons: `${body}${screen}<rect x="86" y="30" width="5" height="16" rx="2" class="ra-warn"/><rect x="86" y="52" width="5" height="10" rx="2" class="ra-fill"/><rect x="29" y="34" width="5" height="12" rx="2" class="ra-fill"/><path class="ra-spark" d="M96 34l7-4M96 42l7 4"/>`,
      software: `${body}${screen}<circle cx="60" cy="60" r="13" class="ra-line"/><path class="ra-line" d="M60 41v-5M60 84v-5M41 60h-5M84 60h-5M47 47l-4-4M77 77l-4-4M73 47l4-4M43 77l4-4"/><circle cx="60" cy="60" r="5" class="ra-fill"/>`,
      chip: `<rect x="26" y="22" width="68" height="76" rx="8" class="ra-board"/><rect x="44" y="42" width="32" height="32" rx="4" class="ra-chip"/><path class="ra-trace" d="M44 50H32M44 58H32M44 66H32M76 50h12M76 58h12M76 66h12M52 42V30M60 42V30M68 42V30M52 74v12M60 74v12M68 74v12"/><path class="ra-bolt" d="M62 48 54 60h6l-2 8 8-12h-6z"/>`,
    };
    return `<svg class="ra" viewBox="0 0 120 128" aria-hidden="true">${art[type] || art.screen}</svg>`;
  }

  const REPAIR_KEY = (t) => (window.REPAIRS.find((r) => r.title === t) || {}).icon;

  function pageService(anchor, q = new URLSearchParams()) {
    setTitle("Сервиз за телефони и таблети");
    const repBrands = ["Apple", "Samsung", "Xiaomi", "Google", "Huawei", "Motorola", "Honor", "OPPO", "OnePlus", "Nokia", "Realme", "Nothing", "Vivo", "Blackview", "Ulefone", "CAT"].filter((b) => C.logos[b]);
    const phoneBrands = [...new Set(PRODUCTS.filter((p) => p.cat === "phones" || p.cat === "tablets").map((p) => p.brand))].sort((a, b) => a.localeCompare(b));
    view.innerHTML = `<section class="container page">
      ${crumbs([["Сервиз"]])}
      <div class="svc-hero">
        <div>
          <span class="eyebrow eyebrow--dark">Сервиз GDMobil · Гоце Делчев</span>
          <h1>Ремонт на телефони и таблети – с ясна цена преди започване.</h1>
          <p class="muted">Смяна на дисплеи и батерии, ремонт на букси за зареждане, камери и бутони, софтуер и диагностика на платки. Избери проблема за ориентировъчна цена или ни пиши.</p>
          <div class="hero__cta"><a class="btn btn--primary" href="#/service#book">${icon("clock")} Запази час</a><a class="btn btn--ghost" href="#/service#calc">Колко ще струва?</a></div>
          <ul class="svc-facts">
            <li><b>8</b><span>вида ремонти</span></li>
            <li><b>от 15 €</b><span>ориентировъчно</span></li>
            <li><b>0 €</b><span>за запитване</span></li>
          </ul>
        </div>
        <figure class="svc-art"><img src="assets/img/service-hero.svg" alt="Отворен смартфон в сервиза с батерия, платка и инструменти"></figure>
      </div>

      <div class="svc-brands">
        <span>Ремонтираме устройства на</span>
        ${logoMarquee(repBrands.map((b) => ({ name: b, logo: C.logos[b], href: PRODUCTS.some((p) => p.brand === b && p.cat !== "accessories") ? `#/c/phones?brand=${encodeURIComponent(b)}` : "#/service#book" })), "mq--sm")}
      </div>

      <div class="section" id="prices">
        <div class="section__head"><div><span class="eyebrow">Цени</span><h2>Какъв е проблемът?</h2><p class="muted">Цените са ориентировъчни. Уточняваме крайната сума, частите и срока след преглед.</p></div></div>
        <div class="repairs">${window.REPAIRS.map((r) => `<button class="repair" data-repair="${esc(r.title)}">
          <span class="repair__art">${repairArt(r.icon)}</span><b>${esc(r.title)}</b><span class="muted">${esc(r.text)}</span>
          <span class="repair__foot"><span class="repair__price">${esc(r.price)}</span><span class="repair__pick">Избери ${icon("arrow")}</span></span></button>`).join("")}</div>
      </div>

      <div class="section" id="calc">
        <div class="calc">
          <div class="calc__copy">
            <span class="eyebrow">Бърза оценка</span>
            <h2>Ориентировъчна цена за 20 секунди</h2>
            <p class="muted">Избери устройство, марка и проблем. Ще видиш ценовия диапазон и можеш веднага да поискаш точна оферта.</p>
          </div>
          <form class="calc__form" id="calcForm">
            <div class="seg" role="radiogroup" aria-label="Устройство">
              <label><input type="radio" name="dev" value="Телефон" checked><span>Телефон</span></label>
              <label><input type="radio" name="dev" value="Таблет"><span>Таблет</span></label>
            </div>
            <div class="two">
              <label class="field"><span>Марка</span><select class="select" name="brand">${phoneBrands.map((b) => `<option ${b === "Apple" ? "selected" : ""}>${esc(b)}</option>`).join("")}<option>Друга</option></select></label>
              <label class="field"><span>Модел (по желание)</span><input class="input" name="model" placeholder="напр. iPhone 13"></label>
            </div>
            <div class="field"><span>Проблем</span>
              <div class="calc__chips">${window.REPAIRS.map((r, i) => `<label><input type="radio" name="rep" value="${i}" ${i === 0 ? "checked" : ""}><span>${icon(r.icon)}${esc(r.title)}</span></label>`).join("")}</div>
            </div>
            <div class="calc__result" id="calcRes" aria-live="polite"></div>
          </form>
        </div>
      </div>

      <div class="section" id="book">${bookingHtml()}</div>

      <div class="section svc-grid">
        <div id="form">${inquiryForm("service", q.get("model") || "", q.get("msg") || "")}</div>
        <div>
          <span class="eyebrow">Как работим</span>
          <h2>Как протича ремонтът</h2>
          <ol class="steps">${window.REPAIR_STEPS.map((s, i) => `<li><span>${i + 1}</span><div><b>${esc(s.title)}</b><p class="muted">${esc(s.text)}</p></div></li>`).join("")}</ol>
          <div class="svc-gets">
            <h3>Какво получаваш</h3>
            <ul>
              <li>${icon("check")}<span><b>Оферта преди ремонта</b> – ремонтираме само след като потвърдиш цената и срока.</span></li>
              <li>${icon("check")}<span><b>Без ангажимент</b> – запитването не те задължава с ремонт или платена диагностика.</span></li>
              <li>${icon("check")}<span><b>Сервиз на място</b> – в магазина на ${esc(S.address)}.</span></li>
              <li>${icon("check")}<span><b>Законова гаранция</b> – правата ти при несъответствие не се ограничават.</span></li>
            </ul>
          </div>
          <h3>Преди да донесеш устройството</h3>
          <div class="acc">${window.SERVICE_FAQ.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("")}</div>
        </div>
      </div>

      <div class="section">
        <div class="svc-contact">
          <div>${icon("pin")}<span><small>Сервиз и магазин</small><b>${esc(S.address)}</b></span></div>
          <div>${icon("clock")}<span><small>Работно време</small><b data-today3></b></span></div>
          <div>${icon("phone")}<span><small>Телефон</small><a href="tel:${tel}"><b>${esc(S.phone)}</b></a></span></div>
          <a class="btn btn--primary" href="${esc(S.maps)}" target="_blank" rel="noopener">${icon("pin")} Упътване</a>
        </div>
      </div>
    </section>`;
    $("[data-today3]").innerHTML = todayText();
    initBooking();

    const fillForm = (repairTitle, model) => {
      const f = $("#inqForm");
      if (!f) return;
      f.querySelector("[name=type]").value = "Ремонт";
      if (model) f.querySelector("[name=model]").value = model;
      const ta = f.querySelector("[name=msg]");
      if (repairTitle && !ta.value.startsWith(repairTitle)) ta.value = `${repairTitle}: ${ta.value}`;
      $("#form").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => f.querySelector(model ? "[name=msg]" : "[name=model]").focus({ preventScroll: true }), 450);
    };
    $("#prices").addEventListener("click", (e) => {
      const b = e.target.closest("[data-repair]");
      if (b) fillForm(b.dataset.repair);
    });
    const calc = $("#calcForm");
    const drawCalc = () => {
      const r = window.REPAIRS[+calc.rep.value];
      const dev = calc.dev.value, brand = calc.brand.value, model = calc.model.value.trim();
      $("#calcRes").innerHTML = `<div><small class="muted">${esc(dev)} · ${esc(model || brand)} · ${esc(r.title)}</small>
        <b class="calc__price">${esc(r.price)}</b><small class="muted">Ориентировъчно. Точната цена – след преглед.</small></div>
        <div class="row-btns"><button type="button" class="btn btn--primary" id="calcGo">Поискай точна оферта ${icon("arrow")}</button>
        <button type="button" class="btn btn--ghost" id="calcBook">${icon("clock")} Запази час</button></div>`;
      $("#calcBook").onclick = () => {
        const b = $("#bookForm");
        b.problem.value = r.title; if (model || brand !== "Друга") b.model.value = model || brand + " ";
        $("#book").scrollIntoView({ behavior: "smooth" });
      };
      $("#calcGo").onclick = () => {
        const f = $("#inqForm");
        if (f) f.querySelector("[name=device]").value = dev;
        fillForm(r.title, model || (brand === "Друга" ? "" : brand + " "));
      };
    };
    calc.addEventListener("change", drawCalc);
    calc.addEventListener("input", drawCalc);
    calc.addEventListener("submit", (e) => e.preventDefault());
    drawCalc();
    if (q.get("repair")) {
      const i = window.REPAIRS.findIndex((r) => r.title === q.get("repair"));
      if (i > -1) { calc.rep.value = i; drawCalc(); }
    }
    if (anchor) requestAnimationFrame(() => $("#" + anchor)?.scrollIntoView());
  }

  /* ================= БЮЛЕТИН И СОЦИАЛНИ МРЕЖИ ================= */
  const SOCIAL = () => [
    S.social.facebook && ["facebook", "Facebook", S.social.facebook],
    S.social.instagram && ["instagram", "Instagram", S.social.instagram],
    S.social.messenger && ["messenger", "Messenger", S.social.messenger],
    S.social.tiktok && ["tiktok", "TikTok", S.social.tiktok],
  ].filter(Boolean);
  const SOC_IC = {
    facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v9h4v-9h3l1-4h-4V8z"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
    messenger: '<path d="M12 2.5c-5.3 0-9.5 3.9-9.5 9 0 2.8 1.3 5.3 3.4 7v3.5l3.2-1.8c.9.3 1.9.4 2.9.4 5.3 0 9.5-3.9 9.5-9s-4.2-9.1-9.5-9.1z"/><path d="m6.5 14.5 4-4.2 2.4 2.4 4.6-2.6-4 4.2-2.5-2.4z"/>',
    tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.8 2.4 4.6 5 5"/>',
    whatsapp: '<path d="M4 20l1.3-4A8.5 8.5 0 1 1 8.4 19z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8a5 5 0 0 1-2.7-2.7l.8-1-1-2z"/>',
    viber: '<path d="M12 2C6.5 2 3 4.6 3 10.5c0 3.2 1.1 5.4 3 6.7V21l3.2-2.6c.9.1 1.8.2 2.8.2 5.5 0 9-2.6 9-8.1S17.5 2 12 2z"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  };
  const socIcon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${SOC_IC[n]}</svg>`;
  const socialButtons = (cls = "soc") => `<div class="${cls}">${SOCIAL().map(([k, n, u]) => `<a class="${cls}__btn ${cls}__btn--${k}" href="${esc(u)}" target="_blank" rel="noopener" aria-label="${n}">${socIcon(k)}<span>${n}</span></a>`).join("")}</div>`;

  // Въртяща се лента с логата (спира при посочване; без анимация при „намалено движение“)
  function logoMarquee(items, cls = "") {
    const one = items.map((x) => `<a class="mq__item" href="${esc(x.href)}" title="${esc(x.name)}">
      <span class="mq__logo"><img src="${esc(x.logo)}" alt="${esc(x.name)}" loading="lazy"></span>
      ${x.sub !== undefined ? `<span class="mq__txt"><b>${esc(x.name)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span>` : ""}</a>`).join("");
    return `<div class="mq ${cls}" style="--mq-dur:${Math.max(20, items.length * 4)}s"><div class="mq__track">${one}<div class="mq__dup" aria-hidden="true">${one.replace(/<a /g, '<a tabindex="-1" ')}</div></div></div>`;
  }

  function reviewsBlock() {
    const R = window.REVIEWS || {};
    const items = (R.items || []).filter((r) => r && r.text).slice(0, 6);
    const stars = (n) => `<span class="stars" aria-label="${n} от 5">${"★".repeat(Math.round(n))}${"☆".repeat(5 - Math.round(n))}</span>`;
    const rating = Number(R.rating) || 0;
    return `<section class="container section" id="reviews">
      <div class="section__head"><div><span class="eyebrow">Отзиви</span><h2>Какво казват клиентите</h2></div>
        <div class="rev-summary">${rating ? `<b>${rating.toFixed(1).replace(".", ",")}</b>${stars(rating)}<small>${R.count ? `${esc(R.count)} отзива в Google` : "в Google"}</small>` : ""}
          ${R.googleUrl ? `<a class="btn btn--ghost btn--sm" href="${esc(R.googleUrl)}" target="_blank" rel="noopener">Виж всички в Google</a>` : ""}
          ${items.length ? `<button class="btn btn--primary btn--sm" data-review>${icon("star")} Остави отзив</button>` : ""}</div></div>
      ${items.length ? `<div class="reviews">${items.map((r) => `<figure class="review">
        ${stars(Number(r.rating) || 5)}<blockquote>${esc(r.text)}</blockquote>
        <figcaption><span class="review__ava">${esc((r.name || "?").trim().charAt(0).toUpperCase())}</span><span><b>${esc(r.name || "Клиент")}</b><small>${esc(r.date || "")}${R.googleUrl ? " · Google" : ""}</small></span></figcaption>
      </figure>`).join("")}</div>` : `<div class="rev-empty">
        <div class="rev-empty__stars">★★★★★</div>
        <div><b>Пазарувал/а си при нас или си ремонтирал/а телефон?</b>
        <p class="muted">Разкажи как е минало – отзивът ти помага на други клиенти и на нас да ставаме по-добри.</p></div>
        <button class="btn btn--primary" data-review>Напиши първия отзив</button></div>`}
    </section>`;
  }

  function openWatch(p, v) {
    openModal(`<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
      <form class="review-form" id="watchForm">
        <h2>${icon("bell")} Кажи ми при намаление</h2>
        <p class="muted">${esc(p.name)}${varLabel(v) ? ` <small>(${esc(varLabel(v))})</small>` : ""} – сега <b>${eur(v.price, true)}</b>. Ще ти пишем, когато цената падне.</p>
        <label class="field"><span>Имейл *</span><input class="input" type="email" name="email" required autocomplete="email" placeholder="твоят@имейл.bg"></label>
        <label class="check check--consent"><input type="checkbox" name="ok" required><span>Съгласен/на съм GDMobil да ми изпрати имейл при намаление на този продукт. Имейлът се изтрива след известието. <a href="#/legal/privacy" target="_blank">Поверителност</a></span></label>
        <button class="btn btn--primary btn--block" type="submit">Следи цената</button>
        <p class="muted small rev-msg" aria-live="polite"></p>
      </form>`);
    $("#watchForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector("[type=submit]");
      btn.disabled = true;
      let ok = false;
      try {
        const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "watch", email: f.email.value.trim(), consent: f.ok.checked, slug: p.slug, id: String(v.id), name: p.name, variant: varLabel(v), price: v.price }) });
        ok = r.ok;
      } catch {}
      if (!ok) { btn.disabled = false; f.querySelector(".rev-msg").textContent = "Не успяхме да запишем имейла. Опитай отново след малко."; return; }
      track("Следене на цена");
      store.set("watch", [...new Set([...store.get("watch", []), p.slug])].slice(-50));
      $("#pdWatch") && ($("#pdWatch").innerHTML = `${icon("bell")} Следиш цената`);
      $("#modalBox").innerHTML = `<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
        <div class="success"><div class="success__check">${icon("check")}</div><h2>Готово!</h2>
        <p class="muted">Ще ти пишем на <b>${esc(f.email.value.trim())}</b>, когато ${esc(p.name)} поевтинее.</p>
        <button class="btn btn--primary" data-close>Затвори</button></div>`;
    });
  }

  function openReview() {
    const R = window.REVIEWS || {};
    openModal(`<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
      <form class="review-form" id="revForm">
        <h2>Твоят отзив за GDMobil</h2>
        <div class="rate" role="radiogroup" aria-label="Оценка">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="rt${n}" value="${n}" ${n === 5 ? "checked" : ""}><label for="rt${n}" title="${n} от 5">★</label>`).join("")}</div>
        <label class="field"><span>Име *</span><input class="input" name="name" required maxlength="60" placeholder="напр. Мария К." autocomplete="given-name"></label>
        <label class="field"><span>Отзив *</span><textarea class="input" name="text" rows="4" required minlength="10" maxlength="1200" placeholder="Какво купи или ремонтира и как беше обслужването?"></textarea></label>
        <label class="check check--consent"><input type="checkbox" name="consent" required><span>Съгласен/на съм отзивът и името ми да бъдат публикувани в сайта след преглед от магазина.</span></label>
        <button class="btn btn--primary btn--block" type="submit">Изпрати отзива</button>
        <p class="muted small rev-msg" aria-live="polite"></p>
      </form>`);
    $("#revForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "Изпращане…";
      track("Отзив");
      let ok = false;
      try {
        const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "review", name: f.name.value.trim(), rating: +f.rating.value, text: f.text.value.trim(), consent: f.consent.checked }) });
        ok = r.ok;
      } catch {}
      if (!ok) { btn.disabled = false; btn.textContent = "Изпрати отзива"; f.querySelector(".rev-msg").textContent = "Не успяхме да изпратим отзива. Опитай отново след малко."; return; }
      $("#modalBox").innerHTML = `<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
        <div class="success"><div class="success__check">${icon("check")}</div><h2>Благодарим за отзива!</h2>
        <p class="muted">Ще се появи в сайта след кратък преглед.</p>
        ${R.writeUrl ? `<p>Ще ни помогнеш много, ако го споделиш и в Google:</p><a class="btn btn--primary" href="${esc(R.writeUrl)}" target="_blank" rel="noopener">Оцени ни в Google</a>` : `<button class="btn btn--primary" data-close>Затвори</button>`}</div>`;
    });
  }

  function newsletterBlock() {
    const done = store.get("newsletter", false);
    return `<section class="container section">
      <div class="news">
        <div class="news__copy">
          <span class="eyebrow eyebrow--dark">Бюлетин GDMobil</span>
          <h2>Научавай първи за новите модели и офертите.</h2>
          <p>Само полезни новини от магазина – без спам. Можеш да се отпишеш по всяко време.</p>
          <div class="news__follow"><small>Последвай ни</small>${socialButtons()}</div>
        </div>
        ${done ? `<div class="news__done">${icon("check")}<b>Вече си абониран.</b><span>Благодарим!</span></div>` : newsForm("news__form")}
      </div>
    </section>`;
  }
  const newsForm = (cls) => `<form class="news-form ${cls}" novalidate>
      <label class="news-form__row"><span class="sr">Имейл</span>
        <input class="input" type="email" name="email" required placeholder="твоят@имейл.bg" autocomplete="email">
        <button class="btn btn--ember" type="submit">Абонирай ме</button></label>
      <label class="check check--consent"><input type="checkbox" name="ok" required><span>Съгласен/на съм да получавам новини и оферти от GDMobil. <a href="#/legal/privacy">Поверителност</a></span></label>
      <p class="news-form__msg" aria-live="polite"></p>
    </form>`;

  async function submitNewsletter(form) {
    const email = form.email.value.trim(), msg = form.querySelector(".news-form__msg");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Въведи валиден имейл адрес."; form.email.focus(); return; }
    if (!form.ok.checked) { msg.textContent = "Моля, потвърди съгласието си."; return; }
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    const text = `Моля, абонирайте ме за бюлетина на GDMobil.\nИмейл: ${email}\nСъгласие: да (${new Date().toLocaleString("bg-BG")})`;
    track("Абонамент за бюлетин");
    const sent = await sendToStore("Абонамент за бюлетин", text, { type: "newsletter", email, consent: true });
    store.set("newsletter", true);
    form.outerHTML = sent
      ? `<div class="news__done">${icon("check")}<b>Готово – абониран си!</b><span>Ще получаваш новините на ${esc(email)}.</span></div>`
      : `<div class="news__done">${icon("mail")}<b>Остава една стъпка</b><span>Изпрати потвърждението до магазина:</span>
          <a class="btn btn--ember btn--sm" href="${mailto("Абонамент за бюлетин", text)}">Изпрати потвърждение</a></div>`;
  }

  function shareMenu(p, anchor) {
    const url = location.href, text = `${p.name} – GDMobil`;
    const enc = encodeURIComponent;
    const items = [
      ["facebook", "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
      ["messenger", "Messenger", `fb-messenger://share/?link=${enc(url)}`],
      ["viber", "Viber", `viber://forward?text=${enc(text + " " + url)}`],
      ["whatsapp", "WhatsApp", `https://wa.me/?text=${enc(text + " " + url)}`],
    ];
    $(".share-pop")?.remove();
    anchor.insertAdjacentHTML("afterend", `<div class="share-pop" role="menu">
      ${navigator.share ? `<button role="menuitem" data-native>${icon("share")} Сподели…</button>` : ""}
      ${items.map(([k, n, u]) => `<a role="menuitem" href="${u}" target="_blank" rel="noopener">${socIcon(k)} ${n}</a>`).join("")}
      <button role="menuitem" data-copy>${socIcon("link")} Копирай линка</button></div>`);
    const pop = $(".share-pop");
    pop.addEventListener("click", (e) => {
      if (e.target.closest("[data-native]")) navigator.share({ title: p.name, text, url }).catch(() => {});
      if (e.target.closest("[data-copy]")) navigator.clipboard?.writeText(url).then(() => toast("🔗 Линкът е копиран"), () => toast(url));
      pop.remove();
    });
    setTimeout(() => document.addEventListener("click", function off(e) { if (!e.target.closest(".share-pop")) { pop.remove(); document.removeEventListener("click", off); } }), 0);
  }

  /* ================= ЧАТ АСИСТЕНТ ================= */
  function initChat() {
    document.body.insertAdjacentHTML("beforeend", `
      <button class="chat-fab" id="chatFab" aria-label="Отвори чат с асистента" aria-expanded="false">
        <svg class="ic" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" stroke-width="2.6"/></svg>
        <span>Помощ</span></button>
      <section class="chat" id="chat" aria-label="Асистент GDMobil" hidden>
        <header class="chat__head">
          <span class="chat__ava">GD</span>
          <span><b>Асистент GDMobil</b><small><i class="dot dot--on"></i>Отговаря веднага · ${esc(S.phone)}</small></span>
          <button class="icon-btn" id="chatClose" aria-label="Затвори чата">${icon("close")}</button>
        </header>
        <div class="chat__log" id="chatLog" aria-live="polite"></div>
        <div class="chat__chips" id="chatChips"></div>
        <form class="chat__form" id="chatForm" autocomplete="off">
          <input class="input" id="chatInput" placeholder="Напиши въпрос…" aria-label="Въпрос към асистента" maxlength="300">
          <button class="icon-btn" type="submit" aria-label="Изпрати"><svg viewBox="0 0 24 24"><path d="M4 12 20 4l-6 16-3-7z"/></svg></button>
        </form>
        <p class="chat__note">Асистентът работи във вашия браузър – въпросите не се изпращат никъде. За поръчки и сложни въпроси ще ви свърже с човек.</p>
      </section>`);
    const fab = $("#chatFab"), box = $("#chat"), log = $("#chatLog"), chipsEl = $("#chatChips"), inp = $("#chatInput");
    let started = false, misses = 0, lastQ = "";
    const START = ["Работно време", "Доставка и плащане", "Цена на ремонт", "Търся телефон", "Гаранция и връщане", "Говори с човек"];

    const scroll = () => (log.scrollTop = log.scrollHeight);
    const say = (html, who = "bot") => { log.insertAdjacentHTML("beforeend", `<div class="msg msg--${who}">${html}</div>`); scroll(); };
    const chips = (list) => (chipsEl.innerHTML = list.map((c) => `<button type="button" class="chip">${esc(c)}</button>`).join(""));
    const typing = (fn) => {
      log.insertAdjacentHTML("beforeend", `<div class="msg msg--bot msg--typing"><i></i><i></i><i></i></div>`); scroll();
      setTimeout(() => { $(".msg--typing", log)?.remove(); fn(); }, 450 + Math.random() * 350);
    };
    const human = () => `<div class="msg__acts">
        <a class="btn btn--sm btn--primary" href="tel:${tel}">${icon("phone")} Обади се</a>
        ${S.social.messenger ? `<a class="btn btn--sm btn--ghost" href="${esc(S.social.messenger)}" target="_blank" rel="noopener">${socIcon("messenger")} Messenger</a>` : ""}
        <a class="btn btn--sm btn--ghost" href="#/inquiries?topic=${encodeURIComponent("Въпрос от чата")}&msg=${encodeURIComponent(lastQ)}" data-chat-close>${icon("mail")} Изпрати въпроса</a>
      </div>`;
    const link = (href, text) => `<a class="msg__link" href="${href}" data-chat-close>${text} →</a>`;

    const A = {
      greet: () => `Здравей! 👋 Аз съм асистентът на GDMobil. Мога да помогна с цени на телефони и аксесоари, ремонти, доставка, плащане и гаранция. Какво те интересува?`,
      hours: () => `🕘 <b>Работно време</b><br>${S.hours.map(([d, h]) => `${esc(d)}: <b>${esc(h)}</b>`).join("<br>")}<br><br>${todayText()}<br>📍 ${esc(S.address)}`,
      address: () => `📍 Магазинът и сервизът са на <b>${esc(S.address)}</b>.<br><a class="msg__link" href="${esc(S.maps)}" target="_blank" rel="noopener">Упътване в Google Maps →</a><br>${todayText()}`,
      delivery: () => `🚚 <b>Доставка</b><br>• Вземане от магазина – <b>без такса</b>, след потвърждение, че конфигурацията е готова.<br>• <b>Еконт или Спиди</b> до офис или адрес в България – таксата и срокът се потвърждават от магазина преди изпращане.<br>${link("#/legal/delivery", "Доставка и плащане")}`,
      payment: () => `💳 <b>Плащане</b><br>• В магазина – при вземане на място.<br>• <b>Наложен платеж</b> – при доставка с куриер.<br>Не се изисква предплащане за непотвърдена заявка. За други възможности (напр. на изплащане) – попитай колегите ни.${human()}`,
      returns: () => `↩️ <b>Връщане и гаранция</b><br>• При покупка онлайн имаш <b>14 дни</b> за отказ без причина.<br>• За новите стоки важи минимум <b>2 години законова гаранция</b>.<br>• Рекламации: ${esc(S.email)} или в магазина.<br>${link("#/legal/returns", "Гаранция и връщане")}`,
      order: () => `📦 След заявка получаваш <b>номер на заявката</b>. Магазинът потвърждава наличността, сумата и срока по телефона или имейла, а при изпращане – номер на товарителница.<br>Статуса на поръчка или ремонт виждаш в <a href="#/track">Проследяване</a> – с номера и последните 4 цифри от телефона. Ако имаш въпрос:${human()}`,
      human: () => `Разбира се – ето как да говориш с колега от GDMobil:<br>${todayText()}${human()}`,
      promo: () => `🔥 Новите модели са с етикет „Ново“, а намаленията – с „-%“. ${link("#/c/phones?tag=new", "Нови телефони")}${PRODUCTS.some((p) => p.tags.sale) ? link("#/c/all?tag=sale", "Намалени продукти") : ""}<br>Абонирай се за бюлетина най-долу на началната страница, за да научаваш първи.`,
      thanks: () => `Моля! 😊 Ако имаш още въпроси – тук съм.`,
    };
    const REPAIR_MAP = [
      [/дисплей|екран|тъч|счупен[оа]? стъкло|пукна|счупих|пукнат/, 0], [/батери|издържа|изтощава|бързо пада|гасне|изключва/, 1],
      [/букса|зарежда|порт|кабел не|не зарежд/, 2], [/заден|гръб|капак|гърба/, 3], [/камер|говорител|микрофон|не се чува|звук|слушалка/, 4],
      [/бутон|лент/, 5], [/софтуер|обнов|прехвърл|данни|забрав|парола|заключ|вирус|бавен/, 6], [/не се включва|платка|мокр|вода|падна в/, 7],
    ];
    const INTENTS = [
      [/^(здрав|здрасти|здр|добър ден|добро утро|добър вечер|hello|hi|hey|хей|ехо)/, "greet"],
      [/благодар|мерси|thanks|супер|чудесно/, "thanks"],

      [/работно време|работите|работи ли|кога (отваря|затваря|сте)|отворено|затворено|до колко|от колко|събота|неделя|празни/, "hours"],
      [/адрес|къде (сте|се намира|е магазин)|локаци|упътван|карта|как да стигна/, "address"],
      [/доставк|еконт|спиди|куриер|изпращ|до офис|до адрес|пратк|кога ще получ/, "delivery"],
      [/плащ|наложен|карт[аи]|изплащ|лизинг|кредит|вноски|банков|кеш|в брой/, "payment"],
      [/връщ|върн|отказ|рекламац|гаранц|замян|замен|дефект|повреден/, "returns"],
      [/поръчк|заявк|статус|потвърж|номер на/, "order"],
      [/човек|оператор|консултант|служител|колега|обад|звънн|говоря с|свърж|контакт|имейл|месинджър|messenger|viber|вайбър|телефон за връзка|вашия телефон|номер за връзка/, "human"],
      [/промо|оферт|намал|отстъпк|бюлетин|абонам|ново|нови модели/, "promo"],
    ];
    const STOP = new Set("колко струва струват цена цената цени имате ли има търся искам трябва ми кажи моля за на по от в с и е ли какво какъв каква до най нов нова нови нъв евтин евтино скъп телефон телефона модел модела купя купувам наличност налично".split(" "));

    function productAnswer(text) {
      const toks = tokens(text).filter((t) => !STOP.has(t) && t.length > 1);
      if (!toks.length) return null;
      let res = PRODUCTS.filter((p) => p.min != null && matches(p, toks));
      if (!res.length && toks.length > 1) res = PRODUCTS.filter((p) => p.min != null && matches(p, toks.slice(0, -1)));
      if (!res.length) return null;
      res.sort((a, b) => (a.cat === "accessories") - (b.cat === "accessories") || (featuredRank.get(a) ?? 99) - (featuredRank.get(b) ?? 99) || b.min - a.min);
      const top = res.slice(0, 3);
      return `Ето какво намерих${res.length > 3 ? ` (${res.length} резултата)` : ""}:
        <div class="msg__prods">${top.map((p) => `<a class="msg__prod" href="#/p/${p.slug}" data-chat-close>${imgTag(p.img, "")}<span><b>${esc(p.name)}</b><small>${p.variants.length > 1 ? "от " : ""}${eur(p.min)} · ${p.tags.new ? "Ново · " : ""}В наличност</small></span></a>`).join("")}</div>
        ${res.length > 3 ? link(`#/c/all?q=${encodeURIComponent(toks.join(" "))}`, "Виж всички резултати") : ""}`;
    }

    function answer(raw) {
      const t = raw.toLowerCase().replace(/ё/g, "е");
      const rep = /ремонт|сервиз|смяна|смени|поправ/.test(t) || (REPAIR_MAP.some(([re]) => re.test(t)) && /счуп|пукн|не работ|не заре|сменя|поправ|ремонт|издържа|изтощава|гасне|изключва/.test(t));
      if (rep || /не се включва|мокр|падна в вода/.test(t)) {
        const hit = REPAIR_MAP.find(([re]) => re.test(t));
        if (hit) {
          const r = window.REPAIRS[hit[1]];
          return { html: `🔧 <b>${esc(r.title)}</b> – ориентировъчно <b>${esc(r.price)}</b>.<br>${esc(r.text)} Точната цена зависи от модела и частта и се уточнява след преглед – ремонтираме едва след като я потвърдиш.<div class="msg__acts"><a class="btn btn--sm btn--primary" href="#/service?repair=${encodeURIComponent(r.title)}&msg=${encodeURIComponent(raw)}#form" data-chat-close>Поискай оферта</a><a class="btn btn--sm btn--ghost" href="tel:${tel}">${icon("phone")} Обади се</a></div>`, chips: ["Колко време отнема?", "Работно време", "Говори с човек"] };
        }
        return { html: `🔧 <b>Цени на ремонти (ориентировъчно)</b><br>${window.REPAIRS.map((r) => `${esc(r.title)}: <b>${esc(r.price)}</b>`).join("<br>")}<br>${link("#/service", "Сервиз и запитване за ремонт")}`, chips: ["Смяна на дисплей", "Смяна на батерия", "Говори с човек"] };
      }
      if (/колко време|срок/.test(t) && /ремонт|отнема/.test(t)) return { html: `⏱ Срокът зависи от диагностиката, наличността на части и сложността на ремонта – уточняваме го заедно с офертата.${human()}` };
      for (const [re, k] of INTENTS) {
        if (re.test(t)) return { html: A[k](), chips: k === "greet" ? START : k === "human" ? ["Работно време", "Адрес на магазина"] : undefined };
      }
      const pa = productAnswer(raw);
      if (pa) return { html: pa, chips: ["Доставка и плащане", "Аксесоари за моя модел", "Говори с човек"] };
      if (/търся|искам|препоръч|какъв телефон|кой телефон|до \d+/.test(t)) {
        return { html: `С удоволствие! Напиши марка или модел (напр. „iPhone 17“, „Galaxy S26“, „Redmi Note 15“) или разгледай: ${link("#/c/phones?tag=new", "Нови телефони")} ${link("#/c/phones?sort=asc", "Телефони по цена")}`, chips: ["iPhone 17 Pro", "Galaxy S26", "Redmi Note 15", "Xiaomi 17"] };
      }
      misses++;
      return {
        html: misses > 1
          ? `Съжалявам, не мога да отговоря точно на това. Нека те свържа с колега – ще получиш отговор от човек:${human()}`
          : `Не съм сигурен, че разбрах. 🤔 Мога да помогна с: цени на телефони и аксесоари, ремонти, доставка, плащане, гаранция и работно време. Или да те свържа с човек.${human()}`,
        chips: START,
      };
    }

    // --- AI асистент (Claude през /api/chat); при липса – готовите отговори по-долу
    let aiOn = !!S.aiChat && /^https?:$/.test(location.protocol);
    const aiHistory = [];
    const mdLite = (t) => esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\[([^\]]{1,80})\]\((#\/[\w\/?=&%-]*)\)/g, '<a class="msg__link" href="$2" data-chat-close>$1</a>')
      .replace(/\n/g, "<br>");
    function productMatches(text) {
      const toks = tokens(text).filter((t) => !STOP.has(t) && t.length > 1);
      if (!toks.length) return [];
      let res = PRODUCTS.filter((p) => p.min != null && matches(p, toks));
      if (!res.length && toks.length > 1) res = PRODUCTS.filter((p) => p.min != null && matches(p, toks.slice(0, -1)));
      return res.sort((a, b) => (a.cat === "accessories") - (b.cat === "accessories") || (featuredRank.get(a) ?? 99) - (featuredRank.get(b) ?? 99) || b.min - a.min).slice(0, 6);
    }
    async function aiAnswer(q) {
      if (!aiOn) return null;
      const found = productMatches(q);
      aiHistory.push({ role: "user", text: q });
      try {
        const r = await fetch("/api/chat", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: aiHistory.slice(-8),
            products: found.map((p) => ({ name: p.name, priceFrom: p.min, url: `#/p/${p.slug}`, category: CAT_NAMES[p.cat], labels: [p.tags.new && "Ново", p.tags.sale && `-${p.disc}%`, p.tags.hot && "Хит"].filter(Boolean).join(", ") })),
          }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
        });
        if (r.status === 503 || r.status === 404) { aiOn = false; aiHistory.pop(); return null; }
        if (!r.ok) { aiHistory.pop(); return null; }
        const d = await r.json();
        aiHistory.push({ role: "assistant", text: d.text });
        track("Чат – AI отговор");
        const cards = found.length && /цен|струва|имате|търся|искам|модел|калъф|протектор|зарядно|слушалк|телефон|iphone|galaxy|redmi|pixel|xiaomi|samsung/i.test(q)
          ? `<div class="msg__prods">${found.slice(0, 3).map((p) => `<a class="msg__prod" href="#/p/${p.slug}" data-chat-close>${imgTag(p.img, "")}<span><b>${esc(p.name)}</b><small>${p.variants.length > 1 ? "от " : ""}${eur(p.min)}</small></span></a>`).join("")}</div>` : "";
        if (d.human) track("Чат – към човек");
        return { html: mdLite(d.text) + cards + (d.human ? human() : ""), chips: d.human ? ["Работно време", "Адрес на магазина"] : undefined };
      } catch { aiHistory.pop(); return null; }
    }

    const CHIP_Q = { "Търся телефон": "търся телефон", "Аксесоари за моя модел": "калъф", "Цена на ремонт": "цени на ремонти", "Говори с човек": "искам да говоря с човек", "Гаранция и връщане": "гаранция и връщане", "Доставка и плащане": "__delivery_payment", "Адрес на магазина": "адрес", "Колко време отнема?": "колко време отнема ремонтът" };
    const ask = (shown, internal) => {
      shown = shown.trim();
      if (!shown) return;
      lastQ = shown;
      say(esc(shown), "me");
      chipsEl.innerHTML = "";
      if (!internal && aiOn) {
        log.insertAdjacentHTML("beforeend", `<div class="msg msg--bot msg--typing"><i></i><i></i><i></i></div>`); scroll();
        aiAnswer(shown).then((r) => {
          $(".msg--typing", log)?.remove();
          r = r || answer(shown);
          say(r.html);
          chips(r.chips || ["Говори с човек", "Работно време", "Търся телефон"]);
        });
        return;
      }
      typing(() => {
        if (internal === "__delivery_payment") { say(A.delivery()); say(A.payment()); chips(START); return; }
        const r = answer(internal || shown);
        say(r.html);
        chips(r.chips || ["Говори с човек", "Работно време", "Търся телефон"]);
      });
    };
    chipsEl.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) ask(c.textContent, CHIP_Q[c.textContent]); });

    if (aiOn) {
      $(".chat__note").textContent = "Отговаря AI асистент (Claude на Anthropic) – въпросите се изпращат към него само за отговор. Не пиши лични данни. За поръчки и сложни въпроси ще те свърже с човек.";
      $(".chat__head small").innerHTML = `<i class="dot dot--on"></i>AI асистент · ${esc(S.phone)}`;
    }
    const open = () => {
      track("Чат – отворен");
      box.hidden = false; fab.setAttribute("aria-expanded", "true"); document.body.classList.add("chat-open");
      if (!started) { started = true; typing(() => { say(A.greet()); chips(START); }); }
      setTimeout(() => inp.focus({ preventScroll: true }), 100);
    };
    const close = () => { box.hidden = true; fab.setAttribute("aria-expanded", "false"); document.body.classList.remove("chat-open"); };
    window.__openChat = open;
    fab.addEventListener("click", () => (box.hidden ? open() : close()));
    $("#chatClose").addEventListener("click", () => { close(); fab.focus(); });
    $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); const q = inp.value; inp.value = ""; ask(q); });
    box.addEventListener("click", (e) => { if (e.target.closest("[data-chat-close]") && innerWidth < 761) close(); });
    box.addEventListener("keydown", (e) => { if (e.key === "Escape") { close(); fab.focus(); } });
  }

  /* ================= ЗАПИТВАНИЯ ================= */
  function pageInquiries(q) {
    setTitle("Запитвания за продукти");
    view.innerHTML = `<section class="container page">
      ${crumbs([["Запитвания"]])}
      <div class="svc-grid">
        <div>
          <h1>Запитвания за продукти</h1>
          <p class="muted">Попитай за цена, наличност или съвместимост на аксесоар.</p>
          <a class="link" href="#/service">Към сервиза и ремонтите →</a>
          <div class="info-cards">
            <div class="info-card">${icon("phone")}<div><b>Отговор по телефона</b><p class="muted">Остави актуален телефон за връзка. Можеш да добавиш и имейл, ако предпочиташ писмен отговор.</p></div></div>
            <div class="info-card">${icon("shield")}<div><b>Без ангажимент</b><p class="muted">Запитването не е поръчка и не те обвързва с покупка. Не изпращай пароли, PIN кодове или банкови данни.</p></div></div>
          </div>
        </div>
        <div>${inquiryForm("inquiry", q.get("topic") || "", q.get("msg") || "")}</div>
      </div>
    </section>`;
  }

  function inquiryForm(kind, topic = "", msg = "") {
    const svc = kind === "service";
    const guessDevice = /ipad|tab|таблет/i.test(topic) ? "Таблет" : /tapo|камер/i.test(topic) ? "Камера" : topic ? "Телефон" : "";
    return `<form class="form-card" id="inqForm">
      <h2>${svc ? "Запитване за ремонт" : "Изпрати запитване"}</h2>
      <p class="muted small">${svc ? "Можеш да въведеш устройството и да опишеш проблема директно." : "Избери устройство и опиши какво те интересува. Ако идваш от продуктовия каталог, избраният модел е попълнен автоматично."}</p>
      <div class="two">
        <label class="field"><span>Твоето име *</span><input class="input" name="name" required autocomplete="name"></label>
        <label class="field"><span>Телефон *</span><input class="input" name="phone" type="tel" required pattern="\\+?[0-9 ]{6,}" title="Само цифри, напр. 0888 123 456" autocomplete="tel"></label>
      </div>
      <label class="field"><span>Имейл (по избор)</span><input class="input" name="email" type="email" autocomplete="email"></label>
      <div class="two">
        <label class="field"><span>Вид запитване *</span><select class="select" name="type" required>
          ${["Ремонт", "Диагностика", "Въпрос за цена или части", "Друго запитване"].map((t) => `<option ${(!svc && t === "Въпрос за цена или части") ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field"><span>Устройство *</span><select class="select" name="device" required>
          <option value="">Избери устройство</option>${["Телефон", "Таблет", "Аксесоар", "Друго"].map((t) => `<option ${t === guessDevice ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>${svc ? "Марка и модел" : "Продукт / тема"} *</span><input class="input" name="model" required value="${esc(topic)}"></label>
      <label class="field"><span>${svc ? "Какъв е проблемът?" : "Как можем да помогнем?"} *</span><textarea class="input" name="msg" rows="4" required>${esc(msg)}</textarea></label>
      ${svc ? `<label class="field"><span>Как ще предадеш устройството?</span><select class="select" name="handover">
        <option>Ще го донеса в магазина</option><option>Искам да уговорим изпращане с куриер</option><option>Още не знам</option></select></label>` : ""}
      <label class="check check--consent"><input type="checkbox" required><span>Прочетох <a href="#/legal/privacy" target="_blank">информацията за личните данни</a> и разбирам, че посочените данни ще бъдат използвани за отговор на запитването. *</span></label>
      <button class="btn btn--primary btn--block" type="submit">Изпрати запитване</button>
      <p class="muted small">След успешно изпращане ще получиш номер на запитването.</p>
    </form>`;
  }

  async function submitInquiry(form) {
    const fd = Object.fromEntries(new FormData(form));
    const num = refNo("Z");
    const text = [`Запитване № ${num}`, `Вид: ${fd.type}`, `Устройство: ${fd.device}`, `Модел / тема: ${fd.model}`, fd.handover ? `Предаване: ${fd.handover}` : false, "", fd.msg, "",
      `Име: ${fd.name}`, `Телефон: ${fd.phone}`, fd.email ? `Имейл: ${fd.email}` : false].filter((x) => x !== false).join("\n");
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "Изпращане…";
    track(fd.type === "Ремонт" ? "Запитване за ремонт" : "Запитване");
    const isRepair = ["Ремонт", "Диагностика"].includes(fd.type);
    const sent = await sendToStore(`Запитване ${num} – ${fd.type}`, text, {
      type: isRepair ? "repair" : "inquiry", ref: num.replace(/^Z-/, isRepair ? "R-" : "Z-"), title: `${fd.type}: ${fd.model}`,
      device: `${fd.device} – ${fd.model}`, customer: { name: fd.name, phone: fd.phone, email: fd.email || "" } });
    const ref = typeof sent === "string" ? sent : num;
    form.outerHTML = `<div class="form-card success">
      <div class="success__check">${icon("check")}</div>
      <h2>${sent ? "Запитването е изпратено" : "Запитването е готово"}</h2>
      <p>Номер на запитването: <b>${ref}</b></p>
      ${sent ? `<p class="muted">Ще се свържем с теб на <b>${esc(fd.phone)}</b>.</p>
        ${typeof sent === "string" ? `<a class="btn btn--ghost" href="${trackLink(ref, fd.phone)}">${icon("search")} Проследи статуса</a>` : ""}`
        : `<p class="muted">Остава една стъпка – изпрати го, за да го получим:</p>
           <div class="row-btns"><a class="btn btn--primary" href="${mailto(`Запитване ${num}`, text)}">${icon("mail")} Изпрати по имейл</a>
           <a class="btn btn--ghost" href="tel:${tel}">${icon("phone")} Обади се</a></div>`}
    </div>`;
  }

  /* ================= ЗАПИСВАНЕ НА ЧАС ================= */
  // Официални празници (магазинът е затворен); Великден по православния календар.
  const HOLIDAYS = new Set(["01-01", "03-03", "05-01", "05-06", "05-24", "09-06", "09-22", "12-24", "12-25", "12-26",
    "2026-04-10", "2026-04-11", "2026-04-12", "2026-04-13", "2027-04-30", "2027-05-01", "2027-05-02", "2027-05-03"]);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function dayHours(d) {
    if (HOLIDAYS.has(ymd(d)) || HOLIDAYS.has(ymd(d).slice(5))) return null;
    const row = S.hours[d.getDay() === 0 ? 2 : d.getDay() === 6 ? 1 : 0];
    const m = String(row?.[1] || "").match(/(\d{1,2})[:.](\d{2})\s*[–-]\s*(\d{1,2})[:.](\d{2})/);
    return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : null;
  }
  function bookDays() {
    const out = [], d = new Date();
    d.setHours(0, 0, 0, 0);
    for (let i = 0; out.length < 10 && i < 30; i++, d.setDate(d.getDate() + 1)) {
      const h = dayHours(d);
      if (h && slotsFor(new Date(d), h).length) out.push(new Date(d));
    }
    return out;
  }
  function slotsFor(d, h = dayHours(d)) {
    if (!h) return [];
    const now = new Date(), out = [];
    for (let t = h[0]; t + 30 <= h[1]; t += 30) {
      const at = new Date(d); at.setHours(Math.floor(t / 60), t % 60, 0, 0);
      if (at - now > 60 * 60 * 1000) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
    }
    return out;
  }
  const DAY_SHORT = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
  function bookingHtml() {
    const days = bookDays();
    return `<div class="book">
      <div class="book__copy">
        <span class="eyebrow">Без чакане</span>
        <h2>Запази час за сервиз</h2>
        <p class="muted">Избери ден и час, в който да донесеш устройството. Ще направим диагностика на място и ще ти кажем точната цена, преди да започнем.</p>
        <ul class="book__points"><li>${icon("check")} Безплатна оценка на място</li><li>${icon("check")} Потвърждение по телефона</li><li>${icon("check")} Можеш да промениш или откажеш часа</li></ul>
      </div>
      <form class="form-card book__form" id="bookForm" novalidate>
        <div class="book__label">1. Ден</div>
        <div class="book__days" role="radiogroup" aria-label="Ден">${days.map((d, i) => `<label class="bday"><input type="radio" name="day" value="${ymd(d)}" ${i ? "" : "checked"}>
          <span><small>${i === 0 && ymd(d) === ymd(new Date()) ? "днес" : DAY_SHORT[d.getDay()]}</small><b>${d.getDate()}</b><small>${["яну", "фев", "мар", "апр", "май", "юни", "юли", "авг", "сеп", "окт", "ное", "дек"][d.getMonth()]}</small></span></label>`).join("")}</div>
        <div class="book__label">2. Час</div>
        <div class="book__slots" id="bookSlots" role="radiogroup" aria-label="Час"></div>
        <div class="book__label">3. Устройство и проблем</div>
        <div class="two">
          <label class="field"><span>Марка и модел *</span><input class="input" name="model" required placeholder="напр. iPhone 15 Pro"></label>
          <label class="field"><span>Проблем *</span><select class="select" name="problem">${window.REPAIRS.map((r) => `<option>${esc(r.title)}</option>`).join("")}<option>Друго / не знам</option></select></label>
        </div>
        <label class="field"><span>Кратко описание</span><input class="input" name="msg" placeholder="напр. спукан екран, тъчът работи"></label>
        <div class="two">
          <label class="field"><span>Име *</span><input class="input" name="name" required autocomplete="name"></label>
          <label class="field"><span>Телефон *</span><input class="input" name="phone" type="tel" required pattern="\\+?[0-9 ]{6,}" autocomplete="tel"></label>
        </div>
        <label class="field"><span>Имейл <small class="muted">(по избор – за потвърждение и напомняне ден преди часа)</small></span><input class="input" name="email" type="email" autocomplete="email"></label>
        <label class="check check--consent"><input type="checkbox" name="ok" required><span>Прочетох <a href="#/legal/privacy" target="_blank">информацията за личните данни</a>. *</span></label>
        <button class="btn btn--primary btn--block" type="submit">${icon("clock")} Запази часа</button>
        <p class="book__msg small" aria-live="polite"></p>
      </form>
    </div>`;
  }
  function initBooking() {
    const f = $("#bookForm");
    if (!f) return;
    const draw = async () => {
      const day = f.day.value, box = $("#bookSlots");
      if (!day) { box.innerHTML = `<p class="muted small">Няма свободни дни в близките седмици – обади се на ${esc(S.phone)}.</p>`; return; }
      const slots = slotsFor(new Date(day + "T00:00"));
      box.innerHTML = slots.map((t) => `<label class="bslot"><input type="radio" name="time" value="${t}"><span>${t}</span></label>`).join("");
      try {
        const r = await fetch(`/api/orders?slots=${day}`);
        if (r.ok && f.day.value === day) {
          const { taken } = await r.json();
          taken.forEach((t) => { const i = box.querySelector(`input[value="${t}"]`); if (i) { i.disabled = true; i.closest("label").title = "Зает час"; } });
        }
      } catch {}
    };
    f.addEventListener("change", (e) => { if (e.target.name === "day") draw(); });
    draw();
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = f.querySelector(".book__msg");
      if (!f.time || !f.querySelector("[name=time]:checked")) { msg.textContent = "Избери час."; return; }
      if (!f.reportValidity()) return;
      const fd = Object.fromEntries(new FormData(f));
      const when = `${fd.day}T${fd.time}`;
      const whenTxt = new Date(when).toLocaleString("bg-BG", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
      const ref = refNo("R");
      const text = [`Записан час за сервиз № ${ref}`, `Час: ${whenTxt}`, `Устройство: ${fd.model}`, `Проблем: ${fd.problem}`, fd.msg ? `Описание: ${fd.msg}` : false, "",
        `Име: ${fd.name}`, `Телефон: ${fd.phone}`].filter((x) => x !== false).join("\n");
      const btn = f.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "Записване…";
      let res, data = {};
      try {
        res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "repair", ref, appointment: when, title: `Час ${fd.day.slice(8)}.${fd.day.slice(5, 7)} ${fd.time} – ${fd.problem}`, device: fd.model, text,
            customer: { name: fd.name, phone: fd.phone, email: fd.email || "" } }) });
        data = await res.json();
      } catch {}
      if (res?.status === 409) { btn.disabled = false; btn.innerHTML = `${icon("clock")} Запази часа`; msg.textContent = "Току-що някой зае този час – избери друг."; draw(); return; }
      if (!res?.ok) {
        btn.disabled = false; btn.innerHTML = `${icon("clock")} Запази часа`;
        msg.innerHTML = `Не успяхме да запишем часа. Обади се на <a href="tel:${tel}">${esc(S.phone)}</a> или <a href="${mailto("Час за сервиз " + ref, text)}">изпрати по имейл</a>.`;
        return;
      }
      track("Записан час за сервиз");
      const r2 = data.ref || ref;
      store.set("orders", [...store.get("orders", []), { num: r2, phone: fd.phone, date: new Date().toISOString(), text }].slice(-20));
      f.outerHTML = `<div class="form-card success">
        <div class="success__check">${icon("check")}</div>
        <h2>Часът е запазен</h2>
        <p><b>${esc(whenTxt)}</b></p>
        <p class="muted">Номер: <b>${r2}</b>. Ще ти се обадим на ${esc(fd.phone)} за потвърждение. Адрес: ${esc(S.address)}.</p>
        <div class="row-btns"><a class="btn btn--ghost" href="${trackLink(r2, fd.phone)}">${icon("search")} Проследи</a>
        <a class="btn btn--ghost" href="${esc(S.maps)}" target="_blank" rel="noopener">${icon("pin")} Упътване</a></div>
      </div>`;
    });
  }

  /* ================= ПРАВНИ СТРАНИЦИ ================= */
  const LEGAL_ORDER = [["terms", "Общи условия"], ["delivery", "Доставка и плащане"], ["returns", "Гаранция и връщане"], ["privacy", "Поверителност"], ["cookies", "Бисквитки и локални настройки"]];
  function pageLegal(key, anchor) {
    const base = LEGAL[key];
    if (!base) return pageNotFound();
    const d = { ...base, sections: [...base.sections, ...extraLegal(key)] };
    setTitle(d.title);
    const sid = (i) => `s${i + 1}`;
    view.innerHTML = `<section class="container page">
      ${crumbs([[d.title]])}
      <div class="legal">
        <aside class="legal__nav">
          <nav aria-label="Правна информация">${LEGAL_ORDER.filter(([k]) => LEGAL[k]).map(([k, n]) => `<a href="#/legal/${k}" class="${k === key ? "active" : ""}">${esc(n)}</a>`).join("")}</nav>
          <div class="legal__toc"><h4>На тази страница</h4>${d.sections.map((s, i) => `<a href="#/legal/${key}#${sid(i)}">${esc(s.h)}</a>`).join("")}</div>
        </aside>
        <article class="legal__body">
          <h1>${esc(d.title)}</h1><p class="lead muted">${esc(d.intro)}</p>
          ${d.sections.map((s, i) => `<section id="${sid(i)}"><h2>${esc(s.h)}</h2>${s.p.map((x) => `<p>${esc(x)}</p>`).join("")}</section>`).join("")}
          <div class="help-box"><b>Нужда от съдействие?</b><a href="mailto:${esc(S.email)}">${esc(S.email)}</a><a href="tel:${tel}">${esc(S.phone)}</a></div>
        </article>
      </div>
    </section>`;
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
  }

  function extraLegal(key) {
    const A = window.ANALYTICS || {}, out = [];
    const names = { plausible: "Plausible Analytics", umami: "Umami", goatcounter: "GoatCounter", cloudflare: "Cloudflare Web Analytics" };
    if (A.provider && names[A.provider] && (key === "cookies" || key === "privacy")) {
      out.push({ h: "Анонимна статистика", p: [`Използваме ${names[A.provider]} за обобщена статистика на посещенията (брой разглеждания, страници, вид устройство и държава). Услугата не използва бисквитки и не създава профил на посетителя. Отчитат се и обобщени действия като добавяне в количката, изпратена заявка или запитване, без лични данни.`] });
    }
    if (S.aiChat && key === "privacy") {
      out.push({ h: "AI асистент в чата", p: ["Ако пишете в чата на сайта, въпросите и последните съобщения от разговора се изпращат през сървъра на сайта към Anthropic (модел Claude) само за да бъде генериран отговор. Не въвеждайте в чата лични данни като ЕГН, пароли или данни от карти. При поръчки и конкретни въпроси асистентът Ви насочва към служител."] });
    }
    return out;
  }

  function pageNotFound() {
    setTitle("Страницата не е намерена");
    view.innerHTML = `<section class="container page"><div class="empty"><h1>404</h1><p>Страницата не е намерена.</p><a class="btn btn--primary" href="#/">Към началото</a></div></section>`;
  }

  /* ================= КОЛИЧКА ================= */
  const lineInfo = (l) => BY_ID.get(l.id);
  const varLabel = (v) => [v.model && "за " + v.model, v.storage, v.ram && v.ram + " RAM", v.color, v.conn].filter(Boolean).join(" · ");
  const cartLines = () => state.cart.filter((l) => lineInfo(l) && lineInfo(l).v.price != null);
  let OFFICES = null, officesPromise = null;
  const subtotal = () => cartLines().reduce((s, l) => s + lineInfo(l).v.price * l.qty, 0);

  function flyToCart(src) {
    const img = src && (src.closest(".card")?.querySelector(".card__media img") || src.closest(".qv")?.querySelector("#qvImg") || (src.closest("#pdBuy,#stickyBuy") && $("#pdImg")));
    const target = [$("#cartBtn"), $("#tabCart")].find((el) => el && el.offsetParent !== null);
    if (!img || !target || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
    const f = img.cloneNode();
    Object.assign(f.style, { position: "fixed", left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px", zIndex: 300, pointerEvents: "none", objectFit: "contain", mixBlendMode: "multiply", borderRadius: "20px" });
    document.body.appendChild(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    f.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx * 0.6}px, ${dy * 0.35 - 80}px) scale(.55)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0.4 }],
      { duration: 750, easing: "cubic-bezier(.5,0,.2,1)" }).onfinish = () => { f.parentNode && f.parentNode.removeChild(f); bump(target === $("#cartBtn") ? "#cartBtn" : "#tabCart"); };
  }

  function addToCart(id, src) {
    const info = BY_ID.get(+id);
    if (!info || info.v.price == null) return;
    flyToCart(src);
    const l = state.cart.find((x) => x.id === +id);
    if (l) l.qty++; else state.cart.push({ id: +id, qty: 1 });
    saveState("cart"); renderCart();
    track("Добавяне в количката");
    toast(`✓ ${info.p.name} е добавен в количката`, "#cart", "Виж количката");
  }

  function renderCart() {
    const lines = cartLines();
    const n = lines.reduce((s, l) => s + l.qty, 0);
    setCount("#cartCount", n);
    if (!n) {
      $("#cartItems").innerHTML = `<div class="drawer__empty"><div class="big">🛍️</div><p>Количката е празна.</p><a href="#/c/phones" class="btn btn--primary">Към телефоните</a></div>`;
      $("#cartFoot").innerHTML = "";
      return;
    }
    $("#cartItems").innerHTML = lines.map((l) => {
      const { p, v } = lineInfo(l);
      return `<div class="line">
        <a class="line__img" href="#/p/${p.slug}${v !== p.def ? "?v=" + v.id : ""}">${imgTag(v.img, p.name)}</a>
        <div class="line__mid"><a class="line__name" href="#/p/${p.slug}${v !== p.def ? "?v=" + v.id : ""}">${esc(p.name)}</a><div class="line__var">${esc(varLabel(v))}</div>
          <div class="qty"><button data-dec="${l.id}" aria-label="Намали">−</button><span>${l.qty}</span><button data-inc="${l.id}" aria-label="Увеличи">+</button></div></div>
        <div class="line__right"><b>${eur(v.price * l.qty, true)}</b><button class="link-btn" data-rm="${l.id}">Премахни</button></div>
      </div>`;
    }).join("");
    const mks = new Set(lines.map((l) => lineInfo(l).p.mk).filter(Boolean));
    const inCart = new Set(lines.map((l) => lineInfo(l).p));
    if (mks.size) {
      const pool = PRODUCTS.filter((x) => x.min != null && !inCart.has(x) && (x.compat || []).some((k) => mks.has(k)));
      const bySub = new Map();
      pool.sort((a, b) => a.min - b.min).forEach((x) => { if (!bySub.has(x.sub)) bySub.set(x.sub, x); });
      const picks = [...bySub.values()].slice(0, 6);
      if (picks.length) $("#cartItems").insertAdjacentHTML("beforeend", `<div class="xsell"><h4>Добави към поръчката</h4>
        <div class="xsell__list">${picks.map((x) => `<div class="xsell__item"><a href="#/p/${x.slug}" class="xsell__img">${imgTag(x.img, x.name)}</a>
          <a href="#/p/${x.slug}" class="xsell__name">${esc(x.sub)}<small>${esc(x.name)}</small></a><b>${eur(x.min)}</b>
          <button class="icon-btn icon-btn--sm" data-add="${x.def.id}" aria-label="Добави ${esc(x.name)}">${icon("plus")}</button></div>`).join("")}</div></div>`);
    }
    $("#cartFoot").innerHTML = `
      <div class="row"><span class="muted">Стоки (${n})</span><b>${eur(subtotal(), true)}</b></div>
      <p class="muted small">Вземане от магазина е без такса. За куриер таксата се уточнява преди потвърждение.</p>
      <button class="btn btn--primary btn--block btn--lg" id="checkoutBtn">Към поръчката ${icon("arrow")}</button>`;
  }

  /* ---------- поръчка ---------- */
  function openCheckout() {
    if (!cartLines().length) return;
    closeDrawers();
    openModal(`<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
      <form class="checkout" id="checkoutForm">
        <h2>Заявка за поръчка</h2>
        <fieldset><legend>1. Данни за контакт</legend>
          <div class="two"><label class="field"><span>Име и фамилия *</span><input class="input" name="name" required autocomplete="name"></label>
          <label class="field"><span>Телефон *</span><input class="input" name="phone" type="tel" required pattern="\\+?[0-9 ]{6,}" title="Само цифри, напр. 0888 123 456" autocomplete="tel"></label></div>
          <label class="field"><span>Имейл <small class="muted">(по избор – ще получиш потвърждение и статуса)</small></span><input class="input" name="email" type="email" autocomplete="email"></label>
        </fieldset>
        <fieldset><legend>2. Получаване</legend>
          <div class="radio-cards">
            <label class="radio-card"><input type="radio" name="recv" value="pickup" checked><b>${icon("store")} От магазина</b><small>Без такса · Гоце Делчев</small></label>
            <label class="radio-card"><input type="radio" name="recv" value="Еконт"><b>${icon("truck")} Еконт</b><small>До офис или адрес</small></label>
            <label class="radio-card"><input type="radio" name="recv" value="Спиди"><b>${icon("truck")} Спиди</b><small>До офис или адрес</small></label>
          </div>
          <div id="courierFields" hidden>
            <div class="seg"><label><input type="radio" name="dest" value="office" checked><span>До офис</span></label><label><input type="radio" name="dest" value="address"><span>До адрес</span></label></div>
            <div id="officeBox" hidden>
              <label class="field"><span>Офис или Еконтомат *</span><input class="input" id="officeQ" placeholder="Търси по град, квартал или улица" autocomplete="off"></label>
              <div class="office-pick" id="officePick" hidden></div>
              <div class="office-list" id="officeList" role="listbox" aria-label="Офиси на Еконт"></div>
            </div>
            <div class="two" id="addrFields"><label class="field"><span>Населено място *</span><input class="input" name="city" autocomplete="address-level2"></label>
            <label class="field"><span id="addrLbl">Офис на куриера *</span><input class="input" name="addr" autocomplete="street-address"></label></div>
            <p class="small" id="speedyHint" hidden><a class="link" href="https://www.speedy.bg/bg/speedy-offices" target="_blank" rel="noopener">Намери офис на Спиди →</a> и впиши името или адреса му.</p>
          </div>
          <p class="muted small" id="recvNote"></p>
        </fieldset>
        <fieldset><legend>3. Плащане</legend><div class="radio-cards" id="payCards"></div></fieldset>
        <label class="field"><span>Бележка към поръчката</span><textarea class="input" name="note" rows="2"></textarea></label>
        <div class="promo-row"><input class="input" id="promoIn" placeholder="Промо код" autocapitalize="characters" autocomplete="off" aria-label="Промо код">
          <button type="button" class="btn btn--ghost" id="promoBtn">Приложи</button></div>
        <p class="small promo-msg" id="promoMsg" aria-live="polite"></p>
        <div class="summary" id="sum"></div>
        <label class="check check--consent"><input type="checkbox" required><span>Съгласен/на съм с <a href="#/legal/terms" target="_blank">общите условия</a> и <a href="#/legal/privacy" target="_blank">политиката за поверителност</a>. *</span></label>
        <button class="btn btn--primary btn--block btn--lg" type="submit">Изпрати заявка за поръчка</button>
        <p class="muted small center">Магазинът потвърждава наличността, сумата и срока преди изпълнение.</p>
      </form>`);
    const f = $("#checkoutForm");
    let lastCourier = null, promo = null, office = null;
    const promoDisc = (sub) => {
      if (!promo) return 0;
      const elig = cartLines().reduce((s, l) => { const { p, v } = lineInfo(l); return s + (promo.scope === "all" || p.cat === promo.scope ? v.price * l.qty : 0); }, 0);
      if (!elig || sub < promo.min) return 0;
      return Math.round(Math.min(elig, promo.kind === "fixed" ? promo.value : elig * promo.value / 100) * 100) / 100;
    };
    const upd = () => {
      const recv = f.recv.value, courier = recv !== "pickup", dest = f.dest.value;
      const econtOffice = recv === "Еконт" && dest === "office";
      $("#courierFields").hidden = !courier;
      $("#officeBox").hidden = !econtOffice;
      $("#addrFields").hidden = econtOffice;
      $("#speedyHint").hidden = !(recv === "Спиди" && dest === "office");
      f.city.required = f.addr.required = courier && !econtOffice;
      if (econtOffice && !OFFICES) loadOffices();
      $("#addrLbl").textContent = dest === "office" ? "Офис на куриера *" : "Адрес (улица, №, вх., ап.) *";
      $("#recvNote").textContent = courier
        ? "Това не генерира автоматично товарителница. Магазинът потвърждава възможността, таксата и очаквания срок за конкретната доставка."
        : `Вземане от ${S.address} след потвърждение, че избраната конфигурация е готова.`;
      if (lastCourier !== courier) {
        const pays = courier ? [["Наложен платеж", "Плащане при получаване"]] : [["Плащане в магазина", "При вземане на място"]];
        $("#payCards").innerHTML = pays.map(([v, s], i) => `<label class="radio-card"><input type="radio" name="pay" value="${v}" ${i === 0 ? "checked" : ""}><b>${v}</b><small>${s}</small></label>`).join("");
        lastCourier = courier;
      }
      const sub = subtotal(), disc = promoDisc(sub);
      const fee = !courier ? 0 : dest === "office" ? S.deliveryOffice : S.deliveryAddress;
      if (promo) $("#promoMsg").innerHTML = disc ? `✓ Код <b>${esc(promo.code)}</b>: −${eur(disc, true)}${promo.title ? ` · ${esc(promo.title)}` : ""}`
        : `Код <b>${esc(promo.code)}</b> важи ${promo.min ? `при поръчка над ${eur(promo.min, true)}` : ""}${promo.scope !== "all" ? ` за ${esc((CAT_NAMES[promo.scope] || "").toLowerCase())}` : ""}.`;
      $("#sum").innerHTML = `
        ${cartLines().map((l) => { const { p, v } = lineInfo(l); return `<div class="row small"><span>${esc(p.name)}${varLabel(v) ? ` <span class="muted">(${esc(varLabel(v))})</span>` : ""} × ${l.qty}</span><span>${eur(v.price * l.qty, true)}</span></div>`; }).join("")}
        <hr><div class="row"><span class="muted">Стоки</span><span>${eur(sub, true)}</span></div>
        ${disc ? `<div class="row promo-line"><span>Отстъпка (${esc(promo.code)})</span><span>−${eur(disc, true)}</span></div>` : ""}
        <div class="row"><span class="muted">Доставка</span><span>${fee === 0 ? "Без такса" : fee == null ? "Предстои уточняване" : eur(fee, true)}</span></div>
        <div class="row row--total"><span>Общо${fee == null ? " <small class=\"muted\">(без доставка)</small>" : ""}</span><span>${eur(sub - disc + (fee || 0), true)}</span></div>`;
      return { courier, fee, sub, disc, econtOffice };
    };
    f.addEventListener("change", (e) => { if (e.target.id !== "officeQ" && e.target.id !== "promoIn") upd(); });
    upd();

    // промо код
    const applyPromo = async () => {
      const code = $("#promoIn").value.trim().toUpperCase();
      if (!code) { promo = null; $("#promoMsg").textContent = ""; return upd(); }
      $("#promoBtn").disabled = true;
      let r = null;
      try { r = await fetch(`/api/orders?promo=${encodeURIComponent(code)}`); } catch {}
      $("#promoBtn").disabled = false;
      if (r && r.ok) { promo = await r.json(); track("Промо код"); }
      else { promo = null; $("#promoMsg").textContent = r && r.status === 404 ? "Този код не е валиден или е изтекъл." : "Кодът не може да се провери в момента."; }
      upd();
    };
    $("#promoBtn").addEventListener("click", applyPromo);
    $("#promoIn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } });

    // офиси на Еконт
    const showOffices = () => {
      const list = OFFICES || [], q = norm($("#officeQ").value).trim();
      const toks = q.split(/\s+/).filter(Boolean);
      const hits = !toks.length ? [] : list.filter((o) => { const t = norm(`${o[2]} ${o[1]} ${o[4]} ${o[3]}`); return toks.every((x) => t.includes(x)); })
        .sort((a, b) => (norm(a[2]).startsWith(toks[0]) ? 0 : 1) - (norm(b[2]).startsWith(toks[0]) ? 0 : 1)).slice(0, 40);
      $("#officeList").innerHTML = !OFFICES ? `<p class="muted small">Зареждане на офисите…</p>`
        : !toks.length ? `<p class="muted small">Започни да пишеш – напр. „Гоце Делчев“ или „София Младост“.</p>`
        : hits.length ? hits.map((o) => `<button type="button" class="office" data-office="${esc(o[0])}" role="option">
            <b>${esc(o[1])}</b>${o[5] === "a" ? ' <span class="office__aps">Еконтомат</span>' : ""}<small>${esc(o[2])}${o[4] ? ", " + esc(o[4]) : ""}</small></button>`).join("")
        : `<p class="muted small">Няма намерени офиси. Опитай само с името на града.</p>`;
    };
    const pickOffice = (o) => {
      office = o;
      $("#officePick").hidden = !o; $("#officeQ").closest(".field").hidden = !!o; $("#officeList").hidden = !!o;
      if (o) $("#officePick").innerHTML = `${icon("pin")}<span><b>Еконт ${esc(o[1])}</b>${o[5] === "a" ? " (Еконтомат)" : ""}<small>${esc(o[2])}${o[4] ? ", " + esc(o[4]) : ""}</small></span><button type="button" class="link-btn" id="officeChange">Смени</button>`;
    };
    function loadOffices() {
      if (OFFICES) return showOffices();
      showOffices();
      (officesPromise ||= fetch("assets/offices-econt.json").then((r) => r.json()).then((d) => (OFFICES = d.offices)).catch(() => (OFFICES = [])))
        .then(() => { if (!OFFICES.length) { $("#officeBox").hidden = true; $("#addrFields").hidden = false; f.city.required = f.addr.required = true; } else showOffices(); });
    }
    $("#officeQ").addEventListener("input", showOffices);
    $("#officeBox").addEventListener("click", (e) => {
      const b = e.target.closest("[data-office]");
      if (b) pickOffice(OFFICES.find((o) => o[0] === b.dataset.office));
      if (e.target.closest("#officeChange")) { pickOffice(null); $("#officeQ").focus(); showOffices(); }
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { courier, fee, sub, disc, econtOffice } = upd();
      if (econtOffice && !office) { $("#officeQ").focus(); $("#officeList").innerHTML = `<p class="small promo-msg">Избери офис на Еконт от списъка.</p>`; return; }
      if (promo) {
        const r = await fetch(`/api/orders?promo=${encodeURIComponent(promo.code)}`).catch(() => null);
        if (r && r.status === 404) { promo = null; upd(); $("#promoMsg").textContent = "Промо кодът вече не е валиден – провери новата сума."; return; }
      }
      const fd = Object.fromEntries(new FormData(f));
      const num = refNo("GD");
      const items = cartLines().map((l) => { const { p, v } = lineInfo(l); return `• ${p.name}${varLabel(v) ? ` (${varLabel(v)})` : ""} – арт. ${v.id} × ${l.qty} = ${eur(v.price * l.qty, true)}`; });
      const recvTxt = econtOffice ? `Еконт, до офис: ${office[1]}${office[5] === "a" ? " (Еконтомат)" : ""} [код ${office[0]}], ${office[2]}${office[4] ? ", " + office[4] : ""}`
        : courier ? `${fd.recv}, ${fd.dest === "office" ? "до офис" : "до адрес"}: ${fd.city}, ${fd.addr}` : `Вземане от магазина (${S.address})`;
      const total = Math.round((sub - disc + (fee || 0)) * 100) / 100;
      const text = [`Заявка за поръчка № ${num}`, "", ...items, "", `Стоки: ${eur(sub, true)}`, disc ? `Отстъпка (код ${promo.code}): −${eur(disc, true)}` : false,
        `Доставка: ${fee === 0 ? "без такса" : fee == null ? "предстои уточняване" : eur(fee, true)}`, `Общо: ${eur(total, true)}`, "",
        `Клиент: ${fd.name}`, `Телефон: ${fd.phone}`, fd.email ? `Имейл: ${fd.email}` : false, `Получаване: ${recvTxt}`, `Плащане: ${fd.pay}`,
        fd.note ? `Бележка: ${fd.note}` : false].filter((x) => x !== false).join("\n");
      const btn = f.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "Изпращане…";
      track("Изпратена заявка за поръчка");
      const sent = await sendToStore(`Нова поръчка ${num} – ${eur(total, true)}`, text, {
        type: "order", ref: num, title: `${cartLines().length} продукт(а) – ${eur(total, true)}`, ...(disc ? { promo: promo.code, discount: disc } : {}),
        customer: { name: fd.name, phone: fd.phone, email: fd.email || "" },
        items: cartLines().map((l) => { const { p, v } = lineInfo(l); return { id: v.id, name: p.name, variant: varLabel(v), qty: l.qty, price: v.price }; }),
        total, delivery: recvTxt, payment: fd.pay });
      const ref = typeof sent === "string" ? sent : num;
      const orders = store.get("orders", []);
      orders.push({ num: ref, phone: fd.phone, date: new Date().toISOString(), text });
      store.set("orders", orders.slice(-20));
      state.cart = []; saveState("cart"); renderCart();
      $("#modalBox").innerHTML = `<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
        <div class="success">
          <div class="success__check">${icon("check")}</div>
          <h2>Благодарим, ${esc(fd.name.split(" ")[0])}!</h2>
          <p>Номер на заявката: <b>${ref}</b></p>
          ${sent
            ? `<p class="muted">Заявката е получена. Ще се свържем с теб на <b>${esc(fd.phone)}</b>, за да потвърдим наличността, сумата и срока.</p>
               <div class="row-btns"><button class="btn btn--primary" data-close>Продължи пазаруването</button>
               ${typeof sent === "string" ? `<a class="btn btn--ghost" href="${trackLink(ref, fd.phone)}">${icon("search")} Проследи поръчката</a>` : ""}</div>`
            : `<p class="muted">Остава една стъпка – изпрати заявката, за да я получим:</p>
               <div class="row-btns"><a class="btn btn--primary" href="${mailto(`Поръчка ${num}`, text)}">${icon("mail")} Изпрати заявката</a>
               <a class="btn btn--ghost" href="tel:${tel}">${icon("phone")} Обади се</a></div>
               <p class="muted small">Или се обади на ${esc(S.phone)} и кажи номера на заявката.</p>`}
        </div>`;
    });
  }

  /* ---------- изпращане ---------- */
  function refNo(prefix) {
    const d = new Date();
    return `${prefix}-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  // Връща номера (string), когато заявката е записана в магазина, true – при Formspree, false – ако не е изпратена.
  async function sendToStore(subject, text, data) {
    try {
      const r = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, text }), signal: AbortSignal.timeout?.(8000),
      });
      if (r.ok) { const j = await r.json(); if (j.ok) return j.ref || true; }
    } catch {}
    if (!S.orderEndpoint) return false;
    try {
      const r = await fetch(S.orderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ _subject: subject, message: text, ...data }),
      });
      return r.ok;
    } catch { return false; }
  }
  const trackLink = (ref, phone) => `#/track?ref=${encodeURIComponent(ref)}&phone=${String(phone || "").replace(/\D/g, "").slice(-4)}`;

  /* ================= ПРОСЛЕДЯВАНЕ ================= */
  function pageTrack(q) {
    setTitle("Проследи поръчка или ремонт");
    const mine = store.get("orders", []).filter((o) => o.phone).slice(-3).reverse();
    view.innerHTML = `<section class="container page">
      ${crumbs([["Проследяване"]])}
      <div class="svc-grid">
        <div>
          <h1>Проследи поръчка или ремонт</h1>
          <p class="muted">Въведи номера, който получи (напр. GD-261124-1234 или R-261124-1234), и последните 4 цифри от телефона, с който е направена заявката.</p>
          ${mine.length ? `<div class="track-mine"><b class="small">Твоите последни заявки</b>${mine.map((o) => `<a class="chip" href="${trackLink(o.num, o.phone)}">${esc(o.num)}</a>`).join("")}</div>` : ""}
          <div class="info-cards">
            <div class="info-card">${icon("phone")}<div><b>Имаш въпрос?</b><p class="muted">Обади се на <a href="tel:${tel}">${esc(S.phone)}</a> и кажи номера на заявката.</p></div></div>
          </div>
        </div>
        <div>
          <form class="form-card" id="trackForm">
            <h2>Статус на заявка</h2>
            <label class="field"><span>Номер *</span><input class="input" name="ref" required value="${esc(q.get("ref") || "")}" placeholder="GD-261124-1234" autocapitalize="characters"></label>
            <label class="field"><span>Последни 4 цифри от телефона *</span><input class="input" name="phone" required inputmode="numeric" pattern="\\d{4}" maxlength="4" value="${esc(q.get("phone") || "")}" placeholder="3338"></label>
            <button class="btn btn--primary btn--block" type="submit">${icon("search")} Провери статуса</button>
          </form>
          <div id="trackRes" aria-live="polite"></div>
        </div>
      </div>
    </section>`;
    const f = $("#trackForm");
    f.addEventListener("submit", (e) => { e.preventDefault(); lookup(); });
    if (q.get("ref") && q.get("phone")) lookup();
    async function lookup() {
      const ref = f.ref.value.trim().toUpperCase(), phone = f.phone.value.replace(/\D/g, "");
      const out = $("#trackRes");
      if (!ref || phone.length !== 4) { out.innerHTML = `<p class="muted">Въведи номера и 4 цифри от телефона.</p>`; return; }
      out.innerHTML = `<p class="muted">Проверка…</p>`;
      let res, data;
      try { res = await fetch(`/api/orders?ref=${encodeURIComponent(ref)}&phone=${phone}`); data = await res.json(); } catch {}
      if (!res || !res.ok) {
        out.innerHTML = `<div class="form-card"><p><b>${res?.status === 404 ? "Не открихме заявка с тези данни." : res?.status === 429 ? "Твърде много опити. Опитай пак след малко." : "Проследяването не е достъпно в момента."}</b></p>
          <p class="muted small">Провери номера и цифрите или се обади на <a href="tel:${tel}">${esc(S.phone)}</a>.</p></div>`;
        return;
      }
      track("Проследяване");
      const d = (s) => new Date(s).toLocaleString("bg-BG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const kind = data.type === "order" ? "Поръчка" : data.type === "repair" ? "Ремонт" : "Запитване";
      const done = ["done", "cancelled"].includes(data.status);
      out.innerHTML = `<div class="form-card track-card">
        <div class="track-card__head"><span class="muted small">${kind} ${esc(data.ref)}</span>
          <span class="track-status track-status--${esc(data.status)}">${esc(data.statusLabel)}</span></div>
        ${data.items?.length ? `<ul class="track-items">${data.items.map((i) => `<li>${esc(i.name)}${i.variant ? ` <span class="muted">(${esc(i.variant)})</span>` : ""} × ${i.qty}</li>`).join("")}</ul>` : ""}
        ${data.appointment ? `<p class="small"><span class="muted">Час в сервиза:</span> <b>${esc(new Date(data.appointment).toLocaleString("bg-BG", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }))}</b></p>` : ""}
        ${data.device ? `<p class="small"><span class="muted">Устройство:</span> ${esc(data.device)}</p>` : ""}
        ${data.total != null ? `<p class="small"><span class="muted">Сума:</span> <b>${eur(data.total, true)}</b></p>` : ""}
        ${data.delivery ? `<p class="small"><span class="muted">Получаване:</span> ${esc(data.delivery)}</p>` : ""}
        ${data.tracking ? `<p class="small"><span class="muted">Товарителница:</span> <b>${esc(data.tracking)}</b></p>` : ""}
        <ol class="track-steps">${data.history.slice().reverse().map((h, i) => `<li class="${i === 0 && !done ? "now" : ""}"><b>${esc(h.label)}</b><span class="muted small">${d(h.at)}</span>${h.note ? `<p class="small">${esc(h.note)}</p>` : ""}</li>`).join("")}</ol>
      </div>`;
    }
  }

  const mailto = (subject, text) => `mailto:${S.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  /* ---------- любими и сравнение ---------- */
  function toggleFav(slug) {
    const i = state.favs.indexOf(slug);
    if (i > -1) state.favs.splice(i, 1);
    else { state.favs.unshift(slug); toast("♥ Добавено в любими"); bump("#favBtn"); }
    saveState("favs"); renderFavs(); syncButtons();
  }
  function toggleCompare(slug) {
    const i = state.compare.indexOf(slug);
    if (i > -1) state.compare.splice(i, 1);
    else {
      if (state.compare.length >= 4) return toast("Може да сравняваш до 4 модела", "#/compare", "Към сравнението");
      state.compare.push(slug);
      toast(`⇄ Добавено за сравнение (${state.compare.length})`, "#/compare", "Сравни");
    }
    saveState("compare"); setCount("#cmpCount", state.compare.length); syncButtons();
    if (parseRoute().parts[0] === "compare") pageCompare();
  }
  function syncButtons() {
    $$("[data-fav]").forEach((b) => { const on = isFav(b.dataset.fav); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    $$("[data-cmp]").forEach((b) => b.classList.toggle("on", inCmp(b.dataset.cmp)));
    const r = parseRoute();
    if (r.parts[0] === "p" && BY_SLUG.get(r.parts[1])) syncProductTools(BY_SLUG.get(r.parts[1]));
  }
  function renderFavs() {
    setCount("#favCount", state.favs.length);
    const list = state.favs.map((s) => BY_SLUG.get(s)).filter(Boolean);
    $("#favItems").innerHTML = list.length
      ? list.map((p) => `<div class="line">
          <a class="line__img" href="#/p/${p.slug}">${imgTag(p.img, p.name)}</a>
          <div class="line__mid"><a class="line__name" href="#/p/${p.slug}">${esc(p.name)}</a><div class="line__var">${p.min == null ? "Цена при запитване" : (p.variants.length > 1 ? "от " : "") + eur(p.min)}</div></div>
          <div class="line__right"><a class="btn btn--primary btn--sm" href="#/p/${p.slug}">Виж</a><button class="link-btn" data-fav="${p.slug}">Премахни</button></div>
        </div>`).join("")
      : `<div class="drawer__empty"><div class="big">♡</div><p>Още нямаш любими продукти.</p></div>`;
  }
  function setCount(sel, n) {
    [sel, sel === "#cartCount" ? "#cartCount2" : null].filter(Boolean).forEach((x) => { const c = $(x); if (c) { c.textContent = n; c.dataset.zero = n === 0; } });
  }

  /* ---------- търсене с подсказки ---------- */
  function saveSearch(q) { store.set("searches", [q, ...store.get("searches", []).filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6)); }
  let openSearch = () => {}, closeSearch = () => {};
  function initSearch() {
    const inp = $("#searchInput"), box = $("#suggest"), hdr = $("#header"), tgl = $("#searchToggle");
    let idx = -1;
    openSearch = () => {
      hdr.classList.add("is-search"); tgl.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => inp.focus());
    };
    closeSearch = () => {
      if (!hdr.classList.contains("is-search")) return;
      hdr.classList.remove("is-search"); tgl.setAttribute("aria-expanded", "false");
      box.hidden = true; inp.blur();
    };
    tgl.addEventListener("click", () => (hdr.classList.contains("is-search") ? closeSearch() : openSearch()));
    $("#searchClose").addEventListener("click", () => { inp.value = ""; closeSearch(); tgl.focus(); });
    const POPULAR = ["iPhone 17 Pro", "Galaxy S26 Ultra", "Xiaomi 17", "Redmi Note 15", "калъф", "протектор", "зарядно", "слушалки"];
    const render = () => {
      const toks = tokens(inp.value);
      if (!toks.length) {
        if (document.activeElement !== inp) { box.hidden = true; return; }
        const rec = store.get("searches", []);
        box.innerHTML = `${rec.length ? `<div class="sug__h">${icon("history")} Последни търсения <button type="button" class="link-btn" data-clear-s>Изчисти</button></div>
          <div class="sug__chips">${rec.map((q) => `<a class="chip" href="#/c/all?q=${encodeURIComponent(q)}">${esc(q)}</a>`).join("")}</div>` : ""}
          <div class="sug__h">${icon("trend")} Популярни</div>
          <div class="sug__chips">${POPULAR.map((q) => `<a class="chip" href="#/c/all?q=${encodeURIComponent(q)}">${esc(q)}</a>`).join("")}</div>`;
        box.hidden = false;
        return;
      }
      const res = PRODUCTS.filter((p) => matches(p, toks)).sort((a, b) => (a.cat === "accessories") - (b.cat === "accessories") || (b.min ?? 0) - (a.min ?? 0));
      idx = -1;
      box.innerHTML = res.length
        ? res.slice(0, 6).map((p) => `<a href="#/p/${p.slug}" class="sug">${imgTag(p.img, "")}<span><b>${esc(p.name)}</b><small>${esc(CAT_NAMES[p.cat])} · ${p.min == null ? "при запитване" : (p.variants.length > 1 ? "от " : "") + eur(p.min)}</small></span></a>`).join("") +
          `<a class="sug sug--all" href="#/c/all?q=${encodeURIComponent(inp.value.trim())}">Всички резултати (${res.length}) →</a>`
        : `<div class="sug sug--none">Няма резултати за „${esc(inp.value)}“</div>`;
      box.hidden = false;
    };
    inp.addEventListener("input", render);
    inp.addEventListener("focus", render);
    inp.addEventListener("keydown", (e) => {
      const items = $$(".sug[href]", box);
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) {
        e.preventDefault();
        idx = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((a, i) => a.classList.toggle("on", i === idx));
      } else if (e.key === "Enter" && idx > -1) { e.preventDefault(); box.hidden = true; go(items[idx].getAttribute("href")); }
      else if (e.key === "Escape") { closeSearch(); tgl.focus(); }
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest("#searchForm, #searchToggle, #tabSearch")) return;
      box.hidden = true;
      if (!inp.value.trim()) closeSearch();
    });
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      if (e.target.closest("[data-clear-s]")) { store.set("searches", []); render(); return; }
      if (e.target.closest("a") && inp.value.trim()) saveSearch(inp.value.trim());
      if (e.target.closest("a")) closeSearch();
    });
    $("#searchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = inp.value.trim();
      if (q) saveSearch(q);
      closeSearch();
      go(q ? `#/c/all?q=${encodeURIComponent(q)}` : "#/c/all");
    });
  }

  /* ---------- модал / чекмеджета ---------- */
  let lastFocus = null;
  function openModal(html, cls = "") {
    lastFocus = document.activeElement;
    const box = $("#modalBox");
    box.className = "modal__box " + cls;
    box.onclick = null; box.onkeydown = null;
    box.innerHTML = html;
    $("#modal").classList.add("open"); $("#modal").setAttribute("aria-hidden", "false");
    document.body.classList.add("lock");
    box.scrollTop = 0;
    setTimeout(() => $(".modal__close", box)?.focus(), 30);
  }
  function closeModal() {
    if (!$("#modal").classList.contains("open")) return;
    $("#modal").classList.remove("open"); $("#modal").setAttribute("aria-hidden", "true");
    if (!$(".drawer.open")) document.body.classList.remove("lock");
    lastFocus?.focus?.({ preventScroll: true });
  }
  function openDrawer(id) {
    closeDrawers(true);
    const d = $("#" + id);
    d.classList.add("open"); d.setAttribute("aria-hidden", "false");
    $("#overlay").hidden = false; document.body.classList.add("lock");
    setTimeout(() => $("[data-close]", d)?.focus(), 50);
  }
  function closeDrawers(keep) {
    $$(".drawer").forEach((d) => { d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); });
    if (!keep) { $("#overlay").hidden = true; if (!$("#modal.open")) document.body.classList.remove("lock"); }
  }

  let toastT;
  function toast(msg, href, label) {
    const t = $("#toast");
    t.innerHTML = esc(msg) + (href ? ` <a href="${href}" ${href === "#cart" ? "data-opencart" : ""}>${esc(label)}</a>` : "");
    t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }
  function bump(sel) { const b = $(sel); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }

  /* ---------- структурирани данни ---------- */
  function setLd(id, obj) {
    let s = document.getElementById(id);
    if (!obj) return s?.remove();
    if (!s) { s = document.createElement("script"); s.type = "application/ld+json"; s.id = id; document.head.appendChild(s); }
    s.textContent = JSON.stringify(obj);
  }
  function setProductLd(p) {
    const priced = p.variants.filter((v) => v.price != null);
    setLd("ld-product", {
      "@context": "https://schema.org", "@type": "Product", name: p.name, brand: { "@type": "Brand", name: p.brand },
      image: new URL(full(p.img), location.href).href, sku: String(p.def.id), category: CAT_NAMES[p.cat],
      ...(priced.length ? { offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: p.min, highPrice: Math.max(...priced.map((v) => v.price)), offerCount: priced.length, availability: "https://schema.org/InStock" } } : {}),
    });
  }

  /* ---------- рутер ---------- */
  function parseRoute() {
    let h = location.hash.slice(1);
    if (!h || !h.startsWith("/")) {
      const m = location.pathname.match(/^\/(p|c|legal)\/([\w-]+)\/?$/) || location.pathname.match(/^\/(service|inquiries|compare|contact|track)\/?$/);
      if (m) h = "/" + m[1] + (m[2] ? "/" + m[2] : "") + location.search; // /p/slug/?v=123 от фийда
    }
    const [pathA, qs] = (h.startsWith("/") ? h : "/").split("?");
    const [path, anchor] = pathA.split("#");
    return { parts: path.split("/").filter(Boolean), q: new URLSearchParams(qs || ""), anchor };
  }
  const routeKey = () => { const r = parseRoute(); return r.parts.join("/") + "?" + r.q; };
  function go(h) { if (location.hash === h) router(); else location.hash = h; }
  let lastPath = null;
  function router() {
    const raw = location.hash.slice(1);
    if (raw === "cart") { history.replaceState(null, "", "#" + (lastPath ? "/" + lastPath.replace(/\?$/, "") : "/")); return openDrawer("cartDrawer"); }
    if (raw && !raw.startsWith("/")) return; // обикновена котва (#view)
    const { parts, q, anchor } = parseRoute();
    const key = routeKey();
    // само котва в същата страница → плавен скрол
    if (anchor && key === lastPath) return document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
    closeModal(); closeDrawers(); closeSearch();
    $("#suggest").hidden = true;
    if (parts[0] !== "p") setLd("ld-product", null);
    if (parts[0] !== "c") { cat = null; $("#searchInput").value = ""; }
    switch (parts[0]) {
      case undefined: pageHome(); break;
      case "contact": pageHome("contact"); break;
      case "c": pageCatalog(parts[1] || "all", q); break;
      case "p": pageProduct(parts[1], q); break;
      case "service": pageService(anchor, q); break;
      case "inquiries": pageInquiries(q); break;
      case "legal": pageLegal(parts[1], anchor); break;
      case "compare": pageCompare(); break;
      case "track": pageTrack(q); break;
      default: pageNotFound();
    }
    if (!anchor && parts[0] !== "contact") window.scrollTo(0, 0);
    lastPath = routeKey();
    reveal();
    setCanonical(parts);
    track("pageview", "/" + parts.join("/"));
    const active = parts[0] === "p" ? BY_SLUG.get(parts[1])?.cat : parts[0] === "c" ? parts[1] : parts[0] || "";
    $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === active));
    const tab = !parts[0] ? "home" : parts[0] === "c" || parts[0] === "p" ? "c" : parts[0];
    $$("[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  }

  /* ---------- canonical адрес за Google ---------- */
  function setCanonical(parts) {
    const base = (S.siteUrl || location.origin).replace(/\/$/, "");
    let href = base + "/";
    if (parts[0] === "p" && BY_SLUG.get(parts[1])) href = `${base}/p/${parts[1]}/`;
    else if (parts[0] === "c" && CAT_NAMES[parts[1]]) href = `${base}/c/${parts[1]}/`;
    else if (parts[0] === "service") href = `${base}/service/`;
    else if (parts[0] === "legal" && LEGAL[parts[1]]) href = `${base}/legal/${parts[1]}/`;
    let l = document.querySelector('link[rel="canonical"]');
    if (!l) { l = document.createElement("link"); l.rel = "canonical"; document.head.appendChild(l); }
    l.href = href;
  }

  /* ---------- анонимна статистика (без бисквитки) ---------- */
  const AN = window.ANALYTICS || {};
  function initAnalytics() {
    if (!AN.provider || !/^https?:$/.test(location.protocol)) return;
    const s = document.createElement("script");
    s.defer = true;
    if (AN.provider === "plausible" && AN.domain) {
      s.src = AN.src || "https://plausible.io/js/script.manual.js";
      s.dataset.domain = AN.domain;
      window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    } else if (AN.provider === "umami" && AN.websiteId) {
      s.src = AN.src || "https://cloud.umami.is/script.js";
      s.dataset.websiteId = AN.websiteId;
      s.dataset.autoTrack = "false";
    } else if (AN.provider === "goatcounter" && AN.code) {
      s.src = "https://gc.zgo.at/count.js";
      s.dataset.goatcounter = `https://${AN.code}.goatcounter.com/count`;
      s.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
    } else if (AN.provider === "cloudflare" && AN.token) {
      s.src = "https://static.cloudflareinsights.com/beacon.min.js";
      s.dataset.cfBeacon = JSON.stringify({ token: AN.token, spa: true });
    } else return;
    document.head.appendChild(s);
  }
  const trackQueue = [];
  function track(name, path) {
    if (!AN.provider) return;
    const url = location.origin + (path || "/");
    try {
      if (AN.provider === "plausible" && window.plausible) {
        name === "pageview" ? window.plausible("pageview", { u: url }) : window.plausible(name);
      } else if (AN.provider === "umami") {
        if (!window.umami) { trackQueue.push([name, path]); if (trackQueue.length === 1) setTimeout(flushTrack, 1500); return; }
        name === "pageview" ? window.umami.track((p) => ({ ...p, url: path })) : window.umami.track(name);
      } else if (AN.provider === "goatcounter") {
        if (!window.goatcounter?.count) { trackQueue.push([name, path]); if (trackQueue.length === 1) setTimeout(flushTrack, 1500); return; }
        name === "pageview" ? window.goatcounter.count({ path }) : window.goatcounter.count({ path: name, title: name, event: true });
      }
    } catch {}
  }
  function flushTrack() { const q = trackQueue.splice(0); q.forEach(([n, p]) => track(n, p)); }

  /* ---------- плавна поява при скрол ---------- */
  const revealObs = "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); revealObs.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px" })
    : null;
  function reveal() {
    if (!revealObs) return;
    $$("#view .section, #view .band, #view .pd-section, #view .why__item, #view .repair").forEach((el) => {
      if (el.getBoundingClientRect().top > innerHeight) { el.classList.add("rv"); revealObs.observe(el); }
    });
  }

  let todayText = () => "";

  /* ---------- статични части ---------- */
  function renderStatic() {
    $$("[data-addr]").forEach((e) => (e.textContent = S.address));
    $$("[data-maps]").forEach((e) => (e.href = S.maps));
    $$("[data-tel]").forEach((e) => { e.href = "tel:" + tel; e.textContent = S.phone; });
    $$("[data-mail]").forEach((e) => { e.href = "mailto:" + S.email; e.textContent = S.email; });
    $$("[data-hours]").forEach((e) => (e.innerHTML = hoursHtml()));
    todayText = () => {
      const d = new Date(), wd = d.getDay();
      const h = S.hours[wd === 0 ? 2 : wd === 6 ? 1 : 0][1];
      const m = h.match(/(\d+):(\d+)\D+(\d+):(\d+)/);
      if (!m) return `<i class="dot"></i>Днес: ${esc(h.toLowerCase())}`;
      const now = d.getHours() * 60 + d.getMinutes(), from = +m[1] * 60 + +m[2], to = +m[3] * 60 + +m[4];
      const open = now >= from && now < to;
      return `<i class="dot ${open ? "dot--on" : ""}"></i>${open ? "Отворено сега" : "Затворено сега"} · днес ${esc(h)}`;
    };
    const tds = $$("[data-today], [data-today2]");
    const tick = () => tds.forEach((e) => (e.innerHTML = todayText()));
    if (tds.length) { tick(); setInterval(tick, 60000); }
    $("[data-tagline]").textContent = S.tagline;
    $("[data-copy]").textContent = `© ${new Date().getFullYear()} GDMobil · ${S.company} · ЕИК ${S.eik}`;
    $("#socials").innerHTML = SOCIAL().map(([k, n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${n}" title="${n}">${socIcon(k)}</a>`).join("");
    $("#footNews").innerHTML = store.get("newsletter", false) ? `<p class="footer__news-ok">${icon("check")} Абониран си за бюлетина.</p>` : newsForm("news-form--foot");
    $("#fab").innerHTML = S.viber ? `<a href="viber://chat?number=%2B${esc(S.viber)}" class="fab__btn fab__viber" aria-label="Пиши ни във Viber">V</a>` : "";
    $("#menuBody").innerHTML = `
      ${window.CATEGORIES.map((c) => `<a href="#/c/${c.key}"><img src="${esc(c.img)}" alt="">${esc(c.name)}</a>`).join("")}
      <hr><a href="#/service">${icon("wrench")} Сервиз и ремонти</a><a href="#/inquiries">${icon("mail")} Запитвания</a>
      <a href="#/compare">${icon("swap")} Сравнение</a><a href="#/contact">${icon("pin")} Контакти</a>
      <button data-open-chat>${icon("mail")} Чат с асистента</button>
      <button id="themeToggle2">${icon("moon")} Тъмна / светла тема</button>
      <hr><a href="#/legal/delivery">Доставка и плащане</a><a href="#/legal/returns">Гаранция и връщане</a><a href="#/legal/terms">Общи условия</a>
      <hr><a href="tel:${tel}"><b>${esc(S.phone)}</b></a><span class="muted small">${esc(S.address)}</span>`;
    setLd("ld-store", {
      "@context": "https://schema.org", "@type": "MobilePhoneStore", name: "GDMobil", telephone: S.phoneIntl, email: S.email,
      address: { "@type": "PostalAddress", streetAddress: "ул. „Солун“ 21", addressLocality: "Гоце Делчев", postalCode: S.postcode, addressCountry: "BG" },
      openingHours: ["Mo-Fr 09:30-18:00", "Sa 10:00-14:00"], sameAs: Object.values(S.social),
    });
  }

  function initTheme() {
    const t = store.get("theme", null);
    if (t) document.documentElement.dataset.theme = t;
    const toggle = () => {
      const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      store.set("theme", next);
    };
    $("#themeToggle").addEventListener("click", toggle);
    document.addEventListener("click", (e) => { if (e.target.closest("#themeToggle2")) toggle(); });
  }

  /* ---------- събития ---------- */
  function bind() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-opencart]")) { e.preventDefault(); return openDrawer("cartDrawer"); }
      if (e.target.closest("[data-open-chat]")) { closeDrawers(); return window.__openChat && window.__openChat(); }
      if (e.target.closest("[data-loadmap]")) {
        $("#map").innerHTML = `<iframe title="Карта – GDMobil, ${esc(S.address)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent("GDMobil, " + S.address)}&z=16&output=embed"></iframe>`;
        return;
      }
      if (e.target.closest("[data-review]")) return openReview();
      const t = e.target.closest("[data-add],[data-qv],[data-fav],[data-cmp],[data-inc],[data-dec],[data-rm],[data-close],[data-reset],[data-unf],[data-expand],#checkoutBtn");
      if (!t) {
        if (e.target.closest(".drawer a[href^='#/']")) closeDrawers();
        return;
      }
      const d = t.dataset;
      if (t.id === "checkoutBtn") return openCheckout();
      if (d.close !== undefined) { closeModal(); closeDrawers(); return; }
      if (d.add) return addToCart(d.add, t);
      if (d.qv) return openQuick(d.qv);
      if (d.fav) return toggleFav(d.fav);
      if (d.cmp) return toggleCompare(d.cmp);
      if (d.expand !== undefined) { t.closest(".fgroup").classList.remove("fgroup--clip"); t.remove(); return; }
      if (d.reset !== undefined && cat) {
        Object.assign(cat, { tags: new Set(), brands: new Set(), mem: new Set(), sub: "", model: "", max: 0, q: "", shown: PAGE });
        if ($("#catSearch")) $("#catSearch").value = "";
        return refreshCatalog();
      }
      if (d.unf && cat) {
        if (d.unf === "tag") cat.tags.delete(d.v);
        else if (d.unf === "brand") cat.brands.delete(d.v);
        else if (d.unf === "mem") cat.mem.delete(d.v);
        else cat[d.unf] = d.unf === "max" ? 0 : "";
        return refreshCatalog();
      }
      const l = state.cart.find((x) => x.id === +(d.inc || d.dec || d.rm));
      if (!l) return;
      if (d.inc) l.qty++;
      if (d.dec && --l.qty <= 0) state.cart = state.cart.filter((x) => x !== l);
      if (d.rm) state.cart = state.cart.filter((x) => x !== l);
      saveState("cart"); renderCart();
    });
    document.addEventListener("change", onFilterChange);
    document.addEventListener("input", (e) => { if (e.target.dataset.f === "max") onFilterChange(e); });
    document.addEventListener("submit", (e) => {
      if (e.target.id === "inqForm") { e.preventDefault(); submitInquiry(e.target); }
      if (e.target.classList.contains("news-form")) { e.preventDefault(); submitNewsletter(e.target); }
    });

    $("#cartBtn").addEventListener("click", () => openDrawer("cartDrawer"));
    $("#tabCart").addEventListener("click", () => openDrawer("cartDrawer"));
    $("#tabSearch").addEventListener("click", () => { closeDrawers(); openSearch(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
    });
    $("#favBtn").addEventListener("click", () => openDrawer("favDrawer"));
    $("#burger").addEventListener("click", () => openDrawer("menuDrawer"));
    $("#overlay").addEventListener("click", () => closeDrawers());
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeDrawers(); } });
    addEventListener("scroll", () => {
      $("#header").classList.toggle("scrolled", scrollY > 30);
      $("#stickyBuy")?.classList.toggle("show", scrollY > 700);
    }, { passive: true });
    addEventListener("hashchange", router);
    addEventListener("storage", (e) => {
      if (!e.key?.startsWith("gdm2_")) return;
      const k = e.key.slice(5);
      if (k in state) { state[k] = store.get(k, []); renderCart(); renderFavs(); setCount("#cmpCount", state.compare.length); }
    });
  }

  /* ---------- старт ---------- */
  initTheme();
  renderStatic();
  initSearch();
  renderCart();
  renderFavs();
  setCount("#cmpCount", state.compare.length);
  bind();
  initChat();
  initAnalytics();
  router();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
