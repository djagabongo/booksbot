/* ==========================================================
   GDMobil – настройки на магазина
   Каталогът (продукти, цени, снимки) е в assets/catalog.js и се генерира
   с tools/build_catalog.py. Тук са контактите, услугите и текстовете.
   ========================================================== */

window.STORE = {
  name: "GDMobil",
  tagline: "Магазин и сервиз за мобилни устройства в Гоце Делчев.",
  phone: "0893 933 338",
  phoneIntl: "+359893933338",
  email: "office@gdmobil.bg",
  address: "ул. „Солун“ 21, Гоце Делчев",
  postcode: "2900",
  company: "ИН-ТЕЛ ЕООД",
  eik: "101560088",
  vat: "BG101560088",
  hours: [
    ["Пон. – Пет.", "09:30 – 18:00"],
    ["Събота", "10:00 – 14:00"],
    ["Неделя", "Почивен ден"],
  ],
  social: {
    facebook: "https://www.facebook.com/110226218023637/",
    instagram: "https://www.instagram.com/gdmobil_gsm/",
    messenger: "https://m.me/110226218023637", // чат във Facebook Messenger
    tiktok: "", // напр. "https://www.tiktok.com/@gdmobil" – празно = не се показва
  },
  maps: "https://www.google.com/maps/search/?api=1&query=GDMobil+%D0%A1%D0%BE%D0%BB%D1%83%D0%BD+21+%D0%93%D0%BE%D1%86%D0%B5+%D0%94%D0%B5%D0%BB%D1%87%D0%B5%D0%B2",
  viber: "", // напр. "359893933338" – ако е празно, бутонът за Viber не се показва
  aiChat: true, // AI асистент в чата (нужен е ключ ANTHROPIC_API_KEY в Netlify); без ключ работи вграденият асистент
  siteUrl: "https://gdmobil.netlify.app", // основен адрес на сайта (за Google и споделяне)
  // Потвърждение на собствеността (само кода от content="…"): Google Search Console → „HTML маркер“,
  // Meta Business Suite → Brand safety → Domains → „Meta-tag verification“. Важи след ново публикуване.
  googleVerify: "",
  metaVerify: "",

  /* Къде да се изпращат поръчките и запитванията.
     Празно = клиентът изпраща готов имейл до office@gdmobil.bg.
     За автоматично получаване: безплатна форма във formspree.io → поставете адреса тук. */
  orderEndpoint: "",

  /* Такси за доставка в евро. null = „Предстои уточняване“ (както на сегашния сайт). */
  deliveryOffice: null,
  deliveryAddress: null,

  /* Основният модел в началото и подбраните смартфони (slug от каталога). */
  heroSlug: "samsung-galaxy-s26-ultra-model-119473",
  heroImage: "assets/img/galaxys26.webp",
  featured: [
    "samsung-galaxy-s26-ultra-model-119473",
    "apple-iphone-18-pro-model-136292",
    "apple-iphone-17-pro-model-103615",
    "samsung-galaxy-s26-model-119515",
    "apple-iphone-18-pro-max-model-136316",
    "samsung-galaxy-z-fold-8-ultra-model-131082",
    "google-pixel-11-pro-model-133234",
    "xiaomi-17t-pro-model-125157",
  ],
};

window.CATEGORIES = [
  { key: "phones", name: "Телефони", sub: "Смартфони", img: "assets/img/iphone.png" },
  { key: "accessories", name: "Аксесоари", sub: "Слушалки, калъфи и зарядни", img: "assets/img/airpods.png" },
  { key: "tablets", name: "Таблети", sub: "За работа и забавление", img: "assets/img/ipad.png" },
];

window.REPAIRS = [
  { icon: "screen", title: "Смяна на дисплей", text: "Счупен екран, липсваща картина или неработещ допир.", price: "30 – 550 €" },
  { icon: "battery", title: "Смяна на батерия", text: "Когато зарядът пада бързо или устройството се изключва.", price: "30 – 129 €" },
  { icon: "plug", title: "Букса за зареждане", text: "Проверка при прекъсващо зареждане или проблем с конектора.", price: "15 – 90 €" },
  { icon: "back", title: "Заден капак и стъкло", text: "Подмяна при пукнатини или счупване на задната част.", price: "15 – 150 €" },
  { icon: "camera", title: "Камера, говорител и микрофон", text: "Проблеми със снимките, звука или разговорите.", price: "15 – 280 €" },
  { icon: "buttons", title: "Бутони и лентови кабели", text: "За неработещи бутони и свързващи компоненти.", price: "15 – 60 €" },
  { icon: "software", title: "Софтуерни услуги", text: "Обновяване, преинсталация или помощ с прехвърляне на данни.", price: "20 – 80 €" },
  { icon: "chip", title: "Ремонт на платка", text: "Сложни повреди и устройства, които не се включват.", price: "След диагностика" },
];

window.REPAIR_STEPS = [
  { title: "Опиши проблема", text: "Посочи точния модел, кога се появява проблемът и дали устройството е било изпускано или мокрено." },
  { title: "Уточняваме цената и срока", text: "След преглед ще получиш конкретна оферта. Потвърждаваш я преди ремонта." },
  { title: "Предай устройството", text: "Ще уточним как да го предадеш. Ако имаш достъп до него, направи резервно копие на важните си данни." },
];

window.SERVICE_FAQ = [
  { q: "Какво да подготвя?", a: "Направи резервно копие, ако е възможно. Пази паролите, PIN кодовете и личните файлове извън запитването." },
  { q: "Колко време отнема ремонтът?", a: "Срокът зависи от диагностиката, наличността на части и сложността на ремонта." },
  { q: "Да изпратя ли устройството по куриер?", a: "Първо се свържи с нас, за да уточним приемането на устройството." },
];

/* ==========================================================
   Етикети върху продуктите
   ========================================================== */
window.LABELS = {
  /* „Ново“ – телефони и таблети, чието име съдържа някой от тези текстове. */
  new: [
    "iPhone 18", "iPhone Duo", "iPhone 17e", "Galaxy S26", "Z Fold 8", "Z Flip 8", "Galaxy A57", "Galaxy A37", "Galaxy A17",
    "Pixel 11", "Xiaomi 18", "Xiaomi 17T", "Redmi Note 17", "Redmi 17", "Poco F9", "Honor 600", "Magic 8",
    "Razr 70", "Razr Fold", "Phone 4a", "Find X9s", "(2026)", "Tab S12", "Tab S11",
  ],

  /* „Хит“ – най-търсените модели (slug от адреса на продукта, напр. #/p/<slug>). */
  hot: [
    "samsung-galaxy-s26-ultra-model-119473",
    "apple-iphone-18-pro-model-136292",
    "apple-iphone-17-pro-model-103615",
    "samsung-galaxy-s26-model-119515",
  ],

  /* Намаления в проценти. Ключът е slug (за всички варианти на модела)
     или артикулен номер (за един вариант). Цената се намалява автоматично,
     старата се показва зачеркната, а продуктът получава етикет „-10%“.
     Пример:  "apple-iphone-17-pro-model-103615": 10,   "103624": 5,  */
  sale: {
  },
};
