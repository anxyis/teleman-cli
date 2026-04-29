#!/bin/bash
# Simple build script to generate binaries for multiple platforms.

set -e

platforms=("windows/amd64" "linux/amd64" "linux/arm64")

echo "Starting Teleman Build Process..."

mkdir -p dist

for platform in "${platforms[@]}"
do
    platform_split=(${platform//\// })
    GOOS=${platform_split[0]}
    GOARCH=${platform_split[1]}
    output_name="dist/teleman-$GOOS-$GOARCH"
    if [ $GOOS = "windows" ]; then
        output_name+='.exe'
    fi

    echo "Building [$GOOS/$GOARCH] -> $output_name"
    export GOOS=$GOOS
    export GOARCH=$GOARCH
    # -s -w: Omit the symbol table and debug information to reduce binary size.
    go build -ldflags="-s -w" -o $output_name main.go
done

echo -e "\nAll builds completed successfully! Check the 'dist' folder."
