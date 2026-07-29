#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Usage: $0 ABSOLUTE_BACKUP_DIRECTORY --confirm" >&2
}

if [[ $# -ne 2 || "$2" != "--confirm" ]]; then
  usage
  exit 2
fi

backup_dir="$(realpath "$1")"
case "${backup_dir}" in
  ""|"/")
    echo "Unsafe backup directory." >&2
    exit 1
    ;;
esac

for required_file in database.dump SHA256SUMS; do
  if [[ ! -f "${backup_dir}/${required_file}" ]]; then
    echo "Missing backup file: ${required_file}" >&2
    exit 1
  fi
done

(
  cd "${backup_dir}"
  sha256sum --check SHA256SUMS
)

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${FACTORY_ENV_FILE:-${repo_root}/.env.production}"
compose_file="${FACTORY_COMPOSE_FILE:-${repo_root}/docker-compose.prod.yml}"
if [[ ! -f "${env_file}" ]]; then
  echo "Environment file not found: ${env_file}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a

for variable in POSTGRES_USER POSTGRES_DB S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_BUCKET; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required variable is empty: ${variable}" >&2
    exit 1
  fi
done

compose=(docker compose --env-file "${env_file}" -f "${compose_file}")
pre_restore="${backup_dir}/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
"${compose[@]}" exec -T postgres pg_dump \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --format=custom \
  --no-owner \
  --no-acl > "${pre_restore}"

echo "A pre-restore database snapshot was written to ${pre_restore}"
echo "Restoring database objects. Existing Factory schema objects will be replaced."
"${compose[@]}" exec -T api true
"${compose[@]}" stop api
trap '"${compose[@]}" start api' EXIT
"${compose[@]}" exec -T postgres pg_restore \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl < "${backup_dir}/database.dump"

if [[ -d "${backup_dir}/objects" ]]; then
  network_name="${COMPOSE_PROJECT_NAME:-sandeul-factory-prod}_default"
  docker run --rm \
    --network "${network_name}" \
    --env S3_ACCESS_KEY_ID \
    --env S3_SECRET_ACCESS_KEY \
    --env S3_BUCKET \
    --volume "${backup_dir}/objects:/backup:ro" \
    --entrypoint /bin/sh \
    quay.io/minio/mc:RELEASE.2025-04-16T18-13-26Z \
    -ec 'mc alias set factory http://minio:9000 "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null; mc mirror --preserve /backup "factory/$S3_BUCKET"'
fi

"${compose[@]}" run --rm migrate
"${compose[@]}" start api
trap - EXIT
echo "Restore completed. Verify /api/health, login, object hashes, and audit history."
