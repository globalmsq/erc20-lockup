# ============================================
# Base stage - Common dependencies and build
# ============================================
FROM node:20-alpine AS base

# Install build dependencies
RUN apk add --no-cache python3 make g++ git wget

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Compile contracts
RUN npx hardhat compile

# ============================================
# Node stage - for hardhat-node service
# ============================================
FROM base AS node

EXPOSE 8545

CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]

# ============================================
# Deploy stage - for hardhat-deploy service
# ============================================
FROM base AS deploy

# Add curl for health checks and deployment scripts
RUN apk add --no-cache curl

# Use existing hardhat.config.ts (already copied in base stage)

CMD ["/bin/sh"]

# ============================================
# Tests stage - for integration-tests service
# ============================================
FROM base AS tests

# Add curl for health checks
RUN apk add --no-cache curl

# Replace hardhat.config.ts with integration test config
COPY docker/hardhat.config.integration.ts ./hardhat.config.ts

# Re-compile with new config
RUN npx hardhat compile

CMD ["/bin/sh"]
