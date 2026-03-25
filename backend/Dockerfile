FROM node:22-alpine

# Install build tools for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++ linux-headers

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (need devDeps for native compilation)
RUN npm install

# Copy application files
COPY . .

# Create directory for SQLite database
RUN mkdir -p /app/database/data

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]
