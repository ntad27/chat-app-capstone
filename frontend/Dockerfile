FROM node:20-slim

WORKDIR /app

RUN addgroup --system app && adduser --system --group app

COPY package*.json .
RUN npm install

COPY . .

USER app

# Dev server — for production, use multi-stage build with nginx
CMD ["npm", "run", "dev", "--", "--host"]
