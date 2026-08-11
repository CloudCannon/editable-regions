#!/bin/bash
# Builds the Hugo renderer WASM and installs it (gzipped) into the Hugo
# module's assets directory, where the bundle pipeline fingerprints and
# publishes it for sites consuming the module.
set -e

cd "$(dirname "$0")"

OUTPUT="hugo_renderer.wasm"
ASSETS_DIR="../hugo-module/assets/cc-editable-regions"

GOOS=js GOARCH=wasm go build -tags nodeploy -ldflags="-s -w" -o "$OUTPUT"
printf "Built Hugo renderer WASM: "
ls -lh "$OUTPUT" | awk '{print $5}'

mkdir -p "$ASSETS_DIR"
gzip --keep --force "$OUTPUT"
mv "$OUTPUT.gz" "$ASSETS_DIR/hugo_renderer.wasm.gz"
printf "Compressed renderer installed at $ASSETS_DIR/hugo_renderer.wasm.gz: "
ls -lh "$ASSETS_DIR/hugo_renderer.wasm.gz" | awk '{print $5}'
