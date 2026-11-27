// GDMobil – цени за доставка с Еконт и Спиди.
// • Еконт: изчисление на живо през публичната услуга на Еконт (LabelService, mode „calculate“) – публичната им тарифа.
// • Спиди: публичната тарифа „Стандарт 24 часа“ от https://services.speedy.bg/priceList/ (крайни цени с ДДС и такса гориво).
//   API на Спиди изисква клиентски договор, затова тарифата е тук и се обновява ръчно.

export const SPEEDY = {
  updated: "27.11.2026",
  // [до кг, основна цена офис/автомат → офис/автомат, добавка за доставка до адрес]
  rows: [[3, 2.69, 2.59], [6, 3.74, 4.27], [10, 4.62, 4.27], [20, 8.23, 5.99]],
  over20: { base: 8.23, perKg: 0.36, addr: 8.52, max: 31.5 },
  // промоция: от офис до автомат на Спиди до 3 кг – 1,52 € (с всички такси и ДДС), до 01.01.2027 г.
  aptPromo: { price: 1.52, maxKg: 3, until: "2027-01-01" },
  cod: { pct: 2.4, min: 0.61 }, // наложен платеж: 2,4% от сумата, мин. 0,61 €
};

const r2 = (n) => Math.round(n * 100) / 100;

export function speedyQuote({ dest = "office", weight = 0.5, cod = 0, today = new Date().toISOString().slice(0, 10) }) {
  const w = Math.max(0.1, Number(weight) || 0.5);
  if (w > SPEEDY.over20.max) throw new Error("too_heavy");
  let base, addr;
  const row = SPEEDY.rows.find((r) => w <= r[0]);
  if (row) [, base, addr] = row;
  else { base = SPEEDY.over20.base + Math.ceil(w - 20) * SPEEDY.over20.perKg; addr = SPEEDY.over20.addr; }
  let ship = base, note = "";
  if (dest === "address") ship = base + addr;
  if (dest === "apt" && w <= SPEEDY.aptPromo.maxKg && today < SPEEDY.aptPromo.until) { ship = SPEEDY.aptPromo.price; note = "промоционална цена до автомат"; }
  const codFee = cod > 0 ? Math.max(SPEEDY.cod.min, (cod * SPEEDY.cod.pct) / 100) : 0;
  return { courier: "speedy", dest, weight: w, ship: r2(ship), codFee: r2(codFee), total: r2(ship + codFee), note, source: `тарифа на Спиди от ${SPEEDY.updated}` };
}

const ECONT_URL = "https://ee.econt.com/services/Shipments/LabelService.createLabel.json";

/** Еконт – публична тарифа. dest: office (вкл. Еконтомат) | address. office: код на офиса; city: населено място за адрес. */
export async function econtQuote({ dest = "office", office = "", city = "", weight = 0.5, cod = 0, sender = "2900" }) {
  const w = Math.max(0.1, Number(weight) || 0.5);
  const label = {
    senderOfficeCode: sender || "2900", packCount: 1, shipmentType: "PACK", weight: w,
    senderClient: { name: "GDMobil", phones: ["0893933338"] }, receiverClient: { name: "Клиент", phones: ["0888000000"] },
    paymentReceiverMethod: "cash",
  };
  if (dest === "address") label.receiverAddress = { city: { country: { code3: "BGR" }, name: String(city || "София").slice(0, 60) }, other: "адрес" };
  else label.receiverOfficeCode = String(office || "1000").replace(/\D/g, "").slice(0, 8) || "1000";
  if (cod > 0) label.services = { cdAmount: r2(cod), cdType: "get", cdCurrency: "EUR" };
  const res = await fetch(ECONT_URL, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ label, mode: "calculate" }), signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("econt_" + res.status);
  const l = (await res.json()).label || {};
  const svc = Array.isArray(l.services) ? l.services : [];
  const codFee = svc.filter((s) => s.type === "CD").reduce((a, s) => a + (Number(s.price) || 0), 0);
  const ship = svc.filter((s) => s.type !== "CD").reduce((a, s) => a + (Number(s.price) || 0), 0) || Number(l.totalPrice) - codFee;
  if (!(ship > 0) || (l.currency && l.currency !== "EUR")) throw new Error("econt_bad");
  return { courier: "econt", dest, weight: w, ship: r2(ship), codFee: r2(codFee), total: r2(ship + codFee), note: "", source: "публична тарифа на Еконт" };
}
