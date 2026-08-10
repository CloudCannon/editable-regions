#!/bin/bash
# Builds the Hugo renderer WASM and installs it (gzipped) into the Hugo
# module's static directory, where sites consuming the module serve it from.
set -e

cd "$(dirname "$0")"

OUTPUT="hugo_renderer.wasm"
STATIC_DIR="../hugo-module/static/cc-editable-regions"

GOOS=js GOARCH=wasm go build -tags nodeploy -ldflags="-s -w" -o "$OUTPUT"
printf "Built Hugo renderer WASM: "
ls -lh "$OUTPUT" | awk '{print $5}'

mkdir -p "$STATIC_DIR"
gzip --keep --force "$OUTPUT"
mv "$OUTPUT.gz" "$STATIC_DIR/hugo_renderer.wasm.gz"
printf "Compressed renderer installed at $STATIC_DIR/hugo_renderer.wasm.gz: "
ls -lh "$STATIC_DIR/hugo_renderer.wasm.gz" | awk '{print $5}'
