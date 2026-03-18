#!/usr/bin/env bash
# rebuild-happy-server-bundle.sh
#
# happy-server 컨테이너 내부의 TypeScript 소스를 esbuild로 컴파일하여
# 번들 CJS 파일을 생성하고, 컨테이너를 재시작한다.
#
# 용도:
#   tsx 런타임 컴파일 오버헤드(상시 CPU 80%+)를 제거하기 위해
#   컴파일된 JS를 node로 직접 실행한다.
#
# 사용법:
#   ./deploy/ops/rebuild-happy-server-bundle.sh
#
# 요구사항:
#   - happy-server Docker 컨테이너가 실행 중이어야 함
#   - 컨테이너 내부에 /repo/node_modules/.bin/esbuild 존재
#
set -euo pipefail

CONTAINER_NAME="happy-server"
BUNDLE_PATH="/repo/packages/happy-server/dist/main.cjs"
ENTRYPOINT="./sources/main.ts"
WORKDIR="/repo/packages/happy-server"

echo "[rebuild-happy-server-bundle] 시작: $(date)"

# 1) 컨테이너 실행 여부 확인
if ! docker inspect "$CONTAINER_NAME" --format '{{.State.Running}}' 2>/dev/null | grep -q "true"; then
  echo "[rebuild-happy-server-bundle] ERROR: $CONTAINER_NAME 컨테이너가 실행 중이지 않습니다."
  exit 1
fi

# 2) esbuild 존재 확인
if ! docker exec "$CONTAINER_NAME" test -f /repo/node_modules/.bin/esbuild; then
  echo "[rebuild-happy-server-bundle] ERROR: esbuild를 찾을 수 없습니다."
  exit 1
fi

# 3) dist 디렉토리 생성
docker exec "$CONTAINER_NAME" mkdir -p "$WORKDIR/dist"

# 4) esbuild 번들링
echo "[rebuild-happy-server-bundle] esbuild 번들 생성 중..."
docker exec "$CONTAINER_NAME" /bin/sh -c "
  cd $WORKDIR && \
  /repo/node_modules/.bin/esbuild $ENTRYPOINT \
    --bundle \
    --platform=node \
    --target=node20 \
    --format=cjs \
    --outfile=$BUNDLE_PATH \
    --alias:@=./sources \
    --external:@prisma/client \
    --external:prisma \
    --external:pino \
    --external:pino-pretty \
    --external:thread-stream \
    --external:privacy-kit \
    --banner:js='const __importMetaUrl = require(\"url\").pathToFileURL(__filename).href;'
"

echo "[rebuild-happy-server-bundle] 번들 생성 완료: $BUNDLE_PATH"

# 5) package.json의 start 스크립트를 번들 실행으로 교체
echo "[rebuild-happy-server-bundle] package.json start 스크립트 업데이트 중..."
docker exec "$CONTAINER_NAME" /bin/sh -c "
  cd $WORKDIR && \
  node -e \"
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.scripts.start = 'node ./dist/main.cjs';
    pkg.scripts['start:bundle'] = 'node ./dist/main.cjs';
    pkg.scripts['start:tsx'] = 'tsx ./sources/main.ts';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    console.log('package.json updated');
  \"
"

# 6) 컨테이너 재시작
echo "[rebuild-happy-server-bundle] happy-server 컨테이너 재시작 중..."
docker restart "$CONTAINER_NAME"

# 7) 헬스 체크 (최대 30초 대기)
echo "[rebuild-happy-server-bundle] 헬스 체크 대기 중..."
for i in $(seq 1 30); do
  sleep 1
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3005/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "[rebuild-happy-server-bundle] ✓ happy-server 정상 기동 확인 (${i}초)"
    curl -s http://127.0.0.1:3005/health
    echo ""
    echo "[rebuild-happy-server-bundle] 완료. tsx → node 번들 전환 성공."
    exit 0
  fi
  echo "[rebuild-happy-server-bundle] 대기 중... (${i}/30, HTTP $STATUS)"
done

echo "[rebuild-happy-server-bundle] ERROR: 30초 내 헬스 체크 실패. 로그를 확인하세요:"
echo "  docker logs $CONTAINER_NAME --tail=50"
exit 1
