# syntax=docker/dockerfile:1.7
# MSP Rolling Mill API — Node 22, built with tsup, run as a non-root user.
#
#   docker build -t msp-rollingmill-api backend/
#   docker run -p 4000:4000 --env-file backend/.env -v erp-cache:/app/data msp-rollingmill-api
#
# The ERP sync needs Oracle Instant Client (thick mode). It is installed here by default;
# build with --build-arg ORACLE_CLIENT=false for an image that only serves the API (run the
# sync elsewhere and share the data volume).

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG ORACLE_CLIENT=true
ARG ORACLE_CLIENT_URL=https://download.oracle.com/otn_software/linux/instantclient/instantclient-basiclite-linuxx64.zip
RUN if [ "$ORACLE_CLIENT" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends libaio1 curl unzip ca-certificates && \
      mkdir -p /opt/oracle && curl -fsSL "$ORACLE_CLIENT_URL" -o /tmp/ic.zip && \
      unzip -q /tmp/ic.zip -d /opt/oracle && rm /tmp/ic.zip && \
      ln -s /opt/oracle/instantclient_* /opt/oracle/instantclient && \
      apt-get purge -y curl unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*; \
    fi
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    ERP_CACHE_DIR=data \
    ERP_ORACLE_CLIENT_DIR=/opt/oracle/instantclient
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
