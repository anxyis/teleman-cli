$ErrorActionPreference = 'Stop'

$repo = "anxyis/teleman-cli"
$target = "teleman-windows-amd64.exe"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) is required but not installed. Please install it from https://cli.github.com/"
    exit 1
}

$installDir = Join-Path $env:USERPROFILE ".teleman\bin"

if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
}

$exePath = Join-Path $installDir "teleman.exe"

Write-Host "Checking for latest release..."
$latestTag = ""
try {
    $latestTagJson = gh release view -R $repo --json tagName | ConvertFrom-Json
    $latestTag = $latestTagJson.tagName
} catch {
    # Ignore error if we can't fetch it
}

if ($latestTag) {
    if (Get-Command teleman -ErrorAction SilentlyContinue) {
        $localVersionOutput = teleman --version
        # Expected output: "teleman version v1.1.0"
        if ($localVersionOutput -match "version (v\d+\.\d+\.\d+)") {
            $localVersion = $matches[1]
            if ($localVersion -eq $latestTag) {
                Write-Host "Teleman is already up-to-date ($localVersion). Skipping update." -ForegroundColor Green
                exit 0
            }
        }
    }
    Write-Host "Updating to $latestTag..."
}

Write-Host "Downloading $target via GitHub CLI..."
$tempDownloadPath = Join-Path $env:TEMP $target
gh release download -R $repo -p $target --clobber -D $env:TEMP

# If teleman.exe is running, overwriting might fail.
# We try to rename the existing one to .old first.
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
    # Also update current session PATH
    $env:PATH = "$installDir;$env:PATH"
    Write-Host "Please restart your terminal to ensure the new PATH is fully applied." -ForegroundColor Yellow
}

if ($latestTag) {
    Write-Host "Teleman installed/updated successfully to $latestTag at $exePath!" -ForegroundColor Green
} else {
    Write-Host "Teleman installed/updated successfully to $exePath!" -ForegroundColor Green
}
Write-Host "Run 'teleman --help' to get started."
