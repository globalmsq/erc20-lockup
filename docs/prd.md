# SUT 토큰 락업 컨트랙트 PRD

**Product Requirements Document**

---

## 목차
1. [프로젝트 개요](#1-프로젝트-개요)
2. [핵심 기능](#2-핵심-기능)
3. [보안 기능](#3-보안-기능)
4. [기술 사양](#4-기술-사양)
5. [배포 전략](#5-배포-전략)
6. [제약사항](#6-제약사항)
7. [부록](#부록)

---

## 1. 프로젝트 개요

### 1.1 목적
SUT 토큰에 대한 Lockup(잠금) 메커니즘을 구현하여, 설정된 기간 동안 토큰을 안전하게 보관하고 점진적으로 해제하는 스마트 컨트랙트 개발

### 1.2 핵심 가치
- **보안성**: ReentrancyGuard, SafeERC20, Emergency Pause를 통한 다층 보안
- **투명성**: 모든 거래 온체인 기록 및 이벤트 로깅
- **신뢰성**: 예측 가능한 선형 베스팅 스케줄
- **유연성**: Revocable Lockup, Partial Release 지원
- **효율성**: 가스비 최적화 및 Proxy Pattern을 통한 업그레이드 가능

---

## 2. 핵심 기능

### 2.1 베스팅 메커니즘

#### Time-based Linear Vesting
| 항목 | 내용 |
|------|------|
| **유형** | Time-based Linear Vesting |
| **해제 비율** | 월 1% |
| **전체 기간** | 100개월 (약 8.3년) |
| **계산 방식** | 선형 분배 (경과 시간 비례) |
| **Cliff 기간** | 설정 가능 (선택사항) |

#### 베스팅 공식
```solidity
vestedAmount = (totalAmount × timeFromStart) / vestingDuration

// 예시: 100개월 후
// vestedAmount = (1000 토큰 × 100개월) / 100개월 = 1000 토큰 (100%)
```

#### Cliff Period
- Cliff 기간 동안은 토큰 해제 불가
- Cliff 이후부터 선형 베스팅 시작
- 예: Cliff 30일 → 30일 후부터 베스팅 시작

### 2.2 토큰 인출 방식

#### Pull Payment Pattern (Claim 방식)
```solidity
function release() external nonReentrant
```

**특징:**
- 수혜자(Beneficiary)가 직접 해제된 토큰을 요청
- 가스비 효율성 (필요시에만 실행)
- 재진입 공격 방지
- 수혜자의 자율적 관리

**프로세스:**
1. 수혜자가 `release()` 호출
2. 컨트랙트가 현재 해제 가능한 토큰 계산
3. 해제 가능한 토큰이 있으면 전송
4. `TokensReleased` 이벤트 발생

### 2.3 Revocable Lockup

#### 기본 정보
| 항목 | 내용 |
|------|------|
| **실행 권한** | Owner/Admin만 가능 |
| **취소 시 처리** | 미해제 토큰은 관리자에게 반환 |
| **이미 해제된 토큰** | 영향 없음 (수혜자 보유) |

#### 함수 명세
```solidity
function revoke(address beneficiary) external onlyOwner
```

#### 취소 가능 조건
- 긴급 보안 이슈 발생
- 계약 조건 위반
- 프로젝트 정책 변경
- 규제 요구사항

**주의사항:**
- 취소 후 수혜자는 더 이상 토큰 해제 불가
- 이미 해제된 토큰은 회수 불가

### 2.4 Partial Release

#### 기능 설명
특별한 상황에서 관리자가 일부 토큰을 조기 해제할 수 있는 기능

#### 제한사항
| 항목 | 제한 |
|------|------|
| **권한** | Admin/Owner만 가능 |
| **최대 비율** | 전체 물량의 10% 이하 권장 |
| **기록** | 모든 내역 이벤트 로깅 필수 |

#### 사용 케이스
- 마일스톤 달성 보상
- 긴급 자금 필요
- 특별 인센티브

---

## 3. 보안 기능

### 3.1 ReentrancyGuard

#### 구현
```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TokenLockup is ReentrancyGuard {
    function release() external nonReentrant { }
    function revoke(address beneficiary) external onlyOwner nonReentrant { }
}
```

#### 적용 대상
- `release()` - 토큰 해제
- `revoke()` - 락업 취소
- `partialRelease()` - 부분 해제
- 모든 토큰 전송 관련 함수

### 3.2 SafeERC20

#### 목적
비표준 ERC20 토큰 호환성 및 안전한 전송 보장

```solidity
using SafeERC20 for IERC20;

token.safeTransfer(beneficiary, amount);
token.safeTransferFrom(msg.sender, address(this), amount);
```

### 3.3 Emergency Pause

#### 기능 명세
| 구분 | 설명 |
|------|------|
| **목적** | 비상 상황 시 모든 토큰 거래 중지 |
| **권한** | Owner/Admin만 실행 가능 |
| **영향 범위** | release(), partialRelease() 등 토큰 이동 함수 |
| **해제 방법** | unpause() 함수 호출 |

#### 구현
```solidity
import "@openzeppelin/contracts/utils/Pausable.sol";

function pause() external onlyOwner {
    _pause();
}

function unpause() external onlyOwner {
    _unpause();
}

function release() external whenNotPaused nonReentrant { }
```

#### 사용 시나리오
- 치명적 버그 발견
- 해킹 시도 감지
- 컨트랙트 업그레이드 준비
- 비정상 거래 패턴 발견

### 3.4 Timestamp 보안

#### 문제점
- `block.timestamp`는 마이너가 일정 범위 내에서 조작 가능
- 짧은 시간 단위에서 취약

#### 해결책
```solidity
// 안전 마진 설정
uint256 constant SAFETY_MARGIN = 1 hours;
uint256 constant MONTH_DURATION = 30 days;

// 월 단위 계산으로 영향 최소화
uint256 elapsedMonths = (block.timestamp - startTime) / MONTH_DURATION;
```

**보안 원칙:**
- 최소 1시간 안전 마진 설정
- 정확한 시간보다 기간 단위 계산
- 월 단위 계산으로 조작 영향 최소화

---

## 4. 기술 사양

### 4.1 개발 환경

| 구분 | 사양 |
|------|------|
| **Solidity Version** | 0.8.24 |
| **Framework** | Hardhat |
| **Language** | TypeScript |
| **Network** | Polygon (Mainnet, Amoy Testnet) |
| **Node Version** | 20.x LTS |
| **Package Manager** | pnpm |

### 4.2 Dependencies

```json
{
  "dependencies": {
    "@openzeppelin/contracts": "^5.0.0",
    "@openzeppelin/contracts-upgradeable": "^5.0.0"
  }
}
```

### 4.3 아키텍처

#### 사용자 구조
| 역할 | 설명 | 권한 |
|------|------|------|
| **Beneficiary** | 락업 토큰 수혜자 | release() |
| **Owner/Admin** | 컨트랙트 관리자 | revoke(), pause(), partialRelease() |
| **Contract** | 스마트 컨트랙트 | 토큰 보관 및 자동 계산 |

**설계 원칙:**
- 단일 수혜자 시스템 (1 beneficiary per lockup)
- 수혜자와 관리자 분리 (서로 다른 주소)
- 역할별 권한 명확화

#### Proxy Pattern (UUPS)

```
┌─────────────────┐     ┌──────────────────┐
│   Proxy         │────▶│  Implementation  │
│  (Storage)      │     │    (Logic)       │
└─────────────────┘     └──────────────────┘
        ▲
        │
    User Call
```

**선택 이유:**
- 가스 효율성 (EIP-1822)
- 로직 업그레이드 가능
- Storage collision 방지
- 관리자만 업그레이드 가능

### 4.4 핵심 함수

#### Lockup 관리
```solidity
function createLockup(
    address beneficiary,
    uint256 amount,
    uint256 cliffDuration,
    uint256 vestingDuration,
    bool revocable
) external onlyOwner;
```

#### 토큰 해제
```solidity
function release() external nonReentrant;
```

#### 락업 취소
```solidity
function revoke(address beneficiary) external onlyOwner;
```

#### 긴급 제어
```solidity
function pause() external onlyOwner;
function unpause() external onlyOwner;
```

### 4.5 View Functions

#### 조회 가능 정보
```solidity
// 현재 해제 가능한 토큰 양
function releasableAmount(address beneficiary) external view returns (uint256);

// 총 베스팅된 토큰 양
function vestedAmount(address beneficiary) external view returns (uint256);

// 락업 정보 조회
function lockups(address beneficiary) external view returns (LockupInfo);
```

#### LockupInfo 구조체
```solidity
struct LockupInfo {
    uint256 totalAmount;      // 전체 락업 양
    uint256 releasedAmount;   // 이미 해제된 양
    uint256 startTime;        // 시작 시간
    uint256 cliffDuration;    // Cliff 기간
    uint256 vestingDuration;  // 전체 베스팅 기간
    bool revocable;           // 취소 가능 여부
    bool revoked;             // 취소 여부
}
```

### 4.6 Event Logging

#### 필수 이벤트 목록

```solidity
event TokensLocked(
    address indexed beneficiary,
    uint256 amount,
    uint256 startTime,
    uint256 cliffDuration,
    uint256 vestingDuration,
    bool revocable
);

event TokensReleased(
    address indexed beneficiary,
    uint256 amount
);

event LockupRevoked(
    address indexed beneficiary,
    uint256 refundAmount
);
```

### 4.7 가스 최적화

#### Storage 최적화
- Struct packing 활용
- `immutable` 변수 사용 (token address)
- Mapping 대신 단일 구조체 (단일 수혜자)

#### 연산 최적화
```solidity
// Custom errors (가스 절약)
error InvalidAmount();
error NoTokensAvailable();
error NotRevocable();

// unchecked 사용 (오버플로우 불가능한 경우)
unchecked { ++i; }
```

#### Compiler 설정
```javascript
solidity: {
  version: '0.8.24',
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    viaIR: true  // IR-based optimizer
  }
}
```

---

## 5. 배포 전략

### 5.1 네트워크

#### Polygon Amoy (테스트넷)
- **목적**: 기능 테스트 및 검증
- **RPC**: https://rpc-amoy.polygon.technology
- **Chain ID**: 80002
- **Explorer**: https://amoy.polygonscan.com

#### Polygon Mainnet
- **목적**: 프로덕션 배포
- **RPC**: https://polygon-rpc.com
- **Chain ID**: 137
- **Explorer**: https://polygonscan.com

### 5.2 배포 프로세스

1. **Amoy 테스트넷 배포**
   ```bash
   pnpm deploy:amoy
   ```

2. **컨트랙트 검증**
   ```bash
   pnpm verify:amoy
   ```

3. **기능 테스트**
   - Lockup 생성
   - 토큰 해제
   - 락업 취소
   - Emergency Pause

4. **Mainnet 배포**
   ```bash
   pnpm deploy:polygon
   ```

5. **PolygonScan 검증**
   ```bash
   pnpm verify:polygon
   ```

### 5.3 검증 요구사항

| 항목 | 요구사항 |
|------|----------|
| **Unit Test** | 95% 이상 커버리지 |
| **Integration Test** | 핵심 시나리오 100% |
| **보안 감사** | 외부 감사 완료 |
| **컨트랙트 검증** | PolygonScan 검증 완료 |

---

## 6. 제약사항

### 6.1 기술적 제약

| 구분 | 내용 |
|------|------|
| **수혜자** | 단일 주소만 지원 (다중 수혜자 미지원) |
| **토큰 타입** | 표준 ERC20만 지원 |
| **베스팅 변경** | 배포 후 스케줄 변경 불가 |
| **최소 기간** | 최소 1개월 이상 락업 권장 |
| **네트워크** | Polygon만 지원 |

### 6.2 보안 고려사항

**지원하지 않는 토큰:**
- Rebasing 토큰 (예: AMPL)
- Fee-on-transfer 토큰
- Deflationary 토큰

**가정사항:**
- 토큰 가격 변동과 무관하게 수량 기준 작동
- 네트워크 가스비는 사용자 부담
- 관리자는 신뢰할 수 있는 주체
- 시간은 block.timestamp 기준
- 월 = 30일로 고정

---

## 부록

### A. 용어 정의

| 용어 | 정의 |
|------|------|
| **Lockup** | 토큰을 일정 기간 동안 인출할 수 없도록 잠그는 것 |
| **Vesting** | 시간 경과에 따라 점진적으로 토큰을 해제하는 과정 |
| **Cliff** | 최초 해제 시작 전 대기 기간 |
| **Beneficiary** | 락업된 토큰의 수혜자 |
| **Claim/Release** | 해제된 토큰을 실제로 인출하는 행위 |
| **Linear Vesting** | 시간에 비례하여 균등하게 토큰이 해제되는 방식 |
| **Pull Payment** | 수신자가 직접 토큰을 요청하여 받는 방식 |

### B. 참고 자료

- [OpenZeppelin Contracts](https://docs.openzeppelin.com/)
- [Polygon Documentation](https://docs.polygon.technology/)
- [EIP-20: Token Standard](https://eips.ethereum.org/EIPS/eip-20)
- [EIP-1822: UUPS Proxy](https://eips.ethereum.org/EIPS/eip-1822)
- [Ethereum Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)

### C. 보안 체크리스트

- [ ] ReentrancyGuard 적용
- [ ] SafeERC20 사용
- [ ] Emergency Pause 구현
- [ ] Timestamp 안전 마진 설정
- [ ] Custom Errors 사용
- [ ] 외부 감사 완료
- [ ] 테스트 커버리지 95% 이상
- [ ] PolygonScan 검증 완료

---

**문서 정보**
- 📄 문서명: SUT Token Lockup Contract PRD
- 📅 작성일: 2024
- 📌 버전: 2.0 (간소화 버전)
- 📝 상태: Active
- 🔄 업데이트: 개발 진행에 따라 지속 업데이트
