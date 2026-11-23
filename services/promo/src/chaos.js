'use strict';
// Chaos: crash this process on purpose so you can watch Docker restart the container and
// Datadog record the restart, while storefront-service and inventory-service stay up.
const logger = require('./logger');

const MB = 1024 * 1024;

/**
 * Allocates memory in 64 MB chunks (filled, so it is really resident) until `targetMb`,
 * then exits with status 1. With the container's mem_limit below `targetMb`, the kernel
 * OOM-kills the container first (exit 137, OOMKilled=true); otherwise the exit(1) fires.
 */
function exhaustMemoryAndExit({ targetMb = 768, exit = process.exit } = {}) {
  const hog = [];
  logger.fatal({ targetMb }, 'chaos: promo-service allocating memory and exiting');
  const step = () => {
    hog.push(Buffer.alloc(64 * MB, 1));
    const allocatedMb = hog.length * 64;
    if (allocatedMb >= targetMb) {
      logger.fatal({ allocatedMb }, 'chaos: promo-service out of memory, exiting with status 1');
      exit(1);
      return;
    }
    setImmediate(step);
  };
  setImmediate(step);
}

module.exports = { exhaustMemoryAndExit };
