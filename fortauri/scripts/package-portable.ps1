$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot 'src-tauri\target\release\sysmind.exe'
$releaseDirectory = Join-Path $projectRoot 'release'
$package = Join-Path $releaseDirectory 'SysMind-tauri-portable-win-x64.zip'

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Tauri executable not found: $executable"
}

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
if (Test-Path -LiteralPath $package) {
  Remove-Item -LiteralPath $package -Force
}

Compress-Archive -LiteralPath $executable -DestinationPath $package -CompressionLevel Optimal
Write-Output "Portable package created: $package"
