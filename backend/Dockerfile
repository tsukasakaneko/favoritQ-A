FROM node:20-slim

WORKDIR /app

# Install deps first for better layer caching
COPY package.json ./
RUN npm install

# Source is bind-mounted in dev (see docker-compose.yml); copy for standalone builds too
COPY . .

EXPOSE 5000

CMD ["npm", "run", "dev"]
