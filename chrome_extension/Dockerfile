FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
RUN npm ci && npm cache clean --force

COPY ./ ./

CMD npm run dev