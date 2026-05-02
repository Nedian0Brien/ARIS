# 04-배포 가이드

현재 배포 기준 문서는 [`deploy/README.md`](../../deploy/README.md)이다. URL별 배포 대상 분류와 완료 선언 기준은 [`06-deployment-target-policy.md`](./06-deployment-target-policy.md)를 따른다. 이 문서는 중복 설명을 줄이기 위한 안내용 인덱스만 유지한다.

## 핵심 원칙

- 운영 단일 소스 env는 `/home/ubuntu/.config/aris/prod.env`다.
- 배포 스크립트는 `DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env`가 없으면 즉시 실패한다.
- 운영 웹은 `RUNTIME_API_URL`, `RUNTIME_API_TOKEN`으로 `aris-backend`에 인증한다.
- `HAPPY_SERVER_URL`, `HAPPY_SERVER_TOKEN`은 백엔드가 Happy 런타임에 붙을 때만 사용한다.

## 공식 엔트리포인트

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_backend_zero_downtime.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_web.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_zero_downtime.sh
```

## 보조 스크립트 위치

```bash
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/ops/check-runtime-connection.sh
./deploy/ops/prune_docker_reclaimable.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/dev/run_web_dev_hot_reload.sh
DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/legacy/deploy_web_legacy.sh
```

## 현재 운영 검증 기준

- 운영 웹 검증 대상은 `http://localhost:3300`이 아니라 nginx가 연결한 실제 도메인 또는 활성 blue/green 슬롯 포트다.
- 웹 배포 기본 경로는 blue/green 전환이며 legacy `aris-web` 단일 슬롯은 표준 경로가 아니다.
- `https://lawdigest.cloud/proxy/<port>/`는 운영 배포 대상이 아니라 code-server dev proxy 대상이다.
- 사용자가 정확한 URL을 제시하면 그 URL을 기준으로 smoke를 완료해야 한다.
- 상세 절차, 헬스체크, 트러블슈팅, cron 예시는 `deploy/README.md`를 따른다.
