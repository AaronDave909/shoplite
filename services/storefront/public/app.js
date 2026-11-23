const $ = (id) => document.getElementById(id);
const money = (c) => `$${(c / 100).toFixed(2)}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const time = () => new Date().toLocaleTimeString();

// ---------- activity log ----------
let logEmpty = true;
function log(title, detail, kind = 'info') {
  if (logEmpty) { $('log').innerHTML = ''; logEmpty = false; }
  const li = document.createElement('li');
  li.className = kind;
  li.innerHTML = `<div><strong>${esc(title)}</strong> <span class="muted small">${time()}</span></div>` +
    (detail ? `<pre>${esc(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))}</pre>` : '');
  $('log').prepend(li);
}
$('clear').onclick = () => { $('log').innerHTML = '<li class="muted">Nothing yet.</li>'; logEmpty = true; };

async function call(method, url, body) {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})), ms: Math.round(performance.now() - started) };
  } catch (err) {
    return { status: 0, body: { error: err.message }, ms: Math.round(performance.now() - started) };
  }
}
const kindOf = (s) => (s >= 500 || s === 0 ? 'bad' : s >= 400 ? 'warn' : 'ok');

// ---------- live service status ----------
const lastState = {};
const downSince = {};
function renderStatus({ services }) {
  $('status').innerHTML = services.map((s) => `
    <li class="pill ${s.state}" title="${esc(s.detail || '')}">
      <span class="dot" aria-hidden="true"></span>
      <span class="name">${esc(s.service)}</span>
      <span class="state">${s.state}${s.state === 'up' && s.latencyMs ? ` · ${s.latencyMs} ms` : ''}</span>
    </li>`).join('');

  for (const s of services) {
    const prev = lastState[s.service];
    if (prev && prev !== s.state) {
      if (s.state !== 'up') downSince[s.service] = Date.now();
      if (s.state === 'up' && downSince[s.service]) {
        const secs = Math.round((Date.now() - downSince[s.service]) / 1000);
        $('restarts').textContent = `${s.service} came back at ${time()} after ~${secs}s ${prev}.`;
        log(`${s.service} is back up`, `It was ${prev} for about ${secs}s.`, 'ok');
        delete downSince[s.service];
      } else {
        log(`${s.service} is ${s.state}`, s.detail, s.state === 'down' ? 'bad' : 'warn');
      }
    }
    lastState[s.service] = s.state;
  }
}
async function pollStatus() {
  const r = await call('GET', '/api/status');
  if (r.status === 200) {
    renderStatus(r.body);
    $('status-at').textContent = `updated ${time()}`;
  } else {
    $('status-at').textContent = 'storefront-service unreachable';
  }
}
pollStatus();
setInterval(pollStatus, 2000);

// ---------- shop ----------
async function loadProducts() {
  const r = await call('GET', '/api/products');
  if (r.status !== 200) {
    $('products').innerHTML = `<li class="muted">Catalog unavailable: ${esc(r.body.error || r.status)}. Retrying…</li>`;
    setTimeout(loadProducts, 3000);
    return;
  }
  $('products').innerHTML = r.body.map((p) => `
    <li><span>${esc(p.name)} — ${money(p.priceCents)} <span class="muted small">(${p.stock} in stock)</span></span>
    <input type="number" min="0" value="1" data-id="${esc(p.id)}" aria-label="Quantity of ${esc(p.name)}" /></li>`).join('');
}
loadProducts();

const cartItems = () => [...$('products').querySelectorAll('input')]
  .map((i) => ({ productId: i.dataset.id, quantity: Number(i.value) }))
  .filter((i) => i.quantity > 0);

$('checkout').onclick = async () => {
  const promoCode = $('promo').value.trim();
  const r = await call('POST', '/api/checkout', { items: cartItems(), promoCode });
  log(`Order: HTTP ${r.status} in ${r.ms} ms`, r.body, kindOf(r.status));
  if (r.status === 201) loadProducts();
};

$('probe').onclick = async () => {
  const r = await call('POST', '/api/checkout', { items: [{ productId: 'stickers', quantity: 1 }] });
  log(`Probe order: HTTP ${r.status} in ${r.ms} ms`, r.status === 201 ? `order #${r.body.orderNumber}` : r.body, kindOf(r.status));
};

// ---------- chaos panel ----------
const chaosLabels = {
  'promo-null-error': 'Cascading promo null error',
  'promo-crash': 'Kill promo-service',
  'inventory-db-bug': 'Inventory DB query crash',
  'orders-db-lock': 'Orders DB lock & pool exhaustion',
};

document.querySelectorAll('[data-chaos]').forEach((btn) => {
  btn.onclick = async () => {
    const name = btn.dataset.chaos;
    const repeat = Number(btn.dataset.repeat || 1);
    const body = name === 'orders-db-lock'
      ? { connections: Number($('lock-conns').value), holdSeconds: Number($('lock-hold').value) }
      : {};
    btn.disabled = true;
    try {
      if (repeat > 1) {
        const results = await Promise.all(Array.from({ length: repeat }, () => call('POST', `/api/chaos/${name}`, body)));
        const counts = results.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
        const failed = results.filter((r) => r.status >= 500).length;
        log(`${chaosLabels[name]} ×${repeat}: ${failed} returned 5xx`, counts, failed ? 'bad' : 'ok');
      } else {
        const r = await call('POST', `/api/chaos/${name}`, body);
        log(`${chaosLabels[name]}: HTTP ${r.status} in ${r.ms} ms`, r.body, r.status === 202 ? 'warn' : kindOf(r.status));
        if (name === 'orders-db-lock' && r.status === 202) setTimeout(() => $('probe').click(), 500);
      }
    } finally {
      btn.disabled = false;
    }
  };
});
