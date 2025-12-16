#!/bin/bash
set -e

echo "Building widget for CDN..."

# Navigate to widget package
cd "$(dirname "$0")/.."

# Build production bundle
yarn build

# Calculate sizes
ORIGINAL=$(wc -c < dist/widget.js | tr -d ' ')

# Check if gzip is available
if command -v gzip &> /dev/null; then
  GZIPPED=$(gzip -c dist/widget.js | wc -c | tr -d ' ')
else
  GZIPPED="N/A"
fi

echo ""
echo "Bundle size:"
echo "  Original: ${ORIGINAL} bytes"
echo "  Gzipped:  ${GZIPPED} bytes"
echo ""

# Check size budget (50KB = 51200 bytes)
MAX_SIZE=51200
if [ "$GZIPPED" != "N/A" ] && [ "$GZIPPED" -gt "$MAX_SIZE" ]; then
  echo "WARNING: Bundle exceeds 50KB budget!"
else
  echo "SUCCESS: Bundle within size budget"
fi

# Generate versioned filename
VERSION=$(node -p "require('./package.json').version")
HASH=$(shasum -a 256 dist/widget.js | cut -c 1-8)

cp dist/widget.js "dist/widget.${VERSION}.${HASH}.js"

echo ""
echo "Output files:"
echo "  dist/widget.js (latest)"
echo "  dist/widget.${VERSION}.${HASH}.js (versioned)"
