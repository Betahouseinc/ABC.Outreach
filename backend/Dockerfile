FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data

EXPOSE 3001

CMD ["node", "--experimental-sqlite", "server.js"]
