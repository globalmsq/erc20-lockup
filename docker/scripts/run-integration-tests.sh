#!/bin/sh
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "${BLUE}========================================${NC}"
echo "${BLUE}  Integration Test Suite${NC}"
echo "${BLUE}========================================${NC}"

# Wait for hardhat-node to be ready
echo "${YELLOW}⏳ Waiting for hardhat-node to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if wget -q --spider http://hardhat-node:8545 2>/dev/null; then
        echo "${GREEN}✅ Hardhat node is ready!${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Attempt $RETRY_COUNT/$MAX_RETRIES..."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "${RED}❌ ERROR: Hardhat node failed to start${NC}"
    exit 1
fi

# Deploy test contracts
echo "${GREEN}========================================${NC}"
echo "${GREEN}📦 Deploying Test Contracts${NC}"
echo "${GREEN}========================================${NC}"
npx hardhat run scripts/deploy-test.ts --network integration

if [ $? -ne 0 ]; then
    echo "${RED}❌ Test contract deployment failed${NC}"
    exit 1
fi

echo ""

# Run unit tests
echo "${BLUE}========================================${NC}"
echo "${BLUE}🧪 Running Unit Tests${NC}"
echo "${BLUE}========================================${NC}"
npx hardhat test test/TokenLockup.test.ts --network integration

if [ $? -ne 0 ]; then
    echo "${RED}❌ Unit tests failed${NC}"
    exit 1
fi

echo ""

# Check if integration tests exist
if [ -d "test/integration" ] && [ "$(ls -A test/integration/*.test.ts 2>/dev/null)" ]; then
    # Run integration tests
    echo "${BLUE}========================================${NC}"
    echo "${BLUE}🔬 Running Integration Tests${NC}"
    echo "${BLUE}========================================${NC}"

    # Run each integration test file
    for test_file in test/integration/*.test.ts; do
        if [ -f "$test_file" ]; then
            echo "${YELLOW}Running: $(basename $test_file)${NC}"
            npx hardhat test "$test_file" --network integration

            if [ $? -ne 0 ]; then
                echo "${RED}❌ Integration test failed: $(basename $test_file)${NC}"
                exit 1
            fi
            echo ""
        fi
    done
else
    echo "${YELLOW}⚠️  No integration tests found in test/integration/${NC}"
fi

# Summary
echo "${GREEN}========================================${NC}"
echo "${GREEN}✅ All Tests Passed!${NC}"
echo "${GREEN}========================================${NC}"
echo "${GREEN}Unit Tests: ✅${NC}"
echo "${GREEN}Integration Tests: ✅${NC}"
echo "${GREEN}========================================${NC}"
