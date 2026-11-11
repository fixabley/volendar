#!/bin/sh
# 웹 스토어 업로드용 zip을 만든다. 확장 실행에 필요한 파일만 넣는다.
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
out="dist/volendar-$version.zip"
mkdir -p dist
rm -f "$out"
zip -qr "$out" manifest.json src icons assets/logo.svg -x '*.DS_Store'
echo "$out"
