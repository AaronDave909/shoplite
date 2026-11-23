# Build from the repo root so the shared package-lock.json pins every dependency:
#   docker build -f services/inventory/Dockerfile .
# The code is copied to /app/services/inventory, the same path as in the repo, so Datadog
# Source Code Integration maps stack frames to services/inventory/src/... on GitHub.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/storefront/package.json services/storefront/
COPY services/checkout/package.json services/checkout/
COPY services/promo/package.json services/promo/
COPY services/inventory/package.json services/inventory/
RUN npm ci --omit=dev --workspace services/inventory --include-workspace-root=false && npm cache clean --force
COPY services/inventory services/inventory
WORKDIR /app/services/inventory
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["node", "--require", "dd-trace/init", "src/server.js"]
