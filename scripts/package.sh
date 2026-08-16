#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
VERSION=$(node -p "require('./package.json').version")
rm -f "vero-detect-v${VERSION}.zip"
(cd dist && zip -qr "../vero-detect-v${VERSION}.zip" .)
echo "✔ vero-detect-v${VERSION}.zip"
