# Build from the repo root so the shared package-lock.json pins every dependency:
#   docker build -f services/promo/Dockerfile .
# The code is copied to /app/services/promo, the same path as in the repo, so Datadog
# Source Code Integration maps stack frames to services/promo/src/... on GitHub.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/storefront/package.json services/storefront/
COPY services/checkout/package.json services/checkout/
COPY services/promo/package.json services/promo/
COPY services/inventory/package.json services/inventory/
RUN npm ci --omit=dev --workspace services/promo --include-workspace-root=false && npm cache clean --force
COPY services/promo services/promo
WORKDIR /app/services/promo
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["node", "--require", "dd-trace/init", "src/server.js"]
