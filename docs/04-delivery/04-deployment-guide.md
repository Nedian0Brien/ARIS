# 04-배포 가이드

현재 배포 기준 문서는 [`deploy/README.md`](../../deploy/README.md)이다. 이 문서는 중복 설명을 줄이기 위한 안내용 인덱스만 유지한다.

## 공식 배포 엔트리포인트

```bash
./deploy/deploy_backend_zero_downtime.sh
./deploy/deploy_web.sh
./deploy/deploy_zero_downtime.sh
```

## 보조 스크립트 위치

```bash
./deploy/ops/check-runtime-connection.sh
./deploy/ops/prune_docker_reclaimable.sh
./deploy/dev/run_web_dev_hot_reload.sh
./deploy/legacy/deploy_web_legacy.sh
```

## 현재 운영 검증 기준

- 운영 웹 검증 대상은 `http://localhost:3300`이 아니라 nginx가 연결한 실제 도메인 또는 활성 blue/green 슬롯 포트다.
- 웹 배포 기본 경로는 blue/green 전환이며 legacy `aris-web` 단일 슬롯은 표준 경로가 아니다.
- 상세 절차, 헬스체크, 트러블슈팅, cron 예시는 `deploy/README.md`를 따른다.
