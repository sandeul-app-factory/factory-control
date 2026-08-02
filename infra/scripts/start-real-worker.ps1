[CmdletBinding()]
param(
  [switch]$Watch,
  [switch]$CheckOnly,
  [string]$EnvironmentFile = ".env"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$environmentPath = if ([System.IO.Path]::IsPathRooted($EnvironmentFile)) {
  $EnvironmentFile
} else {
  Join-Path $repositoryRoot $EnvironmentFile
}

if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
  throw "Environment file not found: $environmentPath"
}

foreach ($line in Get-Content -LiteralPath $environmentPath -Encoding utf8) {
  if ($line -match '^\s*(?:#|$)') {
    continue
  }
  if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
    throw "Invalid environment line. Expected KEY=VALUE."
  }
  $name = $Matches[1]
  $value = $Matches[2].Trim()
  if (
    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
    ($value.StartsWith("'") -and $value.EndsWith("'"))
  ) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

$nodeDirectory = "C:\Program Files\nodejs"
$pnpm = Join-Path $nodeDirectory "pnpm.cmd"
$codex = if ($env:CODEX_BIN -and (Test-Path -LiteralPath $env:CODEX_BIN -PathType Leaf)) {
  $env:CODEX_BIN
} else {
  Join-Path $env:LOCALAPPDATA "Programs\OpenAI\Codex\bin\codex.exe"
}
$androidHome = if ($env:ANDROID_HOME) {
  $env:ANDROID_HOME
} else {
  Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
$javaHome = if ($env:JAVA_HOME -and (Test-Path -LiteralPath $env:JAVA_HOME -PathType Container)) {
  $env:JAVA_HOME
} else {
  "C:\Program Files\Android\Android Studio\jbr"
}
$codexHome = if ($env:CODEX_HOME) {
  $env:CODEX_HOME
} else {
  Join-Path $env:USERPROFILE ".codex"
}
$workspaceRoot = if (
  $env:CODEX_WORKSPACE_ROOT -and
  [System.IO.Path]::IsPathRooted($env:CODEX_WORKSPACE_ROOT)
) {
  $env:CODEX_WORKSPACE_ROOT
} else {
  Join-Path $repositoryRoot ".factory-workspaces"
}

foreach ($requiredPath in @(
  $pnpm,
  $codex,
  (Join-Path $javaHome "bin\java.exe"),
  (Join-Path $androidHome "platform-tools\adb.exe"),
  (Join-Path $codexHome "auth.json")
)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required Worker dependency not found: $requiredPath"
  }
}

$postgresPort = if ($env:POSTGRES_BIND_PORT) { $env:POSTGRES_BIND_PORT } else { "5432" }
$redisPort = if ($env:REDIS_BIND_PORT) { $env:REDIS_BIND_PORT } else { "6379" }
$minioPort = if ($env:MINIO_API_PORT) { $env:MINIO_API_PORT } else { "9000" }
$env:DATABASE_URL = if ($env:CODEX_HOST_DATABASE_URL) {
  $env:CODEX_HOST_DATABASE_URL
} elseif ($env:POSTGRES_PASSWORD) {
  $postgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "factory" }
  $postgresDatabase = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "factory" }
  $encodedPostgresUser = [System.Uri]::EscapeDataString($postgresUser)
  $encodedPostgresPassword = [System.Uri]::EscapeDataString($env:POSTGRES_PASSWORD)
  $encodedPostgresDatabase = [System.Uri]::EscapeDataString($postgresDatabase)
  "postgresql://${encodedPostgresUser}:${encodedPostgresPassword}@127.0.0.1:$postgresPort/${encodedPostgresDatabase}?schema=public"
} else {
  $env:DATABASE_URL -replace '@postgres:[0-9]+', "@127.0.0.1:$postgresPort"
}
$env:REDIS_URL = if ($env:CODEX_HOST_REDIS_URL) {
  $env:CODEX_HOST_REDIS_URL
} elseif ($env:REDIS_PASSWORD) {
  $encodedRedisPassword = [System.Uri]::EscapeDataString($env:REDIS_PASSWORD)
  "redis://:${encodedRedisPassword}@127.0.0.1:$redisPort"
} else {
  $env:REDIS_URL -replace '@redis:[0-9]+', "@127.0.0.1:$redisPort" -replace 'redis://redis:[0-9]+', "redis://127.0.0.1:$redisPort"
}
$env:S3_ENDPOINT = if ($env:CODEX_HOST_S3_ENDPOINT) {
  $env:CODEX_HOST_S3_ENDPOINT
} else {
  "http://127.0.0.1:$minioPort"
}
$env:S3_PUBLIC_ENDPOINT = if ($env:CODEX_HOST_S3_PUBLIC_ENDPOINT) {
  $env:CODEX_HOST_S3_PUBLIC_ENDPOINT
} else {
  $env:S3_ENDPOINT
}
$env:CODEX_ADAPTER = "real"
$env:CODEX_BIN = $codex
$env:CODEX_HOME = $codexHome
$env:CODEX_WORKSPACE_ROOT = $workspaceRoot
$env:CODEX_RESULT_SCHEMA_PATH = Join-Path $repositoryRoot "schemas\codex\codex-result.schema.json"
$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:GRADLE_USER_HOME = Join-Path $workspaceRoot ".gradle"
$registeredPath = @(
  [Environment]::GetEnvironmentVariable("Path", "Machine"),
  [Environment]::GetEnvironmentVariable("Path", "User")
) -join [System.IO.Path]::PathSeparator
$env:Path = @(
  $nodeDirectory,
  (Split-Path -Parent $codex),
  (Join-Path $javaHome "bin"),
  (Join-Path $androidHome "platform-tools"),
  (Join-Path $androidHome "cmdline-tools\latest\bin"),
  $registeredPath,
  $env:Path
) -join [System.IO.Path]::PathSeparator

New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null

& $codex login status
if ($LASTEXITCODE -ne 0) {
  throw "Codex login is not valid for CODEX_HOME=$codexHome"
}

$missingSecurityTools = @()
foreach ($tool in @("gitleaks", "semgrep", "trivy", "osv-scanner", "syft")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    $missingSecurityTools += $tool
  }
}
if ($missingSecurityTools.Count -gt 0) {
  Write-Warning (
    "Worker will run, but Release Gate will be blocked until these tools are installed: " +
    ($missingSecurityTools -join ", ")
  )
}
if ($CheckOnly) {
  Write-Host "Real Codex Worker environment is valid."
  Write-Host "Codex: $codex"
  Write-Host "CODEX_HOME: $codexHome"
  Write-Host "JAVA_HOME: $javaHome"
  Write-Host "ANDROID_HOME: $androidHome"
  Write-Host "Workspace: $workspaceRoot"
  exit 0
}

Push-Location $repositoryRoot
try {
  if ($Watch) {
    & $pnpm --filter "@sandeul/worker" dev
  } else {
    & $pnpm --filter "@sandeul/worker" build
    if ($LASTEXITCODE -ne 0) {
      throw "Worker build failed."
    }
    & $pnpm --filter "@sandeul/worker" start
  }
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
