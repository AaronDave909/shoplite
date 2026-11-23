'use strict';
const { createApp } = require('./app');
const logger = require('./logger');

const port = Number(process.env.PORT || 3000);
createApp().listen(port, () => {
  logger.info({ port }, `ShopLite listening on http://localhost:${port}`);
});
