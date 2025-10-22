FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy project files
COPY . .

# Compile contracts
RUN pnpm compile

# Expose Hardhat node port
EXPOSE 8545

# Run Hardhat node
CMD ["pnpm", "hardhat", "node", "--hostname", "0.0.0.0"]
