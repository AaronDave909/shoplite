'use strict';
const { createApp } = require('./app');
const { createPool, migrate, waitForDatabase } = require('./db');
const logger = require('./logger');

async function main() {
  const db = createPool();
  db.on('error', (err) => logger.error({ err }, 'idle database client error'));
  await waitForDatabase(db, logger);
  await migrate(db);

  const port = Number(process.env.PORT || 3000);
  createApp({ db }).listen(port, () => logger.info({ port }, 'checkout-service listening'));
}

main().catch((err) => {
  logger.fatal({ err }, 'checkout-service failed to start');
  process.exit(1);
});
