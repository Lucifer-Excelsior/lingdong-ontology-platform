#!/usr/bin/env bash
# 灵·洞本体工作站 V4.0 Enterprise GA — PG17 + Oxigraph 图库一键灾备备份与恢复脚本
set -euo pipefail

ACTION="${1:-backup}"
BACKUP_DIR="${2:-./backups/$(date +%Y%m%d-%H%M%S)}"
PG_URL="${DATABASE_URL:-postgres://lingdong:lingdong_dev@127.0.0.1:5433/ontology_v3}"
GRAPH_ENDPOINT="${GRAPH_STORE_ENDPOINT:-}"

if [[ "$ACTION" == "backup" ]]; then
  mkdir -p "$BACKUP_DIR"
  echo "[1/3] 备份 PostgreSQL 17 关系与 RLS 状态..."
  pg_dump "$PG_URL" --format=custom --file="${BACKUP_DIR}/ontology_v3.pgdump"

  echo "[2/3] 备份语义图谱 N-Quads..."
  if [[ -n "$GRAPH_ENDPOINT" ]]; then
    curl -fsS -H "Accept: application/n-quads" "${GRAPH_ENDPOINT}/store" -o "${BACKUP_DIR}/graph.nq"
  elif [[ -f "apps/api/.data/oxigraph-v3.nq" ]]; then
    cp "apps/api/.data/oxigraph-v3.nq" "${BACKUP_DIR}/graph.nq"
  else
    touch "${BACKUP_DIR}/graph.nq"
  fi

  echo "[3/3] 生成备份集 SHA-256 校验清单..."
  (cd "$BACKUP_DIR" && shasum -a 256 ontology_v3.pgdump graph.nq > manifest.sha256)
  echo "✓ GA 备份完成: $BACKUP_DIR"
elif [[ "$ACTION" == "restore" ]]; then
  echo "[1/2] 校验备份完整性..."
  (cd "$BACKUP_DIR" && shasum -a 256 -c manifest.sha256)
  echo "[2/2] 恢复 PostgreSQL 与图库数据..."
  pg_restore --clean --if-exists --dbname="$PG_URL" "${BACKUP_DIR}/ontology_v3.pgdump"
  if [[ -n "$GRAPH_ENDPOINT" && -s "${BACKUP_DIR}/graph.nq" ]]; then
    curl -fsS -X PUT -H "Content-Type: application/n-quads" --data-binary "@${BACKUP_DIR}/graph.nq" "${GRAPH_ENDPOINT}/store"
  fi
  echo "✓ GA 灾难恢复完成"
else
  echo "用法: $0 backup [dir] | restore <dir>" >&2
  exit 1
fi
