'use strict';
// Generates steady background traffic so Datadog has a healthy baseline to compare
// against. Usage: npm run traffic -- [baseUrl] [errorRatePercent]
const base = process.argv[2] || 'http://localhost:3000';
const errorRate = Number(process.argv[3] ?? 0);
const codes = ['', 'SAVE10', 'WELCOME5'];
const products = ['mug', 'hoodie', 'stickers'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function once() {
  const broken = Math.random() * 100 < errorRate;
  const body = {
    items: [{ productId: pick(products), quantity: 1 + Math.floor(Math.random() * 3) }],
    promoCode: broken ? 'BLACKFRIDAY' : pick(codes),
  };
  try {
    await fetch(`${base}/api/products`);
    const res = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    process.stdout.write(res.status >= 500 ? 'x' : '.');
  } catch {
    process.stdout.write('?');
  }
}

console.log(`Sending traffic to ${base} (error rate ${errorRate}%). Ctrl+C to stop.`);
setInterval(once, 500);
