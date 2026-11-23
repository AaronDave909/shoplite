'use strict';
// `npm run dev`: the whole ShopLite stack in one process with in-memory Postgres.
// No Docker and no Datadog; good for working on the UI or the services' logic.
// The chaos buttons work; "Kill promo-service" closes its port for 8s instead of exiting.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
const { startLocalStack } = require('./lib/local-stack');

const basePort = Number(process.env.PORT || 3000);
startLocalStack({ basePort, chaos: true, onCrash: (s) => console.log(`${s} crashed (simulated), back in 8s`) })
  .then(({ urls }) => {
    console.log('ShopLite running locally (in-memory databases, no Datadog):');
    for (const [name, url] of Object.entries(urls)) console.log(`  ${name.padEnd(10)} ${url}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
