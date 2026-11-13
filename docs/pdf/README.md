# Fuente del PDF

1. Servidor local en la raíz (puerto 8340).
2. `node capture.js out` (puppeteer-core + Chrome) genera las capturas; copiarlas a `img/` junto a `sila.html`.
3. `node render.js ../SILA_pantallazo.pdf` arma el PDF (16:9, vínculos internos).
