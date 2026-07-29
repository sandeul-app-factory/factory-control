#!/usr/bin/env bash
set -Eeuo pipefail

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

backup_root="${BACKUP_ROOT:-/srv/backups/sandeul-factory}"
case "${backup_root}" in
  ""|"/"|"."|"..")
    echo "Unsafe BACKUP_ROOT: ${backup_root}" >&2
    exit 1
    ;;
esac
if [[ "${backup_root}" != /* ]]; then
  echo "BACKUP_ROOT must be an absolute path." >&2
  exit 1
fi

for variable in POSTGRES_USER POSTGRES_DB S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_BUCKET; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required variable is empty: ${variable}" >&2
    exit 1
  fi
done

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${backup_root}/${timestamp}"
object_dir="${backup_dir}/objects"
mkdir -p "${object_dir}"
chmod 0700 "${backup_dir}"

compose=(docker compose --env-file "${env_file}" -f "${compose_file}")
"${compose[@]}" exec -T postgres pg_dump \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --format=custom \
  --no-owner \
  --no-acl > "${backup_dir}/database.dump"

network_name="${COMPOSE_PROJECT_NAME:-sandeul-factory-prod}_default"

docker run --rm \
  --network "${network_name}" \
  --env S3_ACCESS_KEY_ID \
  --env S3_SECRET_ACCESS_KEY \
  --env S3_BUCKET \
  --volume "${object_dir}:/backup" \
  --entrypoint /bin/sh \
  quay.io/minio/mc:RELEASE.2025-04-16T18-13-26Z \
  -ec 'mc alias set factory http://minio:9000 "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null; mc mirror --preserve "factory/$S3_BUCKET" /backup'

(
  cd "${backup_dir}"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)

echo "Backup completed: ${backup_dir}"
echo "No old backup was deleted. Apply retention only after an independent restore test."
