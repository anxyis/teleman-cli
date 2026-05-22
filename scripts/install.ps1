$ErrorActionPreference = 'Stop'

$repo = "anxyis/teleman-cli"
$target = "teleman-windows-amd64.exe"

$installDir = Join-Path $env:USERPROFILE ".teleman\bin"

if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
}

$exePath = Join-Path $installDir "teleman.exe"

Write-Host "Fetching latest release from $repo..."
$downloadUrl = "https://github.com/$repo/releases/latest/download/$target"

Write-Host "Downloading Teleman..."
$tempDownloadPath = Join-Path $env:TEMP $target
Invoke-WebRequest -Uri $downloadUrl -OutFile $tempDownloadPath

if (Test-Path $exePath) {
    $oldPath = "$exePath.old"
    if (Test-Path $oldPath) {
        Remove-Item $oldPath -Force -ErrorAction SilentlyContinue
    }
    Rename-Item $exePath "teleman.exe.old" -Force -ErrorAction SilentlyContinue
}

Move-Item -Path $tempDownloadPath -Destination $exePath -Force

# Check if installDir is in PATH
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notmatch [regex]::Escape($installDir)) {
    Write-Host "Adding $installDir to User PATH..."
    $newPath = "$installDir;$userPath"
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    $env:PATH = "$installDir;$env:PATH"
    Write-Host "Please restart your terminal to ensure the new PATH is fully applied." -ForegroundColor Yellow
}

Write-Host "Teleman installed successfully to $exePath!" -ForegroundColor Green
Write-Host "Run 'teleman --help' to get started."
