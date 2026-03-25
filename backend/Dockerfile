FROM node:22-alpine

# Install build tools for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application files
COPY . .

# Create directory for SQLite database
RUN mkdir -p /app/database/data

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]
