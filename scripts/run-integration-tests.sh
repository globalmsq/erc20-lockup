#!/usr/bin/env bash
set -e

# Start hardhat-node in background
echo "Starting Hardhat node..."
docker compose up -d hardhat-node

# Wait for hardhat-node to be ready
echo "Waiting for Hardhat node..."
MAX_RETRIES=30
RETRY_COUNT=0
while ! curl -s http://localhost:8545 > /dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "Error: Hardhat node failed to start"
    docker compose down -v
    exit 1
  fi
  sleep 1
done

echo "Hardhat node ready!"

# Deploy contracts and wait for completion (rebuild to pick up script changes)
echo "Deploying contracts..."
docker compose up --build hardhat-deploy

# Run integration tests locally
echo "Running integration tests..."
pnpm test:integration

# Capture exit code
EXIT_CODE=$?

# Cleanup
echo "Cleaning up Docker resources..."
docker compose down -v

# Return the test exit code
exit $EXIT_CODE
