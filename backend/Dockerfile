FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Create directory for SQLite database
RUN mkdir -p /app/database/data

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]
