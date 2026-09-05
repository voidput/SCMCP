# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev dependencies for TypeScript).
# --ignore-scripts: no dependency here needs a postinstall, so running them
# would only widen the attack surface of a compromised package.
RUN npm ci --ignore-scripts

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN npm run build


# Stage 2: Create the production image
FROM node:22-alpine

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# package.json ships in the image on purpose: the server reads its version from
# there for the MCP handshake and the outbound User-Agent.
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy the built artifacts from the builder stage
COPY --from=builder /app/dist ./dist

# Drop root: this server binds no port and writes nothing inside the image.
USER node

# Exec form, and node directly rather than `npm start` — npm would sit between
# the runtime and PID 1 and swallow SIGTERM, turning every stop into a 10s kill.
CMD ["node", "dist/index.js"]
