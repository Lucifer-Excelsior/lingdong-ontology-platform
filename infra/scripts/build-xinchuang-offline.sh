#!/usr/bin/env bash
# 灵·洞本体工作站 V4.0 Enterprise GA — 信创多架构 (linux/amd64 + linux/arm64 鲲鹏/飞腾) 离线镜像打包脚本
set -euo pipefail

VERSION="${1:-v4.0.0-ga}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
OUT_DIR="${OUT_DIR:-./dist-offline}"
mkdir -p "$OUT_DIR"

echo "[1/3] 构建多架构生产镜像 ($PLATFORMS)..."
docker buildx build --platform "$PLATFORMS" -f apps/api/Dockerfile -t "lingdong-api:${VERSION}" --load .
docker buildx build --platform "$PLATFORMS" -f apps/web/Dockerfile -t "lingdong-web:${VERSION}" --load .

echo "[2/3] 导出空气隔离离线归档包..."
TAR_FILE="${OUT_DIR}/lingdong-ga-${VERSION}.tar.gz"
docker save "lingdong-api:${VERSION}" "lingdong-web:${VERSION}" | gzip > "$TAR_FILE"

echo "[3/3] 生成 SHA-256 完整性校验清单..."
shasum -a 256 "$TAR_FILE" > "${TAR_FILE}.sha256"
echo "✓ 离线交付包构建完成: $TAR_FILE"
cat "${TAR_FILE}.sha256"
