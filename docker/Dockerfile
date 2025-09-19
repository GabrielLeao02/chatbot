# syntax=docker/dockerfile:1
FROM node:14-bullseye

ENV TZ=America/Sao_Paulo \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gconf-service libasound2 libatk1.0-0 libatk-bridge2.0-0 libc6 libcairo2 \
        libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
        libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
        libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
        libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
        libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates \
        fonts-liberation libappindicator1 libnss3 libnss3-dev lsb-release \
        xdg-utils wget libgbm-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./
RUN if [ ! -f package.json ]; then \
        echo >&2 "ERROR: package.json not found in the Docker build context. Ensure the build context points to the project root."; \
        exit 1; \
    fi \
    && npm ci --only=production

COPY . .

RUN mkdir -p cache/wwebjs_auth cachew/webjs_cache

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8081
ENTRYPOINT ["entrypoint.sh"]
CMD ["01"]
