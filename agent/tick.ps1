# Loads .env then runs the agent. Usage:  .\tick.ps1   (or  .\tick.ps1 read | reason | tick)
Get-Content "$PSScriptRoot\.env" | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}
$cmd = if ($args.Count -gt 0) { $args[0] } else { "demo" }
node "$PSScriptRoot\agent.mjs" $cmd
