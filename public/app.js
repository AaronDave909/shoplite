const out = document.getElementById('out');
const list = document.getElementById('products');

const money = (c) => `$${(c / 100).toFixed(2)}`;

async function load() {
  const products = await (await fetch('/api/products')).json();
  list.innerHTML = products.map((p) => `
    <li><span>${p.name} — ${money(p.priceCents)}</span>
    <input type="number" min="0" value="1" data-id="${p.id}" aria-label="Quantity of ${p.name}" /></li>`).join('');
}

function cartItems() {
  return [...list.querySelectorAll('input')]
    .map((i) => ({ productId: i.dataset.id, quantity: Number(i.value) }))
    .filter((i) => i.quantity > 0);
}

async function checkout(promoCode) {
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: cartItems(), promoCode }),
  });
  return { status: res.status, body: await res.json() };
}

const show = (r) => { out.textContent = `HTTP ${r.status}\n${JSON.stringify(r.body, null, 2)}`; };

document.getElementById('checkout').onclick = async () => show(await checkout(document.getElementById('promo').value.trim()));
document.getElementById('break').onclick = async () => show(await checkout('BLACKFRIDAY'));
document.getElementById('burst').onclick = async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => checkout('BLACKFRIDAY')));
  const fails = results.filter((r) => r.status >= 500).length;
  out.textContent = `Sent 20 checkouts with BLACKFRIDAY: ${fails} returned 5xx.`;
};

load();
