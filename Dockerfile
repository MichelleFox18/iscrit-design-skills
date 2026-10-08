FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --fetch-timeout=30000 --fetch-retries=1
COPY --chown=node:node . .
RUN npm run build && chown -R node:node /app/.next
ENV NODE_ENV=production
ENV SEED_DEMO=false
USER node
EXPOSE 3000
CMD ["node", "scripts/hosted-start.mjs"]
