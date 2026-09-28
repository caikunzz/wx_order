FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV PORT=80
ENV ALLOW_DEV_LOGIN=0
ENV NODE_ENV=production

EXPOSE 80

CMD ["node", "src/index.js"]
