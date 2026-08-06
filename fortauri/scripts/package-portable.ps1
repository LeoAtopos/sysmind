$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot 'src-tauri\target\release\sysmind.exe'
$releaseDirectory = Join-Path $projectRoot 'release'
$package = Join-Path $releaseDirectory 'SysMind-tauri-portable-win-x64.zip'
$checksumFile = Join-Path $releaseDirectory 'SysMind-tauri-portable-win-x64.zip.sha256'

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Tauri executable not found: $executable"
}

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
if (Test-Path -LiteralPath $package) {
  Remove-Item -LiteralPath $package -Force
}
if (Test-Path -LiteralPath $checksumFile) {
  Remove-Item -LiteralPath $checksumFile -Force
}

Compress-Archive -LiteralPath $executable -DestinationPath $package -CompressionLevel Optimal
Get-FileHash -LiteralPath $package -Algorithm SHA256 |
  ForEach-Object { "$($_.Hash.ToLowerInvariant())  $(Split-Path -Leaf $package)" } |
  Set-Content -Encoding ascii -LiteralPath $checksumFile

Write-Output "Portable package created: $package"
Write-Output "Checksum written: $checksumFile"
