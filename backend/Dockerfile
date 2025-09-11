FROM node:18-alpine

WORKDIR /app

# Create logs directory
RUN mkdir -p logs uploads

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "
    const http = require('http');
    const options = {
      host: 'localhost',
      port: 3001,
      path: '/health',
      timeout: 2000,
    };
    const request = http.request(options, (res) => {
      if (res.statusCode == 200) process.exit(0);
      else process.exit(1);
    });
    request.on('error', () => process.exit(1));
    request.end();
  "

CMD ["npm", "start"]