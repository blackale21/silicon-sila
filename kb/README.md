# Base de conocimiento de SILA Ayuda

El asistente para residentes responde **sólo** con fragmentos literales de estos manuales.

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `sila_kb.sqlite` | Base SQLite (≈200 KB): `documents`, `chunks` (un fragmento por página), `kb_meta`. La lee el navegador con sql.js. |
| `pages/*.webp` | Captura de cada página, para el botón “Ver página del manual”. |
| `schema.sql` | DDL estándar (TEXT/INTEGER). Incluye `cases` y `case_events` vacías para cuando haya backend propio. |
| `ocr/` | OCR curado del único manual que era sólo imagen (ver `ocr/LEEME.txt`). |
| `tools/drive_fetch.py` | Baja recursivamente las carpetas de Drive compartidas por link → `src/` + `manifest.json`. |
| `tools/build_kb.py` | Arma la base: deduplica por sha256, extrae texto por página, detecta módulo y público (R = residentes, A = administración, AyG = admin y guardia). |
| `tools/ocr_win.ps1` | OCR con el motor nativo de Windows (sin instalar nada). |
| `src/` | Originales bajados de Drive. **No se versiona** (186 MB). |

## Actualizar cuando cambian los manuales

```bash
python kb/tools/drive_fetch.py 1tR5ULdNjxDRF6xu5pcgYUOPp6WziCWSH 1ctFcIcnd9Iw1SdgcmwLz3sfEQFdoXRIs
python kb/tools/build_kb.py
```

## Migrar a otro motor

- **PostgreSQL / MySQL:** ejecutar `schema.sql` tal cual y copiar filas (`sqlite3 kb/sila_kb.sqlite .dump` o un script). Para búsqueda en el servidor: `tsvector` en Postgres o FTS5 en SQLite.
- El front sólo necesita `documents` y `chunks`. Si se mueve a una API, reemplazar `load()` de `js/ayuda/kb.js` por un `fetch` que devuelva las mismas columnas.
- Los casos hoy viven en la Google Sheet (vía `backend/ayuda-casos.gs`); `cases` / `case_events` tienen el mismo modelo para cuando se pasen a base propia.
