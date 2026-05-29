# build.ps1
# Simple build script to generate binaries for multiple platforms.

$platforms = @(
    @{ os = "windows"; arch = "amd64"; ext = ".exe" },
    @{ os = "linux"; arch = "amd64"; ext = "" },
    @{ os = "linux"; arch = "arm64"; ext = "" }
)

Write-Host "Starting Teleman Build Process..." -ForegroundColor Yellow

if (-not (Test-Path "dist")) {
    New-Item -ItemType Directory -Path "dist" | Out-Null
}

foreach ($p in $platforms) {
    $out = "dist/teleman-$($p.os)-$($p.arch)$($p.ext)"
    Write-Host "Building [$($p.os)/$($p.arch)] -> $out" -ForegroundColor Cyan
    $env:GOOS = $p.os
    $env:GOARCH = $p.arch
    # -s -w: Omit the symbol table and debug information to reduce binary size.
    go build -ldflags="-s -w" -o $out main.go
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed for $($p.os)/$($p.arch)"
        exit $LASTEXITCODE
    }
}

Write-Host "`nAll builds completed successfully! Check the 'dist' folder." -ForegroundColor Green
