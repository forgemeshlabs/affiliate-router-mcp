FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js registry.json affiliate-cache.js telemetry.js README.md glama.json ./
COPY adapters ./adapters

USER node

CMD ["node", "index.js"]
