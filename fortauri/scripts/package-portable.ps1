$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot 'src-tauri\target\release\sysmind.exe'
$releaseDirectory = Join-Path $projectRoot 'release'
$portableDirectory = Join-Path $releaseDirectory 'SysMind-tauri-portable-win-x64'
$portableExecutable = Join-Path $portableDirectory 'sysmind.exe'
$package = Join-Path $releaseDirectory 'SysMind-tauri-portable-win-x64.zip'
$checksumFile = Join-Path $releaseDirectory 'SysMind-tauri-portable-win-x64.zip.sha256'

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Tauri executable not found: $executable"
}

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $portableDirectory -Force | Out-Null
Copy-Item -LiteralPath $executable -Destination $portableExecutable -Force
if (Test-Path -LiteralPath $package) {
  Remove-Item -LiteralPath $package -Force
}
if (Test-Path -LiteralPath $checksumFile) {
  Remove-Item -LiteralPath $checksumFile -Force
}

Compress-Archive -LiteralPath $portableExecutable -DestinationPath $package -CompressionLevel Optimal
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$packageStream = [System.IO.File]::OpenRead($package)

try {
  $hashBytes = $sha256.ComputeHash($packageStream)
}
finally {
  $packageStream.Dispose()
  $sha256.Dispose()
}

$hash = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
"$hash  $(Split-Path -Leaf $package)" | Set-Content -Encoding ascii -LiteralPath $checksumFile

Write-Output "Portable package created: $package"
Write-Output "Checksum written: $checksumFile"
