# Emits the Meridian MCP auth header for Claude Code's headersHelper.
# Reads MERIDIAN_MCP_TOKEN from the process env first, then from this repo's .env (never committed).
$tok = $env:MERIDIAN_MCP_TOKEN
if (-not $tok) {
  $envFile = Join-Path $PSScriptRoot '..\.env'
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*MERIDIAN_MCP_TOKEN\s*=' } | Select-Object -First 1
    if ($line) { $tok = ($line -split '=', 2)[1].Trim().Trim('"', "'") }
  }
}
if (-not $tok) { [Console]::Error.WriteLine('MERIDIAN_MCP_TOKEN not found in env or .env'); exit 1 }
@{ Authorization = "Bearer $tok" } | ConvertTo-Json -Compress
