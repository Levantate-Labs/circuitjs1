# Grading service (grader/server.mjs). Build context: the ts/ folder.
# Copyright (C) 2026 Levantate Labs. GNU GPL, version 2 or later.
#
# The Playwright image ships the browser builds for its own version, so the
# tag must match the exact playwright-core version in package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
USER pwuser
EXPOSE 8090
CMD ["node", "grader/server.mjs"]
