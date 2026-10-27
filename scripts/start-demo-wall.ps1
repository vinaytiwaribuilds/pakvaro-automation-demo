param(
  [ValidatePattern('^\.n8n-[A-Za-z0-9-]+$')]
  [string]$ProfileName = '.n8n-wall'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:N8N_USER_FOLDER = Join-Path $repoRoot $ProfileName
$env:npm_config_cache = Join-Path $repoRoot '.npm-cache'
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = 'false'
$env:MOCK_BASE_URL = 'http://127.0.0.1:3001'
$env:MOCK_API_KEY = 'demo-local-key'
$env:N8N_DIAGNOSTICS_ENABLED = 'false'
$env:N8N_VERSION_NOTIFICATIONS_ENABLED = 'false'

& npx --yes n8n@1.121.3 start
