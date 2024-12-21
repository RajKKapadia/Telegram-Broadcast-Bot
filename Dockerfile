# Use Node.js 20 as the base image
FROM node:21-slim

# Install build dependencies, SQLite, and pnpm
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript code
RUN pnpm run build

# Create directory for SQLite database
RUN mkdir -p /usr/src/app/data && \
    chmod 777 /usr/src/app/data

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/usr/src/app/data/telegram_users.sqlite3

# Command to run the bot
CMD ["pnpm", "start"]
