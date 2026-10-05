#!/bin/sh
# Package the files Chrome needs (no tests, no scripts) into dist/ for Web Store upload.
set -e
cd "$(dirname "$0")/.."
v=$(node -p "require('./manifest.json').version")
[ "$v" = "$(node -p "require('./package.json').version")" ] || { echo "manifest.json and package.json versions differ"; exit 1; }
mkdir -p dist
out="dist/burnmeter-extension-$v.zip"
rm -f "$out"
zip -qr "$out" manifest.json LICENSE icons src
echo "$out"
