# Stage 1: Build the app
FROM node:23-slim AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --force

# Copy the rest of the app
COPY . .

# Build the app
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:stable-alpine

# Copy the built app to Nginx's public directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy a custom Nginx config (optional but recommended)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]