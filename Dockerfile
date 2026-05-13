FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package*.json ./

FROM base AS deps
RUN npm ci

FROM deps AS test
COPY tsconfig.json jest.config.cjs ./
COPY src ./src
COPY tests ./tests
RUN npm test

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM base AS prod-deps
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

EXPOSE 3000

CMD ["node", "dist/src/index.js"]
