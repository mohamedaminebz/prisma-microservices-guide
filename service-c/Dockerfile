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
COPY service-c/package.json ./service-c/
RUN cd service-c && npm install
COPY service-c/tsconfig.json ./service-c/
COPY service-c/src ./service-c/src
RUN cd service-c && npm run build

WORKDIR /app/service-c
ENV NODE_ENV=production
EXPOSE 3003
CMD ["node", "dist/index.js"]
