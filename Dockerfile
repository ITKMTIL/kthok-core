FROM node:22-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS migrate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM deps AS build
COPY . .
RUN pnpm build \
  && CI=true pnpm prune --prod --ignore-scripts \
  && rm -rf node_modules/.pnpm/prisma@* \
    node_modules/.pnpm/@prisma+engines@* \
    node_modules/.pnpm/typescript@* \
    node_modules/.pnpm/effect@* \
    node_modules/.pnpm/fast-check@* \
    node_modules/.pnpm/@types+* \
  && find node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/runtime \
    -name '*wasm*' -delete \
  && find node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client \
    -name '*.wasm' -delete

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/main"]
