#!/bin/sh
# Assemble the static audit page for Cloudflare Pages: dist/web/audit/ with the shared core in lib/.
# The page is served at burnmeter.pages.dev/audit (deployed together with the landing page).
set -eu
cd "$(dirname "$0")/.."
rm -rf dist/web
mkdir -p dist/web/audit/lib
cp web/audit/index.html web/audit/app.js web/audit/audit.css dist/web/audit/
cp src/audit/csv.js src/audit/sources.js src/audit/audit.js src/audit/sample.js dist/web/audit/lib/
echo "built dist/web/audit"
