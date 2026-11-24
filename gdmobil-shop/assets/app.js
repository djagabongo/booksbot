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
  const full = (h) => (!h ? "assets/img/camera.svg" : h.startsWith("assets/") ? h : `assets/img/products/${h}.webp`);
  const thumb = (h) => (!h || h.startsWith("assets/") || noThumb.has(h) ? full(h) : `assets/img/products/${h}-sm.webp`);
  const finalPrice = (base, disc) => (base == null ? null : disc ? Math.round(base * (100 - disc)) / 100 : base);
  const CAT_NAMES = Object.fromEntries(window.CATEGORIES.map((c) => [c.key, c.name]));
  const MODEL_NAMES = Object.fromEntries(C.models.map((m) => [m.key, `${m.brand} ${m.name}`]));

  const PRODUCTS = [];
  const BY_SLUG = new Map();
  const BY_ID = new Map();
  const OPT_KEYS = ["storage", "color", "ram", "conn"];
  const OPT_LABEL = { storage: "Вградена памет", color: "Цвят", ram: "RAM", conn: "Свързаност" };

  function addProduct(p) {
    p.variants.forEach((v) => { v.price = finalPrice(v.base, v.disc); BY_ID.set(v.id, { p, v }); });
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
    p.search = norm(`${p.brand} ${p.name} ${p.sub || ""} ${(p.compat || []).map((k) => MODEL_NAMES[k] || "").join(" ")}`);
    PRODUCTS.push(p);
    BY_SLUG.set(p.slug, p);
  }

  for (const g of C.groups) {
    addProduct({
      kind: "g", slug: g.s, name: g.n, brand: g.b, cat: g.c, mk: g.mk, specs: g.sp || {},
      variants: g.v.map((a) => ({ id: a[0], storage: a[1], ram: a[2], color: a[3], conn: a[4], base: a[5], img: a[6], code: a[7], disc: a[8], stock: a[9] })),
    });
  }
  for (const i of C.items) {
    addProduct({
      kind: "i", slug: i.s, name: i.n, brand: i.b, cat: i.c, sub: i.sc, compat: i.cm, desc: i.d, specs: {},
      variants: [{ id: i.i, base: i.p, disc: i.dc, stock: i.st, img: i.im }],
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
          p.disc ? `<span class="old">${eur(Math.round((p.min / (1 - p.disc / 100)) * 100) / 100)}</span>` : ""}`;

  function card(p) {
    let opts = "";
    if (p.kind === "g") {
      const st = p.opts.storage || [];
      const cols = p.opts.color || [];
      opts = `${st.length ? `<div class="chips-sm">${st.slice(0, 3).map((s) => `<span>${esc(s)}</span>`).join("")}${st.length > 3 ? `<span>+${st.length - 3}</span>` : ""}</div>` : ""}
        ${cols.length ? `<div class="dots" title="${esc(cols.join(", "))}">${cols.slice(0, 6).map((c) => `<i style="background:${colorHex(c)}"></i>`).join("")}<span>${plural(cols.length, "цвят", "цвята")}</span></div>` : ""}`;
    } else {
      opts = `<div class="card__sub">${esc(p.sub || CAT_NAMES[p.cat] || "")}${p.compat && p.compat.length ? ` · за ${esc(MODEL_NAMES[p.compat[0]] || "")}${p.compat.length > 1 ? ` +${p.compat.length - 1}` : ""}` : ""}</div>`;
    }
    const action =
      p.kind === "g" && p.variants.length > 1
        ? `<a class="btn btn--primary btn--sm" href="#/p/${p.slug}">Избери вариант</a>`
        : p.min == null
          ? `<a class="btn btn--ghost btn--sm" href="#/inquiries?topic=${encodeURIComponent(p.name)}">Запитване</a>`
          : `<button class="btn btn--primary btn--sm" data-add="${p.def.id}">В количката</button>`;
    return `<article class="card">
      ${p.disc ? `<span class="badge badge--sale">-${p.disc}%</span>` : ""}
      <button class="card__fav ${isFav(p.slug) ? "on" : ""}" data-fav="${p.slug}" aria-label="Любими" aria-pressed="${isFav(p.slug)}">${icon("heart")}</button>
      <a class="card__media" href="#/p/${p.slug}" tabindex="-1" aria-hidden="true">${imgTag(p.img, p.name)}</a>
      <div class="card__body">
        <span class="card__brand">${esc(p.brand)}</span>
        <a class="card__title" href="#/p/${p.slug}">${esc(p.name)}</a>
        ${opts}
        <div class="card__price">${priceHtml(p)}</div>
        <div class="card__actions">
          ${action}
          ${canCompare(p) ? `<button class="icon-btn icon-btn--sm ${inCmp(p.slug) ? "on" : ""}" data-cmp="${p.slug}" aria-label="Сравни" title="Сравни">${icon("swap")}</button>` : ""}
        </div>
      </div>
    </article>`;
  }

  const crumbs = (items) =>
    `<nav class="crumbs" aria-label="Навигация"><a href="#/">Начало</a>${items.map(([t, h]) => ` <span>/</span> ${h ? `<a href="${h}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`}`).join("")}</nav>`;

  const view = $("#view");
  function setTitle(t) { document.title = t ? `${t} | GDMobil` : "GDMobil — Телефони, аксесоари и сервиз в Гоце Делчев"; }

  /* ================= НАЧАЛО ================= */
  function pageHome(scrollTo) {
    setTitle("");
    const hero = BY_SLUG.get(S.heroSlug);
    const counts = Object.fromEntries(window.CATEGORIES.map((c) => [c.key, PRODUCTS.filter((p) => p.cat === c.key).length]));
    const brandCounts = {};
    PRODUCTS.filter((p) => p.cat === "phones").forEach((p) => (brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1));
    const brands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).filter(([b]) => C.logos[b]);
    const recent = state.recent.map((s) => BY_SLUG.get(s)).filter(Boolean);

    view.innerHTML = `
    <section class="hero">
      <div class="hero__bg"></div>
      <div class="container hero__inner">
        <div class="hero__copy">
          <span class="pill">${icon("store")} Магазин и сервиз в Гоце Делчев</span>
          <h1>Телефони, аксесоари и сервиз. <span class="grad">На едно място.</span></h1>
          <p>Избери памет и цвят, поръчай онлайн с доставка до офис или адрес, или вземи от магазина без такса.</p>
          <div class="hero__cta">
            <a href="#/c/phones" class="btn btn--primary">Разгледай телефоните ${icon("arrow")}</a>
            <a href="#/service" class="btn btn--ghost">${icon("wrench")} Запитване за ремонт</a>
          </div>
          <div class="hero__stats">
            <div><b>${counts.phones}</b><span>модела телефони</span></div>
            <div><b>${counts.accessories.toLocaleString("bg-BG")}</b><span>аксесоара</span></div>
            <div><b>0 €</b><span>вземане от магазина</span></div>
          </div>
        </div>
        ${hero ? `<a class="hero__card" href="#/p/${hero.slug}">
          <span class="hero__brand">${esc(hero.brand)}</span>
          <img src="${esc(S.heroImage || full(hero.img))}" alt="${esc(hero.name)}" class="hero__img" width="630" height="640" fetchpriority="high">
          <span class="hero__card-info">
            <b>${esc(hero.name.replace(hero.brand + " ", ""))}</b>
            <span class="muted">Избери конфигурация и цвят.</span>
            <span class="hero__price"><small>от</small> ${eur(hero.min)} <small>с ДДС</small></span>
            <span class="btn btn--primary btn--sm">Виж модела ${icon("arrow")}</span>
          </span>
        </a>` : ""}
      </div>
    </section>

    <section class="container section">
      <div class="section__head"><h2>Пазарувай по категория</h2><a href="#/c/all" class="link">Целият каталог →</a></div>
      <div class="cats">
        ${window.CATEGORIES.map((c) => `<a class="cat" href="#/c/${c.key}">
          <span><b>${esc(c.name)}</b><small>${esc(c.sub)}</small><em>${plural(counts[c.key], "продукт", "продукта")}</em></span>
          <img src="${esc(c.img)}" alt="" loading="lazy"></a>`).join("")}
      </div>
    </section>

    <section class="container section">
      <div class="section__head"><h2>Подбрани смартфони</h2><a href="#/c/phones" class="link">Всички телефони →</a></div>
      <div class="grid">${FEATURED.map(card).join("")}</div>
    </section>

    ${recent.length ? `<section class="container section">
      <div class="section__head"><h2>Последно разгледани</h2></div>
      <div class="rail">${recent.slice(0, 8).map(card).join("")}</div></section>` : ""}

    <section class="section brands-sec">
      <div class="container section__head"><h2>Пазарувай по марка</h2>
        <button class="btn btn--ghost btn--sm" id="marqueeToggle" aria-pressed="false">Пауза</button></div>
      <div class="marquee" id="marquee"><div class="marquee__track">
        ${[0, 1].map((k) => brands.map(([b, n]) => `<a class="brand" href="#/c/phones?brand=${encodeURIComponent(b)}" ${k ? 'aria-hidden="true" tabindex="-1"' : ""}>
          <img src="${esc(C.logos[b])}" alt="${esc(b)}" loading="lazy"><span>${esc(b)}<small>${plural(n, "модел", "модела")}</small></span></a>`).join("")).join("")}
      </div></div>
    </section>

    <section class="container section">
      <div class="service-teaser">
        <div class="service-teaser__img"><img src="assets/img/repair-workbench.jpg" alt="Работно място в сервиза" loading="lazy"><small>Илюстративна снимка</small></div>
        <div class="service-teaser__body">
          <span class="pill">${icon("wrench")} Сервиз</span>
          <h2>Сервиз за телефони и таблети</h2>
          <p class="muted">Изпрати модел и описание на проблема, за да уточним ориентировъчна цена и срок за ремонта.</p>
          <ul class="price-list">${window.REPAIRS.slice(0, 4).map((r) => `<li><span>${icon(r.icon)}${esc(r.title)}</span><b>${esc(r.price)}</b></li>`).join("")}</ul>
          <div class="hero__cta"><a class="btn btn--primary" href="#/service#form">Запитване за ремонт</a><a class="btn btn--ghost" href="#/service#prices">Ориентировъчни цени</a></div>
        </div>
      </div>
    </section>

    <section class="container section">
      <div class="finder">
        <div>
          <h2>Аксесоари за твоя модел</h2>
          <p class="muted">Избери модел и разгледай калъфи, протектори и други предложения, в чието описание е посочен твоят телефон.</p>
        </div>
        <form class="finder__form" id="finderForm">
          <label class="lbl" for="finderModel">Твоят модел</label>
          ${modelSelect("finderModel", "")}
          <button class="btn btn--primary" type="submit">Покажи аксесоарите</button>
          <small class="muted">Провери точния модел и съвместимостта преди покупка.</small>
        </form>
      </div>
    </section>

    <section class="container section">
      <div class="perks">
        <a href="#/legal/delivery" class="perk">${icon("store")}<span><b>Вземи от магазина</b><small>Без такса · Гоце Делчев</small></span></a>
        <a href="#/legal/delivery" class="perk">${icon("truck")}<span><b>Доставка и плащане</b><small>До офис на Еконт, Спиди или адрес</small></span></a>
        <a href="#/legal/returns" class="perk">${icon("shield")}<span><b>Гаранция и връщане</b><small>Условия и съдействие</small></span></a>
      </div>
    </section>

    ${contactBlock()}`;

    $("#finderForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#finderModel").value;
      if (!v) return toast("Избери модел");
      go(`#/c/accessories?model=${encodeURIComponent(v)}`);
    });
    const mq = $("#marquee"), mt = $("#marqueeToggle");
    mt.addEventListener("click", () => {
      const paused = mq.classList.toggle("paused");
      mt.textContent = paused ? "Пусни" : "Пауза"; mt.setAttribute("aria-pressed", paused);
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
          <span class="pill">${icon("pin")} Магазин в Гоце Делчев</span>
          <h2>Заповядай в магазина</h2>
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
        </div>
      </div>
    </section>`;
  }
  const hoursHtml = () => S.hours.map(([d, h]) => `<div><dt>${esc(d)}</dt><dd>${esc(h)}</dd></div>`).join("");

  /* ================= КАТАЛОГ ================= */
  const PAGE = 24;
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
              <option value="desc">Цена: висока → ниска</option><option value="name">Име: А → Я</option>
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
      (!cat.max || (p.min != null && p.min <= cat.max)));
    const pr = (p) => (p.min == null ? Infinity : p.min);
    if (cat.sort === "asc") list.sort((a, b) => pr(a) - pr(b));
    else if (cat.sort === "desc") list.sort((a, b) => (b.min ?? -1) - (a.min ?? -1));
    else if (cat.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "bg"));
    else {
      const catRank = { phones: 0, tablets: 1, accessories: 2, cameras: 3 };
      list.sort((a, b) =>
        (featuredRank.get(a) ?? 99) - (featuredRank.get(b) ?? 99) ||
        catRank[a.cat] - catRank[b.cat] ||
        (a.cat === "accessories" ? a.name.localeCompare(b.name, "bg") : (b.min ?? -1) - (a.min ?? -1)));
    }
    return list;
  }

  function facet(base, fn) {
    const m = new Map();
    base.forEach((p) => [].concat(fn(p) || []).forEach((v) => v && m.set(v, (m.get(v) || 0) + 1)));
    return [...m.entries()];
  }

  function filtersHtml(base) {
    const brands = facet(base, (p) => p.brand).sort((a, b) => b[1] - a[1]);
    const subs = facet(base, (p) => p.sub).sort((a, b) => b[1] - a[1]);
    const memOrder = (s) => parseFloat(s) * (s.includes("TB") ? 1024 : s.includes("MB") ? 1 / 1024 : 1);
    const mems = facet(base, (p) => p.opts.storage).sort((a, b) => memOrder(a[0]) - memOrder(b[0]));
    const prices = base.map((p) => p.min).filter((x) => x != null);
    const maxP = prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 0;
    const check = (name, val, n, on) =>
      `<label class="check"><input type="checkbox" data-f="${name}" value="${esc(val)}" ${on ? "checked" : ""}><span>${esc(val)}</span><em>${n}</em></label>`;
    const clip = brands.length > 10;
    return `
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
    $("#grid").innerHTML = list.slice(0, cat.shown).map(card).join("") ||
      `<div class="empty"><p>😕 Няма продукти по тези критерии.</p><button class="btn btn--ghost" data-reset>Изчисти филтрите</button>
       <p class="muted">Не намираш търсеното? <a class="link" href="#/inquiries${cat.q ? "?topic=" + encodeURIComponent(cat.q) : ""}">Изпрати запитване</a></p></div>`;
    const left = list.length - cat.shown;
    $("#more").innerHTML = left > 0 ? `<button class="btn btn--ghost" id="moreBtn">Покажи още ${Math.min(left, PAGE)} <small class="muted">(остават ${left})</small></button>` : "";
    $("#moreBtn")?.addEventListener("click", () => { cat.shown += PAGE; refreshCatalog(); });
    const nf = cat.brands.size + cat.mem.size + (cat.sub ? 1 : 0) + (cat.model ? 1 : 0) + (cat.max ? 1 : 0);
    $("#fCount").textContent = nf ? `(${nf})` : "";
    $("#filterApply").textContent = `Покажи ${plural(list.length, "резултат", "резултата")}`;
    const chips = [
      ...[...cat.brands].map((b) => ["brand", b, b]),
      ...[...cat.mem].map((m) => ["mem", m, m]),
      cat.sub && ["sub", cat.sub, cat.sub],
      cat.model && ["model", cat.model, "За " + (MODEL_NAMES[cat.model] || cat.model)],
      cat.max && ["max", "", "до " + eur(cat.max)],
    ].filter(Boolean);
    $("#activeF").innerHTML = chips.map(([k, v, t]) => `<button class="chip chip--x" data-unf="${k}" data-v="${esc(v)}">${esc(t)} ${icon("close")}</button>`).join("");
    const qs = new URLSearchParams();
    if (cat.q) qs.set("q", cat.q);
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
    if (f === "brand" || f === "mem") {
      const set = f === "brand" ? cat.brands : cat.mem;
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
  function pageProduct(slug, q) {
    const p = BY_SLUG.get(slug);
    if (!p) return pageNotFound();
    let cur = p.variants.find((v) => v.id === +q.get("v")) || p.def;
    setTitle(p.name);
    state.recent = [slug, ...state.recent.filter((s) => s !== slug)].slice(0, 12);
    saveState("recent");
    setProductLd(p);

    const compatAcc = p.kind === "g" && p.mk ? PRODUCTS.filter((x) => (x.compat || []).includes(p.mk)) : [];
    const similar = PRODUCTS.filter((x) => x !== p && x.cat === p.cat && (p.kind === "g" ? x.brand === p.brand : x.sub === p.sub && x.brand === p.brand))
      .sort((a, b) => Math.abs((a.min ?? 0) - (p.min ?? 0)) - Math.abs((b.min ?? 0) - (p.min ?? 0))).slice(0, 8);
    const keySpecs = ["Дисплей", "Основна камера", "Батерия", "Процесор"].filter((k) => p.specs[k]);

    view.innerHTML = `<section class="container page">
      ${crumbs([[CAT_NAMES[p.cat], `#/c/${p.cat}`], [p.name]])}
      <div class="pd">
        <div class="pd__gallery">
          <button class="pd__main" id="pdZoom" aria-label="Увеличи снимката"><img id="pdImg" alt="${esc(p.name)}"><span class="pd__zoom">Увеличи ${icon("zoom")}</span></button>
          <div class="pd__thumbs" id="pdThumbs"></div>
        </div>
        <div class="pd__info">
          <div class="pd__brand">${C.logos[p.brand] ? `<img src="${esc(C.logos[p.brand])}" alt="">` : ""}<span>${esc(p.brand)} / ${esc(CAT_NAMES[p.cat])}${p.sub ? " / " + esc(p.sub) : ""}</span></div>
          <h1>${esc(p.name)}</h1>
          <p class="muted pd__codes" id="pdCodes"></p>
          ${p.desc ? `<p class="muted">${esc(p.desc)}</p>` : ""}
          <div class="config" id="config"></div>
          <div class="pd__buy" id="pdBuy"></div>
          ${keySpecs.length ? `<div class="keyspecs">${keySpecs.map((k) => `<div><small>${esc(k)}</small><b>${esc(p.specs[k])}</b></div>`).join("")}<div><small>Памет</small><b id="ksMem"></b></div></div>` : ""}
          <div class="pd__tools">
            <button class="btn btn--ghost btn--sm" data-fav="${p.slug}" id="pdFav">${icon("heart")} <span></span></button>
            ${canCompare(p) ? `<button class="btn btn--ghost btn--sm" data-cmp="${p.slug}" id="pdCmp">${icon("swap")} <span></span></button>` : ""}
            <button class="btn btn--ghost btn--sm" id="pdShare">${icon("share")} Сподели</button>
          </div>
          <div class="pd__store">${icon("store")}<span><b>GDMobil · ${esc(S.address)}</b><a href="tel:${tel}">${esc(S.phone)}</a></span></div>
          <div class="acc">${window.PRODUCT_INFO.map((x, i) => `<details ${i === 1 ? "open" : ""}><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("")}
            <p class="acc__links"><a href="#/legal/delivery">Доставка и плащане</a> · <a href="#/legal/returns">Гаранция и връщане</a> · <a href="#/service">Сервизно запитване</a></p></div>
        </div>
      </div>

      <div class="pd-section" id="specsSec"></div>

      ${p.compat && p.compat.length ? `<div class="pd-section"><h2>Съвместими модели</h2><div class="tags">${p.compat.map((k) => `<a class="chip" href="#/c/accessories?model=${k}">${esc(MODEL_NAMES[k] || k)}</a>`).join("")}</div>
        <p class="muted small">Провери точния модел и съвместимостта преди покупка.</p></div>` : ""}

      ${compatAcc.length ? `<div class="pd-section"><div class="section__head"><h2>Аксесоари за ${esc(p.name.replace(p.brand + " ", ""))}</h2>
        <a class="link" href="#/c/accessories?model=${p.mk}">Всички ${compatAcc.length} →</a></div>
        <div class="rail">${compatAcc.slice(0, 12).map(card).join("")}</div></div>` : ""}

      ${similar.length ? `<div class="pd-section"><div class="section__head"><h2>Подобни продукти</h2></div><div class="rail">${similar.map(card).join("")}</div></div>` : ""}
    </section>
    <div class="sticky-buy" id="stickyBuy"></div>`;

    const draw = () => {
      $("#pdImg").src = full(cur.img);
      $("#pdCodes").innerHTML = `Артикул № ${cur.id}${cur.code ? ` · Каталожен номер (BrosBG): <b>${esc(cur.code)}</b>` : ""}`;
      const imgs = [];
      p.variants.forEach((v) => { if (v.img && !imgs.some((x) => x.img === v.img)) imgs.push(v); });
      $("#pdThumbs").innerHTML = imgs.length > 1
        ? imgs.map((v) => `<button class="${v.img === cur.img ? "on" : ""}" data-timg="${v.id}" aria-label="${esc(v.color || "Снимка")}">${imgTag(v.img, v.color || p.name)}</button>`).join("")
        : "";
      const keys = Object.keys(p.opts).filter((k) => p.opts[k].length > 1 || k === "color");
      $("#config").innerHTML = p.kind === "g" ? `
        <div class="config__head"><b>Конфигурация</b><small class="muted">${plural(p.variants.length, "конфигурация", "конфигурации")}</small></div>
        ${keys.map((k) => `<div class="config__row">
          <div class="config__label"><span>${OPT_LABEL[k]}</span><b>${esc(cur[k] || "—")}</b></div>
          <div class="opts">${p.opts[k].map((val) => {
            const exact = p.variants.some((v) => v[k] === val && OPT_KEYS.every((o) => o === k || v[o] === cur[o]));
            return `<button class="opt ${cur[k] === val ? "active" : ""} ${exact ? "" : "opt--alt"}" data-opt="${k}" data-val="${esc(val)}" aria-pressed="${cur[k] === val}" ${exact ? "" : 'title="Ще смени и други опции"'}>${k === "color" ? `<i class="sw" style="background:${colorHex(val)}"></i>` : ""}${esc(val)}</button>`;
          }).join("")}</div></div>`).join("")}
        <div class="config__sel"><small class="muted">Избрана конфигурация</small><b>${esc(varLabel(cur) || "Стандартна")}</b></div>` : "";
      $("#pdBuy").innerHTML = cur.price == null
        ? `<div class="pd__price"><span class="price price--ask">Цена при запитване</span></div>
           <a class="btn btn--primary btn--lg btn--block" href="#/inquiries?topic=${encodeURIComponent(p.name)}">Изпрати запитване</a>`
        : `<div class="pd__price"><span class="price">${eur(cur.price, true)}</span><small class="muted">с ДДС</small>
            ${cur.disc ? `<span class="old">${eur(cur.base, true)}</span>` : ""}</div>
           <p class="stock ${cur.stock ? "" : "stock--no"}">${cur.stock ? "● В наличност" : "● По заявка"}</p>
           <p class="muted small">Срокът за получаване се уточнява при потвърждение.</p>
           <button class="btn btn--primary btn--lg btn--block" data-add="${cur.id}">Добави в количката</button>`;
      $("#stickyBuy").innerHTML = cur.price == null ? "" : `<div><b>${eur(cur.price, true)}</b><small>${esc([cur.storage, cur.color].filter(Boolean).join(" · ") || p.name)}</small></div><button class="btn btn--primary" data-add="${cur.id}">В количката</button>`;
      if ($("#ksMem")) $("#ksMem").textContent = cur.storage || p.specs["Памет"] || "—";
      const rows = [
        ...Object.entries(p.specs),
        cur.storage && ["Вградена памет", cur.storage], cur.ram && ["RAM", cur.ram], cur.color && ["Цвят", cur.color], cur.conn && ["Свързаност", cur.conn],
        ["Артикул №", cur.id], cur.code && ["Каталожен номер (BrosBG)", cur.code],
      ].filter(Boolean);
      $("#specsSec").innerHTML = `<h2>Технически характеристики</h2><table class="specs">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
      syncProductTools(p);
      history.replaceState(null, "", `#/p/${p.slug}${cur !== p.def ? "?v=" + cur.id : ""}`);
      lastPath = routeKey();
    };

    const pick = (k, val) => {
      const prio = OPT_KEYS.filter((o) => o !== k);
      const score = (v) => prio.reduce((s, o, i) => s + (v[o] === cur[o] ? 8 >> i : 0), 0);
      const cands = p.variants.filter((v) => v[k] === val).sort((a, b) => score(b) - score(a));
      cur = cands[0] || cur;
      draw();
    };
    $("#config").addEventListener("click", (e) => { const b = e.target.closest("[data-opt]"); if (b) pick(b.dataset.opt, b.dataset.val); });
    $("#pdThumbs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-timg]");
      if (!b) return;
      const v = BY_ID.get(+b.dataset.timg).v;
      if (v.color) pick("color", v.color); else { cur = v; draw(); }
    });
    $("#pdZoom").addEventListener("click", () => openModal(`<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button><div class="zoom"><img src="${esc(full(cur.img))}" alt="${esc(p.name)}"></div>`, "modal__box--img"));
    $("#pdShare").addEventListener("click", () => share(p));
    draw();
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
      <div class="cat-head"><h1>Сравнение</h1><p class="muted">${items.length ? `${items.length} от 4 модела` : ""}</p></div>
      ${items.length ? `<div class="cmp-wrap"><table class="cmp">
        <tr><th></th>${items.map((p) => `<td><button class="icon-btn icon-btn--sm cmp__rm" data-cmp="${p.slug}" aria-label="Премахни ${esc(p.name)}">${icon("close")}</button>
          <a href="#/p/${p.slug}">${imgTag(p.img, p.name, "cmp__img")}<b>${esc(p.name)}</b></a></td>`).join("")}</tr>
        <tr><th>Цена</th>${items.map((p) => `<td>${priceHtml(p)}</td>`).join("")}</tr>
        <tr><th>Памет</th>${items.map((p) => `<td>${esc((p.opts.storage || []).join(" / ") || "—")}</td>`).join("")}</tr>
        <tr><th>Цветове</th>${items.map((p) => `<td><div class="dots">${(p.opts.color || []).map((c) => `<i title="${esc(c)}" style="background:${colorHex(c)}"></i>`).join("")}</div></td>`).join("")}</tr>
        ${keys.map((k) => `<tr><th>${esc(k)}</th>${items.map((p) => `<td>${esc(p.specs[k] || "—")}</td>`).join("")}</tr>`).join("")}
        <tr><th></th>${items.map((p) => `<td><a class="btn btn--primary btn--sm" href="#/p/${p.slug}">Избери вариант</a></td>`).join("")}</tr>
      </table></div>` : `<div class="empty"><p>Няма добавени модели за сравнение.</p><a class="btn btn--primary" href="#/c/phones">Към телефоните</a></div>`}
    </section>`;
  }

  /* ================= СЕРВИЗ ================= */
  function pageService(anchor) {
    setTitle("Сервиз за телефони и таблети");
    view.innerHTML = `<section class="container page">
      ${crumbs([["Сервиз"]])}
      <div class="svc-hero">
        <div>
          <span class="pill">${icon("wrench")} Сервиз</span>
          <h1>Сервиз за телефони и таблети</h1>
          <p class="muted">Смяна на дисплеи и батерии, ремонти на букси за зареждане и диагностика. Избери услуга за ориентировъчна цена или опиши проблема.</p>
          <div class="hero__cta"><a class="btn btn--primary" href="#/service#prices">Виж ремонти и цени</a><a class="btn btn--ghost" href="#/service#form">Опиши проблема</a></div>
        </div>
        <figure><img src="assets/img/repair-workbench.jpg" alt="Работно място в сервиза"><figcaption>Илюстративна снимка</figcaption></figure>
      </div>

      <div class="section" id="prices">
        <div class="section__head"><div><h2>Какъв е проблемът?</h2><p class="muted">Цените са ориентировъчни. Уточняваме крайната сума, частите и срока след преглед.</p></div></div>
        <div class="repairs">${window.REPAIRS.map((r) => `<button class="repair" data-repair="${esc(r.title)}">
          <span class="repair__ic">${icon(r.icon)}</span><b>${esc(r.title)}</b><span class="muted">${esc(r.text)}</span>
          <span class="repair__price">${esc(r.price)}</span><span class="repair__pick">Избери →</span></button>`).join("")}</div>
      </div>

      <div class="section svc-grid">
        <div id="form">${inquiryForm("service")}</div>
        <div>
          <h2>Как протича ремонтът</h2>
          <ol class="steps">${window.REPAIR_STEPS.map((s, i) => `<li><span>${i + 1}</span><div><b>${esc(s.title)}</b><p class="muted">${esc(s.text)}</p></div></li>`).join("")}</ol>
          <h3>Преди да донесеш устройството</h3>
          <div class="acc">${window.SERVICE_FAQ.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("")}</div>
        </div>
      </div>
    </section>`;
    $("#prices").addEventListener("click", (e) => {
      const b = e.target.closest("[data-repair]");
      if (!b) return;
      const f = $("#inqForm");
      if (!f) return;
      f.querySelector("[name=type]").value = "Ремонт";
      const ta = f.querySelector("[name=msg]");
      if (!ta.value.startsWith(b.dataset.repair)) ta.value = `${b.dataset.repair}: ${ta.value}`;
      $("#form").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => f.querySelector("[name=model]").focus({ preventScroll: true }), 450);
    });
    if (anchor) requestAnimationFrame(() => $("#" + anchor)?.scrollIntoView());
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
        <div>${inquiryForm("inquiry", q.get("topic") || "")}</div>
      </div>
    </section>`;
  }

  function inquiryForm(kind, topic = "") {
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
          <option value="">Избери устройство</option>${["Телефон", "Таблет", "Камера", "Аксесоар", "Друго"].map((t) => `<option ${t === guessDevice ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>${svc ? "Марка и модел" : "Продукт / тема"} *</span><input class="input" name="model" required value="${esc(topic)}"></label>
      <label class="field"><span>${svc ? "Какъв е проблемът?" : "Как можем да помогнем?"} *</span><textarea class="input" name="msg" rows="4" required></textarea></label>
      <label class="check check--consent"><input type="checkbox" required><span>Прочетох <a href="#/legal/privacy" target="_blank">информацията за личните данни</a> и разбирам, че посочените данни ще бъдат използвани за отговор на запитването. *</span></label>
      <button class="btn btn--primary btn--block" type="submit">Изпрати запитване</button>
      <p class="muted small">След успешно изпращане ще получиш номер на запитването.</p>
    </form>`;
  }

  async function submitInquiry(form) {
    const fd = Object.fromEntries(new FormData(form));
    const num = refNo("Z");
    const text = [`Запитване № ${num}`, `Вид: ${fd.type}`, `Устройство: ${fd.device}`, `Модел / тема: ${fd.model}`, "", fd.msg, "",
      `Име: ${fd.name}`, `Телефон: ${fd.phone}`, fd.email ? `Имейл: ${fd.email}` : false].filter((x) => x !== false).join("\n");
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true; btn.textContent = "Изпращане…";
    const sent = await sendToStore(`Запитване ${num} – ${fd.type}`, text, { ref: num, ...fd });
    form.outerHTML = `<div class="form-card success">
      <div class="success__check">${icon("check")}</div>
      <h2>${sent ? "Запитването е изпратено" : "Запитването е готово"}</h2>
      <p>Номер на запитването: <b>${num}</b></p>
      ${sent ? `<p class="muted">Ще се свържем с теб на <b>${esc(fd.phone)}</b>.</p>`
        : `<p class="muted">Остава една стъпка – изпрати го, за да го получим:</p>
           <div class="row-btns"><a class="btn btn--primary" href="${mailto(`Запитване ${num}`, text)}">${icon("mail")} Изпрати по имейл</a>
           <a class="btn btn--ghost" href="tel:${tel}">${icon("phone")} Обади се</a></div>`}
    </div>`;
  }

  /* ================= ПРАВНИ СТРАНИЦИ ================= */
  const LEGAL_ORDER = [["terms", "Общи условия"], ["delivery", "Доставка и плащане"], ["returns", "Гаранция и връщане"], ["privacy", "Поверителност"], ["cookies", "Бисквитки и локални настройки"]];
  function pageLegal(key, anchor) {
    const d = LEGAL[key];
    if (!d) return pageNotFound();
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

  function pageNotFound() {
    setTitle("Страницата не е намерена");
    view.innerHTML = `<section class="container page"><div class="empty"><h1>404</h1><p>Страницата не е намерена.</p><a class="btn btn--primary" href="#/">Към началото</a></div></section>`;
  }

  /* ================= КОЛИЧКА ================= */
  const lineInfo = (l) => BY_ID.get(l.id);
  const varLabel = (v) => [v.storage, v.ram && v.ram + " RAM", v.color, v.conn].filter(Boolean).join(" · ");
  const cartLines = () => state.cart.filter((l) => lineInfo(l) && lineInfo(l).v.price != null);
  const subtotal = () => cartLines().reduce((s, l) => s + lineInfo(l).v.price * l.qty, 0);

  function addToCart(id) {
    const info = BY_ID.get(+id);
    if (!info || info.v.price == null) return;
    const l = state.cart.find((x) => x.id === +id);
    if (l) l.qty++; else state.cart.push({ id: +id, qty: 1 });
    saveState("cart"); renderCart();
    toast(`✓ ${info.p.name} е добавен в количката`, "#cart", "Виж количката");
    bump("#cartBtn");
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
          <label class="field"><span>Имейл (по избор)</span><input class="input" name="email" type="email" autocomplete="email"></label>
        </fieldset>
        <fieldset><legend>2. Получаване</legend>
          <div class="radio-cards">
            <label class="radio-card"><input type="radio" name="recv" value="pickup" checked><b>${icon("store")} От магазина</b><small>Без такса · Гоце Делчев</small></label>
            <label class="radio-card"><input type="radio" name="recv" value="Еконт"><b>${icon("truck")} Еконт</b><small>До офис или адрес</small></label>
            <label class="radio-card"><input type="radio" name="recv" value="Спиди"><b>${icon("truck")} Спиди</b><small>До офис или адрес</small></label>
          </div>
          <div id="courierFields" hidden>
            <div class="seg"><label><input type="radio" name="dest" value="office" checked><span>До офис</span></label><label><input type="radio" name="dest" value="address"><span>До адрес</span></label></div>
            <div class="two"><label class="field"><span>Населено място *</span><input class="input" name="city" autocomplete="address-level2"></label>
            <label class="field"><span id="addrLbl">Офис на куриера *</span><input class="input" name="addr" autocomplete="street-address"></label></div>
          </div>
          <p class="muted small" id="recvNote"></p>
        </fieldset>
        <fieldset><legend>3. Плащане</legend><div class="radio-cards" id="payCards"></div></fieldset>
        <label class="field"><span>Бележка към поръчката</span><textarea class="input" name="note" rows="2"></textarea></label>
        <div class="summary" id="sum"></div>
        <label class="check check--consent"><input type="checkbox" required><span>Съгласен/на съм с <a href="#/legal/terms" target="_blank">общите условия</a> и <a href="#/legal/privacy" target="_blank">политиката за поверителност</a>. *</span></label>
        <button class="btn btn--primary btn--block btn--lg" type="submit">Изпрати заявката</button>
        <p class="muted small center">Магазинът потвърждава наличността, сумата и срока преди изпълнение.</p>
      </form>`);
    const f = $("#checkoutForm");
    let lastCourier = null;
    const upd = () => {
      const recv = f.recv.value, courier = recv !== "pickup", dest = f.dest.value;
      $("#courierFields").hidden = !courier;
      f.city.required = f.addr.required = courier;
      $("#addrLbl").textContent = dest === "office" ? "Офис на куриера *" : "Адрес (улица, №, вх., ап.) *";
      $("#recvNote").textContent = courier
        ? "Това не генерира автоматично товарителница. Магазинът потвърждава възможността, таксата и очаквания срок за конкретната доставка."
        : `Вземане от ${S.address} след потвърждение, че избраната конфигурация е готова.`;
      if (lastCourier !== courier) {
        const pays = courier ? [["Наложен платеж", "Плащане при получаване"]] : [["Плащане в магазина", "При вземане на място"]];
        $("#payCards").innerHTML = pays.map(([v, s], i) => `<label class="radio-card"><input type="radio" name="pay" value="${v}" ${i === 0 ? "checked" : ""}><b>${v}</b><small>${s}</small></label>`).join("");
        lastCourier = courier;
      }
      const sub = subtotal();
      const fee = !courier ? 0 : dest === "office" ? S.deliveryOffice : S.deliveryAddress;
      $("#sum").innerHTML = `
        ${cartLines().map((l) => { const { p, v } = lineInfo(l); return `<div class="row small"><span>${esc(p.name)}${varLabel(v) ? ` <span class="muted">(${esc(varLabel(v))})</span>` : ""} × ${l.qty}</span><span>${eur(v.price * l.qty, true)}</span></div>`; }).join("")}
        <hr><div class="row"><span class="muted">Стоки</span><span>${eur(sub, true)}</span></div>
        <div class="row"><span class="muted">Доставка</span><span>${fee === 0 ? "Без такса" : fee == null ? "Предстои уточняване" : eur(fee, true)}</span></div>
        <div class="row row--total"><span>Общо${fee == null ? " <small class=\"muted\">(без доставка)</small>" : ""}</span><span>${eur(sub + (fee || 0), true)}</span></div>`;
      return { courier, fee, sub };
    };
    f.addEventListener("change", upd);
    upd();
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { courier, fee, sub } = upd();
      const fd = Object.fromEntries(new FormData(f));
      const num = refNo("GD");
      const items = cartLines().map((l) => { const { p, v } = lineInfo(l); return `• ${p.name}${varLabel(v) ? ` (${varLabel(v)})` : ""} – арт. ${v.id} × ${l.qty} = ${eur(v.price * l.qty, true)}`; });
      const recvTxt = courier ? `${fd.recv}, ${fd.dest === "office" ? "до офис" : "до адрес"}: ${fd.city}, ${fd.addr}` : `Вземане от магазина (${S.address})`;
      const text = [`Заявка за поръчка № ${num}`, "", ...items, "", `Стоки: ${eur(sub, true)}`,
        `Доставка: ${fee === 0 ? "без такса" : fee == null ? "предстои уточняване" : eur(fee, true)}`, `Общо: ${eur(sub + (fee || 0), true)}`, "",
        `Клиент: ${fd.name}`, `Телефон: ${fd.phone}`, fd.email ? `Имейл: ${fd.email}` : false, `Получаване: ${recvTxt}`, `Плащане: ${fd.pay}`,
        fd.note ? `Бележка: ${fd.note}` : false].filter((x) => x !== false).join("\n");
      const btn = f.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "Изпращане…";
      const sent = await sendToStore(`Нова поръчка ${num} – ${eur(sub, true)}`, text, { order: num, name: fd.name, phone: fd.phone, email: fd.email || "" });
      const orders = store.get("orders", []);
      orders.push({ num, date: new Date().toISOString(), text });
      store.set("orders", orders.slice(-20));
      state.cart = []; saveState("cart"); renderCart();
      $("#modalBox").innerHTML = `<button class="icon-btn modal__close" data-close aria-label="Затвори">${icon("close")}</button>
        <div class="success">
          <div class="success__check">${icon("check")}</div>
          <h2>Благодарим, ${esc(fd.name.split(" ")[0])}!</h2>
          <p>Номер на заявката: <b>${num}</b></p>
          ${sent
            ? `<p class="muted">Заявката е получена. Ще се свържем с теб на <b>${esc(fd.phone)}</b>, за да потвърдим наличността, сумата и срока.</p>
               <button class="btn btn--primary" data-close>Продължи пазаруването</button>`
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
  async function sendToStore(subject, text, data) {
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
  function setCount(sel, n) { const c = $(sel); c.textContent = n; c.dataset.zero = n === 0; }

  /* ---------- търсене с подсказки ---------- */
  function initSearch() {
    const inp = $("#searchInput"), box = $("#suggest");
    let idx = -1;
    const render = () => {
      const toks = tokens(inp.value);
      if (!toks.length) { box.hidden = true; return; }
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
      else if (e.key === "Escape") box.hidden = true;
    });
    document.addEventListener("click", (e) => { if (!e.target.closest("#searchForm")) box.hidden = true; });
    $("#searchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = inp.value.trim();
      box.hidden = true; inp.blur();
      go(q ? `#/c/all?q=${encodeURIComponent(q)}` : "#/c/all");
    });
  }

  /* ---------- модал / чекмеджета ---------- */
  let lastFocus = null;
  function openModal(html, cls = "") {
    lastFocus = document.activeElement;
    const box = $("#modalBox");
    box.className = "modal__box " + cls;
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
    const h = location.hash.slice(1);
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
    closeModal(); closeDrawers();
    $("#suggest").hidden = true;
    if (parts[0] !== "p") setLd("ld-product", null);
    if (parts[0] !== "c") { cat = null; $("#searchInput").value = ""; }
    switch (parts[0]) {
      case undefined: pageHome(); break;
      case "contact": pageHome("contact"); break;
      case "c": pageCatalog(parts[1] || "all", q); break;
      case "p": pageProduct(parts[1], q); break;
      case "service": pageService(anchor); break;
      case "inquiries": pageInquiries(q); break;
      case "legal": pageLegal(parts[1], anchor); break;
      case "compare": pageCompare(); break;
      default: pageNotFound();
    }
    if (!anchor && parts[0] !== "contact") window.scrollTo(0, 0);
    lastPath = routeKey();
    const active = parts[0] === "p" ? BY_SLUG.get(parts[1])?.cat : parts[0] === "c" ? parts[1] : parts[0] || "";
    $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === active));
  }

  /* ---------- статични части ---------- */
  function renderStatic() {
    $$("[data-addr]").forEach((e) => (e.textContent = S.address));
    $$("[data-maps]").forEach((e) => (e.href = S.maps));
    $$("[data-tel]").forEach((e) => { e.href = "tel:" + tel; e.textContent = S.phone; });
    $$("[data-mail]").forEach((e) => { e.href = "mailto:" + S.email; e.textContent = S.email; });
    $$("[data-hours]").forEach((e) => (e.innerHTML = hoursHtml()));
    $("[data-tagline]").textContent = S.tagline;
    $("[data-copy]").textContent = `© ${new Date().getFullYear()} GDMobil · ${S.company} · ЕИК ${S.eik}`;
    $("#socials").innerHTML = `
      <a href="${esc(S.social.facebook)}" target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v9h4v-9h3l1-4h-4V8z"/></svg></a>
      <a href="${esc(S.social.instagram)}" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>`;
    $("#fab").innerHTML = `${S.viber ? `<a href="viber://chat?number=%2B${esc(S.viber)}" class="fab__btn fab__viber" aria-label="Пиши ни във Viber">V</a>` : ""}
      <a href="tel:${tel}" class="fab__btn fab__call" aria-label="Обади се на ${esc(S.phone)}">${icon("phone")}</a>`;
    $("#menuBody").innerHTML = `
      ${window.CATEGORIES.map((c) => `<a href="#/c/${c.key}"><img src="${esc(c.img)}" alt="">${esc(c.name)}</a>`).join("")}
      <hr><a href="#/service">${icon("wrench")} Сервиз и ремонти</a><a href="#/inquiries">${icon("mail")} Запитвания</a>
      <a href="#/compare">${icon("swap")} Сравнение</a><a href="#/contact">${icon("pin")} Контакти</a>
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
      const t = e.target.closest("[data-add],[data-fav],[data-cmp],[data-inc],[data-dec],[data-rm],[data-close],[data-reset],[data-unf],[data-expand],#checkoutBtn");
      if (!t) {
        if (e.target.closest(".drawer a[href^='#/']")) closeDrawers();
        return;
      }
      const d = t.dataset;
      if (t.id === "checkoutBtn") return openCheckout();
      if (d.close !== undefined) { closeModal(); closeDrawers(); return; }
      if (d.add) return addToCart(d.add);
      if (d.fav) return toggleFav(d.fav);
      if (d.cmp) return toggleCompare(d.cmp);
      if (d.expand !== undefined) { t.closest(".fgroup").classList.remove("fgroup--clip"); t.remove(); return; }
      if (d.reset !== undefined && cat) {
        Object.assign(cat, { brands: new Set(), mem: new Set(), sub: "", model: "", max: 0, q: "", shown: PAGE });
        if ($("#catSearch")) $("#catSearch").value = "";
        return refreshCatalog();
      }
      if (d.unf && cat) {
        if (d.unf === "brand") cat.brands.delete(d.v);
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
    document.addEventListener("submit", (e) => { if (e.target.id === "inqForm") { e.preventDefault(); submitInquiry(e.target); } });

    $("#cartBtn").addEventListener("click", () => openDrawer("cartDrawer"));
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
  router();
})();
