'use strict';
// Steady background traffic through the storefront so Datadog has a healthy baseline.
// Usage: npm run traffic -- [storefrontUrl] [errorRatePercent]
// errorRatePercent of orders use LEGACY_VIP (the cascading promo bug).
const base = process.argv[2] || 'http://localhost:3000';
const errorRate = Number(process.argv[3] ?? 0);
const codes = ['', '', 'SAVE10', 'WELCOME5'];
const products = ['mug', 'hoodie', 'stickers'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function once() {
  const broken = Math.random() * 100 < errorRate;
  const body = {
    items: [{ productId: pick(products), quantity: 1 + Math.floor(Math.random() * 3) }],
    promoCode: broken ? 'LEGACY_VIP' : pick(codes),
  };
  try {
    await fetch(`${base}/api/products`);
    const res = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    process.stdout.write(res.status >= 500 ? 'x' : res.status >= 400 ? '-' : '.');
  } catch {
    process.stdout.write('?');
  }
}

console.log(`Sending traffic to ${base} (LEGACY_VIP rate ${errorRate}%). . = ok, - = 4xx, x = 5xx. Ctrl+C to stop.`);
setInterval(once, 500);
