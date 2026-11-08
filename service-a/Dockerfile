# syntax=docker/dockerfile:1

# A demo microservice. It consumes @myorg/db-schema and NEVER runs migrations.

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=development
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 1) Build the shared schema package first (single source of truth).
COPY schema-package/package.json ./schema-package/
RUN cd schema-package && npm install
COPY schema-package/tsconfig.json schema-package/schema.prisma ./schema-package/
COPY schema-package/migrations ./schema-package/migrations
COPY schema-package/src ./schema-package/src
RUN cd schema-package && npm run build

# 2) Install and build this service (generates its client from the shared schema).
COPY service-a/package.json ./service-a/
RUN cd service-a && npm install
COPY service-a/tsconfig.json ./service-a/
COPY service-a/src ./service-a/src
RUN cd service-a && npm run build

WORKDIR /app/service-a
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
