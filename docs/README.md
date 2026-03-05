# ARIS Docs

ARIS(Agentic Runtime Interface System)의 문서는 **사용자 의도 중심(Chat-first Agentic Coding)**으로 재정렬했다.

핵심 전제:
- 사용자는 채팅 UI에 가까운 화면에서 에이전틱 코딩을 수행한다.
- 모바일/태블릿/데스크톱에서 동일한 핵심 행동(지시, 승인, 중단, 재시도)을 수행한다.
- 로그인 기반 접근통제와 E2E 암호화 계층을 기본 보안 모델로 적용한다.

## 문서 맵

### 01-intent
- `01-user-intent.md`: 사용자 의도와 제품 방향의 기준 문장
- `02-product-vision.md`: 목표, 문제정의, 성공지표

### 02-experience
- `01-design-thinking.md`: Purpose/Tone/Differentiator/Constraints
- `02-information-architecture.md`: 채팅 워크스페이스 중심 정보구조
- `03-ui-interaction-spec.md`: 응답 타입/의도 전달/컴포넌트 스타일 기준

### 03-platform
- `01-system-architecture.md`: ARIS 서비스 구성, 런타임 연동 경계
- `02-security-model.md`: 인증, 권한, 암호화, 감사 로그, SSH fallback 보안 정책

### 04-delivery
- `01-mvp-feature-spec.md`: MVP 기능/수용기준
- `02-roadmap.md`: 단계별 구현 계획
- `03-feature-backlog.md`: Post-MVP 백로그
- `04-deployment-guide.md`: 배포 절차와 런타임 이슈 트러블슈팅
- `05-dark-mode-support-plan.md`: 다크모드 지원 설계/구현/검증 계획

## 권장 읽기 순서

1. `01-intent/01-user-intent.md`
2. `02-experience/02-information-architecture.md`
3. `02-experience/03-ui-interaction-spec.md`
4. `03-platform/02-security-model.md`
5. `04-delivery/01-mvp-feature-spec.md`

## 유지 원칙

- 구현이 바뀌면 먼저 문서의 IA/기능 스펙을 수정한다.
- 파일명은 숫자 접두어로 읽기 순서를 유지한다.
- 민감정보(비밀번호/토큰/키)는 문서에 기록하지 않는다.
