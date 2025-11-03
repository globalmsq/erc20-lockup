# SUT 토큰 락업 절차

SUT 토큰을 TokenLockup 컨트랙트에 락업하고 베스팅하는 전체 절차를 설명합니다.

---

## 목차

1. [사전 준비사항](#1-사전-준비사항)
2. [Step 1: TokenLockup 컨트랙트 배포](#step-1-tokenlockup-컨트랙트-배포)
3. [Step 2: SUT 토큰 Approve](#step-2-sut-토큰-approve)
4. [Step 3: Lockup 생성](#step-3-lockup-생성)
5. [Step 4: 토큰 해제 (수혜자)](#step-4-토큰-해제-수혜자)
6. [확인 및 검증](#확인-및-검증)
7. [트러블슈팅](#트러블슈팅)

---

## 1. 사전 준비사항

### 1.1 필요한 정보

| 항목              | Mainnet                                      | Amoy Testnet                                 |
| ----------------- | -------------------------------------------- | -------------------------------------------- |
| **SUT 토큰 주소** | `0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55` | `0xE4C687167705Abf55d709395f92e254bdF5825a2` |
| **네트워크**      | Polygon                                      | Polygon Amoy                                 |
| **Chain ID**      | 137                                          | 80002                                        |
| **Explorer**      | https://polygonscan.com                      | https://amoy.polygonscan.com                 |

### 1.2 필요한 계정 및 권한

**관리자 (Owner/Admin):**

- TokenLockup 컨트랙트 배포 권한
- SUT 토큰 보유 (락업할 수량만큼)
- 가스비용 (MATIC)

**수혜자 (Beneficiary):**

- 토큰을 받을 지갑 주소
- 가스비용 (토큰 해제 시)

### 1.3 환경 설정

`.env` 파일 설정:

```bash
# Mainnet 배포
PRIVATE_KEY=your_private_key_here
TOKEN_ADDRESS=0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55
ETHERSCAN_API_KEY=your_etherscan_api_key  # Etherscan API V2 - 60+ 체인 지원

# Amoy Testnet 배포
PRIVATE_KEY=your_private_key_here
TOKEN_ADDRESS=0xE4C687167705Abf55d709395f92e254bdF5825a2
ETHERSCAN_API_KEY=your_etherscan_api_key  # 동일한 키 사용
```

---

## Step 1: TokenLockup 컨트랙트 배포

### 1.1 Amoy 테스트넷 배포

```bash
# 환경변수 확인
cat .env | grep TOKEN_ADDRESS
# TOKEN_ADDRESS=0xE4C687167705Abf55d709395f92e254bdF5825a2

# 배포
pnpm deploy:testnet
```

**예상 출력:**

```
Deploying contracts with account: 0x...
Account balance: 1.234567 MATIC

Deploying TokenLockup...
TokenLockup deployed to: 0xABCD1234...

=== Deployment Summary ===
{
  "network": "amoy",
  "chainId": "80002",
  "deployer": "0x...",
  "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
  "tokenLockupAddress": "0xABCD1234...",
  "timestamp": "2024-..."
}

✅ Deployment completed successfully!
```

**배포된 컨트랙트 주소를 기록하세요:**

```
TokenLockup Address: 0xABCD1234...
```

### 1.2 Polygon Mainnet 배포

```bash
# 환경변수 변경
TOKEN_ADDRESS=0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55

# 배포
pnpm deploy:mainnet
```

### 1.3 컨트랙트 검증

```bash
# 환경변수 설정
export CONTRACT_ADDRESS=0xABCD1234...  # TokenLockup 주소
export TOKEN_ADDRESS=0xE4C687167705Abf55d709395f92e254bdF5825a2

# Amoy 검증
pnpm verify:testnet

# Mainnet 검증
pnpm verify:mainnet
```

---

## Step 2: SUT 토큰 Approve

TokenLockup 컨트랙트가 SUT 토큰을 전송할 수 있도록 승인해야 합니다.

> **⚠️ 중요:** Lockup 생성 전 반드시 토큰 승인(approve)이 필요합니다. 승인 없이 `createLockup()`을 호출하면 트랜잭션이 실패합니다.

### 2.1 PolygonScan에서 직접 Approve하기 (권장)

가장 간단한 방법은 PolygonScan UI를 통해 직접 approve하는 것입니다.

#### 단계별 가이드:

1. **SUT 토큰 컨트랙트로 이동**
   - Polygon Mainnet: https://polygonscan.com/address/0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55#writeContract
   - Amoy Testnet: https://amoy.polygonscan.com/address/0xE4C687167705Abf55d709395f92e254bdF5825a2#writeContract

2. **지갑 연결**
   - "Connect to Web3" 버튼 클릭
   - MetaMask 또는 다른 지갑으로 연결
   - **주의:** Owner 계정으로 연결해야 합니다

3. **approve 함수 찾기**
   - "Write Contract" 탭에서 `approve` 함수를 찾습니다
   - 일반적으로 2번째 또는 3번째 함수입니다

4. **파라미터 입력**

   ```
   spender (address): 0xABCD1234...  // TokenLockup 컨트랙트 주소 (Step 1에서 배포한 주소)
   amount (uint256): 10000000000000000000000  // 승인할 토큰 수량 (wei 단위)
   ```

   **토큰 수량 계산:**
   - 10,000 SUT = `10000000000000000000000` (10000 × 10^18)
   - 1,000 SUT = `1000000000000000000000` (1000 × 10^18)
   - 100 SUT = `100000000000000000000` (100 × 10^18)

   **팁:** 계산기 사용

   ```javascript
   // JavaScript console에서
   const amount = 10000; // SUT 수량
   const wei = (amount * 1e18).toLocaleString('fullwide', { useGrouping: false });
   console.log(wei); // PolygonScan에 입력할 값
   ```

5. **트랜잭션 실행**
   - "Write" 버튼 클릭
   - MetaMask 팝업에서 가스비 확인
   - "Confirm" 클릭하여 트랜잭션 전송
   - 트랜잭션 완료 대기 (보통 수 초 소요)

6. **승인 확인**
   - "Read Contract" 탭으로 이동
   - `allowance` 함수 찾기
   - 파라미터 입력:
     ```
     owner (address): 0xYourAddress...  // Owner 주소
     spender (address): 0xABCD1234...  // TokenLockup 주소
     ```
   - "Query" 버튼 클릭
   - 승인된 수량 확인 (예: `10000000000000000000000` = 10,000 SUT)

### 2.2 Hardhat Console 사용

```bash
# Amoy 테스트넷
npx hardhat console --network amoy

# Polygon Mainnet
npx hardhat console --network polygon
```

### 2.3 Approve 실행

```javascript
// Hardhat console에서 실행

// 1. 계정 및 컨트랙트 설정
const [owner] = await ethers.getSigners();
const sutToken = await ethers.getContractAt(
  'IERC20',
  '0xE4C687167705Abf55d709395f92e254bdF5825a2' // Amoy
  // "0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55"  // Mainnet
);

const tokenLockupAddress = '0xABCD1234...'; // Step 1에서 배포된 주소

// 2. 현재 잔액 확인
const balance = await sutToken.balanceOf(owner.address);
console.log('SUT Balance:', ethers.formatEther(balance));

// 3. Approve 실행 (예: 10,000 SUT)
const approveAmount = ethers.parseEther('10000');
const tx = await sutToken.approve(tokenLockupAddress, approveAmount);
await tx.wait();

console.log('✅ Approved:', ethers.formatEther(approveAmount), 'SUT');

// 4. Approve 확인
const allowance = await sutToken.allowance(owner.address, tokenLockupAddress);
console.log('Allowance:', ethers.formatEther(allowance));
```

### 2.4 스크립트 파일로 실행

`scripts/approve.ts` 생성:

```typescript
import { ethers } from 'hardhat';

async function main() {
  const [owner] = await ethers.getSigners();

  const sutToken = await ethers.getContractAt('IERC20', process.env.TOKEN_ADDRESS!);

  const tokenLockupAddress = process.env.LOCKUP_ADDRESS!;
  const approveAmount = ethers.parseEther('10000'); // 승인할 수량

  console.log('Approving', ethers.formatEther(approveAmount), 'SUT');

  const tx = await sutToken.approve(tokenLockupAddress, approveAmount);
  await tx.wait();

  console.log('✅ Approved successfully!');
}

main().catch(console.error);
```

실행:

```bash
LOCKUP_ADDRESS=0xABCD1234... npx hardhat run scripts/approve.ts --network amoy
```

---

## Step 3: Lockup 생성

> **⚠️ 중요 제약사항:**
>
> 한 beneficiary 주소는 **평생 단 하나의 lockup만 생성 가능**합니다.
>
> - Lockup 완료 또는 취소(revoke) 후에도 같은 주소로 재생성 **불가능**
> - `lockups[beneficiary]` 매핑 엔트리가 영구적으로 유지됨 (`totalAmount != 0`)
> - 추가 lockup이 필요한 경우:
>   - ✅ **다른 지갑 주소 사용** (권장)
>   - ✅ **새 TokenLockup 컨트랙트 배포**
> - 이 설계는 감사 추적(audit trail) 보존과 상태 무결성을 위한 것입니다
>
> **예시:**
>
> - ❌ 잘못된 방법: beneficiary `0x1234...`에게 lockup 생성 → 완료 후 같은 주소로 다시 생성 시도 → `LockupAlreadyExists` 에러
> - ✅ 올바른 방법: beneficiary `0x1234...`에게 첫 번째 lockup → 추가 lockup 필요 시 `0x5678...` (다른 주소) 사용

### 3.1 Hardhat Console 사용

```javascript
// Hardhat console에서 실행

// 1. TokenLockup 컨트랙트 연결
const tokenLockup = await ethers.getContractAt(
  'TokenLockup',
  '0xABCD1234...' // TokenLockup 주소
);

// 2. Lockup 파라미터 설정
const beneficiaryAddress = '0x1234...'; // 수혜자 주소
const lockupAmount = ethers.parseEther('10000'); // 10,000 SUT
const cliffDuration = 30 * 24 * 60 * 60; // 30일 (Cliff)
const vestingDuration = 100 * 30 * 24 * 60 * 60; // 100개월 (전체 베스팅)
const revocable = true; // 취소 가능 여부

// 3. Lockup 생성
const tx = await tokenLockup.createLockup(
  beneficiaryAddress,
  lockupAmount,
  cliffDuration,
  vestingDuration,
  revocable
);

const receipt = await tx.wait();
console.log('✅ Lockup created! Tx:', receipt.hash);

// 4. Lockup 정보 확인
const lockupInfo = await tokenLockup.lockups(beneficiaryAddress);
console.log('Lockup Info:');
console.log('  Total Amount:', ethers.formatEther(lockupInfo.totalAmount));
console.log('  Start Time:', new Date(Number(lockupInfo.startTime) * 1000));
console.log('  Cliff Duration:', lockupInfo.cliffDuration / (24 * 60 * 60), 'days');
console.log('  Vesting Duration:', lockupInfo.vestingDuration / (30 * 24 * 60 * 60), 'months');
console.log('  Revocable:', lockupInfo.revocable);
```

### 3.2 베스팅 스케줄 예시

**설정 예시:**

- 총 락업량: 10,000 SUT
- Cliff 기간: 30일
- 베스팅 기간: 100개월
- 월별 해제율: 1% (100 SUT/월)

**해제 스케줄:**

| 시점   | 경과 시간 | 해제 가능량 | 누적 해제량 |
| ------ | --------- | ----------- | ----------- |
| 0일    | 0개월     | 0 SUT       | 0 SUT       |
| 30일   | 1개월     | 100 SUT     | 100 SUT     |
| 60일   | 2개월     | 100 SUT     | 200 SUT     |
| 90일   | 3개월     | 100 SUT     | 300 SUT     |
| ...    | ...       | ...         | ...         |
| 3000일 | 100개월   | 100 SUT     | 10,000 SUT  |

---

## Step 4: 토큰 해제 (수혜자)

수혜자가 베스팅된 토큰을 해제하는 과정입니다.

### 4.1 해제 가능 금액 확인

```javascript
// 수혜자 계정으로 연결
const beneficiary = await ethers.getSigner('0x1234...'); // 수혜자 주소

const tokenLockup = await ethers.getContractAt('TokenLockup', '0xABCD1234...', beneficiary);

// 현재 해제 가능한 금액 확인
const releasable = await tokenLockup.releasableAmount(beneficiary.address);
console.log('Releasable Amount:', ethers.formatEther(releasable), 'SUT');

// 총 베스팅된 금액 확인
const vested = await tokenLockup.vestedAmount(beneficiary.address);
console.log('Total Vested:', ethers.formatEther(vested), 'SUT');

// Lockup 정보 확인
const lockupInfo = await tokenLockup.lockups(beneficiary.address);
console.log('Already Released:', ethers.formatEther(lockupInfo.releasedAmount), 'SUT');
```

### 4.2 토큰 해제 실행

```javascript
// 해제 가능한 토큰이 있는 경우
if (releasable > 0n) {
  console.log("Releasing", ethers.formatEther(releasable), "SUT...");

  const tx = await tokenLockup.release();
  const receipt = await tx.wait();

  console.log("✅ Released successfully! Tx:", receipt.hash);

  // SUT 잔액 확인
  const sutToken = await ethers.getContractAt(
    "IERC20",
    process.env.TOKEN_ADDRESS!,
    beneficiary
  );
  const balance = await sutToken.balanceOf(beneficiary.address);
  console.log("Current SUT Balance:", ethers.formatEther(balance));
} else {
  console.log("⚠️ No tokens available for release yet");
}
```

### 4.3 정기적 해제 스크립트

`scripts/release.ts`:

```typescript
import { ethers } from 'hardhat';

async function main() {
  const [beneficiary] = await ethers.getSigners();

  const tokenLockup = await ethers.getContractAt('TokenLockup', process.env.LOCKUP_ADDRESS!);

  const releasable = await tokenLockup.releasableAmount(beneficiary.address);

  if (releasable === 0n) {
    console.log('⚠️ No tokens available for release');
    return;
  }

  console.log('Releasing:', ethers.formatEther(releasable), 'SUT');

  const tx = await tokenLockup.release();
  await tx.wait();

  console.log('✅ Released successfully!');
}

main().catch(console.error);
```

실행 (Cron 등으로 정기 실행 가능):

```bash
LOCKUP_ADDRESS=0xABCD1234... npx hardhat run scripts/release.ts --network polygon
```

---

## 확인 및 검증

### 5.1 Helper Scripts로 Lockup 상태 확인

프로젝트에서 제공하는 Helper Scripts를 사용하면 Lockup 상태를 쉽게 확인하고 관리할 수 있습니다.

#### Lockup 상태 조회

```bash
export LOCKUP_ADDRESS=0xABCD1234...
export BENEFICIARY_ADDRESS=0x수혜자주소...

npx hardhat run scripts/check-lockup.ts --network polygon
```

**출력 정보:**

- 총 락업량, 해제된 양, 베스팅된 양, 해제 가능한 양
- 베스팅 진행률 (%)
- 타임라인 (시작, Cliff 종료, 베스팅 종료)
- 현재 상태 및 남은 기간

#### 베스팅 타임라인 계산

```bash
export LOCKUP_ADDRESS=0xABCD1234...
export BENEFICIARY_ADDRESS=0x수혜자주소...

npx hardhat run scripts/calculate-vested.ts --network polygon
```

**출력 정보:**

- 주요 마일스톤별 베스팅 계산 (시작, Cliff, 25%, 50%, 75%, 종료)
- 월별 베스팅 내역 (장기 베스팅의 경우)
- 현재 상태 및 진행률

#### 대화형 Lockup 생성

```bash
export LOCKUP_ADDRESS=0xABCD1234...

npx hardhat run scripts/create-lockup-helper.ts --network polygon
```

이 스크립트는 다음을 안내합니다:

- 수혜자 주소, 락업량, Cliff 기간, 베스팅 기간 입력
- 입력값 검증 및 요약 표시
- 토큰 Approve 상태 확인 및 자동 처리
- Lockup 생성 실행

### 5.2 PolygonScan 확인

**Amoy 테스트넷:**

```
https://amoy.polygonscan.com/address/0xABCD1234...
```

**Polygon Mainnet:**

```
https://polygonscan.com/address/0xABCD1234...
```

**확인 항목:**

- ✅ Contract 탭: 컨트랙트 소스 코드 검증 완료
- ✅ Transactions 탭: createLockup, release 트랜잭션
- ✅ Events 탭: TokensLocked, TokensReleased 이벤트

### 5.3 각 단계별 확인

#### Step 1 확인: 배포

```bash
# 컨트랙트 코드 확인
npx hardhat verify --network amoy 0xABCD1234... 0xE4C687167705Abf55d709395f92e254bdF5825a2
```

#### Step 2 확인: Approve

```javascript
const allowance = await sutToken.allowance(ownerAddress, tokenLockupAddress);
console.log('Approved:', ethers.formatEther(allowance));
// 출력: Approved: 10000.0
```

#### Step 3 확인: Lockup 생성

```javascript
const lockupInfo = await tokenLockup.lockups(beneficiaryAddress);
console.log('Total Amount:', ethers.formatEther(lockupInfo.totalAmount));
// 출력: Total Amount: 10000.0
```

#### Step 4 확인: 토큰 해제

```javascript
const sutBalance = await sutToken.balanceOf(beneficiaryAddress);
console.log('Beneficiary SUT Balance:', ethers.formatEther(sutBalance));
// 출력: Beneficiary SUT Balance: 100.0 (1개월 경과 후)
```

---

## 트러블슈팅

### 문제 1: "Insufficient allowance" 에러

**원인:** Approve가 안되었거나 부족함

**해결:**

```javascript
const allowance = await sutToken.allowance(owner.address, tokenLockupAddress);
console.log('Current Allowance:', ethers.formatEther(allowance));

// 재승인
await sutToken.approve(tokenLockupAddress, ethers.parseEther('10000'));
```

### 문제 2: "NoTokensAvailable" 에러

**원인:** 아직 베스팅되지 않았거나 Cliff 기간 중

**해결:**

```javascript
const lockupInfo = await tokenLockup.lockups(beneficiaryAddress);
const now = Math.floor(Date.now() / 1000);
const cliffEnd = Number(lockupInfo.startTime) + Number(lockupInfo.cliffDuration);

if (now < cliffEnd) {
  const remainingSeconds = cliffEnd - now;
  console.log('Cliff period remaining:', remainingSeconds / (24 * 60 * 60), 'days');
}
```

### 문제 3: "LockupAlreadyExists" 에러

**원인:** 해당 수혜자에 대한 락업이 이미 존재

**중요:** Lockup을 취소(revoke)하거나 완료한 후에도 같은 beneficiary 주소로는 **재생성이 불가능**합니다. `lockups` 매핑 엔트리가 영구적으로 유지되기 때문입니다.

**해결 방법:**

1. **다른 지갑 주소 사용 (권장)**

   ```javascript
   // 새로운 beneficiary 주소 사용
   const newBeneficiaryAddress = '0x새주소...';
   await tokenLockup.createLockup(
     newBeneficiaryAddress, // 다른 주소
     amount,
     cliffDuration,
     vestingDuration,
     revocable
   );
   ```

2. **새 TokenLockup 컨트랙트 배포**
   ```bash
   # 새 컨트랙트를 배포하여 같은 beneficiary 사용
   pnpm deploy:testnet  # 또는 deploy:mainnet
   ```

**❌ 작동하지 않는 방법:**

```javascript
// ❌ 이 방법은 작동하지 않습니다!
await tokenLockup.revoke(beneficiaryAddress);  // 취소해도
await tokenLockup.createLockup(beneficiaryAddress, ...);  // 재생성 불가 - LockupAlreadyExists 에러

// 이유: revoke 후에도 lockups[beneficiary].totalAmount는 0이 아니므로
// createLockup의 검증 로직에서 에러 발생
```

**확인 방법:**

```javascript
// 특정 주소에 lockup이 존재하는지 확인
const lockupInfo = await tokenLockup.lockups(beneficiaryAddress);
console.log('Total Amount:', ethers.formatEther(lockupInfo.totalAmount));
// 0이 아니면 이미 lockup이 존재함 (재생성 불가)
```

### 문제 4: 가스비 부족

**원인:** MATIC 잔액 부족

**해결:**

```javascript
// 잔액 확인
const balance = await ethers.provider.getBalance(address);
console.log('MATIC Balance:', ethers.formatEther(balance));

// 가스비 예상
const gasEstimate = await tokenLockup.release.estimateGas();
console.log('Estimated Gas:', gasEstimate.toString());
```

---

## 부록

### A. 주요 함수 요약

| 함수                 | 호출자 | 목적                |
| -------------------- | ------ | ------------------- |
| `createLockup()`     | 관리자 | 새 락업 생성        |
| `release()`          | 수혜자 | 베스팅된 토큰 해제  |
| `revoke()`           | 관리자 | 락업 취소           |
| `releasableAmount()` | 누구나 | 해제 가능 금액 조회 |
| `vestedAmount()`     | 누구나 | 총 베스팅 금액 조회 |

### B. 가스비 예상

| 작업         | 예상 가스 | 비고         |
| ------------ | --------- | ------------ |
| createLockup | ~150,000  | 첫 락업 생성 |
| release      | ~50,000   | 토큰 해제    |
| revoke       | ~80,000   | 락업 취소    |
| approve      | ~46,000   | ERC20 승인   |

### C. 베스팅 계산 공식

```solidity
// 현재까지 베스팅된 총량
vestedAmount = (totalAmount × (현재시간 - 시작시간)) / 전체베스팅기간

// 해제 가능한 양
releasableAmount = vestedAmount - 이미해제된양

// Cliff 기간 체크
if (현재시간 < 시작시간 + Cliff기간) {
    vestedAmount = 0
}
```

---

**문서 정보**

- 📄 문서명: SUT Token Lockup Procedure
- 📅 작성일: 2024
- 📌 버전: 1.0
- 🔄 업데이트: 배포 후 실제 주소로 업데이트 필요
