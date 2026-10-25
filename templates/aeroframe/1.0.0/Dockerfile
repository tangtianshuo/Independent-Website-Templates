FROM node:22-slim AS build
WORKDIR /app
COPY storefront/package.json storefront/package-lock.json ./
RUN npm ci --no-audit --no-fund --registry=https://registry.npmjs.org
COPY storefront/ ./
RUN npm run build
COPY assets/hero.png .output/public/assets/hero.png

FROM node:22-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
