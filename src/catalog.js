'use strict';

const PRODUCTS = [
  { id: 'mug', name: 'Observability Mug', priceCents: 1800 },
  { id: 'hoodie', name: 'On-Call Hoodie', priceCents: 5500 },
  { id: 'stickers', name: 'Sticker Pack', priceCents: 600 },
];

function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

module.exports = { PRODUCTS, getProduct };
