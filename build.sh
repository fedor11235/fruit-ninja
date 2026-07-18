#!/bin/sh
# Собирает dist/fruit-ninja.zip для загрузки в консоль Яндекс Игр.
set -e
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/fruit-ninja.zip
zip -j dist/fruit-ninja.zip index.html style.css game.js
echo "Готово: dist/fruit-ninja.zip"
