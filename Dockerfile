FROM oven/bun:1.3.9 AS bun-runtime
FROM node:22-bookworm-slim AS build
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG SITE_URL=https://tld.henhau.online
ENV SITE_URL=$SITE_URL
ARG GOOGLE_SITE_VERIFICATION
ENV GOOGLE_SITE_VERIFICATION=$GOOGLE_SITE_VERIFICATION
RUN bun run build:host

FROM node:22-bookworm-slim AS runtime
ARG SITE_URL=https://tld.henhau.online
ENV SITE_URL=$SITE_URL
ARG GOOGLE_SITE_VERIFICATION
ENV GOOGLE_SITE_VERIFICATION=$GOOGLE_SITE_VERIFICATION
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NODE_ENV=production PORT=3000 API_PORT=3001 WEB_PORT=3002 TLD_DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY --from=build /app/lib ./lib
COPY --from=build /app/data ./data
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["bun", "run", "start:host"]
