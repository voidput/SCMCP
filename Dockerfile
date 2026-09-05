# Stage 1: Build the application
#
# Pinned to BUILDPLATFORM so this stage always runs natively, even when the
# target is arm64. Every dependency here is pure JavaScript, so nothing needs
# compiling per architecture and the emulator never has to run: building arm64
# under qemu took 30 minutes and hit the job timeout, against ~2 minutes native.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

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

# Drop dev dependencies in place, so the runtime stage can copy node_modules
# straight across instead of running an emulated install of its own.
RUN npm prune --omit=dev --ignore-scripts

# The copy above is only sound while every dependency is architecture
# independent. A prebuilt .node binary would be the build platform's, and would
# fail at runtime on the other architecture - so fail here instead, loudly.
RUN if find node_modules -name '*.node' -print -quit | grep -q .; then \
      echo "A dependency ships a native binary; node_modules can no longer be copied across architectures." >&2; \
      find node_modules -name '*.node' >&2; \
      exit 1; \
    fi


# Stage 2: Create the production image
FROM node:22-alpine

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# package.json ships in the image on purpose: the server reads its version from
# there for the MCP handshake and the outbound User-Agent.
COPY package.json package-lock.json ./

# Both copied from the builder, so no npm runs on the target architecture.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Drop root: this server binds no port and writes nothing inside the image.
USER node

# Exec form, and node directly rather than `npm start` - npm would sit between
# the runtime and PID 1 and swallow SIGTERM, turning every stop into a 10s kill.
CMD ["node", "dist/index.js"]
