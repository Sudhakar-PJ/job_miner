# Use the official Playwright image which comes with all browser dependencies
FROM mcr.microsoft.com/playwright:v1.49.1-focal

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
# This includes the 'public' folder where your frontend build lives
COPY . .

# Install Playwright browsers (Chromium only to save space)
RUN npx playwright install chromium --with-deps

# Set environment to production
ENV NODE_ENV=production
ENV PORT=5000

# Expose the port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
