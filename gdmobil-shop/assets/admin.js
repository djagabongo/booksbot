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
  const CAT = { phones: "Телефони", tablets: "Таблети", accessories: "Аксесоари", cameras: "Камери" };
  const PW_KEY = "gdm_admin_pw";

  /* ---------- продукти от каталога ---------- */
  const PRODUCTS = [
    ...C.groups.map((g) => ({ slug: g.s, name: g.n, brand: g.b, cat: g.c, kind: "g",
      variants: g.v.map((v) => ({ id: v[0], label: [v[1], v[2] && v[2] + " RAM", v[3], v[4]].filter(Boolean).join(" · ") || "Стандартен", price: v[5] })) })),
    ...C.items.map((i) => ({ slug: i.s, name: i.n, brand: i.b, cat: i.c, kind: "i", sub: i.sc, variants: [{ id: i.i, label: i.sc || "Артикул", price: i.p }] })),
  ];
  const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));
  const norm = (s) => String(s).toLowerCase();
  const NEW_RE = () => {
    const list = O.labels.new || [];
    return list.length ? new RegExp(list.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i") : null;
  };

  /* ---------- състояние ---------- */
  let O = null; // настройките
  let dirty = false;
  let tab = "orders";
  let sel = null; // избран продукт
  const blank = () => ({
    store: {}, labels: { new: [...(L0.new || [])], hot: [...(L0.hot || [])], sale: { ...(L0.sale || {}) }, newAdd: [], newRemove: [] },
    prices: {}, stock: {}, hidden: [], reviews: { items: [] }, analytics: { provider: "" },
  });
  function normalize(o) {
    const b = blank();
    o = o && typeof o === "object" ? o : {};
    return {
      ...b, ...o,
      store: { ...(o.store || {}) },
      labels: { ...b.labels, ...(o.labels || {}), sale: { ...((o.labels && o.labels.sale) || b.labels.sale) } },
      prices: { ...(o.prices || {}) }, stock: { ...(o.stock || {}) }, hidden: [...(o.hidden || [])],
      reviews: { items: [], ...(o.reviews || {}) }, analytics: { provider: "", ...(o.analytics || {}) },
    };
  }
  const st = (k) => (O.store[k] !== undefined ? O.store[k] : S0[k]);
  function change() { dirty = true; $("#saveBtn").disabled = false; $("#status").textContent = "Има незапазени промени"; $("#status").className = "adm-status adm-status--dirty"; }

  let toastT;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

  /* ---------- API ---------- */
  const pw = () => sessionStorage.getItem(PW_KEY) || "";
  async function api(method, body, query = "") {
    const r = await fetch("/api/settings" + query, {
      method, cache: "no-store",
      headers: { "content-type": "application/json", ...(method === "POST" ? { "x-admin-password": pw() } : {}) },
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
  async function enter() {
    const r = await api("GET", null, "?t=" + Date.now());
    O = normalize(r.ok ? r.data : {});
    $("#login").hidden = true; $("#app").hidden = false;
    if (O._savedAt) { $("#status").textContent = "Последно запазено: " + new Date(O._savedAt).toLocaleString("bg-BG"); }
    render();
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
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    tab = b.dataset.tab;
    $$("#tabs [data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b));
    render();
  });
  function render() {
    const m = $("#main"), fresh = m.cloneNode(false);
    m.replaceWith(fresh); // нов елемент – без натрупани обработчици от предишния раздел
    ({ orders: renderOrders, products: renderProducts, labels: renderLabels, home: renderHome, store: renderStore, reviews: renderReviews, analytics: renderAnalytics })[tab]();
  }

  /* ===== ПРОДУКТИ ===== */
  const isChanged = (p) => O.hidden.includes(p.slug) || O.labels.hot.includes(p.slug) || O.labels.newAdd.includes(p.slug) || O.labels.newRemove.includes(p.slug) ||
    O.labels.sale[p.slug] != null || p.variants.some((v) => O.prices[v.id] != null || O.stock[v.id] === 0 || O.labels.sale[v.id] != null);
  let q = "", qCat = "", onlyChanged = false;
  function renderProducts() {
    $("#main").innerHTML = `<div class="adm-split">
      <aside class="adm-list">
        <div class="adm-list__tools">
          <input class="input" id="pq" placeholder="Търси модел или аксесоар…" value="${esc(q)}" />
          <div class="adm-row">
            <select class="select" id="pcat"><option value="">Всички категории</option>${Object.entries(CAT).map(([k, n]) => `<option value="${k}" ${qCat === k ? "selected" : ""}>${n}</option>`).join("")}</select>
            <label class="check"><input type="checkbox" id="pchg" ${onlyChanged ? "checked" : ""}><span>Само променени</span></label>
          </div>
        </div>
        <div class="adm-results" id="pres"></div>
      </aside>
      <section class="adm-edit" id="pedit"></section>
    </div>`;
    const list = () => {
      const toks = norm(q).split(/\s+/).filter(Boolean);
      const res = PRODUCTS.filter((p) => (!qCat || p.cat === qCat) && (!onlyChanged || isChanged(p)) && toks.every((t) => norm(p.brand + " " + p.name).includes(t)));
      $("#pres").innerHTML = `<p class="muted small">${res.length} продукта${res.length > 80 ? " · показани първите 80" : ""}</p>` + res.slice(0, 80).map((p) => {
        const min = Math.min(...p.variants.map((v) => v.price ?? Infinity));
        return `<button class="adm-item ${sel === p ? "on" : ""}" data-slug="${p.slug}"><b>${esc(p.name)}</b>
          <small>${CAT[p.cat]} · ${isFinite(min) ? "от " + eur(min) : "при запитване"}${p.variants.length > 1 ? ` · ${p.variants.length} варианта` : ""}</small>
          ${isChanged(p) ? `<i class="adm-dot" title="Има промени"></i>` : ""}</button>`;
      }).join("");
    };
    list();
    $("#pq").addEventListener("input", (e) => { q = e.target.value; list(); });
    $("#pcat").addEventListener("change", (e) => { qCat = e.target.value; list(); });
    $("#pchg").addEventListener("change", (e) => { onlyChanged = e.target.checked; list(); });
    $("#pres").addEventListener("click", (e) => { const b = e.target.closest("[data-slug]"); if (b) { sel = BY_SLUG.get(b.dataset.slug); list(); editProduct(); } });
    editProduct();
  }
  const toggleIn = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i > -1) arr.splice(i, 1); };
  function finalOf(p, v) {
    const base = O.prices[v.id] != null ? Number(O.prices[v.id]) : v.price;
    const pct = Number(O.labels.sale[v.id] ?? O.labels.sale[p.slug] ?? 0);
    return base == null ? null : pct > 0 ? Math.round(base * (100 - pct)) / 100 : base;
  }
  function editProduct() {
    const box = $("#pedit");
    if (!sel) { box.innerHTML = `<div class="adm-empty"><b>Избери продукт отляво</b><p class="muted">Можеш да промениш цена, намаление, наличност и етикети, или да го скриеш от сайта.</p></div>`; return; }
    const p = sel, autoNew = !!NEW_RE() && (p.cat === "phones" || p.cat === "tablets") && NEW_RE().test(p.name);
    const newMode = O.labels.newAdd.includes(p.slug) ? "on" : O.labels.newRemove.includes(p.slug) ? "off" : "auto";
    box.innerHTML = `
      <div class="adm-edit__head"><div><small class="muted">${esc(p.brand)} · ${CAT[p.cat]}${p.sub ? " · " + esc(p.sub) : ""}</small><h2>${esc(p.name)}</h2></div>
        <a class="btn btn--ghost btn--sm" href="./#/p/${p.slug}" target="_blank" rel="noopener">Виж в магазина ↗</a></div>
      <div class="adm-cards">
        <label class="adm-card"><span>Намаление за целия модел</span><div class="adm-pct"><input class="input" type="number" min="0" max="90" step="1" id="mSale" value="${esc(O.labels.sale[p.slug] ?? "")}" placeholder="0" /><b>%</b></div></label>
        <label class="adm-card"><span>Етикет „Ново“</span><select class="select" id="mNew">
          <option value="auto" ${newMode === "auto" ? "selected" : ""}>Автоматично (${autoNew ? "да" : "не"})</option>
          <option value="on" ${newMode === "on" ? "selected" : ""}>Винаги</option><option value="off" ${newMode === "off" ? "selected" : ""}>Никога</option></select></label>
        <label class="adm-card adm-card--check"><input type="checkbox" id="mHot" ${O.labels.hot.includes(p.slug) ? "checked" : ""}><span><b>Етикет „Хит“</b><small>Показва се и в „Подбрани“ при раздел Хит</small></span></label>
        <label class="adm-card adm-card--check"><input type="checkbox" id="mHide" ${O.hidden.includes(p.slug) ? "checked" : ""}><span><b>Скрий от сайта</b><small>Няма да се показва никъде</small></span></label>
      </div>
      <div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Вариант</th><th>Цена в каталога</th><th>Нова цена</th><th>Намаление</th><th>Наличност</th><th>Крайна цена</th></tr></thead>
        <tbody>${p.variants.map((v) => `<tr data-id="${v.id}">
          <td><b>${esc(v.label)}</b><small class="muted">Арт. ${v.id}</small></td>
          <td>${eur(v.price)}</td>
          <td><input class="input input--sm" type="number" min="0" step="0.01" data-f="price" value="${esc(O.prices[v.id] ?? "")}" placeholder="${v.price ?? ""}" /></td>
          <td><div class="adm-pct"><input class="input input--sm" type="number" min="0" max="90" step="1" data-f="sale" value="${esc(O.labels.sale[v.id] ?? "")}" placeholder="${O.labels.sale[p.slug] ?? 0}" /><b>%</b></div></td>
          <td><select class="select input--sm" data-f="stock"><option value="1">В наличност</option><option value="0" ${O.stock[v.id] === 0 ? "selected" : ""}>По заявка</option></select></td>
          <td class="adm-final" data-final>${eur(finalOf(p, v))}</td></tr>`).join("")}</tbody></table></div>
      ${p.variants.length > 1 ? `<div class="adm-row"><button class="btn btn--ghost btn--sm" id="allStockOn">Всички в наличност</button><button class="btn btn--ghost btn--sm" id="allStockOff">Всички по заявка</button><button class="btn btn--ghost btn--sm" id="resetModel">Изчисти промените по модела</button></div>`
        : `<div class="adm-row"><button class="btn btn--ghost btn--sm" id="resetModel">Изчисти промените</button></div>`}
      <p class="muted small">Празно поле = стойността от каталога. Намалението по вариант има предимство пред това за целия модел.</p>`;
    const refreshFinal = () => $$("tr[data-id]", box).forEach((tr) => { const v = p.variants.find((x) => x.id === +tr.dataset.id); $("[data-final]", tr).textContent = eur(finalOf(p, v)); });
    const num = (s) => (s === "" ? null : Math.max(0, Number(s)));
    $("#mSale").addEventListener("input", (e) => { const n = num(e.target.value); n ? (O.labels.sale[p.slug] = Math.min(90, n)) : delete O.labels.sale[p.slug]; change(); refreshFinal(); $$('[data-f="sale"]', box).forEach((i) => (i.placeholder = O.labels.sale[p.slug] ?? 0)); });
    $("#mNew").addEventListener("change", (e) => { toggleIn(O.labels.newAdd, p.slug, e.target.value === "on"); toggleIn(O.labels.newRemove, p.slug, e.target.value === "off"); change(); });
    $("#mHot").addEventListener("change", (e) => { toggleIn(O.labels.hot, p.slug, e.target.checked); change(); });
    $("#mHide").addEventListener("change", (e) => { toggleIn(O.hidden, p.slug, e.target.checked); change(); });
    box.addEventListener("input", (e) => {
      const f = e.target.dataset.f, tr = e.target.closest("tr[data-id]"); if (!f || !tr) return;
      const id = tr.dataset.id, n = num(e.target.value);
      if (f === "price") n != null ? (O.prices[id] = n) : delete O.prices[id];
      if (f === "sale") n ? (O.labels.sale[id] = Math.min(90, n)) : delete O.labels.sale[id];
      change(); refreshFinal();
    });
    box.addEventListener("change", (e) => {
      if (e.target.dataset.f !== "stock") return;
      const id = e.target.closest("tr").dataset.id;
      e.target.value === "0" ? (O.stock[id] = 0) : delete O.stock[id];
      change();
    });
    const allStock = (on) => { p.variants.forEach((v) => (on ? delete O.stock[v.id] : (O.stock[v.id] = 0))); change(); editProduct(); };
    $("#allStockOn")?.addEventListener("click", () => allStock(true));
    $("#allStockOff")?.addEventListener("click", () => allStock(false));
    $("#resetModel").addEventListener("click", () => {
      p.variants.forEach((v) => { delete O.prices[v.id]; delete O.stock[v.id]; delete O.labels.sale[v.id]; });
      delete O.labels.sale[p.slug];
      [O.hidden, O.labels.hot, O.labels.newAdd, O.labels.newRemove].forEach((a) => toggleIn(a, p.slug, false));
      change(); editProduct();
    });
  }

  /* ===== ЕТИКЕТИ ===== */
  function renderLabels() {
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
    const featured = O.store.featured || [...S0.featured];
    const hero = st("heroSlug");
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box"><h2>Голямата плочка</h2><p class="muted">Моделът, показан най-отгоре на началната страница.</p>
        <p class="adm-current">Сега: <b>${esc(BY_SLUG.get(hero)?.name || hero)}</b></p>${picker("heroPick", "Смени с… (търси модел)")}
        <p class="muted small">Снимката в плочката остава Galaxy S26 Ultra, освен ако не избереш друг модел – тогава се ползва неговата снимка.</p></section>
      <section class="adm-box"><h2>Подбрани смартфони (${featured.length})</h2><p class="muted">Подредбата е както тук. Препоръчително 8.</p>
        <ol class="adm-order">${featured.map((s, i) => `<li><span>${esc(BY_SLUG.get(s)?.name || s)}</span>
          <button data-up="${i}" ${i ? "" : "disabled"} aria-label="Нагоре">↑</button><button data-down="${i}" ${i < featured.length - 1 ? "" : "disabled"} aria-label="Надолу">↓</button><button data-del="${i}" aria-label="Махни">✕</button></li>`).join("")}</ol>
        ${picker("featPick", "Добави модел…")}</section>
    </div>`;
    bindPicker("heroPick", (s) => { O.store.heroSlug = s; O.store.heroImage = s === "samsung-galaxy-s26-ultra-model-119473" ? "" : "auto"; change(); renderHome(); });
    bindPicker("featPick", (s) => { const f = [...featured]; if (!f.includes(s)) f.push(s); O.store.featured = f; change(); renderHome(); });
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
    const hours = st("hours"), social = { ...S0.social, ...(O.store.social || {}) };
    const f = (k, label, type = "text", ph = "") => `<label class="field"><span>${label}</span><input class="input" data-k="${k}" type="${type}" value="${esc(st(k) ?? "")}" placeholder="${esc(ph)}" /></label>`;
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box"><h2>Контакти</h2><div class="adm-grid">
        ${f("phone", "Телефон")}${f("email", "Имейл", "email")}${f("address", "Адрес")}${f("viber", "Viber (номер без +, по желание)", "text", "359893933338")}</div></section>
      <section class="adm-box"><h2>Работно време</h2><div class="adm-grid">
        ${hours.map((h, i) => `<label class="field"><span>${esc(h[0])}</span><input class="input" data-h="${i}" value="${esc(h[1])}" /></label>`).join("")}</div>
        <p class="muted small">Формат: „09:30 – 18:00“ или „Почивен ден“. По него сайтът показва „Отворено/Затворено сега“.</p></section>
      <section class="adm-box"><h2>Доставка и поръчки</h2><div class="adm-grid">
        ${f("deliveryOffice", "Такса до офис на куриер (€)", "number", "празно = предстои уточняване")}${f("deliveryAddress", "Такса до адрес (€)", "number", "празно = предстои уточняване")}
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
  }

  /* ===== ОТЗИВИ ===== */
  function renderReviews() {
    const R = O.reviews;
    $("#main").innerHTML = `<div class="adm-page">
      <section class="adm-box"><h2>Google профил</h2><div class="adm-grid">
        <label class="field"><span>Връзка към профила в Google Maps</span><input class="input" data-r="googleUrl" type="url" value="${esc(R.googleUrl || "")}" placeholder="https://maps.app.goo.gl/…" /></label>
        <label class="field"><span>Връзка „Остави отзив“</span><input class="input" data-r="writeUrl" type="url" value="${esc(R.writeUrl || "")}" placeholder="https://g.page/r/…/review" /></label>
        <label class="field"><span>Среден рейтинг</span><input class="input" data-r="rating" type="number" min="1" max="5" step="0.1" value="${esc(R.rating || "")}" placeholder="4.9" /></label>
        <label class="field"><span>Брой отзиви</span><input class="input" data-r="count" type="number" min="0" value="${esc(R.count || "")}" /></label></div>
        <p class="muted small">Връзката за отзив се взима от Google Business Profile → „Поискай отзиви“. Рейтингът и броят се обновяват ръчно.</p></section>
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
      if (e.target.id === "oSave") {
        const b = { status: $("#oStatus").value, note: $("#oNote").value.trim(), tracking: $("#oTrack").value.trim(), internalNote: $("#oInternal").value };
        e.target.disabled = true;
        const r = await ordersApi("POST", "?update=" + encodeURIComponent(oSel.ref), b);
        if (r.ok) { oSel = r.data.order; OL = null; toast("✓ Заявката е обновена"); renderOrders(); }
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
      <button class="btn btn--primary" id="oSave">Запази статуса</button>
      <p class="muted small">Връзка за клиента: <a href="${esc(link)}" target="_blank">${esc(link)}</a></p>
      <h3>История</h3><ol class="adm-hist">${o.history.slice().reverse().map((h) => `<li><b>${esc(S[h.status] || h.status)}</b> <span class="muted small">${fmt(h.at)}</span>${h.note ? `<br>${esc(h.note)}` : ""}</li>`).join("")}</ol>`;
  }

  /* ===== СТАТИСТИКА ===== */
  function renderAnalytics() {
    const A = O.analytics;
    const P = [
      ["", "Изключена", "", []],
      ["plausible", "Plausible", "https://plausible.io", [["domain", "Домейн (както е в Plausible)", "gdmobil.netlify.app"]]],
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
