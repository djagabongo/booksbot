/* ========== GDMobil – админ панел ==========
   Настройките се пазят в Netlify Blobs чрез /api/settings (виж netlify/functions/settings.mjs).
   Нищо не се записва, докато не натиснеш „Запази“. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n) => (n == null || n === "" || isNaN(n) ? "—" : new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n));
  const S0 = window.STORE, L0 = window.LABELS || {}, C = window.CATALOG;
  const CAT = { phones: "Телефони", tablets: "Таблети", accessories: "Аксесоари" };
  const PW_KEY = "gdm_admin_pw";

  /* ---------- продукти от каталога ---------- */
  const noThumb = new Set(C.noThumb || []);
  const csImg = (h, w) => `https://casestore.bg/cdn/img/products/${h.slice(3)}${h.includes("?") ? "&" : "?"}width=${w}&height=${w}`;
  const thumb = (h) => (!h ? "" : h.startsWith("cs:") ? csImg(h, 160) : h.startsWith("https:") ? h.replace(/width=\d+&height=\d+/, "width=160&height=160")
    : h.startsWith("assets/") || h.startsWith("media/") ? h : /^cs\d+$/.test(h) || noThumb.has(h) ? `assets/img/products/${h}.webp` : `assets/img/products/${h}-sm.webp`);
  const NO_BRAND = "Без марка";
  const PRODUCTS = [
    ...C.groups.map((g) => ({ slug: g.s, name: g.n, brand: g.b, cat: g.c, kind: "g", mk: g.mk || "", sub: g.sc || "", compat: g.cm || [], specs: g.sp || {},
      variants: g.v.map((v) => ({ id: v[0], storage: v[1], ram: v[2], color: v[3], conn: v[4], price: v[5], img: v[6], code: v[7], disc: v[8], stock: v[9], old: v[11], model: v[12] || "", vmk: v[13] || "",
        label: [v[12] && "за " + v[12], v[1], v[2] && v[2] + " RAM", v[3], v[4]].filter(Boolean).join(" · ") || "Стандартен" })) })),
    ...C.items.map((i) => ({ slug: i.s, name: i.n, brand: i.b, cat: i.c, kind: "i", mk: "", sub: i.sc || "", compat: i.cm || [], specs: {},
      variants: [{ id: i.i, label: i.sc || "Артикул", price: i.p, img: i.im, old: i.op, stock: i.st }] })),
  ];
  PRODUCTS.forEach((p) => { p.brandLabel = p.brand || NO_BRAND; p.img = p.variants[0] ? p.variants[0].img : ""; });
  // модели: телефони/таблети от каталога + моделите, за които има аксесоари
  const MODELS = new Map();
  for (const m of C.models) MODELS.set(m.key, { key: m.key, brand: m.brand, name: m.name.toLowerCase().startsWith(m.brand.toLowerCase()) ? m.name : `${m.brand} ${m.name}` });
  for (const p of PRODUCTS) if (p.mk && p.cat !== "accessories" && !MODELS.has(p.mk)) MODELS.set(p.mk, { key: p.mk, brand: p.brand, name: p.name });
  const modelName = (k) => MODELS.get(k)?.name || "";
  // ключове на модели за продукта: самият телефон или съвместимите модели на аксесоара
  PRODUCTS.forEach((p) => { p.models = [...new Set([p.cat !== "accessories" && p.mk, ...p.compat, ...p.variants.map((v) => v.vmk)].filter((k) => k && MODELS.has(k)))]; });
  const modelCount = new Map();
  PRODUCTS.forEach((p) => p.models.forEach((k) => modelCount.set(k, (modelCount.get(k) || 0) + 1)));
  const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));
  const norm = (s) => String(s).toLowerCase();
  const NEW_RE = () => {
    const list = O.labels.new || [];
    return list.length ? new RegExp(list.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
  };

  /* ---------- състояние ---------- */
  let O = null; // настройките
  let dirty = false;
  let tab = sessionStorage.getItem("gdm_admin_tab") || "dash";
  const PAGES = {
    dash: ["Табло", "Оборот, поръчки, ремонти и състояние на магазина"],
    orders: ["Поръчки и заявки", "Поръчки, ремонти, запитвания, записани часове и откази"],
    promos: ["Промо кодове", "Кодове за отстъпка, които клиентите въвеждат при поръчка"],
    watches: ["Следени цени", "Клиенти, които чакат намаление на продукт"],
    products: ["Продукти", "Цени, наличност, снимки, описания, скриване и изтриване"],
    labels: ["Етикети и намаления", "„Ново“, „Хит“ и намаления по марка или модел"],
    home: ["Начална страница", "Витрина, подбрани модели и слайдове"],
    service: ["Ценоразпис на ремонти", "Цени по модел за страницата на сервиза, калкулатора и чата"],
    store: ["Магазин и доставка", "Контакти, работно време, доставка и социални мрежи"],
    chat: ["Чат асистент", "Указания, готови отговори и въпроси, препратени към служител"],
    analytics: ["Статистика", "Брояч на посещенията (само със съгласие на посетителя)"],
  };
  let sel = null; // избран продукт
  const blank = () => ({
    store: {}, labels: { new: [...(L0.new || [])], hot: [...(L0.hot || [])], sale: { ...(L0.sale || {}) }, newAdd: [], newRemove: [] },
    prices: {}, stock: {}, hidden: [], deleted: [], reviews: { items: [] }, analytics: { provider: "" }, edits: {}, vedits: {}, vadd: {}, vdel: [], padd: {},
  });
  function normalize(o) {
    const b = blank();
    o = o && typeof o === "object" ? o : {};
    return {
      ...b, ...o,
      store: { ...(o.store || {}) },
      labels: { ...b.labels, ...(o.labels || {}), sale: { ...((o.labels && o.labels.sale) || b.labels.sale) } },
      prices: { ...(o.prices || {}) }, stock: { ...(o.stock || {}) }, hidden: [...(o.hidden || [])], deleted: [...(o.deleted || [])],
      reviews: { items: [], ...(o.reviews || {}) }, analytics: { provider: "", ...(o.analytics || {}) },
      edits: { ...(o.edits || {}) }, vedits: { ...(o.vedits || {}) }, vadd: { ...(o.vadd || {}) }, vdel: [...(o.vdel || [])], padd: { ...(o.padd || {}) },
    };
  }
  const st = (k) => (O.store[k] !== undefined ? O.store[k] : S0[k]);
  function change() { dirty = true; $("#saveBtn").disabled = false; $("#status").textContent = "Има незапазени промени"; $("#status").className = "adm-status adm-status--dirty"; }

  let toastT;
  function toast(m, undo) {
    const t = $("#toast"); t.textContent = m;
    if (undo) {
      const b = document.createElement("button"); b.className = "toast__undo"; b.textContent = "Отмени";
      b.onclick = () => { undo(); t.classList.remove("show"); };
      t.append(" ", b);
    }
    t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), undo ? 6000 : 2600);
  }

  /* ---------- API ---------- */
  const pw = () => sessionStorage.getItem(PW_KEY) || "";
  async function api(method, body, query = "") {
    const r = await fetch("/api/settings" + query, {
      method, cache: "no-store",
      headers: { "content-type": "application/json", ...(pw() ? { "x-admin-password": pw() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  }

  /* ---------- вход ---------- */
  async function login(p) {
    sessionStorage.setItem(PW_KEY, p);
    const r = await api("POST", {}, "?check=1");
    if (r.ok) return true;
    sessionStorage.removeItem(PW_KEY);
    $("#loginMsg").textContent =
      r.status === 503 ? "Паролата не е настроена. В Netlify добави променлива ADMIN_PASSWORD (поне 8 знака) и публикувай отново."
      : r.status === 401 ? "Грешна парола."
      : r.status === 404 ? "Админ функцията не е публикувана на този адрес."
      : "Няма връзка със сървъра.";
    return false;
  }
  function registerNew(slug) {
    const d = O.padd[slug]; if (!d || BY_SLUG.has(slug)) return BY_SLUG.get(slug);
    const p = { slug, name: d.n, brand: d.b || "", cat: d.c, kind: "g", mk: "", sub: d.sc || "", compat: d.cm || [], specs: {}, variants: [], isNewProduct: true };
    p.brandLabel = p.brand || NO_BRAND; p.img = "";
    p.models = p.compat.filter((k) => MODELS.has(k));
    PRODUCTS.unshift(p); BY_SLUG.set(slug, p);
    return p;
  }
  async function enter() {
    const r = await api("GET", null, "?t=" + Date.now());
    O = normalize(r.ok ? r.data : {});
    Object.keys(O.padd).forEach(registerNew);
    $("#login").hidden = true; $("#app").hidden = false;
    if (O._savedAt) { $("#status").textContent = "Запазено " + new Date(O._savedAt).toLocaleString("bg-BG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    render(); badges(); setInterval(badges, 120000);
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = e.target.querySelector("button"); b.disabled = true; b.textContent = "Проверка…";
    if (await login($("#pw").value)) await enter();
    b.disabled = false; b.textContent = "Вход";
  });
  if (pw()) login(pw()).then((ok) => ok && enter());

  /* ---------- запис ---------- */
  async function save() {
    const b = $("#saveBtn"); b.disabled = true; b.textContent = "Запис…";
    const clean = JSON.parse(JSON.stringify(O));
    delete clean._savedAt;
    const r = await api("POST", clean);
    b.textContent = "Запази";
    if (r.ok) {
      dirty = false; O._savedAt = r.data.savedAt;
      // магазинът в този браузър веднага ползва новите настройки (без промо кодовете и указанията за чата)
      try { const pub = JSON.parse(JSON.stringify(O)); delete pub.promos; delete pub.chat; localStorage.setItem("gdm2_overrides", JSON.stringify({ t: Date.now(), admin: true, o: pub })); } catch {}
      $("#status").textContent = "Запазено " + new Date(r.data.savedAt).toLocaleTimeString("bg-BG") + " · видимо в сайта до минута";
      $("#status").className = "adm-status adm-status--ok";
      toast("✓ Промените са запазени");
    } else {
      b.disabled = false;
      toast(r.status === 401 ? "Сесията изтече – влез отново" : "Грешка при запис (" + r.status + ")");
      if (r.status === 401) { sessionStorage.removeItem(PW_KEY); location.reload(); }
    }
  }
  $("#saveBtn").addEventListener("click", save);
  addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (dirty) save(); } });

  /* ---------- меню ---------- */
  $("#menuBtn").addEventListener("click", () => ($("#menu").hidden = !$("#menu").hidden));
  $("#exportBtn").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(O, null, 2)], { type: "application/json" }));
    a.download = `gdmobil-nastroiki-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); $("#menu").hidden = true;
  });
  $("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { O = normalize(JSON.parse(await f.text())); change(); render(); toast("Файлът е зареден – натисни „Запази“"); }
    catch { toast("Невалиден файл"); }
    $("#menu").hidden = true;
  });
  $("#logoutBtn").addEventListener("click", () => { sessionStorage.removeItem(PW_KEY); location.reload(); });

  /* ---------- раздели ---------- */
  const sideOpen = (on) => { document.body.classList.toggle("adm-side-open", on); $("#scrim").hidden = !on; };
  $("#sideBtn").addEventListener("click", () => sideOpen(!document.body.classList.contains("adm-side-open")));
  $("#scrim").addEventListener("click", () => sideOpen(false));
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    tab = b.dataset.tab; sessionStorage.setItem("gdm_admin_tab", tab);
    sideOpen(false); render(); scrollTo(0, 0);
  });
  // брой нови заявки в менюто
  async function badges() {
    const r = await fetch("/api/orders?list=1", { headers: { "x-admin-password": pw() }, cache: "no-store" }).catch(() => null);
    if (!r || !r.ok) return;
    const d = await r.json().catch(() => null); if (!d) return;
    const n = (d.orders || []).filter((o) => o.status === "new").length;
    const b = $('[data-badge="orders"]'); if (b) { b.hidden = !n; b.textContent = n; }
  }
  function freshMain() { const m = $("#main"); const f = m.cloneNode(true); m.replaceWith(f); return f; } // без натрупани обработчици
  function render() {
    if (!PAGES[tab]) tab = "dash";
    $$("#tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === tab));
    $("#pageTitle").textContent = PAGES[tab][0]; $("#pageSub").textContent = PAGES[tab][1];
    document.title = PAGES[tab][0] + " | Админ GDMobil";
    const m = $("#main"), fresh = m.cloneNode(false);
    m.replaceWith(fresh); // нов елемент – без натрупани обработчици от предишния раздел
    ({ chat: renderChat, dash: renderDash, promos: renderPromos, watches: renderWatches, orders: renderOrders, products: renderProducts, service: renderService, labels: renderLabels, home: renderHome, store: renderStore, reviews: renderReviews, analytics: renderAnalytics })[tab]();
  }

  /* ===== ПРОДУКТИ ===== */
  // редакции на съдържанието: O.edits[slug] = { n: име, d: описание, img: главна снимка, gal: [галерия], vimg: {вариант: снимка} }
  const edOf = (p) => O.edits[p.slug] || {};
  const edSet = (p, k, v) => {
    const e = { ...edOf(p) };
    if (v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) delete e[k]; else e[k] = v;
    if (Object.keys(e).length) O.edits[p.slug] = e; else delete O.edits[p.slug];
    change();
  };
  const imgOf = (p, v) => (v && edOf(p).vimg?.[v.id]) || edOf(p).img || (v ? v.img : p.img);
  const nameOf = (p) => edOf(p).n || p.name;
  const isEdited = (p) => !!O.edits[p.slug];
  // варианти: редакции на текстовете (O.vedits[id]), нови (O.vadd[slug]) и изтрити (O.vdel)
  const VF = [["storage", "Памет"], ["ram", "RAM"], ["color", "Цвят"], ["conn", "Връзка"], ["model", "За модел"]];
  const vLabel = (v) => [v.model && "за " + v.model, v.storage, v.ram && v.ram + " RAM", v.color, v.conn].filter(Boolean).join(" · ") || "Стандартен";
  const variantsOf = (p) => [...p.variants, ...(O.vadd[p.slug] || []).map((x) => ({ ...x, price: null, isNew: true }))].map((v) => {
    const e = O.vedits[v.id] || {}, m = { ...v };
    VF.forEach(([k]) => { if (k in e) m[k] = e[k]; });
    m.label = vLabel(m); m.orig = v; m.deleted = O.vdel.includes(String(v.id));
    return m;
  });
  const variantsChanged = (p) => !!(O.vadd[p.slug] || []).length || p.variants.some((v) => O.vedits[v.id] || O.vdel.includes(String(v.id)));
  let DEL = new Set(), HID = new Set(); // бързи проверки; обновяват се при всяко изрисуване на списъка
  const syncSets = () => { DEL = new Set(O.deleted); HID = new Set(O.hidden); };
  const isDeleted = (p) => DEL.has(p.slug);
  const isChanged = (p) => isEdited(p) || variantsChanged(p) || DEL.has(p.slug) || HID.has(p.slug) || O.labels.hot.includes(p.slug) || O.labels.newAdd.includes(p.slug) || O.labels.newRemove.includes(p.slug) ||
    O.labels.sale[p.slug] != null || p.variants.some((v) => O.prices[v.id] != null || O.stock[v.id] === 0 || O.labels.sale[v.id] != null);
  // филтри (пазят се, докато е отворен разделът)
  const F = { q: "", cat: "", brand: "", model: "", sub: "", status: "", sort: "name", limit: 100 };
  const picked = new Set(); // маркирани продукти (slug)
  let refreshList = null; // обновява списъка на място (запазва превъртането)
  const resetFilters = () => { Object.assign(F, { q: "", cat: "", brand: "", model: "", sub: "", status: "", limit: 100 }); const q = $("#pq"); if (q) q.value = ""; };
  // изтриване/възстановяване на продукти без презареждане; при празен резултат – показва всички продукти
  function deleteProducts(slugs, on = true) {
    if (on) slugs.filter((x) => O.padd[x]).forEach((x) => {
      if (!confirm(`„${O.padd[x].n}“ е добавен ръчно – да го изтрия ли напълно?`)) return;
      (O.vadd[x] || []).forEach((v) => { delete O.prices[v.id]; delete O.stock[v.id]; delete O.labels.sale[v.id]; });
      delete O.padd[x]; delete O.vadd[x]; delete O.edits[x];
      const i = PRODUCTS.findIndex((p) => p.slug === x); if (i > -1) PRODUCTS.splice(i, 1); BY_SLUG.delete(x);
      if (sel && sel.slug === x) sel = null;
    });
    slugs = slugs.filter((x) => BY_SLUG.has(x));
    if (!slugs.length) { change(); syncSets(); if (refreshList) refreshList(); editProduct(); toast("✓ Изтрит – натисни „Запази“"); return; }
    slugs.forEach((x) => toggleIn(O.deleted, x, on));
    slugs.forEach((x) => picked.delete(x));
    if (sel && on && slugs.includes(sel.slug)) sel = null;
    change(); syncSets();
    let reset = false;
    if (on && F.status !== "deleted" && !filtered().length && (F.q || F.cat || F.brand || F.model || F.sub || F.status)) { resetFilters(); reset = true; }
    if (refreshList) refreshList();
    editProduct();
    const n = slugs.length, one = n === 1 ? `„${nameOf(BY_SLUG.get(slugs[0]) || { name: "" }).slice(0, 40)}“` : `${n} продукта`;
    toast(on ? `✓ Изтрит${n === 1 ? "" : "и"} ${one}${reset ? " · показвам всички продукти" : ""} – натисни „Запази“` : `✓ Възстановен${n === 1 ? "" : "и"} ${one}`,
      on ? () => deleteProducts(slugs, false) : null);
  }

  const liveVariants = (p) => [...p.variants, ...(O.vadd[p.slug] || []).map((x) => ({ ...x, price: null }))].filter((v) => !O.vdel.includes(String(v.id)));
  const prMin = (p) => { const l = liveVariants(p).map((v) => finalOf(p, v)).filter((x) => x != null); return l.length ? Math.min(...l) : null; };
  const prMax = (p) => { const l = liveVariants(p).map((v) => finalOf(p, v)).filter((x) => x != null); return l.length ? Math.max(...l) : null; };
  const STATUS = {
    changed: ["Променени", isChanged],
    edited: ["С редактирано име/описание/снимки", isEdited],
    added: ["Добавени ръчно", (p) => !!p.isNewProduct],
    hidden: ["Скрити", (p) => HID.has(p.slug)],
    deleted: ["Изтрити", isDeleted],
    sale: ["С намаление", (p) => O.labels.sale[p.slug] > 0 || p.variants.some((v) => O.labels.sale[v.id] > 0 || v.disc > 0 || v.old > v.price)],
    price: ["С ръчна цена", (p) => p.variants.some((v) => O.prices[v.id] != null)],
    order: ["По заявка", (p) => p.variants.some((v) => O.stock[v.id] === 0 || v.stock === 0)],
    hot: ["Хит", (p) => O.labels.hot.includes(p.slug)],
    noprice: ["Без цена", (p) => prMin(p) == null],
    multi: ["С много варианти (5+)", (p) => p.variants.length >= 5],
  };
  const firstModel = (p) => (p.models[0] ? modelName(p.models[0]) : "");
  const SORTS = {
    name: ["Име (А–Я)", (a, b) => a.name.localeCompare(b.name, "bg")],
    brand: ["Марка, после име", (a, b) => (a.brandLabel === NO_BRAND) - (b.brandLabel === NO_BRAND) || a.brandLabel.localeCompare(b.brandLabel, "en") || a.name.localeCompare(b.name, "bg")],
    model: ["Модел, после име", (a, b) => (firstModel(a) || "яяя").localeCompare(firstModel(b) || "яяя", "bg") || a.name.localeCompare(b.name, "bg")],
    priceUp: ["Цена ↑", (a, b) => (prMin(a) ?? 1e9) - (prMin(b) ?? 1e9)],
    priceDown: ["Цена ↓", (a, b) => (prMin(b) ?? -1) - (prMin(a) ?? -1)],
    variants: ["Брой варианти", (a, b) => b.variants.length - a.variants.length],
  };
  function filtered(ignore = "") {
    const toks = norm(F.q).split(/\s+/).filter(Boolean);
    return PRODUCTS.filter((p) =>
      (ignore === "cat" || !F.cat || p.cat === F.cat) &&
      (ignore === "brand" || !F.brand || p.brandLabel === F.brand) &&
      (ignore === "model" || !F.model || p.models.includes(F.model)) &&
      (ignore === "sub" || !F.sub || p.sub === F.sub) &&
      (F.status === "deleted" || !isDeleted(p)) &&
      (!F.status || STATUS[F.status][1](p)) &&
      toks.every((t) => norm(`${p.brand} ${nameOf(p)} ${p.name} ${p.sub} ${p.models.map(modelName).join(" ")} ${p.variants.map((v) => v.id + " " + (v.code || "")).join(" ")}`).includes(t)));
  }
  const counts = (list, key) => { const m = new Map(); list.forEach((p) => [].concat(key(p)).forEach((k) => k && m.set(k, (m.get(k) || 0) + 1))); return m; };
  function renderProducts() {
    freshMain();
    const stat = (k) => PRODUCTS.filter((p) => (k === "deleted" || !isDeleted(p)) && STATUS[k][1](p)).length;
    const drawStats = () => {
      $("#pstats").innerHTML = `<button data-qs="" class="${F.status ? "" : "on"}">Всички<b>${PRODUCTS.length - DEL.size}</b></button>` +
        ["changed", "edited", "added", "hidden", "deleted", "sale", "price", "order", "noprice"].map((k) => `<button data-qs="${k}" class="${F.status === k ? "on" : ""}">${STATUS[k][0]}<b>${stat(k)}</b></button>`).join("");
    };
    $("#main").innerHTML = `
      <div class="adm-stats" id="pstats"></div>
      <div class="adm-split">
      <aside class="adm-list">
        <div class="adm-list__tools">
          <div class="adm-row adm-newrow"><input class="input" id="pq" type="search" placeholder="Търси по име, модел, арт. номер…" value="${esc(F.q)}" /><button class="btn btn--primary btn--sm" id="pNew">+ Нов продукт</button></div>
          <div class="adm-filters">
            <select class="select" id="fCat" aria-label="Категория"></select>
            <select class="select" id="fBrand" aria-label="Марка"></select>
            <select class="select" id="fModel" aria-label="Модел"></select>
            <select class="select" id="fSub" aria-label="Подкатегория"></select>
            <select class="select" id="fStatus" aria-label="Статус"></select>
            <select class="select" id="fSort" aria-label="Подреди по"></select>
          </div>
          <div class="adm-row adm-row--between"><label class="check adm-pickall"><input type="checkbox" id="pickAll"><span class="muted small" id="pcount"></span></label><button class="link-btn" id="fReset">Изчисти филтрите</button></div>
          <div class="adm-bulk" id="bulk" hidden>
            <b id="bulkN"></b>
            <div class="adm-bulk__btns">
              <button class="btn btn--sm adm-btn--danger" data-bulk="delete">Изтрий</button>
              <button class="btn btn--ghost btn--sm" data-bulk="restore">Възстанови</button>
              <button class="btn btn--ghost btn--sm" data-bulk="hide">Скрий</button>
              <button class="btn btn--ghost btn--sm" data-bulk="show">Покажи</button>
              <button class="btn btn--ghost btn--sm" data-bulk="hot">Хит</button>
              <button class="btn btn--ghost btn--sm" data-bulk="unhot">Без „Хит“</button>
              <button class="btn btn--ghost btn--sm" data-bulk="order">По заявка</button>
              <button class="btn btn--ghost btn--sm" data-bulk="stock">В наличност</button>
              <button class="btn btn--ghost btn--sm" data-bulk="sale">Намаление %</button>
              <button class="link-btn" data-bulk="clear">Отмени избора</button>
            </div>
          </div>
        </div>
        <div class="adm-results" id="pres"></div>
      </aside>
      <section class="adm-edit" id="pedit"></section>
    </div>`;
    const opt = (v, label, n, cur) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(label)}${n != null ? ` (${n})` : ""}</option>`;
    const fillFilters = () => {
      const cc = counts(filtered("cat"), (p) => p.cat);
      $("#fCat").innerHTML = opt("", "Всички категории", null, F.cat) + Object.entries(CAT).map(([k, n]) => opt(k, n, cc.get(k) || 0, F.cat)).join("");
      const bc = counts(filtered("brand"), (p) => p.brandLabel);
      $("#fBrand").innerHTML = opt("", "Всички марки", null, F.brand) + [...bc.keys()].sort((a, b) => (a === NO_BRAND) - (b === NO_BRAND) || a.localeCompare(b, "en")).map((b) => opt(b, b, bc.get(b), F.brand)).join("");
      const mc = counts(filtered("model"), (p) => p.models);
      const byBrand = new Map();
      [...mc.keys()].map((k) => MODELS.get(k)).sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name, "bg", { numeric: true })).forEach((m) => { if (!byBrand.has(m.brand)) byBrand.set(m.brand, []); byBrand.get(m.brand).push(m); });
      $("#fModel").innerHTML = opt("", "Всички модели", null, F.model) + [...byBrand].map(([b, ms]) => `<optgroup label="${esc(b)}">${ms.map((m) => opt(m.key, m.name, mc.get(m.key), F.model)).join("")}</optgroup>`).join("");
      const sc = counts(filtered("sub"), (p) => p.sub);
      $("#fSub").innerHTML = opt("", "Всички подкатегории", null, F.sub) + [...sc.keys()].sort((a, b) => a.localeCompare(b, "bg")).map((x) => opt(x, x, sc.get(x), F.sub)).join("");
      $("#fSub").hidden = sc.size < 2 && !F.sub;
      $("#fStatus").innerHTML = opt("", "Всякакъв статус", null, F.status) + Object.entries(STATUS).map(([k, [n]]) => opt(k, n, null, F.status)).join("");
      $("#fSort").innerHTML = Object.entries(SORTS).map(([k, [n]]) => opt(k, "Подреди: " + n, null, F.sort)).join("");
      $$(".adm-stats [data-qs]").forEach((b) => b.classList.toggle("on", b.dataset.qs === F.status));
    };
    const groupOf = (p) => (F.sort === "brand" ? p.brandLabel : F.sort === "model" ? firstModel(p) || "Без модел" : "");
    let res = [];
    const bulkBar = () => {
      const n = picked.size;
      $("#bulk").hidden = !n;
      $("#bulkN").textContent = `Избрани: ${n}`;
      const inRes = res.filter((p) => picked.has(p.slug)).length;
      $("#pickAll").checked = !!res.length && inRes === res.length;
      $("#pickAll").indeterminate = inRes > 0 && inRes < res.length;
      $("#pcount").textContent = `${res.length} продукта${res.length > F.limit ? ` · показани ${F.limit}` : ""}`;
    };
    const list = () => {
      syncSets();
      drawStats();
      fillFilters();
      res = filtered().sort(SORTS[F.sort][1]);
      let last = null;
      $("#pres").innerHTML = res.slice(0, F.limit).map((p) => {
        const g = groupOf(p);
        const head = g && g !== last ? `<h4 class="adm-group">${esc(g)} <span>${res.filter((x) => groupOf(x) === g).length}</span></h4>` : "";
        last = g;
        const min = prMin(p), max = prMax(p);
        const chips = [
          isDeleted(p) && `<i class="adm-chip adm-chip--red">изтрит</i>`,
          HID.has(p.slug) && `<i class="adm-chip adm-chip--grey">скрит</i>`,
          STATUS.sale[1](p) && `<i class="adm-chip adm-chip--red">намаление</i>`,
          STATUS.price[1](p) && `<i class="adm-chip">ръчна цена</i>`,
          STATUS.order[1](p) && `<i class="adm-chip adm-chip--amber">по заявка</i>`,
          O.labels.hot.includes(p.slug) && `<i class="adm-chip adm-chip--ember">хит</i>`,
          isEdited(p) && `<i class="adm-chip adm-chip--blue">редактиран</i>`,
          p.isNewProduct && `<i class="adm-chip adm-chip--blue">нов продукт</i>`,
        ].filter(Boolean).join("");
        const models = p.cat === "accessories" && p.models.length ? ` · ${esc(modelName(p.models[0]))}${p.models.length > 1 ? ` +${p.models.length - 1}` : ""}` : "";
        return head + `<div class="adm-pickrow ${picked.has(p.slug) ? "is-picked" : ""}"><label class="adm-pick" title="Маркирай"><input type="checkbox" data-pick="${p.slug}" ${picked.has(p.slug) ? "checked" : ""}></label><button class="adm-item ${sel === p ? "on" : ""}" data-slug="${p.slug}">
          <span class="adm-item__img">${imgOf(p) ? `<img src="${esc(thumb(imgOf(p)))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}</span>
          <span class="adm-item__txt"><small class="adm-item__brand">${esc(p.brandLabel)} · ${CAT[p.cat]}${p.sub && p.cat === "accessories" ? " · " + esc(p.sub) : ""}</small>
            <b>${esc(nameOf(p))}</b>
            <small>${min == null ? "при запитване" : min === max ? eur(min) : `${eur(min)} – ${eur(max)}`}${p.variants.length > 1 ? ` · ${p.variants.length} варианта` : ""}${models}</small>
            ${chips ? `<span class="adm-chips">${chips}</span>` : ""}</span>
          ${isChanged(p) ? `<i class="adm-dot" title="Има промени"></i>` : ""}</button>
          ${isDeleted(p) ? `<button class="adm-rowact" data-rowrestore="${p.slug}" title="Възстанови" aria-label="Възстанови">↺</button>`
            : `<button class="adm-rowact adm-rowact--del" data-rowdel="${p.slug}" title="Изтрий" aria-label="Изтрий ${esc(nameOf(p))}"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`}</div>`;
      }).join("") + (res.length > F.limit ? `<button class="btn btn--ghost btn--sm btn--block" id="pmore">Покажи още ${Math.min(100, res.length - F.limit)}</button>` : "")
        + (res.length ? "" : `<div class="adm-none"><p class="muted">Няма продукти с тези филтри.</p><button class="btn btn--ghost btn--sm" id="pShowAll">Покажи всички продукти</button></div>`);
      bulkBar();
    };
    const set = (k, v) => { F[k] = v; F.limit = 100; list(); };
    refreshList = () => { const sc = $("#pres").scrollTop; list(); $("#pres").scrollTop = sc; };
    list();
    $("#pq").addEventListener("input", (e) => set("q", e.target.value));
    [["fCat", "cat"], ["fBrand", "brand"], ["fModel", "model"], ["fSub", "sub"], ["fStatus", "status"], ["fSort", "sort"]].forEach(([id, k]) => $("#" + id).addEventListener("change", (e) => set(k, e.target.value)));
    $("#fReset").addEventListener("click", () => { Object.assign(F, { q: "", cat: "", brand: "", model: "", sub: "", status: "", sort: "name", limit: 100 }); $("#pq").value = ""; list(); });
    $(".adm-stats").addEventListener("click", (e) => { const b = e.target.closest("[data-qs]"); if (b) set("status", b.dataset.qs); });
    $("#pNew").addEventListener("click", () => { sel = null; newProductForm(); if (innerWidth < 900) $("#pedit").scrollIntoView({ behavior: "smooth" }); });
    $("#pickAll").addEventListener("change", (e) => { res.forEach((p) => (e.target.checked ? picked.add(p.slug) : picked.delete(p.slug))); list(); });
    $("#bulk").addEventListener("click", (e) => {
      const b = e.target.closest("[data-bulk]"); if (!b) return;
      const act = b.dataset.bulk, slugs = [...picked], n = slugs.length;
      if (act === "clear") { picked.clear(); list(); return; }
      if (!n) return;
      const ps = slugs.map((x) => BY_SLUG.get(x)).filter(Boolean);
      if (act === "delete") {
        if (!confirm(`Да изтрия ли ${n} продукт${n > 1 ? "а" : ""} от сайта?\n\nТе изчезват от магазина, търсенето, Google и фийда след „Запази“. Можеш да ги възстановиш от плочката „Изтрити“.`)) return;
        return deleteProducts(slugs, true);
      }
      if (act === "restore") return deleteProducts(slugs, false);
      if (act === "hide" || act === "show") slugs.forEach((x) => toggleIn(O.hidden, x, act === "hide"));
      if (act === "hot" || act === "unhot") slugs.forEach((x) => toggleIn(O.labels.hot, x, act === "hot"));
      if (act === "order" || act === "stock") ps.forEach((p) => p.variants.forEach((v) => (act === "order" ? (O.stock[v.id] = 0) : delete O.stock[v.id])));
      if (act === "sale") {
        const v = prompt(`Намаление в % за ${n} продукта (0 = премахни намалението):`, "10");
        if (v == null) return;
        const pct = Math.max(0, Math.min(90, Math.round(Number(v) || 0)));
        slugs.forEach((x) => (pct ? (O.labels.sale[x] = pct) : delete O.labels.sale[x]));
      }
      change();
      toast(`✓ ${{ delete: "Изтрити", restore: "Възстановени", hide: "Скрити", show: "Показани", hot: "Маркирани като хит", unhot: "Без хит", order: "По заявка", stock: "В наличност", sale: "Намалението е зададено за" }[act]} ${n} – натисни „Запази“`);
      picked.clear(); refreshList(); editProduct();
    });
    let lastPick = null;
    $("#pres").addEventListener("click", (e) => {
      const cb = e.target.closest("[data-pick]");
      if (cb) {
        // Shift + клик маркира всички между последната и тази отметка
        const slugs = res.slice(0, F.limit).map((x) => x.slug), i = slugs.indexOf(cb.dataset.pick);
        const range = e.shiftKey && lastPick != null ? slugs.slice(Math.min(i, lastPick), Math.max(i, lastPick) + 1) : [cb.dataset.pick];
        range.forEach((sl) => (cb.checked ? picked.add(sl) : picked.delete(sl)));
        lastPick = i;
        range.forEach((sl) => { const r = $(`[data-pick="${CSS.escape(sl)}"]`); if (r) { r.checked = cb.checked; r.closest(".adm-pickrow").classList.toggle("is-picked", cb.checked); } });
        bulkBar(); return;
      }
      if (e.target.closest("#pmore")) { F.limit += 100; list(); return; }
      if (e.target.closest("#pShowAll")) { resetFilters(); list(); return; }
      const rd = e.target.closest("[data-rowdel],[data-rowrestore]");
      if (rd) { deleteProducts([rd.dataset.rowdel || rd.dataset.rowrestore], !!rd.dataset.rowdel); return; }
      const b = e.target.closest("[data-slug]"); if (b) { sel = BY_SLUG.get(b.dataset.slug); $$("#pres .adm-item").forEach((x) => x.classList.toggle("on", x === b)); editProduct(); if (innerWidth < 900) $("#pedit").scrollIntoView({ behavior: "smooth" }); }
    });
    editProduct();
  }
  function newProductForm() {
    const old = $("#pedit"); if (!old) return;
    const box = old.cloneNode(false); old.replaceWith(box);
    const subs = [...new Set(PRODUCTS.filter((x) => x.cat === "accessories" && x.sub).map((x) => x.sub))].sort((a, b) => a.localeCompare(b, "bg"));
    const brands = [...new Set(PRODUCTS.map((x) => x.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
    const models = [...MODELS.values()].sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name, "bg", { numeric: true }));
    box.innerHTML = `<form class="adm-newp" id="npForm">
      <div class="adm-edit__head"><div><small class="muted">Каталог</small><h2>Нов продукт</h2></div><button type="button" class="btn btn--ghost btn--sm" id="npCancel">Откажи</button></div>
      <p class="muted small">Попълни основното – след „Създай“ продуктът се отваря и можеш да качиш снимки, описание и още варианти (цветове, памет). Видим е в магазина след „Запази“.</p>
      <div class="adm-grid">
        <label class="field adm-span2"><span>Име на продукта *</span><input class="input" name="n" required maxlength="160" placeholder="напр. Кейс Spigen Ultra Hybrid за iPhone 17 Pro"></label>
        <label class="field"><span>Категория *</span><select class="select" name="c"><option value="accessories">Аксесоари</option><option value="phones">Телефони</option><option value="tablets">Таблети</option></select></label>
        <label class="field" id="npSubF"><span>Подкатегория</span><select class="select" name="sc">${subs.map((x) => `<option ${x === "Калъфи" ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
        <label class="field"><span>Марка</span><input class="input" name="b" list="npBrands" placeholder="напр. Spigen"><datalist id="npBrands">${brands.map((b) => `<option value="${esc(b)}">`).join("")}</datalist></label>
        <label class="field"><span>Цена (€) *</span><input class="input" name="price" type="number" min="0.01" step="0.01" required></label>
        <label class="field"><span>Цвят</span><input class="input" name="color" placeholder="напр. Черен"></label>
        <label class="field"><span>Памет</span><input class="input" name="storage" placeholder="напр. 256 GB (за телефон/таблет)"></label>
        <label class="field adm-span2" id="npCmF"><span>Съвместим с модели <small class="muted">(за аксесоари – Ctrl/⌘ + клик за няколко)</small></span>
          <input class="input input--sm" id="npCmQ" type="search" placeholder="Търси модел, напр. iPhone 17">
          <select class="select adm-multi" name="cm" multiple size="8">${models.map((m) => `<option value="${esc(m.key)}">${esc(m.name)}</option>`).join("")}</select></label>
      </div>
      <div class="adm-row"><button class="btn btn--primary" type="submit">Създай продукта</button></div>
    </form>`;
    const f = $("#npForm", box);
    const sync = () => { const acc = f.c.value === "accessories"; $("#npSubF", box).hidden = !acc; $("#npCmF", box).hidden = !acc; };
    f.c.addEventListener("change", sync); sync();
    $("#npCmQ", box).addEventListener("input", (e) => { const q = norm(e.target.value); [...f.cm.options].forEach((o) => (o.hidden = !!q && !norm(o.textContent).includes(q) && !o.selected)); });
    $("#npCancel", box).addEventListener("click", () => editProduct());
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = f.n.value.trim(); if (!n) return;
      const tr = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya" };
      const base = n.toLowerCase().split("").map((ch) => tr[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "produkt";
      let slug = base + "-n" + Math.floor(1000 + Math.random() * 9000);
      while (BY_SLUG.has(slug)) slug = base + "-n" + Math.floor(1000 + Math.random() * 9000);
      const cat = f.c.value;
      O.padd[slug] = { n, b: f.b.value.trim(), c: cat, sc: cat === "accessories" ? f.sc.value : "", cm: cat === "accessories" ? [...f.cm.selectedOptions].map((o) => o.value) : [] };
      const used = new Set([...PRODUCTS.flatMap((x) => x.variants.map((v) => v.id)), ...Object.values(O.vadd).flat().map((x) => x.id)]);
      let id; do { id = 990000000 + Math.floor(Math.random() * 9000000); } while (used.has(id));
      O.vadd[slug] = [{ id, storage: f.storage.value.trim(), ram: "", color: f.color.value.trim(), conn: "", model: "", vmk: "", img: "" }];
      O.prices[id] = Math.round(Number(f.price.value) * 100) / 100;
      change();
      sel = registerNew(slug);
      Object.assign(F, { q: "", cat: "", brand: "", model: "", sub: "", status: "added", limit: 100 });
      renderProducts();
      toast("✓ Продуктът е създаден – качи снимка и натисни „Запази“");
    });
    f.n.focus();
  }

  const toggleIn = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i > -1) arr.splice(i, 1); };
  function finalOf(p, v) {
    const base = O.prices[v.id] != null ? Number(O.prices[v.id]) : v.price;
    const pct = Number(O.labels.sale[v.id] ?? O.labels.sale[p.slug] ?? 0);
    return base == null ? null : pct > 0 ? Math.round(base * (100 - pct)) / 100 : base;
  }
  function editProduct() {
    const old = $("#pedit"); if (!old) return;
    const box = old.cloneNode(false); old.replaceWith(box); // без натрупани обработчици от предишния продукт
    if (!sel) { box.innerHTML = `<div class="adm-empty"><b>Избери продукт отляво</b><p class="muted">Можеш да промениш цена, намаление, наличност и етикети, или да го скриеш от сайта.</p></div>`; return; }
    const p = sel;
    const vFields = VF.filter(([k]) => k === "color" || p.variants.some((v) => v[k]) || (O.vadd[p.slug] || []).some((v) => v[k]));
    const autoNew = !!NEW_RE() && (p.cat === "phones" || p.cat === "tablets") && NEW_RE().test(p.name);
    const newMode = O.labels.newAdd.includes(p.slug) ? "on" : O.labels.newRemove.includes(p.slug) ? "off" : "auto";
    box.innerHTML = `
      <div class="adm-edit__head">
        <div class="adm-edit__img">${imgOf(p) ? `<img src="${esc(thumb(imgOf(p)))}" alt="" onerror="this.style.visibility='hidden'">` : ""}</div>
        <div class="adm-edit__title"><small class="muted">${esc(p.brandLabel)} · ${CAT[p.cat]}${p.sub ? " · " + esc(p.sub) : ""}</small><h2>${esc(nameOf(p))}</h2>
          <div class="adm-facts">
            <span><small>Цена в сайта</small><b>${(() => { const a = prMin(p), b = prMax(p); return a == null ? "при запитване" : a === b ? eur(a) : eur(a) + " – " + eur(b); })()}</b></span>
            <span><small>Варианти</small><b>${p.variants.length}</b></span>
            ${p.cat !== "accessories" && p.mk ? `<span><small>Модел</small><b>${esc(modelName(p.mk) || p.name)}</b></span>` : ""}
            ${p.cat === "accessories" ? `<span><small>Съвместим с</small><b>${p.models.length ? p.models.length + " модела" : "—"}</b></span>` : ""}
            <span><small>Адрес</small><b class="adm-slug">/p/${esc(p.slug)}/</b></span>
          </div></div>
        <div class="adm-edit__act"><a class="btn btn--ghost btn--sm" href="./#/p/${p.slug}" target="_blank" rel="noopener">Виж в магазина ↗</a>
          ${O.deleted.includes(p.slug) ? `<button class="btn btn--ghost btn--sm" id="pRestore">Възстанови</button>` : `<button class="btn btn--sm adm-btn--danger" id="pDelete">Изтрий</button>`}</div></div>
      ${O.deleted.includes(p.slug) ? `<div class="adm-warn">Този продукт е <b>изтрит</b> – не се показва в сайта, търсенето, Google и фийда.</div>` : ""}
      <section class="adm-content">
        <div class="adm-content__head"><h3>Съдържание на страницата</h3>${isEdited(p) ? `<button class="link-btn" id="edReset">Върни оригинала</button>` : ""}</div>
        <label class="field"><span>Име на продукта</span><input class="input" id="edName" value="${esc(edOf(p).n || "")}" placeholder="${esc(p.name)}" maxlength="160"></label>
        <label class="field"><span>Описание <small class="muted">(празен ред = нов абзац; празно поле = автоматичното описание)</small></span>
          <textarea class="input" id="edDesc" rows="5" maxlength="4000" placeholder="${esc(p.desc || "Напиши описание – предимства, какво има в кутията, гаранция…")}">${esc(edOf(p).d || "")}</textarea></label>
        <div class="field"><span>Снимки <small class="muted">(главна + галерия; JPG/PNG/WebP – намаляват се автоматично${p.variants.length > 1 ? "; снимка за отделен цвят/вариант – натисни снимката му в таблицата по-долу" : ""})</small></span>
          <div class="adm-photos" id="edPhotos">
            <figure class="adm-photo adm-photo--main"><img src="${esc(thumb(imgOf(p)) || "")}" alt="" onerror="this.style.visibility='hidden'"><figcaption>Главна${p.variants.length > 1 ? " (за всички варианти)" : ""}${edOf(p).img ? ` · <button class="link-btn" data-edimg-reset>оригинал</button>` : ""}</figcaption>
              <label class="adm-photo__btn">Смени<input type="file" accept="image/*" data-up="main" hidden></label></figure>
            ${(edOf(p).gal || []).map((u, i) => `<figure class="adm-photo"><img src="${esc(thumb(u))}" alt=""><figcaption>
              <button class="link-btn" data-galmv="${i}" title="Направи главна">главна</button> · <button class="link-btn" data-galdel="${i}">изтрий</button></figcaption></figure>`).join("")}
            <label class="adm-photo adm-photo--add"><span>+</span><small>Добави снимки</small><input type="file" accept="image/*" multiple data-up="gal" hidden></label>
          </div>
          <p class="muted small" id="edMsg">${(edOf(p).gal || []).length ? "" : "Без собствена галерия се показват снимките от каталога."}</p>
        </div>
      </section>
      ${p.cat === "accessories" && p.models.length ? `<details class="adm-details"><summary>Съвместими модели (${p.models.length})</summary><div class="adm-tags">${p.models.map((k) => `<button class="adm-tag" data-model="${esc(k)}" title="Покажи всички продукти за модела">${esc(modelName(k))}</button>`).join("")}</div></details>` : ""}
      ${Object.keys(p.specs).length ? `<details class="adm-details"><summary>Характеристики (${Object.keys(p.specs).length})</summary><dl class="adm-specs">${Object.entries(p.specs).slice(0, 40).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></details>` : ""}
      <div class="adm-cards">
        <label class="adm-card"><span>Намаление за целия модел</span><div class="adm-pct"><input class="input" type="number" min="0" max="90" step="1" id="mSale" value="${esc(O.labels.sale[p.slug] ?? "")}" placeholder="0" /><b>%</b></div></label>
        <label class="adm-card"><span>Етикет „Ново“</span><select class="select" id="mNew">
          <option value="auto" ${newMode === "auto" ? "selected" : ""}>Автоматично (${autoNew ? "да" : "не"})</option>
          <option value="on" ${newMode === "on" ? "selected" : ""}>Винаги</option><option value="off" ${newMode === "off" ? "selected" : ""}>Никога</option></select></label>
        <label class="adm-card adm-card--check"><input type="checkbox" id="mHot" ${O.labels.hot.includes(p.slug) ? "checked" : ""}><span><b>Етикет „Хит“</b><small>Показва се и в „Подбрани“ при раздел Хит</small></span></label>
        <label class="adm-card adm-card--check"><input type="checkbox" id="mHide" ${O.hidden.includes(p.slug) ? "checked" : ""}><span><b>Скрий от сайта</b><small>Няма да се показва никъде</small></span></label>
      </div>
      <div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th></th><th>Вариант</th><th>Цена в каталога</th><th>Нова цена</th><th>Намаление</th><th>Наличност</th><th>Крайна цена</th><th></th></tr></thead>
        <tbody>${variantsOf(p).map((v) => `<tr data-id="${v.id}" class="${v.deleted ? "adm-vdel" : ""}${v.isNew ? " adm-vnew" : ""}">
          <td class="adm-vimg"><label title="Смени снимката на този вариант">${imgOf(p, v) ? `<img src="${esc(thumb(imgOf(p, v)))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : "<span>+</span>"}<input type="file" accept="image/*" data-up="v" data-vid="${v.id}" hidden></label>
            ${edOf(p).vimg?.[v.id] ? `<button class="link-btn" data-vreset="${v.id}">оригинал</button>` : ""}</td>
          <td class="adm-vcell"><b>${esc(v.label)}</b>${v.isNew ? ` <i class="adm-chip adm-chip--blue">нов</i>` : ""}${v.deleted ? ` <i class="adm-chip adm-chip--red">изтрит</i>` : ""}
            <small class="muted">Арт. ${v.id}${v.code ? " · код " + esc(v.code) : ""}${v.stock === 0 ? " · в каталога: по заявка" : ""}</small>
            ${v.deleted ? "" : `<div class="adm-vfields">${vFields.map(([k, n]) => `<label><span>${n}</span><input class="input input--sm" data-ve="${k}" value="${esc(v[k] || "")}" placeholder="${esc(v.isNew ? "" : v.orig[k] || "—")}"></label>`).join("")}</div>`}</td>
          <td>${v.isNew ? `<small class="muted">нов</small>` : eur(v.price)}${v.old > v.price ? `<small class="muted"><s>${eur(v.old)}</s></small>` : ""}</td>
          <td><input class="input input--sm" type="number" min="0" step="0.01" data-f="price" value="${esc(O.prices[v.id] ?? "")}" placeholder="${v.price ?? ""}" /></td>
          <td><div class="adm-pct"><input class="input input--sm" type="number" min="0" max="90" step="1" data-f="sale" value="${esc(O.labels.sale[v.id] ?? "")}" placeholder="${O.labels.sale[p.slug] ?? 0}" /><b>%</b></div></td>
          <td><select class="select input--sm" data-f="stock"><option value="1">В наличност</option><option value="0" ${O.stock[v.id] === 0 ? "selected" : ""}>По заявка</option></select></td>
          <td class="adm-final" data-final>${v.isNew && O.prices[v.id] == null ? `<small class="adm-warn-inline">задай цена</small>` : eur(finalOf(p, v))}</td>
          <td>${v.deleted ? `<button class="adm-rowact" data-vrestore="${v.id}" title="Възстанови варианта">↺</button>`
            : `<button class="adm-rowact adm-rowact--del" data-vdelete="${v.id}" title="Изтрий варианта" aria-label="Изтрий варианта"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`}</td></tr>`).join("")}</tbody></table></div>
      <div class="adm-row"><button class="btn btn--ghost btn--sm" id="vAdd">+ Добави вариант</button><span class="muted small">Нов цвят, памет или модел – копира първия вариант, после сменяш текстовете, цената и снимката.</span></div>
      ${p.variants.length > 1 ? `<div class="adm-row"><button class="btn btn--ghost btn--sm" id="allStockOn">Всички в наличност</button><button class="btn btn--ghost btn--sm" id="allStockOff">Всички по заявка</button><button class="btn btn--ghost btn--sm" id="resetModel">Изчисти промените по модела</button></div>`
        : `<div class="adm-row"><button class="btn btn--ghost btn--sm" id="resetModel">Изчисти промените</button></div>`}
      <p class="muted small">Празно поле = стойността от каталога. Намалението по вариант има предимство пред това за целия модел.</p>`;
    const refreshFinal = () => $$("tr[data-id]", box).forEach((tr) => { const v = variantsOf(p).find((x) => String(x.id) === tr.dataset.id); if (v) $("[data-final]", tr).textContent = v.isNew && O.prices[v.id] == null ? "задай цена" : eur(finalOf(p, v)); });
    const num = (s) => (s === "" ? null : Math.max(0, Number(s)));
    $("#mSale").addEventListener("input", (e) => { const n = num(e.target.value); n ? (O.labels.sale[p.slug] = Math.min(90, n)) : delete O.labels.sale[p.slug]; change(); refreshFinal(); $$('[data-f="sale"]', box).forEach((i) => (i.placeholder = O.labels.sale[p.slug] ?? 0)); });
    $("#mNew").addEventListener("change", (e) => { toggleIn(O.labels.newAdd, p.slug, e.target.value === "on"); toggleIn(O.labels.newRemove, p.slug, e.target.value === "off"); change(); });
    $("#mHot").addEventListener("change", (e) => { toggleIn(O.labels.hot, p.slug, e.target.checked); change(); });
    $("#mHide").addEventListener("change", (e) => { toggleIn(O.hidden, p.slug, e.target.checked); change(); });
    box.addEventListener("input", (e) => {
      const ve = e.target.dataset.ve, vtr = e.target.closest("tr[data-id]");
      if (ve && vtr) {
        const id = vtr.dataset.id, val = e.target.value.trim();
        const added = (O.vadd[p.slug] || []).find((x) => String(x.id) === id);
        if (added) added[ve] = val;
        else {
          const orig = p.variants.find((x) => String(x.id) === id) || {};
          const ed = { ...(O.vedits[id] || {}) };
          if (val === (orig[ve] || "")) delete ed[ve]; else ed[ve] = val;
          if (Object.keys(ed).length) O.vedits[id] = ed; else delete O.vedits[id];
        }
        $("b", vtr.querySelector(".adm-vcell")).textContent = (variantsOf(p).find((x) => String(x.id) === id) || {}).label || "";
        change(); return;
      }
      const f = e.target.dataset.f, tr = e.target.closest("tr[data-id]"); if (!f || !tr) return;
      const id = tr.dataset.id, n = num(e.target.value);
      if (f === "price") n != null ? (O.prices[id] = n) : delete O.prices[id];
      if (f === "sale") n ? (O.labels.sale[id] = Math.min(90, n)) : delete O.labels.sale[id];
      change(); refreshFinal();
    });
    // смяна на цвят/памет/модел – предлага същото за всички варианти със същата стойност
    box.addEventListener("change", (e) => {
      const ve = e.target.dataset.ve, tr = e.target.closest("tr[data-id]"); if (!ve || !tr) return;
      const all = variantsOf(p), me = all.find((x) => String(x.id) === tr.dataset.id); if (!me || me.isNew) return;
      const from = me.orig[ve] || "", to = e.target.value.trim();
      if (!from || from === to) return;
      const others = all.filter((x) => !x.isNew && x.id !== me.id && (x.orig[ve] || "") === from && (x[ve] || "") !== to);
      if (!others.length || !confirm(`Да сменя ли „${from}“ на „${to || "(празно)"}“ и при останалите ${others.length} варианта?`)) return;
      others.forEach((x) => { const ed = { ...(O.vedits[x.id] || {}) }; if (to === from) delete ed[ve]; else ed[ve] = to; if (Object.keys(ed).length) O.vedits[x.id] = ed; else delete O.vedits[x.id]; });
      change(); editProduct();
      toast(`✓ „${from}“ → „${to}“ за ${others.length + 1} варианта – натисни „Запази“`);
    });
    box.addEventListener("change", (e) => {
      if (e.target.dataset.f !== "stock") return;
      const id = e.target.closest("tr").dataset.id;
      e.target.value === "0" ? (O.stock[id] = 0) : delete O.stock[id];
      change();
    });
    $("#pDelete")?.addEventListener("click", () => {
      if (!confirm(`Да изтрия ли „${nameOf(p)}“ от сайта?\n\nМожеш да го възстановиш от плочката „Изтрити“.`)) return;
      // на компютър следващият продукт остава избран; на телефон се връщаме към списъка
      const slugs = $$("#pres [data-slug]").map((x) => x.dataset.slug), i = slugs.indexOf(p.slug);
      const next = slugs[i + 1] || slugs[i - 1];
      const mobile = innerWidth < 900;
      deleteProducts([p.slug], true);
      if (!mobile && next && next !== p.slug && !O.deleted.includes(next)) { sel = BY_SLUG.get(next); refreshList(); editProduct(); }
      if (mobile) $("#pres")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("#pRestore")?.addEventListener("click", () => deleteProducts([p.slug], false));
    // съдържание: име, описание, снимки
    $("#edName").addEventListener("input", (e) => { edSet(p, "n", e.target.value.trim() === p.name ? "" : e.target.value.trim()); });
    $("#edDesc").addEventListener("input", (e) => { edSet(p, "d", e.target.value.trim()); });
    $("#edReset")?.addEventListener("click", () => { if (confirm("Да върна ли оригиналното име, описание и снимки?")) { delete O.edits[p.slug]; change(); editProduct(); } });
    box.addEventListener("change", async (e) => {
      const up = e.target.dataset.up; if (!up || !e.target.files.length) return;
      const files = [...e.target.files].slice(0, up === "gal" ? 10 : 1);
      $("#edMsg").textContent = `Качване на ${files.length} снимк${files.length > 1 ? "и" : "а"}…`;
      try {
        const urls = [];
        for (const f of files) urls.push(await uploadImage(f));
        if (up === "main") edSet(p, "img", urls[0]);
        if (up === "gal") edSet(p, "gal", [...(edOf(p).gal || []), ...urls]);
        if (up === "v") edSet(p, "vimg", { ...(edOf(p).vimg || {}), [e.target.dataset.vid]: urls[0] });
        toast("✓ Снимката е качена – натисни „Запази“"); editProduct();
      } catch (err) { $("#edMsg").textContent = "Грешка при качване: " + err.message; }
    });
    box.addEventListener("click", (e) => {
      const g = e.target.closest("[data-galdel],[data-galmv],[data-edimg-reset],[data-vreset]");
      if (g) {
        const gal = [...(edOf(p).gal || [])];
        if (g.dataset.galdel != null) { gal.splice(+g.dataset.galdel, 1); edSet(p, "gal", gal); }
        if (g.dataset.galmv != null) { const [u] = gal.splice(+g.dataset.galmv, 1); if (edOf(p).img) gal.unshift(edOf(p).img); edSet(p, "gal", gal); edSet(p, "img", u); }
        if (g.dataset.edimgReset !== undefined) edSet(p, "img", "");
        if (g.dataset.vreset) { const vi = { ...(edOf(p).vimg || {}) }; delete vi[g.dataset.vreset]; edSet(p, "vimg", vi); }
        editProduct(); return;
      }
      const t = e.target.closest("[data-model]"); if (!t) return;
      Object.assign(F, { model: t.dataset.model, brand: "", cat: "", sub: "", q: "", status: "", sort: "brand", limit: 100 }); renderProducts();
    });
    box.addEventListener("click", (e) => {
      const d = e.target.closest("[data-vdelete],[data-vrestore]"); if (!d) return;
      const id = d.dataset.vdelete || d.dataset.vrestore;
      const added = O.vadd[p.slug] || [];
      if (d.dataset.vdelete && added.some((x) => String(x.id) === id)) {
        O.vadd[p.slug] = added.filter((x) => String(x.id) !== id); if (!O.vadd[p.slug].length) delete O.vadd[p.slug];
        delete O.prices[id]; delete O.stock[id]; delete O.labels.sale[id];
      } else if (d.dataset.vdelete) {
        if (variantsOf(p).filter((v) => !v.deleted).length <= 1) { toast("Продуктът трябва да има поне един вариант – изтрий целия продукт отгоре"); return; }
        toggleIn(O.vdel, id, true);
      } else toggleIn(O.vdel, id, false);
      change(); editProduct();
    });
    $("#vAdd").addEventListener("click", () => {
      const base = variantsOf(p).find((v) => !v.deleted) || p.variants[0];
      const used = new Set([...PRODUCTS.flatMap((x) => x.variants.map((v) => v.id)), ...Object.values(O.vadd).flat().map((x) => x.id)]);
      let id; do { id = 990000000 + Math.floor(Math.random() * 9000000); } while (used.has(id));
      const nv = { id };
      VF.forEach(([k]) => { nv[k] = base[k] || ""; });
      nv.vmk = base.vmk || ""; nv.img = (O.edits[p.slug]?.vimg || {})[base.id] || base.img || p.img;
      (O.vadd[p.slug] = O.vadd[p.slug] || []).push(nv);
      change(); editProduct();
      const row = $(`tr[data-id="${id}"]`); row?.scrollIntoView({ block: "center" }); row?.querySelector('[data-ve="color"]')?.focus();
      toast("✓ Добавен нов вариант – смени текстовете и задай цена");
    });
    const allStock = (on) => { p.variants.forEach((v) => (on ? delete O.stock[v.id] : (O.stock[v.id] = 0))); change(); editProduct(); };
    $("#allStockOn")?.addEventListener("click", () => allStock(true));
    $("#allStockOff")?.addEventListener("click", () => allStock(false));
    $("#resetModel").addEventListener("click", () => {
      variantsOf(p).forEach((v) => { delete O.prices[v.id]; delete O.stock[v.id]; delete O.labels.sale[v.id]; delete O.vedits[v.id]; toggleIn(O.vdel, String(v.id), false); });
      if (!p.isNewProduct) delete O.vadd[p.slug];
      delete O.labels.sale[p.slug];
      [O.hidden, O.labels.hot, O.labels.newAdd, O.labels.newRemove].forEach((a) => toggleIn(a, p.slug, false));
      change(); editProduct();
    });
  }

  async function uploadImage(file) {
    if (!/^image\//.test(file.type)) throw new Error("файлът не е снимка");
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error("снимката не може да се отвори");
    const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
    let blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
    const r = await fetch("/api/media", { method: "POST", headers: { "x-admin-password": pw(), "content-type": blob.type }, body: blob });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? "сесията изтече – влез отново" : r.status === 413 ? "снимката е твърде голяма" : "сървърът отказа (" + r.status + ")");
    return d.url;
  }

  /* ===== ЕТИКЕТИ ===== */
  function renderLabels() {
    freshMain();
    const name = (s) => esc(BY_SLUG.get(s)?.name || s);
    const sales = Object.entries(O.labels.sale);
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box"><h2>Етикет „Ново“ – автоматично</h2>
        <p class="muted">Телефоните и таблетите, чието име съдържа някой от тези текстове, получават „Ново“. По един текст на ред.</p>
        <textarea class="input" id="newList" rows="8">${esc((O.labels.new || []).join("\n"))}</textarea>
        <p class="muted small" id="newCount"></p></section>
      <section class="adm-box"><h2>Ръчно зададени</h2>
        ${block("Винаги „Ново“", O.labels.newAdd, "newAdd")}${block("Никога „Ново“", O.labels.newRemove, "newRemove")}${block("„Хит“", O.labels.hot, "hot")}${block("Скрити от сайта", O.hidden, "hidden")}
        <p class="muted small">Добавяй и маха от раздел „Продукти“.</p></section>
      <section class="adm-box"><h2>Намаления (${sales.length})</h2>
        ${sales.length ? `<ul class="adm-chips">${sales.map(([k, v]) => `<li>${/^\d+$/.test(k) ? "Арт. " + esc(k) : name(k)} <b>−${esc(v)}%</b><button data-unsale="${esc(k)}" aria-label="Махни">✕</button></li>`).join("")}</ul>` : `<p class="muted">Няма намаления. Задай ги от раздел „Продукти“.</p>`}
        <div class="adm-row"><select class="select" id="bulkBrand"><option value="">Масово намаление за марка…</option>${[...new Set(PRODUCTS.filter((p) => p.cat === "phones").map((p) => p.brand))].sort().map((b) => `<option>${esc(b)}</option>`).join("")}</select>
          <div class="adm-pct"><input class="input" type="number" min="1" max="90" id="bulkPct" placeholder="%" /><b>%</b></div><button class="btn btn--ghost btn--sm" id="bulkGo">Приложи за телефоните на марката</button></div></section>
    </div>`;
    function block(t, arr, key) {
      return `<h4>${t} (${arr.length})</h4>${arr.length ? `<ul class="adm-chips">${arr.map((s) => `<li>${name(s)}<button data-rm="${key}" data-s="${esc(s)}" aria-label="Махни">✕</button></li>`).join("")}</ul>` : `<p class="muted small">—</p>`}`;
    }
    const count = () => { const re = NEW_RE(); $("#newCount").textContent = re ? `Съвпадат ${PRODUCTS.filter((p) => (p.cat === "phones" || p.cat === "tablets") && re.test(p.name)).length} модела.` : "Няма автоматични „Ново“."; };
    count();
    $("#newList").addEventListener("input", (e) => { O.labels.new = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); change(); count(); });
    $("#main").addEventListener("click", (e) => {
      const r = e.target.closest("[data-rm]"); if (r) { const arr = r.dataset.rm === "hidden" ? O.hidden : O.labels[r.dataset.rm]; toggleIn(arr, r.dataset.s, false); change(); renderLabels(); }
      const u = e.target.closest("[data-unsale]"); if (u) { delete O.labels.sale[u.dataset.unsale]; change(); renderLabels(); }
    });
    $("#bulkGo").addEventListener("click", () => {
      const b = $("#bulkBrand").value, pct = Number($("#bulkPct").value);
      if (!b || !(pct > 0 && pct <= 90)) return toast("Избери марка и процент (1–90)");
      const list = PRODUCTS.filter((p) => p.cat === "phones" && p.brand === b);
      if (!confirm(`Намаление ${pct}% за ${list.length} модела ${b}?`)) return;
      list.forEach((p) => (O.labels.sale[p.slug] = pct)); change(); renderLabels();
    });
  }

  /* ===== избор на продукт (за началната страница) ===== */
  function picker(id, placeholder, filter = (p) => p.cat === "phones" || p.cat === "tablets") {
    return `<div class="adm-pick"><input class="input" id="${id}" placeholder="${placeholder}" autocomplete="off" /><div class="adm-pick__list" id="${id}List" hidden></div></div>`;
  }
  function bindPicker(id, onPick, filter = (p) => p.cat === "phones" || p.cat === "tablets") {
    const inp = $("#" + id), lst = $("#" + id + "List");
    inp.addEventListener("input", () => {
      const toks = norm(inp.value).split(/\s+/).filter(Boolean);
      if (!toks.length) { lst.hidden = true; return; }
      const res = PRODUCTS.filter((p) => filter(p) && toks.every((t) => norm(p.brand + " " + p.name).includes(t))).slice(0, 8);
      lst.innerHTML = res.map((p) => `<button data-slug="${p.slug}">${esc(p.name)}</button>`).join("") || `<p class="muted small">Няма резултати</p>`;
      lst.hidden = false;
    });
    lst.addEventListener("click", (e) => { const b = e.target.closest("[data-slug]"); if (b) { onPick(b.dataset.slug); inp.value = ""; lst.hidden = true; } });
  }

  /* ===== НАЧАЛНА СТРАНИЦА ===== */
  function renderHome() {
    freshMain();
    const featured = O.store.featured || [...S0.featured];
    const hero = st("heroSlug");
    const slides = O.store.heroSlides || JSON.parse(JSON.stringify(S0.heroSlides || [{ type: "product", slug: "" }]));
    const saveSlides = () => { O.store.heroSlides = slides; change(); };
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box"><h2>Голямата плочка</h2><p class="muted">Моделът, показан най-отгоре на началната страница.</p>
        <p class="adm-current">Сега: <b>${esc(BY_SLUG.get(hero)?.name || hero)}</b></p>${picker("heroPick", "Смени с… (търси модел)")}
        <p class="muted small">Снимката в плочката остава Galaxy S26 Ultra, освен ако не избереш друг модел – тогава се ползва неговата снимка.</p></section>
      <section class="adm-box"><div class="adm-row"><h2>Витрина – още слайдове (${slides.length - 1})</h2>
          <button class="btn btn--ghost btn--sm" data-sadd="custom">+ Свой слайд</button><button class="btn btn--ghost btn--sm" data-sadd="product">+ Слайд с продукт</button></div>
        <p class="muted">Първият слайд е моделът по-горе. Тези се показват след него и се сменят на всеки 6 секунди.</p>
        <div class="adm-reviews">${slides.slice(1).map((x, k) => { const i = k + 1; return `<div class="adm-rev ${x.active === false ? "off" : ""}" data-si="${i}">
          <div class="adm-row"><b>Слайд ${i + 1} · ${x.type === "product" ? "продукт" : "свой"}</b>
            <label class="check"><input type="checkbox" data-sf="active" ${x.active === false ? "" : "checked"}><span>Показва се</span></label>
            <button class="btn btn--ghost btn--sm" data-sup ${i > 1 ? "" : "disabled"}>↑</button><button class="btn btn--ghost btn--sm" data-sdel>Изтрий</button></div>
          <div class="adm-grid">
            ${x.type === "product" ? `<label class="field"><span>Продукт</span><select class="select" data-sf="slug">${PRODUCTS.filter((p) => p.cat !== "accessories" || p.variants.length > 5).map((p) => `<option value="${esc(p.slug)}" ${p.slug === x.slug ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` : ""}
            <label class="field"><span>Малък надпис</span><input class="input" data-sf="eyebrow" value="${esc(x.eyebrow || "")}" placeholder="Протектори · OG Premium"></label>
            <label class="field"><span>Заглавие</span><input class="input" data-sf="title" value="${esc(x.title || "")}" placeholder="${x.type === "product" ? "(името на продукта)" : "Заглавие"}"></label>
            <label class="field"><span>Оцветена част</span><input class="input" data-sf="em" value="${esc(x.em || "")}" placeholder="само 10 €"></label>
            <label class="field"><span>Текст на бутона</span><input class="input" data-sf="button" value="${esc(x.button || "")}" placeholder="Виж повече"></label>
            ${x.type === "product" ? "" : `<label class="field"><span>Връзка</span><input class="input" data-sf="href" value="${esc(x.href || "")}" placeholder="#/c/accessories"></label>
            <label class="field"><span>Снимка (адрес)</span><input class="input" data-sf="image" value="${esc(x.image || "")}" placeholder="assets/img/…"></label>`}
          </div>
          <label class="field"><span>Текст</span><input class="input" data-sf="text" value="${esc(x.text || "")}"></label></div>`; }).join("")}</div></section>
      <section class="adm-box"><h2>Подбрани смартфони (${featured.length})</h2><p class="muted">Подредбата е както тук. Препоръчително 8.</p>
        <ol class="adm-order">${featured.map((s, i) => `<li><span>${esc(BY_SLUG.get(s)?.name || s)}</span>
          <button data-up="${i}" ${i ? "" : "disabled"} aria-label="Нагоре">↑</button><button data-down="${i}" ${i < featured.length - 1 ? "" : "disabled"} aria-label="Надолу">↓</button><button data-del="${i}" aria-label="Махни">✕</button></li>`).join("")}</ol>
        ${picker("featPick", "Добави модел…")}</section>
    </div>`;
    bindPicker("heroPick", (s) => { O.store.heroSlug = s; O.store.heroImage = s === "samsung-galaxy-s26-ultra-model-119473" ? "" : "auto"; change(); renderHome(); });
    bindPicker("featPick", (s) => { const f = [...featured]; if (!f.includes(s)) f.push(s); O.store.featured = f; change(); renderHome(); });
    $("#main").addEventListener("input", (e) => {
      const box = e.target.closest("[data-si]"); const f = e.target.dataset.sf; if (!box || !f) return;
      slides[+box.dataset.si][f] = f === "active" ? e.target.checked : e.target.value; saveSlides();
    });
    $("#main").addEventListener("change", (e) => {
      const box = e.target.closest("[data-si]"); const f = e.target.dataset.sf; if (!box || !f) return;
      slides[+box.dataset.si][f] = f === "active" ? e.target.checked : e.target.value; saveSlides();
      if (f === "active") renderHome();
    });
    $("#main").addEventListener("click", (e) => {
      const add = e.target.closest("[data-sadd]");
      if (add) { slides.push(add.dataset.sadd === "product" ? { type: "product", slug: S0.featured[1] } : { type: "custom", title: "", text: "", href: "#/", button: "Виж повече" }); saveSlides(); return renderHome(); }
      const box = e.target.closest("[data-si]"); if (!box) return; const i = +box.dataset.si;
      if (e.target.closest("[data-sdel]")) { slides.splice(i, 1); saveSlides(); renderHome(); }
      if (e.target.closest("[data-sup]") && i > 1) { [slides[i - 1], slides[i]] = [slides[i], slides[i - 1]]; saveSlides(); renderHome(); }
    });
    $(".adm-order").addEventListener("click", (e) => {
      const f = [...featured], b = e.target.closest("button"); if (!b) return;
      const i = +(b.dataset.up ?? b.dataset.down ?? b.dataset.del);
      if (b.dataset.up) [f[i - 1], f[i]] = [f[i], f[i - 1]];
      if (b.dataset.down) [f[i + 1], f[i]] = [f[i], f[i + 1]];
      if (b.dataset.del) f.splice(i, 1);
      O.store.featured = f; change(); renderHome();
    });
  }

  /* ===== МАГАЗИН ===== */
  function renderStore() {
    freshMain();
    const hours = st("hours"), social = { ...S0.social, ...(O.store.social || {}) };
    const f = (k, label, type = "text", ph = "") => `<label class="field"><span>${label}</span><input class="input" data-k="${k}" type="${type}" value="${esc(st(k) ?? "")}" placeholder="${esc(ph)}" /></label>`;
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box"><h2>Контакти</h2><div class="adm-grid">
        ${f("phone", "Телефон")}${f("email", "Имейл", "email")}${f("address", "Адрес")}${f("viber", "Viber (номер без +, по желание)", "text", "359893933338")}</div></section>
      <section class="adm-box"><h2>Работно време</h2><div class="adm-grid">
        ${hours.map((h, i) => `<label class="field"><span>${esc(h[0])}</span><input class="input" data-h="${i}" value="${esc(h[1])}" /></label>`).join("")}</div>
        <p class="muted small">Формат: „09:30 – 18:00“ или „Почивен ден“. По него сайтът показва „Отворено/Затворено сега“.</p></section>
      <section class="adm-box"><h2>Доставка и поръчки</h2>
        <div class="adm-grid">
          <label class="field"><span>Цена на доставката в поръчката</span><select class="select" id="shipMode">
            <option value="tariff" ${st("shipMode") !== "fixed" ? "selected" : ""}>Автоматично – по тарифите на Еконт и Спиди</option>
            <option value="fixed" ${st("shipMode") === "fixed" ? "selected" : ""}>Фиксирани такси (полетата по-долу)</option></select></label>
          ${f("freeShipOver", "Безплатна доставка над (€)", "number", "празно = няма")}
          ${f("econtSender", "Офис на Еконт за изпращане (код)", "text", "2900")}
          <label class="check" style="align-self:end"><input type="checkbox" id="codFeeShown" ${st("codFeeShown") !== false ? "checked" : ""}><span>Показвай таксата за наложен платеж (на куриера) в поръчката</span></label>
        </div>
        <p class="muted small">Автоматично: Еконт се изчислява на живо по публичната им тарифа, Спиди – по тарифата от services.speedy.bg (27.11.2026). Ако имаш договор с по-ниски цени, избери „Фиксирани такси“.</p>
        <div class="adm-grid">
        ${f("deliveryOffice", "Фиксирана такса до офис (€)", "number", "празно = предстои уточняване")}${f("deliveryAddress", "Фиксирана такса до адрес (€)", "number", "празно = предстои уточняване")}
        ${f("orderEndpoint", "Адрес за получаване на поръчки (Formspree)", "url", "https://formspree.io/f/…")}</div>
        <p class="muted small">Без адрес на форма клиентът изпраща поръчката като имейл до магазина.</p></section>
      <section class="adm-box"><h2>Социални мрежи</h2><div class="adm-grid">
        ${["facebook", "instagram", "messenger", "tiktok"].map((k) => `<label class="field"><span>${k[0].toUpperCase() + k.slice(1)}</span><input class="input" data-soc="${k}" type="url" value="${esc(social[k] || "")}" placeholder="https://…" /></label>`).join("")}</div></section>
      <section class="adm-box"><h2>AI асистент в чата</h2>
        <label class="check"><input type="checkbox" id="aiChat" ${st("aiChat") !== false ? "checked" : ""}><span>Включен (използва Claude, ако в Netlify е добавен ключ ANTHROPIC_API_KEY)</span></label></section>
    </div>`;
    $("#main").addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.k) { O.store[t.dataset.k] = t.type === "number" ? (t.value === "" ? null : Number(t.value)) : t.value; change(); }
      if (t.dataset.h) { const h = (O.store.hours || st("hours")).map((r) => [...r]); h[+t.dataset.h][1] = t.value; O.store.hours = h; change(); }
      if (t.dataset.soc) { O.store.social = { ...(O.store.social || {}), [t.dataset.soc]: t.value.trim() }; change(); }
    });
    $("#aiChat").addEventListener("change", (e) => { O.store.aiChat = e.target.checked; change(); });
    $("#shipMode").addEventListener("change", (e) => { O.store.shipMode = e.target.value; change(); });
    $("#codFeeShown").addEventListener("change", (e) => { O.store.codFeeShown = e.target.checked; change(); });
  }

  /* ===== СЕРВИЗ: ЦЕНОРАЗПИС ПО МОДЕЛ ===== */
  function renderService() {
    freshMain();
    const COLS = window.REPAIR_COLS || [];
    const rows = () => O.store.repairPrices || (window.REPAIR_PRICES || []).map((r) => ({ b: r.b, m: r.m, p: [...r.p] }));
    const setRows = (r) => { O.store.repairPrices = r; change(); };
    let fq = "";
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box">
        <div class="adm-row adm-row--between"><div><h2>Ценоразпис на ремонти по модел</h2>
          <p class="muted small">Показва се в сайта на „Сервиз → Цени по модел“, в калкулатора и в AI чата. Цени в евро с ДДС, с част и труд. Празно поле = „запитване“.</p></div>
          <div class="adm-row"><input class="input" id="svQ" type="search" placeholder="Търси модел…" style="width:200px"><button class="btn btn--primary btn--sm" id="svAdd">+ Нов модел</button></div></div>
        <div class="adm-table-wrap"><table class="adm-table adm-svc"><thead><tr><th>Марка</th><th>Модел</th>${COLS.map((c) => `<th>${esc(c.name)} €</th>`).join("")}<th></th></tr></thead><tbody id="svBody"></tbody></table></div>
        <div class="adm-row" style="margin-top:12px"><button class="btn btn--ghost btn--sm" id="svSort">Подреди по марка и модел</button><button class="btn btn--ghost btn--sm" id="svReset">Върни цените по подразбиране</button><span class="muted small" id="svCount"></span></div>
      </section></div>`;
    const draw = () => {
      const all = rows(), t = norm(fq);
      $("#svBody").innerHTML = all.map((r, i) => (!t || norm(r.b + " " + r.m).includes(t)) ? `<tr data-i="${i}">
        <td><input class="input input--sm" data-sf="b" value="${esc(r.b)}" list="svBrands" style="width:110px"></td>
        <td><input class="input input--sm" data-sf="m" value="${esc(r.m)}" style="min-width:170px"></td>
        ${COLS.map((c, j) => `<td><input class="input input--sm" type="number" min="0" step="1" data-sp="${j}" value="${esc(r.p[j] ?? "")}" placeholder="—" style="width:84px"></td>`).join("")}
        <td><button class="link-btn" data-del="${i}" title="Изтрий">Изтрий</button></td></tr>` : "").join("")
        + `<datalist id="svBrands">${[...new Set(all.map((r) => r.b))].map((b) => `<option value="${esc(b)}">`).join("")}</datalist>`;
      $("#svCount").textContent = `${all.length} модела`;
    };
    draw();
    $("#svQ").addEventListener("input", (e) => { fq = e.target.value; draw(); });
    $("#svBody").addEventListener("input", (e) => {
      const tr = e.target.closest("tr[data-i]"); if (!tr) return;
      const r = rows().map((x) => ({ ...x, p: [...x.p] })), it = r[+tr.dataset.i];
      if (e.target.dataset.sf) it[e.target.dataset.sf] = e.target.value;
      if (e.target.dataset.sp) it.p[+e.target.dataset.sp] = e.target.value === "" ? "" : Math.max(0, Number(e.target.value));
      setRows(r);
    });
    $("#svBody").addEventListener("click", (e) => {
      const d = e.target.closest("[data-del]"); if (!d) return;
      const r = rows(); if (!confirm(`Да изтрия ли „${r[+d.dataset.del].b} ${r[+d.dataset.del].m}“?`)) return;
      setRows(r.filter((_, i) => i !== +d.dataset.del)); draw();
    });
    $("#svAdd").addEventListener("click", () => { setRows([{ b: "", m: "", p: COLS.map(() => "") }, ...rows()]); fq = ""; $("#svQ").value = ""; draw(); $("#svBody input")?.focus(); });
    $("#svSort").addEventListener("click", () => { setRows([...rows()].sort((a, b) => a.b.localeCompare(b.b) || a.m.localeCompare(b.m, "bg", { numeric: true }))); draw(); });
    $("#svReset").addEventListener("click", () => { if (!confirm("Да върна ли ценоразписа по подразбиране? Твоите промени ще се изгубят след „Запази“.")) return; delete O.store.repairPrices; change(); draw(); });
  }

  /* ===== ОТЗИВИ ===== */
  function renderReviews() {
    freshMain();
    const R = O.reviews;
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box"><h2>Google профил</h2><div class="adm-grid">
        <label class="field"><span>Връзка към профила в Google Maps</span><input class="input" data-r="googleUrl" type="url" value="${esc(R.googleUrl || "")}" placeholder="https://maps.app.goo.gl/…" /></label>
        <label class="field"><span>Връзка „Остави отзив“</span><input class="input" data-r="writeUrl" type="url" value="${esc(R.writeUrl || "")}" placeholder="https://g.page/r/…/review" /></label>
        <label class="field"><span>Среден рейтинг</span><input class="input" data-r="rating" type="number" min="1" max="5" step="0.1" value="${esc(R.rating || "")}" placeholder="4.9" /></label>
        <label class="field"><span>Брой отзиви</span><input class="input" data-r="count" type="number" min="0" value="${esc(R.count || "")}" /></label></div>
        <p class="muted small">Връзката за отзив се взима от Google Business Profile → „Поискай отзиви“. Рейтингът и броят се обновяват ръчно.</p></section>
      <section class="adm-box" id="pendingBox"><h2>Нови отзиви от клиенти</h2><p class="muted">Зареждане…</p></section>
      <section class="adm-box"><h2>Отзиви на началната страница (${(R.items || []).length})</h2>
        <p class="muted">Копирай истински отзиви от Google (с името, както е там). Показват се до 6.</p>
        <div class="adm-reviews">${(R.items || []).map((r, i) => `<div class="adm-rev" data-i="${i}">
          <div class="adm-grid"><label class="field"><span>Име</span><input class="input" data-ri="name" value="${esc(r.name || "")}" /></label>
          <label class="field"><span>Оценка</span><select class="select" data-ri="rating">${[5, 4, 3, 2, 1].map((n) => `<option ${Number(r.rating || 5) === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label class="field"><span>Дата / период</span><input class="input" data-ri="date" value="${esc(r.date || "")}" placeholder="преди 2 месеца" /></label></div>
          <label class="field"><span>Текст</span><textarea class="input" rows="3" data-ri="text">${esc(r.text || "")}</textarea></label>
          <div class="adm-row"><button class="btn btn--ghost btn--sm" data-rup ${i ? "" : "disabled"}>↑</button><button class="btn btn--ghost btn--sm" data-rdel>Изтрий</button></div></div>`).join("")}</div>
        <button class="btn btn--primary btn--sm" id="addRev">+ Добави отзив</button></section>
    </div>`;
    $("#main").addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.r) { R[t.dataset.r] = t.type === "number" ? (t.value === "" ? "" : Number(t.value)) : t.value.trim(); change(); }
      if (t.dataset.ri) { const i = +t.closest("[data-i]").dataset.i; R.items[i][t.dataset.ri] = t.dataset.ri === "rating" ? Number(t.value) : t.value; change(); }
    });
    $("#main").addEventListener("change", (e) => { if (e.target.dataset.ri === "rating") { R.items[+e.target.closest("[data-i]").dataset.i].rating = Number(e.target.value); change(); } });
    $("#main").addEventListener("click", (e) => {
      const box = e.target.closest("[data-i]"); const i = box ? +box.dataset.i : -1;
      if (e.target.closest("[data-rdel]")) { R.items.splice(i, 1); change(); renderReviews(); }
      if (e.target.closest("[data-rup]")) { [R.items[i - 1], R.items[i]] = [R.items[i], R.items[i - 1]]; change(); renderReviews(); }
    });
    $("#addRev").addEventListener("click", () => { R.items = R.items || []; R.items.push({ name: "", rating: 5, date: "", text: "" }); change(); renderReviews(); });
    loadPending();
  }
  async function loadPending() {
    const box = $("#pendingBox");
    const r = await fetch("/api/orders?reviews=1", { cache: "no-store", headers: { "x-admin-password": pw() } }).then((x) => x.json()).catch(() => null);
    if (!box.isConnected) return;
    const list = r?.reviews || [];
    box.innerHTML = `<h2>Нови отзиви от клиенти (${list.length})</h2>
      ${list.length ? `<p class="muted">Изпратени от сайта. „Публикувай“ ги добавя към отзивите по-долу – после натисни „Запази“.</p>
      <div class="adm-reviews">${list.map((x) => `<div class="adm-rev" data-key="${esc(x.key)}">
        <p><b>${esc(x.name)}</b> · ${"★".repeat(x.rating)}${"☆".repeat(5 - x.rating)} · <span class="muted small">${new Date(x.at).toLocaleString("bg-BG")}</span></p>
        <p>${esc(x.text)}</p>
        <div class="adm-row"><button class="btn btn--primary btn--sm" data-pub>Публикувай</button><button class="btn btn--ghost btn--sm" data-pdel>Изтрий</button></div></div>`).join("")}</div>`
      : `<p class="muted">Няма нови отзиви. Клиентите оставят отзив от бутона „Остави отзив“ на началната страница.</p>`}`;
    box.addEventListener("click", async (e) => {
      const el = e.target.closest("[data-key]"); if (!el) return;
      const x = list.find((y) => y.key === el.dataset.key);
      if (e.target.closest("[data-pub]")) {
        O.reviews.items = O.reviews.items || [];
        O.reviews.items.unshift({ name: x.name, rating: x.rating, date: new Date(x.at).toLocaleDateString("bg-BG", { month: "long", year: "numeric" }), text: x.text });
        change();
      } else if (!e.target.closest("[data-pdel]")) return;
      await fetch("/api/orders?review_del=" + encodeURIComponent(x.key), { method: "POST", headers: { "x-admin-password": pw() } });
      toast(e.target.closest("[data-pub]") ? "Добавен – натисни „Запази“" : "Изтрит");
      renderReviews();
    });
  }

  /* ===== ПОРЪЧКИ, РЕМОНТИ, ЗАПИТВАНИЯ ===== */
  const TYPE = { order: "Поръчка", repair: "Ремонт", inquiry: "Запитване" };
  let OL = null, oFilter = "open", oType = "", oSel = null;
  async function ordersApi(method, query, body) {
    const r = await fetch("/api/orders" + query, { method, cache: "no-store", headers: { "content-type": "application/json", "x-admin-password": pw() }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  }
  const fmt = (s) => new Date(s).toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  async function renderOrders() {
    freshMain();
    const m = $("#main");
    if (!OL) {
      m.innerHTML = `<div class="adm-page"><p class="muted">Зареждане…</p></div>`;
      const r = await ordersApi("GET", "?list=1");
      if (!r.ok) { m.innerHTML = `<div class="adm-page"><section class="adm-box"><p>Списъкът не може да се зареди (${r.status}).</p></section></div>`; return; }
      OL = r.data;
    }
    const S = OL.statuses, list = OL.orders.filter((o) => (!oType || o.type === oType) && (oFilter === "all" || (oFilter === "open" ? !["done", "cancelled", "closed"].includes(o.status) : o.status === "new")));
    const cnt = (f) => OL.orders.filter((o) => f(o)).length;
    m.innerHTML = `<div class="adm-page adm-orders"><section class="adm-box">
      <div class="adm-row"><h2>Заявки</h2><button class="btn btn--ghost btn--sm" id="oReload">Обнови</button></div>
      <div class="adm-chips">
        ${[["new", `Нови (${cnt((o) => o.status === "new")})`], ["open", `Отворени (${cnt((o) => !["done", "cancelled", "closed"].includes(o.status))})`], ["all", `Всички (${OL.orders.length})`]].map(([k, l]) => `<button class="adm-chip ${oFilter === k ? "on" : ""}" data-of="${k}">${l}</button>`).join("")}
        <select class="select" id="oType"><option value="">Всички видове</option>${Object.entries(TYPE).map(([k, l]) => `<option value="${k}" ${oType === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
      ${list.length ? `<div class="adm-table-wrap"><table class="adm-table adm-table--orders"><thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Описание</th><th>Сума</th><th>Статус</th></tr></thead><tbody>
        ${list.map((o) => `<tr data-ref="${esc(o.ref)}" class="${oSel?.ref === o.ref ? "sel" : ""}"><td><b>${esc(o.ref)}</b><br><span class="muted small">${TYPE[o.type] || o.type}</span></td><td>${fmt(o.createdAt)}</td>
          <td>${esc(o.name)}<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></td><td>${esc(o.title)}</td><td>${o.total != null ? eur(o.total) : "—"}</td>
          <td><span class="adm-badge adm-badge--${esc(o.status)}">${esc(S[o.type]?.[o.status] || o.status)}</span></td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">Няма заявки в този изглед. Новите поръчки от сайта се появяват тук автоматично.</p>`}
      <p class="muted small">Известия в Telegram: добави TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в Netlify (виж README).</p>
    </section><section class="adm-box" id="oDetail">${oSel ? orderDetail(oSel) : `<p class="muted">Избери заявка от списъка.</p>`}</section></div>`;
    m.addEventListener("click", async (e) => {
      if (e.target.id === "oReload") { OL = null; return renderOrders(); }
      const f = e.target.closest("[data-of]"); if (f) { oFilter = f.dataset.of; return renderOrders(); }
      const tr = e.target.closest("tr[data-ref]");
      if (tr && !e.target.closest("a")) {
        const r = await ordersApi("GET", "?ref=" + encodeURIComponent(tr.dataset.ref));
        if (r.ok) { oSel = r.data; renderOrders(); }
      }
      const pb = e.target.closest("[data-print]");
      if (pb && oSel) printDoc(pb.dataset.print, oSel);
      if (e.target.id === "oSave") {
        const b = { status: $("#oStatus").value, note: $("#oNote").value.trim(), tracking: $("#oTrack").value.trim(), internalNote: $("#oInternal").value, notify: !!$("#oNotify")?.checked };
        e.target.disabled = true;
        const r = await ordersApi("POST", "?update=" + encodeURIComponent(oSel.ref), b);
        if (r.ok) { oSel = r.data.order; OL = null; toast(r.data.mailed ? "✓ Обновено · имейлът е изпратен" : "✓ Заявката е обновена"); renderOrders(); }
        else { e.target.disabled = false; toast("Грешка (" + r.status + ")"); }
      }
    });
    m.addEventListener("change", (e) => { if (e.target.id === "oType") { oType = e.target.value; renderOrders(); } });
  }
  function orderDetail(o) {
    const S = OL.statuses[o.type] || {};
    const link = `${location.origin}/#/track?ref=${encodeURIComponent(o.ref)}&phone=${String(o.customer.phone).replace(/\D/g, "").slice(-4)}`;
    return `<div class="adm-row"><h2>${TYPE[o.type] || ""} ${esc(o.ref)}</h2><span class="muted small">${fmt(o.createdAt)}</span></div>
      <p><b>${esc(o.customer.name)}</b> · <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a>${o.customer.email ? ` · <a href="mailto:${esc(o.customer.email)}">${esc(o.customer.email)}</a>` : ""}</p>
      <pre class="adm-pre">${esc(o.text)}</pre>
      <label class="field"><span>Статус</span><select class="select" id="oStatus">${Object.entries(S).map(([k, l]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field"><span>Бележка към клиента (вижда се при проследяване)</span><input class="input" id="oNote" placeholder="напр. Очакваме частта до четвъртък"></label>
      ${o.type === "order" ? `<label class="field"><span>Номер на товарителница</span><input class="input" id="oTrack" value="${esc(o.tracking || "")}" placeholder="Еконт / Спиди"></label>` : `<input type="hidden" id="oTrack" value="${esc(o.tracking || "")}">`}
      <label class="field"><span>Вътрешна бележка (само за магазина)</span><textarea class="input" id="oInternal" rows="2">${esc(o.internalNote || "")}</textarea></label>
      ${o.customer.email ? `<label class="check"><input type="checkbox" id="oNotify" checked><span>Изпрати имейл на клиента при промяна</span></label>` : `<p class="muted small">Клиентът не е оставил имейл – обади се на ${esc(o.customer.phone)}.</p>`}
      <div class="adm-row"><button class="btn btn--primary" id="oSave">Запази статуса</button>
        ${o.type === "order" ? `<button class="btn btn--ghost" data-print="receipt">🖨 Стокова разписка</button>` : `<button class="btn btn--ghost" data-print="intake">🖨 Приемателен протокол</button>`}
        <button class="btn btn--ghost" data-print="summary">🖨 Печат</button></div>
      <p class="muted small">Връзка за клиента: <a href="${esc(link)}" target="_blank">${esc(link)}</a></p>
      <h3>История</h3><ol class="adm-hist">${o.history.slice().reverse().map((h) => `<li><b>${esc(S[h.status] || h.status)}</b> <span class="muted small">${fmt(h.at)}</span>${h.note ? `<br>${esc(h.note)}` : ""}</li>`).join("")}</ol>`;
  }

  /* ===== СЛЕДЕНИ ЦЕНИ („Кажи ми при намаление“) ===== */
  const BY_VID = new Map(PRODUCTS.flatMap((p) => p.variants.map((v) => [String(v.id), { p, v }])));
  function nowPrice(slug, id) {
    const x = BY_VID.get(String(id)) || (BY_SLUG.get(slug) && { p: BY_SLUG.get(slug), v: BY_SLUG.get(slug).variants[0] });
    if (!x) return null;
    const base = O.prices[x.v.id] != null && O.prices[x.v.id] !== "" ? Number(O.prices[x.v.id]) : x.v.price;
    const pct = O.labels.sale[x.v.id] ?? O.labels.sale[x.p.slug];
    return base == null ? null : pct > 0 && pct < 100 ? Math.round(base * (100 - pct)) / 100 : base;
  }
  async function renderWatches() {
    freshMain();
    const m = $("#main");
    m.innerHTML = `<div class="adm-page"><p class="muted">Зареждане…</p></div>`;
    const r = await fetch("/api/orders?watches=1", { cache: "no-store", headers: { "x-admin-password": pw() } }).then((x) => x.json()).catch(() => null);
    if (!$("#main").isConnected || tab !== "watches") return;
    const groups = {};
    (r?.watches || []).forEach((w) => (groups[w.slug] = groups[w.slug] || []).push(w));
    const rows = Object.entries(groups).map(([slug, ws]) => {
      const now = nowPrice(slug, ws[0].id), was = Math.min(...ws.map((w) => w.price || Infinity));
      return { slug, ws, now, was, drop: now != null && was !== Infinity && now < was, name: ws[0].name };
    }).sort((a, b) => b.drop - a.drop || b.ws.length - a.ws.length);
    $("#main").innerHTML = `<div class="adm-page"><section class="adm-box"><h2>Следени цени (${rows.length} продукта, ${(r?.watches || []).length} абоната)</h2>
      <p class="muted">Клиентите натискат „Кажи ми при намаление“ на продукта. Когато намалиш цената (в „Продукти“ или „Етикети“ → Запази), продуктът се маркира тук.
      Натисни „Изпрати имейл“ – отваря се писмо до всички абонати (скрито копие) – и после „Готово“, за да изтриеш имейлите им.</p>
      <div class="adm-row" id="mailState"></div>
      ${rows.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Продукт</th><th>Абонати</th><th>Цена при абониране</th><th>Сега</th><th></th></tr></thead><tbody>
        ${rows.map((x) => `<tr data-slug="${esc(x.slug)}" class="${x.drop ? "sel" : ""}"><td><b>${esc(x.name)}</b><small class="muted">${esc(x.ws[0].variant || "")}</small></td><td>${x.ws.length}</td>
          <td>${eur(x.was === Infinity ? null : x.was)}</td><td>${x.drop ? `<span class="adm-badge adm-badge--ready">${eur(x.now)} ↓</span>` : eur(x.now)}</td>
          <td><div class="adm-row">${x.drop ? `<a class="btn btn--primary btn--sm" data-mail href="#">Изпрати имейл</a>` : ""}<button class="btn btn--ghost btn--sm" data-wdone>${x.drop ? "Готово" : "Изтрий"}</button></div></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">Още няма абонати.</p>`}</section></div>`;
    mailState($("#mailState"), true);
    $("#main").addEventListener("click", async (e) => {
      if (e.target.id === "runDaily") {
        e.target.disabled = true;
        const r = await fetch("/api/orders?rundaily=1", { method: "POST", headers: { "x-admin-password": pw() } }).then((x) => x.json()).catch(() => null);
        toast(r ? `Изпратени: ${r.priceAlerts} известия за намаление, ${r.reminders} напомняния` : "Грешка");
        return renderWatches();
      }
      const tr = e.target.closest("tr[data-slug]"); if (!tr) return;
      const x = rows.find((y) => y.slug === tr.dataset.slug);
      if (e.target.closest("[data-mail]")) {
        e.preventDefault();
        const site = (st("siteUrl") || location.origin).replace(/\/$/, "");
        const body = `Здравей!\n\nЦената на ${x.name}, която следиш, падна на ${eur(x.now)} (беше ${eur(x.was)}).\n\nВиж продукта: ${site}/p/${x.slug}/\n\nПоздрави,\nекипът на GDMobil\n${st("phone")} · ${st("address")}\n\nПолучаваш това писмо, защото поиска известие при намаление. Имейлът ти вече е изтрит от списъка.`;
        location.href = `mailto:${encodeURIComponent(st("email"))}?bcc=${encodeURIComponent(x.ws.map((w) => w.email).join(","))}&subject=${encodeURIComponent("Намаление: " + x.name)}&body=${encodeURIComponent(body)}`;
      }
      if (e.target.closest("[data-wdone]")) {
        if (!x.drop && !confirm(`Да изтрия ${x.ws.length} абоната за „${x.name}“?`)) return;
        await fetch("/api/orders?watch_del=1", { method: "POST", headers: { "content-type": "application/json", "x-admin-password": pw() }, body: JSON.stringify({ keys: x.ws.map((w) => w.key) }) });
        toast("Готово"); renderWatches();
      }
    });
  }

  /* ===== ЧАТ АСИСТЕНТ: указания, готови отговори, въпроси без отговор ===== */
  async function renderChat() {
    freshMain();
    O.chat = O.chat || {};
    const CH = O.chat; CH.qa = CH.qa || [];
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box"><h2>Как да „обучиш“ асистента</h2>
        <p class="muted">Асистентът вече знае цените на ремонтите, доставката, гаранцията, въпросите и отговорите и ръководствата от сайта, и вижда намерените продукти с цени.
        Тук добавяш <b>своите</b> правила и отговори. Те важат веднага след „Запази“ и са с предимство пред общите. <a class="link" href="./#/" target="_blank">Пробвай чата в сайта →</a></p>
        <label class="field"><span>Указания (свободен текст)</span><textarea class="input" id="chNotes" rows="7" placeholder="Напр.: Изкупуваме стари телефони срещу отстъпка – клиентът да донесе телефона за оценка.&#10;Изплащане предлагаме чрез TBI Bank в магазина.&#10;През август работим и в събота до 16:00.">${esc(CH.notes || "")}</textarea></label>
        <p class="muted small">Пиши кратки и конкретни изречения. Не пиши лични данни или пароли – текстът се изпраща на AI модела при всеки въпрос.</p></section>
      <section class="adm-box"><div class="adm-row"><h2>Готови отговори (${CH.qa.length})</h2><button class="btn btn--primary btn--sm" id="qaAdd">+ Нов отговор</button></div>
        <div class="adm-reviews" id="qaList">${CH.qa.map((x, i) => `<div class="adm-rev" data-i="${i}">
          <label class="field"><span>Въпрос</span><input class="input" data-qa="q" value="${esc(x.q || "")}" placeholder="Купувате ли стари телефони?"></label>
          <label class="field"><span>Отговор</span><textarea class="input" rows="3" data-qa="a" placeholder="Отговорът, който асистентът да дава">${esc(x.a || "")}</textarea></label>
          <div class="adm-row"><button class="btn btn--ghost btn--sm" data-qadel>Изтрий</button>${x.a ? "" : `<span class="adm-badge adm-badge--new">Попълни отговора</span>`}</div></div>`).join("") || `<p class="muted">Още няма. Добави от „Въпроси без отговор“ по-долу или с „+ Нов отговор“.</p>`}</div></section>
      <section class="adm-box" id="chLog"><h2>Въпроси без отговор</h2><p class="muted">Зареждане…</p></section></div>`;
    const m = $("#main");
    m.addEventListener("input", (e) => {
      const t = e.target;
      if (t.id === "chNotes") { CH.notes = t.value; change(); }
      if (t.dataset.qa) {
        const box = t.closest("[data-i]"); CH.qa[+box.dataset.i][t.dataset.qa] = t.value; change();
        if (t.dataset.qa === "a") box.querySelector(".adm-badge")?.toggleAttribute("hidden", !!t.value.trim());
      }
    });
    m.addEventListener("click", async (e) => {
      if (e.target.id === "qaAdd") { CH.qa.unshift({ q: "", a: "" }); change(); return renderChat(); }
      if (e.target.closest("[data-qadel]")) { CH.qa.splice(+e.target.closest("[data-i]").dataset.i, 1); change(); return renderChat(); }
      const it = e.target.closest("[data-key]");
      if (it && e.target.closest("[data-learn]")) {
        CH.qa.unshift({ q: it.dataset.q, a: "" }); change();
        await fetch("/api/chat?logdel=" + encodeURIComponent(it.dataset.key), { method: "POST", headers: { "x-admin-password": pw() } });
        toast("Добавен – напиши отговора и натисни „Запази“"); return renderChat();
      }
      if (it && e.target.closest("[data-ldel]")) {
        await fetch("/api/chat?logdel=" + encodeURIComponent(it.dataset.key), { method: "POST", headers: { "x-admin-password": pw() } });
        it.remove();
      }
    });
    const r = await fetch("/api/chat?log=1", { cache: "no-store", headers: { "x-admin-password": pw() } }).then((x) => x.json()).catch(() => null);
    const box = $("#chLog"); if (!box || !box.isConnected) return;
    const items = r?.items || [];
    box.innerHTML = `<h2>Въпроси без отговор (${items.length})</h2>
      <p class="muted">Въпроси, при които асистентът е препратил клиента към колега (последните 30 дни). Добави отговор и следващия път той ще знае.</p>
      ${items.length ? `<div class="adm-reviews">${items.map((x) => `<div class="adm-rev" data-key="${esc(x.key)}" data-q="${esc(x.q)}">
        <p><b>${esc(x.q)}</b> <span class="muted small">${new Date(x.at).toLocaleString("bg-BG")}</span></p>
        <p class="muted small">Асистентът отговори: ${esc(x.a)}</p>
        <div class="adm-row"><button class="btn btn--primary btn--sm" data-learn>Добави отговор</button><button class="btn btn--ghost btn--sm" data-ldel>Изтрий</button></div></div>`).join("")}</div>`
        : `<p class="muted">Няма такива въпроси. 👍</p>`}`;
  }

  /* ===== СЪСТОЯНИЕ НА ИМЕЙЛИТЕ ===== */
  async function mailState(el, withRun) {
    const r = await fetch("/api/orders?mailcheck=1", { headers: { "x-admin-password": pw() } }).then((x) => x.json()).catch(() => null);
    if (!el.isConnected || !r) return;
    el.innerHTML = `<span class="adm-badge ${r.mail ? "adm-badge--ready" : "adm-badge--new"}">${r.mail ? "✓ Автоматични имейли: включени" : "Автоматични имейли: изключени"}</span>
      <span class="adm-badge ${r.telegram ? "adm-badge--ready" : ""}">${r.telegram ? "✓ Telegram: включен" : "Telegram: изключен"}</span>
      ${r.mail && withRun ? `<button class="btn btn--ghost btn--sm" id="runDaily">Провери и изпрати сега</button><span class="muted small">Автоматично всеки ден в 17:05.</span>` : ""}
      ${r.mail ? "" : `<span class="muted small">Добави BREVO_API_KEY и MAIL_FROM в Netlify (виж README).</span>`}`;
  }

  /* ===== ПРОМО КОДОВЕ ===== */
  const SCOPES = { all: "Всички продукти", phones: "Само телефони", accessories: "Само аксесоари", tablets: "Само таблети" };
  async function renderPromos() {
    freshMain();
    O.promos = O.promos || [];
    const P = O.promos;
    const uses = (await fetch("/api/orders?promouses=1", { headers: { "x-admin-password": pw() } }).then((x) => x.json()).catch(() => null))?.uses || {};
    if (tab !== "promos") return;
    $("#main").innerHTML = `<div class="adm-page"><section class="adm-box"><div class="adm-row"><h2>Промо кодове (${P.length})</h2><button class="btn btn--primary btn--sm" id="addPromo">+ Нов код</button></div>
      <p class="muted">Клиентът въвежда кода при поръчката. Кодовете не се виждат публично – проверяват се от сървъра. След промяна натисни „Запази“.</p>
      ${P.length ? `<div class="adm-promos">${P.map((p, i) => `<div class="adm-rev adm-promo ${p.active === false ? "off" : ""}" data-i="${i}">
        <div class="adm-grid">
          <label class="field"><span>Код</span><input class="input" data-p="code" value="${esc(p.code || "")}" placeholder="GDMOBIL10" style="text-transform:uppercase"></label>
          <label class="field"><span>Вид</span><select class="select" data-p="kind"><option value="percent" ${p.kind !== "fixed" ? "selected" : ""}>Процент (%)</option><option value="fixed" ${p.kind === "fixed" ? "selected" : ""}>Сума (€)</option></select></label>
          <label class="field"><span>Стойност</span><input class="input" type="number" min="0" step="0.01" data-p="value" value="${esc(p.value ?? "")}"></label>
          <label class="field"><span>Важи за</span><select class="select" data-p="scope">${Object.entries(SCOPES).map(([k, l]) => `<option value="${k}" ${(p.scope || "all") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field"><span>Мин. поръчка (€)</span><input class="input" type="number" min="0" data-p="min" value="${esc(p.min ?? "")}" placeholder="0"></label>
          <label class="field"><span>Валиден до</span><input class="input" type="date" data-p="until" value="${esc(p.until || "")}"></label>
          <label class="field"><span>Макс. използвания</span><input class="input" type="number" min="0" data-p="limit" value="${esc(p.limit ?? "")}" placeholder="без ограничение"></label>
          <label class="field"><span>Описание (вижда се от клиента)</span><input class="input" data-p="title" value="${esc(p.title || "")}" placeholder="Черен петък"></label>
        </div>
        <div class="adm-row"><label class="check"><input type="checkbox" data-p="active" ${p.active === false ? "" : "checked"}><span>Активен</span></label>
          <span class="muted small">Използван: <b>${uses[String(p.code || "").toUpperCase()] || 0}</b> пъти</span><button class="btn btn--ghost btn--sm" data-pdel>Изтрий</button></div></div>`).join("")}</div>`
        : `<p class="muted">Няма кодове. Създай първия – напр. GDMOBIL10 за −10% на аксесоарите.</p>`}</section></div>`;
    const m = $("#main");
    m.addEventListener("input", (e) => {
      const t = e.target, k = t.dataset.p; if (!k) return;
      const p = P[+t.closest("[data-i]").dataset.i];
      p[k] = k === "active" ? t.checked : k === "code" ? t.value.trim().toUpperCase().replace(/\s+/g, "") : ["value", "min", "limit"].includes(k) ? (t.value === "" ? "" : Number(t.value)) : t.value;
      change();
    });
    m.addEventListener("change", (e) => { if (e.target.dataset.p === "active") { P[+e.target.closest("[data-i]").dataset.i].active = e.target.checked; change(); } });
    m.addEventListener("click", (e) => {
      if (e.target.id === "addPromo") { P.unshift({ code: "", kind: "percent", value: 10, scope: "all", min: "", until: "", limit: "", title: "", active: true }); change(); renderPromos(); }
      if (e.target.closest("[data-pdel]")) { P.splice(+e.target.closest("[data-i]").dataset.i, 1); change(); renderPromos(); }
    });
  }

  /* ===== ТАБЛО ===== */
  let dashDays = 30;
  async function renderDash() {
    freshMain();
    const m = $("#main");
    if (!OL) {
      m.innerHTML = `<div class="adm-page"><p class="muted">Зареждане…</p></div>`;
      const r = await ordersApi("GET", "?list=1");
      if (!r.ok) { m.innerHTML = `<div class="adm-page"><section class="adm-box"><p>Данните не могат да се заредят (${r.status}).</p></section></div>`; return; }
      OL = r.data;
    }
    if (tab !== "dash") return;
    const DAY = 864e5, now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dashDays + 1);
    const inRange = (o) => new Date(o.createdAt) >= start;
    const prevStart = new Date(start - dashDays * DAY);
    const all = OL.orders, cur = all.filter(inRange), prev = all.filter((o) => new Date(o.createdAt) >= prevStart && new Date(o.createdAt) < start);
    const sales = (l) => l.filter((o) => o.type === "order" && o.status !== "cancelled");
    const sum = (l) => l.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const S1 = sales(cur), S0 = sales(prev), rev = sum(S1), rev0 = sum(S0);
    const delta = (a, b) => (!b ? "" : `<small class="${a >= b ? "up" : "down"}">${a >= b ? "▲" : "▼"} ${Math.abs(Math.round((a / b - 1) * 100))}% спрямо предходните ${dashDays} дни</small>`);
    // по дни
    const days = Array.from({ length: dashDays }, (_, i) => { const d = new Date(start.getTime() + i * DAY); return { d, key: d.toDateString(), v: 0, n: 0 }; });
    const byKey = new Map(days.map((x) => [x.key, x]));
    S1.forEach((o) => { const x = byKey.get(new Date(o.createdAt).toDateString()); if (x) { x.v += Number(o.total) || 0; x.n++; } });
    const max = Math.max(...days.map((x) => x.v), 1);
    // най-продавани
    const top = new Map();
    S1.forEach((o) => (o.items || []).forEach((i) => { const t = top.get(i.name) || { name: i.name, qty: 0, rev: 0 }; t.qty += i.qty || 1; t.rev += (i.price || 0) * (i.qty || 1); top.set(i.name, t); }));
    const topList = [...top.values()].sort((a, b) => b.rev - a.rev).slice(0, 8), topMax = Math.max(...topList.map((t) => t.rev), 1);
    const repairs = cur.filter((o) => o.type === "repair"), booked = repairs.filter((o) => o.appointment);
    const promoUsed = S1.filter((o) => o.promo), promoDisc = promoUsed.reduce((s, o) => s + (o.discount || 0), 0);
    const open = all.filter((o) => !["done", "cancelled", "closed"].includes(o.status));
    const upcoming = all.filter((o) => o.appointment && new Date(o.appointment) >= new Date(now.toDateString()) && !["done", "cancelled"].includes(o.status)).sort((a, b) => a.appointment.localeCompare(b.appointment)).slice(0, 6);
    const W = 720, H = 200, bw = W / dashDays, fmtD = (d) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
    m.innerHTML = `<div class="adm-page">
      <div class="adm-row adm-toolbar"><div class="adm-seg">${[7, 30, 90].map((n) => `<button class="${dashDays === n ? "on" : ""}" data-days="${n}">${n} дни</button>`).join("")}</div>
        <button class="btn btn--ghost btn--sm" id="dReload">↻ Обнови</button></div>
      <div class="dash-kpis">
        <div class="kpi"><span>Оборот (поръчки)</span><b>${eur(rev)}</b>${delta(rev, rev0)}</div>
        <div class="kpi"><span>Поръчки</span><b>${S1.length}</b>${delta(S1.length, S0.length)}</div>
        <div class="kpi"><span>Средна поръчка</span><b>${eur(S1.length ? rev / S1.length : null)}</b></div>
        <div class="kpi"><span>Ремонти / записани часове</span><b>${repairs.length} <small>/ ${booked.length}</small></b></div>
        <div class="kpi"><span>Отворени заявки</span><b>${open.length}</b><small>${open.filter((o) => o.status === "new").length} нови</small></div>
        <div class="kpi"><span>Промо кодове</span><b>${promoUsed.length}</b><small>отстъпки ${eur(promoDisc)}</small></div>
      </div>
      <section class="adm-box"><h3>Оборот по дни</h3>
        ${rev ? `<div class="dash-chart"><svg viewBox="0 -12 ${W + 50} ${H + 38}" role="img" aria-label="Оборот по дни за последните ${dashDays} дни">
          ${ticks.map((t) => { const y = H - (t / max) * H; return `<line x1="50" x2="${W + 50}" y1="${y}" y2="${y}" class="grid"/><text x="44" y="${y + 4}" text-anchor="end" class="axis">${t ? t.toLocaleString("bg-BG") + " €" : "0"}</text>`; }).join("")}
          ${days.map((x, i) => { const h = x.v ? Math.max(3, (x.v / max) * H) : 0, bx = 50 + i * bw + 1, w = Math.max(1, bw - 2);
            return `<g class="bar" tabindex="0"><title>${fmtD(x.d)}: ${eur(x.v)} · ${x.n} поръчки</title><rect class="hit" x="${50 + i * bw}" y="0" width="${bw}" height="${H}"/>
              ${h ? `<path d="M${bx},${H} v${-(h - Math.min(4, w / 2, h))} q0,${-Math.min(4, w / 2, h)} ${Math.min(4, w / 2)},${-Math.min(4, w / 2, h)} h${w - 2 * Math.min(4, w / 2)} q${Math.min(4, w / 2)},0 ${Math.min(4, w / 2)},${Math.min(4, w / 2, h)} v${h - Math.min(4, w / 2, h)} z" class="fill"/>` : ""}</g>`; }).join("")}
          <line x1="50" x2="${W + 50}" y1="${H}" y2="${H}" class="base"/>
          ${days.map((x, i) => (i % Math.ceil(dashDays / 8) === 0 ? `<text x="${50 + i * bw + bw / 2}" y="${H + 18}" text-anchor="middle" class="axis">${fmtD(x.d)}</text>` : "")).join("")}
        </svg></div>
        <details><summary class="muted small">Таблица</summary><div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Ден</th><th>Поръчки</th><th>Оборот</th></tr></thead><tbody>${days.filter((x) => x.n).map((x) => `<tr><td>${fmtD(x.d)}</td><td>${x.n}</td><td>${eur(x.v)}</td></tr>`).join("")}</tbody></table></div></details>`
        : `<p class="muted">Няма поръчки в този период.</p>`}
      </section>
      <div class="dash-two">
        <section class="adm-box"><h3>Най-продавани</h3>${topList.length ? `<ol class="dash-top">${topList.map((t) => `<li><span class="dash-top__name">${esc(t.name)}</span><span class="dash-top__bar"><i style="width:${(t.rev / topMax) * 100}%"></i></span><b>${eur(t.rev)}</b><small class="muted">${t.qty} бр.</small></li>`).join("")}</ol>` : `<p class="muted">Още няма данни. (Продуктите се отчитат за поръчки след това обновяване.)</p>`}</section>
        <section class="adm-box"><h3>Предстоящи часове в сервиза</h3>${upcoming.length ? `<ul class="dash-list">${upcoming.map((o) => `<li><b>${new Date(o.appointment).toLocaleString("bg-BG", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</b><span>${esc(o.name)} · ${esc(o.title.replace(/^Час [\d. :]+– /, ""))}</span><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></li>`).join("")}</ul>` : `<p class="muted">Няма записани часове.</p>`}
          <h3>Състояние</h3><div class="adm-row" id="mailState2"></div></section>
      </div>
      <div class="dash-two">
        <section class="adm-box"><div class="adm-box__head"><h3>Последни заявки</h3><button class="link-btn" data-go="orders">Всички →</button></div>
          ${all.length ? `<table class="adm-table dash-recent"><tbody>${[...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 7).map((o) => `<tr data-go="orders">
            <td><b>${esc(o.ref || "")}</b><small class="muted">${new Date(o.createdAt).toLocaleString("bg-BG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></td>
            <td>${esc(o.name || "")}<small class="muted">${esc(({ order: "Поръчка", repair: "Ремонт", inquiry: "Запитване", withdrawal: "Отказ", newsletter: "Бюлетин", watch: "Следене", unsubscribe: "Отписване" })[o.type] || o.type)}</small></td>
            <td class="num">${o.total ? eur(o.total) : ""}</td><td><span class="adm-badge adm-badge--${esc(o.status)}">${esc(o.status === "new" ? "нова" : o.status)}</span></td></tr>`).join("")}</tbody></table>` : `<p class="muted">Още няма заявки.</p>`}
        </section>
        <section class="adm-box"><div class="adm-box__head"><h3>Каталог</h3><button class="link-btn" data-go="products">Продукти →</button></div>
          ${(() => {
            const del = new Set(O.deleted || []), hid = new Set(O.hidden || []);
            const live = PRODUCTS.filter((p) => !del.has(p.slug));
            const cnt = (f) => live.filter(f).length;
            const noPrice = cnt((p) => !p.variants.some((v) => (O.prices[v.id] ?? v.price) > 0));
            const order = cnt((p) => p.variants.some((v) => O.stock[v.id] === 0));
            const rows = [
              ["Активни продукти", live.length - hid.size, ""], ["Телефони", cnt((p) => p.cat === "phones"), ""], ["Таблети", cnt((p) => p.cat === "tablets"), ""], ["Аксесоари", cnt((p) => p.cat === "accessories"), ""],
              ["Скрити", hid.size, "hidden"], ["Изтрити", del.size, "deleted"], ["Без цена", noPrice, "noprice"], ["По заявка", order, "order"], ["С редактирано съдържание", Object.keys(O.edits || {}).length, "edited"],
            ];
            return `<ul class="dash-stats">${rows.map(([n, v, st]) => `<li ${st ? `data-gostatus="${st}"` : ""}><span>${n}</span><b>${v}</b></li>`).join("")}</ul>`;
          })()}
        </section>
      </div></div>`;
    mailState($("#mailState2"), false);
    m.addEventListener("click", (e) => {
      const d = e.target.closest("[data-days]"); if (d) { dashDays = +d.dataset.days; renderDash(); }
      if (e.target.id === "dReload") { OL = null; renderDash(); }
      const go = e.target.closest("[data-go],[data-gostatus]");
      if (go) {
        if (go.dataset.gostatus) { Object.assign(F, { q: "", cat: "", brand: "", model: "", sub: "", status: go.dataset.gostatus, limit: 100 }); tab = "products"; }
        else tab = go.dataset.go;
        sessionStorage.setItem("gdm_admin_tab", tab); render(); scrollTo(0, 0);
      }
    });
  }

  /* ===== ПЕЧАТ ===== */
  function printDoc(kind, o) {
    const C = { company: "ИН-ТЕЛ ЕООД", eik: "101560088", name: "GDMobil", address: st("address"), phone: st("phone"), email: st("email") };
    const d = (s) => new Date(s).toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const items = o.items || [], subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const head = (title) => `<header><div><b class="logo">GD<span>Mobil</span></b><div>${esc(C.company)} · ЕИК ${C.eik}<br>${esc(C.address)}<br>${esc(C.phone)} · ${esc(C.email)}</div></div>
      <div class="r"><h1>${title}</h1><div>№ <b>${esc(o.ref)}</b><br>${d(o.createdAt)}</div></div></header>`;
    const client = `<section class="box"><h3>Клиент</h3><p><b>${esc(o.customer.name)}</b><br>Тел.: ${esc(o.customer.phone)}${o.customer.email ? `<br>${esc(o.customer.email)}` : ""}</p></section>`;
    const sign = (a, b) => `<div class="sign"><div>${a}<span></span></div><div>${b}<span></span></div></div>`;
    let body = "";
    if (kind === "receipt") {
      body = `${head("Стокова разписка")}${client}
        <table><thead><tr><th>#</th><th>Артикул</th><th>Код</th><th>К-во</th><th>Ед. цена</th><th>Сума</th></tr></thead><tbody>
        ${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}${i.variant ? `<br><small>${esc(i.variant)}</small>` : ""}</td><td>${esc(i.id)}</td><td>${i.qty}</td><td>${eur(i.price)}</td><td>${eur(i.price * i.qty)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="5">Стоки</td><td>${eur(subtotal)}</td></tr>${o.promo ? `<tr><td colspan="5">Отстъпка (${esc(o.promo.code)})</td><td>−${eur(o.promo.discount)}</td></tr>` : ""}
        ${o.total != null && Math.abs(o.total - subtotal + (o.promo?.discount || 0)) > 0.009 ? `<tr><td colspan="5">Доставка</td><td>${eur(o.total - subtotal + (o.promo?.discount || 0))}</td></tr>` : ""}
        <tr class="tot"><td colspan="5">Общо (с ДДС)</td><td>${eur(o.total ?? subtotal)}</td></tr></tfoot></table>
        <p>Получаване: ${esc(o.delivery || "—")}<br>Плащане: ${esc(o.payment || "—")}${o.tracking ? `<br>Товарителница: ${esc(o.tracking)}` : ""}</p>
        <p class="small">Стоката е с минимум 2 години законова гаранция. При покупка от разстояние клиентът има право на отказ в 14-дневен срок. Този документ не е фискален бон или фактура.</p>
        ${sign("Предал:", "Получил:")}`;
    } else if (kind === "intake") {
      body = `${head("Приемателен протокол за ремонт")}${client}
        <section class="box"><h3>Устройство</h3><table class="kv">
          <tr><td>Марка и модел</td><td>${esc(o.device || "")}</td></tr><tr><td>IMEI / сериен №</td><td class="blank"></td></tr>
          <tr><td>Цвят</td><td class="blank"></td></tr><tr><td>Код за отключване</td><td class="blank">☐ предоставен ☐ не е предоставен</td></tr>
          <tr><td>Окомплектовка</td><td class="blank">☐ калъф ☐ SIM карта ☐ карта памет ☐ зарядно ☐ друго: ______</td></tr>
          <tr><td>Външно състояние</td><td class="blank">☐ без забележки ☐ драскотини ☐ удари ☐ счупено стъкло ☐ влага</td></tr></table></section>
        <section class="box"><h3>Описан проблем</h3><p>${esc(o.title || "")}</p><pre>${esc(o.text || "")}</pre></section>
        <section class="box"><h3>Оценка</h3><table class="kv"><tr><td>Ориентировъчна цена</td><td class="blank"></td></tr><tr><td>Очакван срок</td><td class="blank"></td></tr>
          <tr><td>Капаро</td><td class="blank"></td></tr>${o.appointment ? `<tr><td>Записан час</td><td>${d(o.appointment)}</td></tr>` : ""}</table></section>
        <p class="small">Ремонтът започва само след потвърждение на цената от клиента. Сервизът не носи отговорност за данни в устройството – препоръчваме резервно копие.
        Устройство, непотърсено до 3 месеца след уведомяване за готовност, може да бъде предадено за рециклиране. Статус: ${esc(location.origin)}/#/track (номер ${esc(o.ref)} + последните 4 цифри от телефона).</p>
        ${sign("Приел (сервиз):", "Предал (клиент):")}`;
    } else {
      body = `${head("Заявка")}${client}<pre>${esc(o.text || "")}</pre>`;
    }
    const w = window.open("", "_blank");
    if (!w) return toast("Разреши изскачащите прозорци за печат");
    w.document.write(`<!doctype html><html lang="bg"><head><meta charset="utf-8"><title>${esc(o.ref)}</title><style>
      *{box-sizing:border-box} body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:0;padding:28px} header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
      .logo{font-size:22px} .logo span{color:#e8511b} h1{font-size:18px;margin:0 0 6px} .r{text-align:right} .box{border:1px solid #ccc;border-radius:8px;padding:10px 14px;margin:0 0 12px} .box h3{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#555}
      table{width:100%;border-collapse:collapse;margin:8px 0 12px} th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top} th{background:#f2f2f2;font-size:12px}
      td:nth-last-child(-n+3),th:nth-last-child(-n+3){text-align:right} .kv td,.kv td:nth-last-child(-n+3){text-align:left} .kv td:first-child{width:32%;color:#555} .blank{height:28px}
      tfoot td{border:0;text-align:right} .tot td{font-weight:bold;font-size:15px;border-top:2px solid #111} pre{white-space:pre-wrap;font:inherit;margin:0} .small{font-size:11px;color:#444}
      .sign{display:flex;gap:40px;margin-top:40px} .sign div{flex:1} .sign span{display:block;border-bottom:1px solid #111;height:34px} @media print{body{padding:0}}
    </style></head><body>${body}<script>window.onload=()=>{window.print()}<\/script></body></html>`);
    w.document.close();
  }

  /* ===== СТАТИСТИКА ===== */
  function renderAnalytics() {
    freshMain();
    const A = O.analytics;
    const P = [
      ["", "Изключена", "", []],
      ["plausible", "Plausible", "https://plausible.io", [["domain", "Домейн (както е в Plausible)", "gdmobil.bg"]]],
      ["umami", "Umami Cloud (има безплатен план)", "https://cloud.umami.is", [["websiteId", "Website ID", "xxxxxxxx-xxxx-…"]]],
      ["goatcounter", "GoatCounter", "https://www.goatcounter.com", [["code", "Код (поддомейн)", "gdmobil"]]],
      ["cloudflare", "Cloudflare Web Analytics (безплатна)", "https://www.cloudflare.com/web-analytics/", [["token", "Token", "…"]]],
    ];
    $("#main").innerHTML = `<div class="adm-page"><section class="adm-box"><h2>Статистика за посещенията</h2>
      <p class="muted">Всички изброени услуги работят <b>без бисквитки</b> и не изискват банер за съгласие. Регистрирай се в избраната услуга, добави сайта и въведи данните тук. Текстът за бисквитките и поверителността се допълва автоматично.</p>
      <div class="adm-providers">${P.map(([k, n, url, fields]) => `<label class="adm-prov ${A.provider === k ? "on" : ""}"><input type="radio" name="prov" value="${k}" ${A.provider === k ? "checked" : ""}>
        <span><b>${n}</b>${url ? `<a href="${url}" target="_blank" rel="noopener">${url.replace("https://", "")}</a>` : ""}</span>
        ${fields.map(([f, l, ph]) => `<label class="field"><span>${l}</span><input class="input" data-a="${f}" value="${esc(A[f] || "")}" placeholder="${esc(ph)}" ${A.provider === k ? "" : "disabled"} /></label>`).join("")}</label>`).join("")}</div>
      <p class="muted small">Отчитат се и действия: добавяне в количката, изпратена заявка, запитване, абонамент, използване на чата.</p></section></div>`;
    $("#main").addEventListener("change", (e) => { if (e.target.name === "prov") { O.analytics = { provider: e.target.value }; change(); renderAnalytics(); } });
    $("#main").addEventListener("input", (e) => { if (e.target.dataset.a) { O.analytics[e.target.dataset.a] = e.target.value.trim(); change(); } });
  }
})();
