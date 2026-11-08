# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# The schema package image is the ONLY thing that may run `prisma migrate
# deploy` against the shared database. Services never run migrations.
#
# In docker-compose this image is used as a one-shot "migrate" service that
# runs, applies any pending migrations, and exits before the app services boot.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim AS build
WORKDIR /app
# Prisma's query engine links against OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY schema-package/package.json ./
RUN npm install

COPY schema-package/tsconfig.json schema-package/schema.prisma ./
COPY schema-package/migrations ./migrations
COPY schema-package/src ./src
COPY schema-package/scripts ./scripts
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/schema.prisma ./schema.prisma
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/dist ./dist

CMD ["npx", "prisma", "migrate", "deploy", "--schema=./schema.prisma"]
