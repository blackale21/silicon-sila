#!/bin/sh
# Compila la mascota a ../js/mascota.js (IIFE minificado, sin dependencias en runtime).
# El modelo ../assets/sila-mascota.glb sale de C:\Users\O-O\sila-avatar-vida (build_web_glb.sh).
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --no-audit --no-fund
npx esbuild src/mascota.js --bundle --minify --format=iife --target=es2020 --legal-comments=eof --outfile=../js/mascota.js
ls -la ../js/mascota.js
