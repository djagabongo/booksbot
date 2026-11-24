/* ========== GD Mobil – логика на магазина ========== */
(() => {
  "use strict";

  const S = window.STORE;
  const P = window.PRODUCTS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const eur = (n) =>
    new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = (id) => P.find((p) => p.id === id);
  const minPrice = (p) => Math.min(...p.storage.map((s) => s.price));

  /* ---------- storage (safe) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("gdm_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("gdm_" + k, JSON.stringify(v)); } catch {} },
  };

  const state = {
    brand: "all",
    condition: "all",
    q: "",
    sort: "popular",
    maxPrice: 2200,
    cart: store.get("cart", []),
    favs: store.get("favs", []),
    compare: [],
    promo: store.get("promo", null),
    sel: {}, // избран цвят на карта: id -> index
    recent: store.get("recent", []),
  };

  /* ---------- SVG телефон ---------- */
  let uid = 0;
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (x) => Math.max(0, Math.min(255, x + amt));
    const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  const lens = (x, y, r) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#15161a" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="#24304a"/>` +
    `<circle cx="${x - r * 0.25}" cy="${y - r * 0.25}" r="${r * 0.18}" fill="rgba(255,255,255,.7)"/>`;

  function phoneSVG(p, hex) {
    const id = "g" + ++uid;
    const light = shade(hex, 28), dark = shade(hex, -38);
    const type = p.camera;
    const isPro = /Pro|Ultra/.test(p.model);
    let w = 100, h = 205, body = "", cam = "";

    if (type === "fold") {
      w = 150;
      body = `<rect x="2" y="2" width="146" height="201" rx="14" fill="url(#${id})"/>
              <line x1="75" y1="4" x2="75" y2="201" stroke="${dark}" stroke-width="1.5" opacity=".6"/>`;
      cam = `<rect x="88" y="12" width="22" height="62" rx="11" fill="${dark}" opacity=".35"/>` + lens(99, 24, 7.5) + lens(99, 43, 7.5) + lens(99, 62, 7.5);
    } else if (type === "flip") {
      body = `<rect x="2" y="2" width="96" height="201" rx="18" fill="url(#${id})"/>
              <rect x="2" y="100" width="96" height="6" fill="${dark}" opacity=".55"/>
              <rect x="8" y="8" width="84" height="86" rx="12" fill="#101114"/>`;
      cam = lens(22, 22, 8) + lens(22, 44, 8) + `<circle cx="38" cy="22" r="2.5" fill="#fff8" />`;
    } else {
      body = `<rect x="2" y="2" width="96" height="201" rx="18" fill="url(#${id})"/>`;
      if (type === "apple") {
        if (isPro) {
          cam = `<rect x="6" y="6" width="88" height="56" rx="16" fill="${dark}" opacity=".35"/>` +
                lens(24, 22, 10) + lens(24, 46, 10) + lens(46, 34, 10) + `<circle cx="76" cy="22" r="3" fill="#fff9"/>`;
        } else {
          cam = `<rect x="8" y="8" width="38" height="58" rx="15" fill="${dark}" opacity=".3"/>` + lens(27, 24, 9.5) + lens(27, 50, 9.5);
        }
        cam += `<path d="M50 120c-3 0-4-2-6-2s-3 2-6 2c-4 0-8-7-8-13 0-6 4-9 8-9 2 0 4 1 6 1s3-1 6-1c3 0 5 1 7 4-6 3-5 11 1 13-1 3-4 5-8 5zM47 95c0-3 2-5 5-6 0 3-2 6-5 6z" fill="${dark}" opacity=".45" transform="translate(6,-2) scale(.9)"/>`;
      } else if (type === "apple-air") {
        cam = `<rect x="6" y="8" width="88" height="30" rx="15" fill="${dark}" opacity=".35"/>` + lens(24, 23, 9) + `<circle cx="44" cy="23" r="2.5" fill="#fff9"/>`;
      } else if (type === "samsung") {
        cam = lens(20, 22, 9) + lens(20, 45, 9) + lens(20, 68, 9) + (isPro ? lens(40, 30, 6) : "") + `<circle cx="40" cy="50" r="2.5" fill="#fff9"/>`;
        cam += `<text x="50" y="178" text-anchor="middle" font-family="Arial" font-weight="700" font-size="9" letter-spacing="2" fill="${dark}" opacity=".5">SAMSUNG</text>`;
      } else if (type === "pixel") {
        cam = `<rect x="2" y="34" width="96" height="30" rx="15" fill="${dark}" opacity=".85"/>` + lens(22, 49, 8) + lens(42, 49, 8) + lens(62, 49, 8) + `<circle cx="80" cy="49" r="2.5" fill="#fff9"/>`;
        cam += `<text x="50" y="140" text-anchor="middle" font-family="Arial" font-weight="700" font-size="16" fill="${dark}" opacity=".4">G</text>`;
      } else if (type === "xiaomi") {
        cam = `<rect x="18" y="8" width="64" height="64" rx="22" fill="${dark}" opacity=".5"/>` + lens(37, 27, 9) + lens(63, 27, 9) + lens(37, 53, 9) + lens(63, 53, 9);
      }
    }
    return `<svg viewBox="0 0 ${w} ${h + 2}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${hex}"/><stop offset="1" stop-color="${dark}"/>
      </linearGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      ${body}${cam}
      <rect x="2" y="2" width="${w - 4}" height="201" rx="${type === "fold" ? 14 : 18}" fill="url(#${id}s)" stroke="${dark}" stroke-opacity=".5"/>
    </svg>`;
  }
  function phone(p, hex) {
    const c = p.colors.find((x) => x.hex === hex);
    const img = (c && c.image) || p.image;
    if (img) return `<div class="phone-wrap photo"><img src="${esc(img)}" alt="${esc(p.model)}${c ? " – " + esc(c.name) : ""}" loading="lazy" decoding="async"/></div>`;
    return `<div class="phone-wrap">${phoneSVG(p, hex)}</div>`;
  }

  /* ---------- икони ---------- */
  const ICONS = {
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L2 10l8-8z"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  };
  const icon = (n, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" style="width:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">${ICONS[n]}</svg>`;
  const heart = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 7 4.5c2 0 3.5 1 5 2.8 1.5-1.8 3-2.8 5-2.8 3.6 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21z"/></svg>';

  /* ---------- карта на продукт ---------- */
  function card(p) {
    const ci = state.sel[p.id] || 0;
    const color = p.colors[ci];
    const price = minPrice(p);
    const fav = state.favs.includes(p.id);
    const sale = p.oldPrice && p.oldPrice > price ? Math.round((1 - price / p.oldPrice) * 100) : 0;
    return `<article class="card" data-id="${p.id}">
      ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
      ${sale ? `<span class="badge badge--sale">-${sale}%</span>` : ""}
      <button class="card__fav ${fav ? "on" : ""}" data-fav="${p.id}" aria-label="Добави в любими">${heart}</button>
      <div class="card__media" data-open="${p.id}">${phone(p, color.hex)}</div>
      <div class="card__body">
        <span class="card__brand">${esc(p.brand)} · ${esc(p.condition)}</span>
        <h3 class="card__title" data-open="${p.id}">${esc(p.model)}</h3>
        <div class="card__meta"><span class="stars">★</span><b>${p.rating}</b><span>(${p.reviews} отзива)</span></div>
        <div class="swatches">${p.colors
          .map((c, i) => `<button class="swatch ${i === ci ? "active" : ""}" style="background:${c.hex}" data-swatch="${p.id}" data-i="${i}" title="${esc(c.name)}" aria-label="${esc(c.name)}"></button>`)
          .join("")}</div>
        <div class="card__price">
          <span class="price">${p.storage.length > 1 ? "от " : ""}${eur(price)}</span>
          ${p.oldPrice ? `<span class="old">${eur(p.oldPrice)}</span>` : ""}
        </div>
        <span class="monthly">или ${eur(Math.ceil(price / 12))}/мес. × 12, 0% оскъпяване</span>
        <div class="card__actions">
          <button class="btn btn--primary" data-quick="${p.id}">В количката</button>
          <button class="btn btn--ghost" data-open="${p.id}">Детайли</button>
        </div>
        <label class="cmp"><input type="checkbox" data-cmp="${p.id}" ${state.compare.includes(p.id) ? "checked" : ""}/> Сравни</label>
      </div>
    </article>`;
  }

  /* ---------- филтри ---------- */
  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = P.filter(
      (p) =>
        (state.brand === "all" || p.brand === state.brand) &&
        (state.condition === "all" || p.condition === state.condition) &&
        minPrice(p) <= state.maxPrice &&
        (!q || `${p.brand} ${p.model} ${Object.values(p.specs).join(" ")}`.toLowerCase().includes(q))
    );
    const s = state.sort;
    if (s === "price-asc") list.sort((a, b) => minPrice(a) - minPrice(b));
    else if (s === "price-desc") list.sort((a, b) => minPrice(b) - minPrice(a));
    else if (s === "rating") list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => b.reviews * b.rating - a.reviews * a.rating);
    return list;
  }

  function renderGrid() {
    const list = filtered();
    $("#grid").innerHTML = list.map(card).join("");
    $("#empty").hidden = list.length > 0;
    $("#resultsInfo").textContent = `${list.length} ${list.length === 1 ? "модел" : "модела"} в наличност`;
    $$(".chip", $("#brandFilters")).forEach((c) => c.classList.toggle("active", c.dataset.brand === state.brand));
  }
  function renderDeals() {
    $("#dealsRail").innerHTML = P.filter((p) => p.oldPrice).map(card).join("");
  }
  const rerenderCards = () => { renderGrid(); renderDeals(); };

  function renderFilters() {
    const brands = ["all", ...new Set(P.map((p) => p.brand))];
    $("#brandFilters").innerHTML = brands
      .map((b) => `<button class="chip" data-brand="${b}">${b === "all" ? "Всички" : b}</button>`)
      .join("");
    const max = Math.ceil(Math.max(...P.map(minPrice)) / 50) * 50;
    const r = $("#price");
    r.max = max; r.value = max; state.maxPrice = max;
    $("#priceLabel").textContent = eur(max);
  }

  /* ---------- детайли на продукт ---------- */
  function openProduct(id) {
    const p = byId(id);
    if (!p) return;
    setHash("#p/" + id);
    state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 8);
    store.set("recent", state.recent);
    renderRecent();
    let ci = state.sel[id] || 0, si = 0;
    const draw = () => {
      const st = p.storage[si], c = p.colors[ci];
      $("#modalBox").innerHTML = `
        <button class="icon-btn modal__close" data-close aria-label="Затвори"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <div class="pd">
          <div class="pd__media">${phone(p, c.hex)}</div>
          <div class="pd__info">
            <span class="card__brand">${esc(p.brand)} · ${esc(p.condition)}</span>
            <h2>${esc(p.model)}</h2>
            <div class="card__meta"><span class="stars">★★★★★</span><b>${p.rating}</b><span>(${p.reviews} отзива)</span></div>
            <p class="muted" style="margin:0">${esc(p.description)}</p>
            <div>
              <div class="opt-label">Цвят: <b>${esc(c.name)}</b></div>
              <div class="swatches" style="margin-top:8px">${p.colors.map((x, i) => `<button class="swatch ${i === ci ? "active" : ""}" style="background:${x.hex}" data-mc="${i}" aria-label="${esc(x.name)}"></button>`).join("")}</div>
            </div>
            <div>
              <div class="opt-label">Памет</div>
              <div class="opts" style="margin-top:8px">${p.storage.map((x, i) => `<button class="opt ${i === si ? "active" : ""}" data-ms="${i}">${x.size}</button>`).join("")}</div>
            </div>
            <div class="card__price"><span class="price" style="font-size:2rem">${eur(st.price)}</span>${p.oldPrice && si === 0 ? `<span class="old">${eur(p.oldPrice)}</span>` : ""}</div>
            <span class="monthly">или ${eur(Math.ceil(st.price / 12))}/мес. × 12 месеца</span>
            <div style="display:flex;gap:10px">
              <button class="btn btn--primary" style="flex:1" data-add>Добави в количката</button>
              <button class="icon-btn" data-fav="${p.id}" style="width:50px;height:50px" aria-label="Любими">${heart}</button>
              <button class="icon-btn" data-share style="width:50px;height:50px" aria-label="Сподели" title="Сподели"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg></button>
            </div>
            <div class="perks"><span>🚚 Доставка до 24 ч</span><span>🔍 Преглед преди плащане</span><span>🛡️ Гаранция ${p.condition === "Нов" ? "24" : "12"} мес.</span><span>↩️ 14 дни за връщане</span></div>
            <table class="specs">${Object.entries(p.specs).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
          </div>
        </div>`;
      const favBtn = $(".pd [data-fav]");
      if (state.favs.includes(p.id)) favBtn.querySelector("svg").style.fill = "var(--accent)";
    };
    draw();
    $("#modalBox").onclick = (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.dataset.mc) { ci = +t.dataset.mc; draw(); }
      else if (t.dataset.ms) { si = +t.dataset.ms; draw(); }
      else if ("add" in t.dataset) { addToCart(p.id, si, ci); closeModal(); openDrawer("cartDrawer"); }
      else if (t.dataset.fav) { toggleFav(p.id); draw(); }
      else if ("share" in t.dataset) share(p);
    };
    openModal();
  }

  function share(p) {
    const url = location.href.split("#")[0] + "#p/" + p.id;
    const text = `${p.model} – от ${eur(minPrice(p))} в ${S.name}`;
    if (navigator.share) navigator.share({ title: p.model, text, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast("🔗 Линкът е копиран"), () => toast(url));
  }
  function setHash(h) {
    try { history.replaceState(null, "", h || location.pathname + location.search); } catch {}
  }
  function routeFromHash() {
    const m = location.hash.match(/^#p\/([\w-]+)/);
    if (m && byId(m[1])) openProduct(m[1]);
  }

  /* ---------- последно разгледани ---------- */
  function renderRecent() {
    const list = state.recent.map(byId).filter(Boolean);
    $("#recent").hidden = list.length === 0;
    $("#recentRail").innerHTML = list
      .map((p) => `<button class="mini" data-open="${p.id}">
        <span class="mini__img">${phone(p, p.colors[state.sel[p.id] || 0].hex)}</span>
        <span><b>${esc(p.model)}</b><small>от ${eur(minPrice(p))}</small></span></button>`)
      .join("");
  }

  /* ---------- изпращане на поръчки/запитвания ---------- */
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
  const mailtoLink = (subject, text) =>
    `mailto:${S.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  /* ---------- количка ---------- */
  const saveCart = () => { store.set("cart", state.cart); renderCart(); };
  function addToCart(id, si = 0, ci = 0) {
    const key = `${id}|${si}|${ci}`;
    const line = state.cart.find((l) => l.key === key);
    if (line) line.qty++;
    else state.cart.push({ key, id, si, ci, qty: 1 });
    saveCart();
    const p = byId(id);
    toast(`✓ ${p.model} е добавен в количката`);
    bump("#cartBtn");
  }
  const lineTotal = (l) => byId(l.id).storage[l.si].price * l.qty;
  function totals() {
    const sub = state.cart.reduce((s, l) => s + lineTotal(l), 0);
    const disc = state.promo ? Math.round(sub * state.promo.pct) / 100 : 0;
    const ship = sub === 0 || sub - disc >= S.freeShippingFrom ? 0 : S.shippingPrice;
    return { sub, disc, ship, total: sub - disc + ship };
  }
  function renderCart() {
    const n = state.cart.reduce((s, l) => s + l.qty, 0);
    const cc = $("#cartCount");
    cc.textContent = n; cc.dataset.zero = n === 0;
    const t = totals();
    const left = Math.max(0, S.freeShippingFrom - (t.sub - t.disc));
    $("#shipProgress").innerHTML = n
      ? `${left > 0 ? `Още <b>${eur(left)}</b> до безплатна доставка` : "🎉 Имате безплатна доставка!"}<div class="bar"><i style="width:${Math.min(100, ((t.sub - t.disc) / S.freeShippingFrom) * 100)}%"></i></div>`
      : "";
    $("#shipProgress").hidden = !n;
    if (!n) {
      $("#cartItems").innerHTML = `<div class="drawer__empty"><div class="big">🛒</div><p>Количката е празна.</p><a href="#shop" class="btn btn--primary" data-close>Пазарувай</a></div>`;
      $("#cartFoot").innerHTML = "";
      return;
    }
    $("#cartItems").innerHTML = state.cart
      .map((l) => {
        const p = byId(l.id);
        return `<div class="line">
          <div class="line__img">${phone(p, p.colors[l.ci].hex)}</div>
          <div><div class="line__name">${esc(p.model)}</div><div class="line__var">${p.storage[l.si].size} · ${esc(p.colors[l.ci].name)}</div>
            <div class="qty"><button data-dec="${l.key}" aria-label="Намали">−</button><span>${l.qty}</span><button data-inc="${l.key}" aria-label="Увеличи">+</button></div></div>
          <div class="line__right"><b>${eur(lineTotal(l))}</b><button class="link-btn" data-rm="${l.key}">Премахни</button></div>
        </div>`;
      })
      .join("");
    $("#cartFoot").innerHTML = `
      <form class="promo" id="promoForm"><input class="input" id="promoInput" placeholder="Промо код (опитай GD10)" value="${state.promo ? state.promo.code : ""}"/><button class="btn btn--ghost btn--sm">Приложи</button></form>
      <div class="row"><span class="muted">Междинна сума</span><span>${eur(t.sub)}</span></div>
      ${t.disc ? `<div class="row" style="color:var(--success)"><span>Отстъпка (${state.promo.code})</span><span>−${eur(t.disc)}</span></div>` : ""}
      <div class="row"><span class="muted">Доставка</span><span>${t.ship ? eur(t.ship) : "Безплатна"}</span></div>
      <div class="row row--total"><span>Общо</span><span>${eur(t.total)}</span></div>
      <button class="btn btn--primary btn--block" id="checkoutBtn">Към поръчка →</button>`;
  }
  const PROMOS = { GD10: 10, WELCOME5: 5 };

  /* ---------- поръчка ---------- */
  function openCheckout() {
    closeDrawers();
    const t = totals();
    $("#modalBox").innerHTML = `
      <button class="icon-btn modal__close" data-close aria-label="Затвори"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <form class="checkout" id="checkoutForm">
        <h2>Финализиране на поръчката</h2>
        <fieldset><legend>1. Данни за контакт</legend>
          <div class="two"><input class="input" name="name" required placeholder="Име и фамилия" autocomplete="name"/><input class="input" name="phone" required type="tel" pattern="[0-9+ ]{8,}" placeholder="Телефон" autocomplete="tel"/></div>
          <input class="input" name="email" type="email" placeholder="Имейл (по желание)" autocomplete="email"/>
        </fieldset>
        <fieldset><legend>2. Доставка</legend>
          <div class="radio-cards">
            <label class="radio-card"><input type="radio" name="ship" value="Офис на Еконт" checked/><b>Офис на Еконт</b><small>1–2 работни дни</small></label>
            <label class="radio-card"><input type="radio" name="ship" value="Офис на Speedy"/><b>Офис на Speedy</b><small>1–2 работни дни</small></label>
            <label class="radio-card"><input type="radio" name="ship" value="До адрес"/><b>До адрес</b><small>Куриер до врата</small></label>
          </div>
          <div class="two"><input class="input" name="city" required placeholder="Град" autocomplete="address-level2"/><input class="input" name="addr" required placeholder="Адрес или офис" autocomplete="street-address"/></div>
        </fieldset>
        <fieldset><legend>3. Плащане</legend>
          <div class="radio-cards">
            <label class="radio-card"><input type="radio" name="pay" value="Наложен платеж" checked/><b>Наложен платеж</b><small>С преглед и тест</small></label>
            <label class="radio-card"><input type="radio" name="pay" value="Карта"/><b>Карта</b><small>Visa / Mastercard</small></label>
            <label class="radio-card"><input type="radio" name="pay" value="Изплащане"/><b>На изплащане</b><small>от ${eur(Math.ceil(t.total / 12))}/мес.</small></label>
          </div>
        </fieldset>
        <div class="summary">
          <div class="row"><span class="muted">Продукти (${state.cart.reduce((s, l) => s + l.qty, 0)})</span><span>${eur(t.sub)}</span></div>
          ${t.disc ? `<div class="row" style="color:var(--success)"><span>Отстъпка</span><span>−${eur(t.disc)}</span></div>` : ""}
          <div class="row"><span class="muted">Доставка</span><span>${t.ship ? eur(t.ship) : "Безплатна"}</span></div>
          <div class="row row--total"><span>Общо за плащане</span><span>${eur(t.total)}</span></div>
        </div>
        <label class="cmp"><input type="checkbox" required/> Съгласен/на съм с общите условия и политиката за поверителност</label>
        <button class="btn btn--primary btn--block" type="submit">Потвърди поръчката · ${eur(t.total)}</button>
      </form>`;
    $("#modalBox").onclick = null;
    $("#checkoutForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const num = "GD" + Date.now().toString().slice(-6);
      const lines = state.cart.map((l) => {
        const p = byId(l.id);
        return `• ${p.model} ${p.storage[l.si].size}, ${p.colors[l.ci].name} × ${l.qty} = ${eur(lineTotal(l))}`;
      });
      const text = [
        `Поръчка № ${num}`, "", ...lines, "",
        `Междинна сума: ${eur(t.sub)}`, t.disc ? `Отстъпка (${state.promo.code}): −${eur(t.disc)}` : false,
        `Доставка: ${t.ship ? eur(t.ship) : "безплатна"}`, `ОБЩО: ${eur(t.total)}`, "",
        `Клиент: ${fd.name}`, `Телефон: ${fd.phone}`, fd.email ? `Имейл: ${fd.email}` : false,
        `Доставка: ${fd.ship} – ${fd.city}, ${fd.addr}`, `Плащане: ${fd.pay}`,
      ].filter((x) => x !== false).join("\n");
      const btn = e.target.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "Изпращане…";
      const sent = await sendToStore(`Нова поръчка ${num} – ${eur(t.total)}`, text, { order: num, name: fd.name, phone: fd.phone, email: fd.email || "" });
      const orders = store.get("orders", []);
      orders.push({ num, date: new Date().toISOString(), customer: fd, items: state.cart, total: t.total });
      store.set("orders", orders);
      state.cart = []; state.promo = null; store.set("promo", null); saveCart();
      $("#modalBox").innerHTML = `<button class="icon-btn modal__close" data-close aria-label="Затвори"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <div class="success"><div class="check">✓</div><h2>Благодарим, ${esc(fd.name.split(" ")[0])}!</h2>
        ${sent
          ? `<p class="muted">Поръчка <b>№ ${num}</b> е приета. Ще се свържем с вас на <b>${esc(fd.phone)}</b> за потвърждение.<br/>Доставка: ${esc(fd.ship)} · Плащане: ${esc(fd.pay)}</p>
             <button class="btn btn--primary" data-close>Продължи пазаруването</button>`
          : `<p class="muted">Поръчка <b>№ ${num}</b> е готова. Остава една стъпка – изпратете я, за да я получим:</p>
             <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
               <a class="btn btn--primary" href="${mailtoLink("Поръчка " + num, text)}">✉️ Изпрати поръчката</a>
               <a class="btn btn--ghost" href="tel:${S.phone.replace(/\s/g, "")}">📞 Обади се</a>
             </div>
             <p class="muted" style="font-size:.85rem;margin-top:16px">Или ни се обадете на ${esc(S.phone)} и кажете номера на поръчката.</p>`}
        </div>`;
    });
    openModal();
  }

  /* ---------- любими ---------- */
  function toggleFav(id) {
    const i = state.favs.indexOf(id);
    if (i > -1) state.favs.splice(i, 1);
    else { state.favs.push(id); toast("♥ Добавено в любими"); bump("#favBtn"); }
    store.set("favs", state.favs);
    renderFavs(); rerenderCards();
  }
  function renderFavs() {
    const n = state.favs.length, fc = $("#favCount");
    fc.textContent = n; fc.dataset.zero = n === 0;
    $("#favItems").innerHTML = n
      ? state.favs.map(byId).filter(Boolean).map((p) => `<div class="line">
          <div class="line__img">${phone(p, p.colors[0].hex)}</div>
          <div><div class="line__name">${esc(p.model)}</div><div class="line__var">от ${eur(minPrice(p))}</div></div>
          <div class="line__right"><button class="btn btn--primary btn--sm" data-quick="${p.id}">Купи</button><br/><button class="link-btn" data-fav="${p.id}">Премахни</button></div>
        </div>`).join("")
      : `<div class="drawer__empty"><div class="big">♡</div><p>Още нямате любими телефони.</p></div>`;
  }

  /* ---------- сравнение ---------- */
  function toggleCompare(id, on) {
    if (on && state.compare.length >= 3) { toast("Може да сравнявате до 3 модела"); rerenderCards(); return; }
    state.compare = on ? [...new Set([...state.compare, id])] : state.compare.filter((x) => x !== id);
    renderCompareBar(); rerenderCards();
  }
  function renderCompareBar() {
    $("#compareBar").hidden = state.compare.length === 0;
    $("#compareItems").innerHTML = state.compare.map((id) => `<span>${esc(byId(id).model)}</span>`).join("");
    $("#compareOpen").disabled = state.compare.length < 2;
  }
  function openCompare() {
    const items = state.compare.map(byId);
    const keys = [...new Set(items.flatMap((p) => Object.keys(p.specs)))];
    $("#modalBox").innerHTML = `<button class="icon-btn modal__close" data-close aria-label="Затвори"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <div class="cmp-table"><h2>Сравнение</h2><table>
        <tr><th></th>${items.map((p) => `<td>${phone(p, p.colors[0].hex)}<b>${esc(p.model)}</b></td>`).join("")}</tr>
        <tr><th>Цена от</th>${items.map((p) => `<td><b>${eur(minPrice(p))}</b></td>`).join("")}</tr>
        <tr><th>Рейтинг</th>${items.map((p) => `<td>★ ${p.rating}</td>`).join("")}</tr>
        <tr><th>Памет</th>${items.map((p) => `<td>${p.storage.map((s) => s.size).join(" / ")}</td>`).join("")}</tr>
        <tr><th>Цветове</th>${items.map((p) => `<td>${p.colors.length}</td>`).join("")}</tr>
        ${keys.map((k) => `<tr><th>${esc(k)}</th>${items.map((p) => `<td>${esc(p.specs[k] || "—")}</td>`).join("")}</tr>`).join("")}
        <tr><th></th>${items.map((p) => `<td><button class="btn btn--primary btn--sm" data-cq="${p.id}">В количката</button></td>`).join("")}</tr>
      </table></div>`;
    $("#modalBox").onclick = (e) => { const b = e.target.closest("[data-cq]"); if (b) addToCart(b.dataset.cq); };
    openModal();
  }

  /* ---------- модал/drawer помощни ---------- */
  let lastFocus = null;
  function openModal() {
    lastFocus = document.activeElement;
    const m = $("#modal");
    m.classList.add("open"); m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    $("#modalBox").scrollTop = 0;
    setTimeout(() => $(".modal__close", m)?.focus(), 50);
  }
  function closeModal() {
    const m = $("#modal");
    m.classList.remove("open"); m.setAttribute("aria-hidden", "true");
    if (location.hash.startsWith("#p/")) setHash("");
    if (!$(".drawer.open")) document.body.style.overflow = "";
    lastFocus?.focus?.();
  }
  function openDrawer(id) {
    closeDrawers(true);
    $("#" + id).classList.add("open"); $("#" + id).setAttribute("aria-hidden", "false");
    $("#overlay").hidden = false; document.body.style.overflow = "hidden";
  }
  function closeDrawers(keepOverlay) {
    $$(".drawer").forEach((d) => { d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); });
    if (!keepOverlay) { $("#overlay").hidden = true; if (!$("#modal.open")) document.body.style.overflow = ""; }
  }

  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function bump(sel) { const b = $(sel); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }

  /* ---------- статични секции ---------- */
  function renderStatic() {
    $("[data-free-ship]").textContent = eur(S.freeShippingFrom);
    $("[data-tagline]").textContent = S.tagline + ". Нови и рефърбиш смартфони с гаранция.";
    $("#year").textContent = new Date().getFullYear();
    $("#servicesGrid").innerHTML = window.SERVICES.map(
      (s) => `<div class="service reveal"><div class="service__icon">${icon(s.icon)}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`
    ).join("");
    $("#faqList").innerHTML = window.FAQ.map((f, i) => `<details ${i === 0 ? "open" : ""}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");
    const tel = S.phone.replace(/\s/g, "");
    $("#contactList").innerHTML = `
      <li><span class="ic">${icon("phone")}</span><div><small>Телефон</small><a href="tel:${tel}"><b>${esc(S.phone)}</b></a></div></li>
      <li><span class="ic">${icon("mail")}</span><div><small>Имейл</small><a href="mailto:${esc(S.email)}"><b>${esc(S.email)}</b></a></div></li>
      <li><span class="ic">${icon("pin")}</span><div><small>Магазин</small><b>${esc(S.address)}</b></div></li>
      <li><span class="ic">${icon("clock")}</span><div><small>Работно време</small><b>${esc(S.hours)}</b></div></li>`;
    $("#socials").innerHTML = `<a href="${S.social.facebook}" aria-label="Facebook">f</a><a href="${S.social.instagram}" aria-label="Instagram">ig</a><a href="${S.social.tiktok}" aria-label="TikTok">tt</a>`;

    // плаващ бутон за контакт
    $("#fab").innerHTML = `
      <a href="viber://chat?number=%2B${S.viber}" class="fab__btn fab__viber" aria-label="Пиши ни във Viber" title="Viber"><svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 3 4.6 3 10.5c0 3.2 1.1 5.4 3 6.7V21l3.2-2.6c.9.1 1.8.2 2.8.2 5.5 0 9-2.6 9-8.1S17.5 2 12 2z"/><path d="M9 7.5c.4-.4 1-.4 1.3.1l.7 1.1c.2.4.1.8-.2 1.1l-.4.3c.4 1 1.2 1.8 2.2 2.3l.3-.4c.3-.3.8-.4 1.1-.2l1.1.7c.5.3.5.9.1 1.3l-.5.5c-.6.6-1.6.7-2.4.2C10.6 13.4 9.4 12.2 8.5 10.6c-.5-.8-.4-1.8.2-2.4z" fill="currentColor"/></svg></a>
      <a href="tel:${tel}" class="fab__btn fab__call" aria-label="Обади се" title="Обади се">${icon("phone")}</a>`;

    // структурирани данни за Google
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "MobilePhoneStore", name: S.name, telephone: S.phone, email: S.email, address: S.address, openingHours: S.hours },
        ...P.map((p) => ({
          "@type": "Product", name: p.model, brand: { "@type": "Brand", name: p.brand }, description: p.description,
          aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews },
          offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: minPrice(p), highPrice: Math.max(...p.storage.map((s) => s.price)), availability: "https://schema.org/InStock",
            itemCondition: p.condition === "Нов" ? "https://schema.org/NewCondition" : "https://schema.org/RefurbishedCondition" },
        })),
      ],
    });
    document.head.appendChild(ld);

    // hero
    const a = byId("iphone-17-pro-max"), b = byId("galaxy-s26-ultra");
    $("#heroVisual").innerHTML = `
      <div class="phone-wrap p1">${phoneSVG(b, b.colors[2].hex)}</div>
      <div class="phone-wrap p2">${phoneSVG(a, a.colors[0].hex)}</div>
      <div class="tag t1">⚡ Доставка утре<small>при поръчка до 16:00</small></div>
      <div class="tag t2">💳 0% изплащане<small>от ${eur(Math.ceil(minPrice(a) / 12))}/мес.</small></div>`;
  }

  function tradeIn() {
    const v = Math.round(+$("#tiModel").value * +$("#tiCond").value);
    $("#tiValue").textContent = eur(v);
  }

  function countdown() {
    const now = new Date(), end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const d = Math.max(0, end - now);
    const h = Math.floor(d / 36e5), m = Math.floor((d % 36e5) / 6e4), s = Math.floor((d % 6e4) / 1e3);
    const pad = (x) => String(x).padStart(2, "0");
    $("#countdown").innerHTML = `<div><b>${pad(h)}</b><span>часа</span></div><div><b>${pad(m)}</b><span>мин</span></div><div><b>${pad(s)}</b><span>сек</span></div>`;
  }

  function reveal() {
    if (!("IntersectionObserver" in window)) { $$(".reveal").forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
    $$(".reveal").forEach((el) => io.observe(el));
  }

  /* ---------- тема ---------- */
  function initTheme() {
    const t = store.get("theme", null);
    if (t) document.documentElement.dataset.theme = t;
    $("#themeToggle").addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      store.set("theme", next);
    });
  }

  /* ---------- събития ---------- */
  function bind() {
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-open],[data-quick],[data-fav],[data-swatch],[data-inc],[data-dec],[data-rm],[data-close],[data-brand],#checkoutBtn");
      if (!t) return;
      const d = t.dataset;
      if (t.id === "checkoutBtn") return openCheckout();
      if (d.close !== undefined) { closeModal(); closeDrawers(); return; }
      if (t.closest("#modalBox") && (d.fav || d.mc || d.ms)) return; // обработва се в модала
      if (d.swatch) { state.sel[d.swatch] = +d.i; rerenderCards(); return; }
      if (d.open) return openProduct(d.open);
      if (d.quick) {
        const p = byId(d.quick);
        if (p.storage.length > 1 || p.colors.length > 1) return openProduct(p.id);
        return addToCart(p.id);
      }
      if (d.fav) return toggleFav(d.fav);
      if (d.brand) {
        state.brand = d.brand; renderGrid();
        if (t.classList.contains("brand-chip")) $("#shop").scrollIntoView();
        return;
      }
      const findL = (k) => state.cart.find((l) => l.key === k);
      if (d.inc) { findL(d.inc).qty++; saveCart(); }
      if (d.dec) { const l = findL(d.dec); if (--l.qty <= 0) state.cart = state.cart.filter((x) => x !== l); saveCart(); }
      if (d.rm) { state.cart = state.cart.filter((x) => x.key !== d.rm); saveCart(); }
    });

    document.addEventListener("change", (e) => { if (e.target.dataset.cmp) toggleCompare(e.target.dataset.cmp, e.target.checked); });
    document.addEventListener("submit", (e) => {
      if (e.target.id !== "promoForm") return;
      e.preventDefault();
      const code = $("#promoInput").value.trim().toUpperCase();
      if (PROMOS[code]) { state.promo = { code, pct: PROMOS[code] }; store.set("promo", state.promo); toast(`Промо код ${code}: −${PROMOS[code]}%`); }
      else { state.promo = null; store.set("promo", null); toast("Невалиден промо код"); }
      renderCart();
    });

    $("#search").addEventListener("input", (e) => { state.q = e.target.value; renderGrid(); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
    $("#condition").addEventListener("change", (e) => { state.condition = e.target.value; renderGrid(); });
    $("#price").addEventListener("input", (e) => { state.maxPrice = +e.target.value; $("#priceLabel").textContent = eur(state.maxPrice); renderGrid(); });
    $("#resetFilters").addEventListener("click", () => {
      Object.assign(state, { brand: "all", condition: "all", q: "", sort: "popular" });
      $("#search").value = ""; $("#sort").value = "popular"; $("#condition").value = "all";
      renderFilters(); renderGrid();
    });

    $("#cartBtn").addEventListener("click", () => openDrawer("cartDrawer"));
    $("#favBtn").addEventListener("click", () => openDrawer("favDrawer"));
    $("#overlay").addEventListener("click", () => closeDrawers());
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeDrawers(); } });

    $("#compareOpen").addEventListener("click", openCompare);
    $("#compareClear").addEventListener("click", () => { state.compare = []; renderCompareBar(); rerenderCards(); });

    $("#burger").addEventListener("click", () => $("#nav").classList.toggle("open"));
    $$("#nav a").forEach((a) => a.addEventListener("click", () => $("#nav").classList.remove("open")));
    addEventListener("scroll", () => $("#header").classList.toggle("scrolled", scrollY > 10), { passive: true });

    $("#tiModel").addEventListener("change", tradeIn);
    $("#tiCond").addEventListener("change", tradeIn);
    $("#contactForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const text = `Запитване от ${fd.name}\nТелефон: ${fd.phone}\n\n${fd.msg || ""}`;
      if (await sendToStore("Запитване от сайта", text, fd)) toast("✓ Благодарим! Ще се свържем с вас скоро.");
      else location.href = mailtoLink("Запитване от сайта", text);
      e.target.reset();
    });
  }

  /* ---------- старт ---------- */
  initTheme();
  renderStatic();
  renderFilters();
  rerenderCards();
  renderCart();
  renderFavs();
  renderCompareBar();
  tradeIn();
  countdown(); setInterval(countdown, 1000);
  renderRecent();
  bind();
  reveal();
  routeFromHash();
  addEventListener("hashchange", routeFromHash);
})();
