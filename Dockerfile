FROM node:22-slim

WORKDIR /app

COPY package*.json ./

RUN npm config delete proxy 2>/dev/null || true && \
    npm config delete https-proxy 2>/dev/null || true && \
    npm config set registry https://registry.npmjs.org/ && \
    npm config set proxy "" && \
    npm config set https-proxy "" && \
    npm install --omit=dev --no-optional

COPY . .

RUN mv env.example .env 2>/dev/null || true

EXPOSE 8000

CMD ["node", "server.mjs"]
