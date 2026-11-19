FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ARG DD_GIT_COMMIT_SHA
ENV DD_GIT_COMMIT_SHA=$DD_GIT_COMMIT_SHA
EXPOSE 3000
CMD ["node", "--require", "dd-trace/init", "src/server.js"]
