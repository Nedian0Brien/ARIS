# ARIS Documentation

ARIS(Agentic Runtime Interface System)는 `happy` 기반의 에이전틱 바이브코딩 웹 클라이언트를 독자적인 UX와 기능으로 재구성하는 프로젝트입니다.

ARIS의 기본 방향은 **Web-first Cross-Device**입니다. 하나의 웹 클라이언트로 모바일/태블릿/데스크톱에서 동일한 핵심 런타임 경험을 제공하며, UI는 **노션 등 모던 프로덕션 앱에 익숙한 사용자에게 친숙한 감각**을 목표로 합니다.

## 문서 구성

- `Features-to-develop.md`: 중장기 개발 백로그(원본)
- `aris-01-product-vision.md`: 제품 비전, 목표, 범위, 성공 지표
- `aris-02-design-thinking.md`: Design Thinking 결과 (Purpose/Tone/Differentiator/Constraints)
- `aris-03-information-architecture.md`: 정보구조, 화면 구조, 핵심 사용자 플로우
- `aris-04-system-architecture.md`: `happy` 연동 기반 시스템 아키텍처
- `aris-05-feature-spec-mvp.md`: MVP 기능 스펙 및 수용 기준
- `aris-06-roadmap.md`: 단계별 개발 로드맵 및 마일스톤
- `aris-07-security-model.md`: 로그인/권한/E2E 암호화 중심 보안 모델
- `aris-08-ui-interaction-spec.md`: 화이트 베이스 + 컬러 컴포넌트 중심 UI/응답/인터랙션 스펙

## 문서 사용 원칙

- UI/UX 구현 시 `aris-02`, `aris-03`, `aris-05`, `aris-08`을 우선 참조
- 응답 타입 렌더링/의도 입력 컴포넌트는 `aris-08`을 기준으로 구현
- 크로스디바이스 동작 기준은 `aris-03`, `aris-05`를 우선 참조
- 백엔드/통신 연동 구현 시 `aris-04`를 우선 참조
- 인증/암호화/접근통제 구현 시 `aris-07`을 우선 참조
- 중장기 기능 반영 시 `Features-to-develop.md`와 `aris-06`을 함께 업데이트
- 변경 발생 시 해당 문서에 바로 반영하고, `README.md` 문서 맵을 유지
