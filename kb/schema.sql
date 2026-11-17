-- Base de conocimiento del asistente de ayuda a residentes (SILA Ayuda).
-- SQL estándar (TEXT/INTEGER, sin tipos propios de SQLite) para poder migrar
-- a PostgreSQL / MySQL copiando el DDL. Ver kb/README.md.

CREATE TABLE kb_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Un registro por documento ÚNICO (deduplicado por sha256).
CREATE TABLE documents (
  id             TEXT PRIMARY KEY,        -- sha256[:12] del archivo
  title          TEXT NOT NULL,           -- nombre legible del manual
  module         TEXT NOT NULL,           -- módulo (Paquetería, Timbre Virtual…)
  audience       TEXT NOT NULL,           -- residente | administracion | admin_guardia | general
  version_label  TEXT,                    -- fecha/versión que figura en el nombre, si la hay
  file_name      TEXT NOT NULL,
  mime           TEXT NOT NULL,
  pages          INTEGER NOT NULL,
  sha256         TEXT NOT NULL UNIQUE,
  bytes          INTEGER NOT NULL,
  drive_ids      TEXT NOT NULL,           -- JSON: ids de Drive con este mismo contenido
  drive_paths    TEXT NOT NULL,           -- JSON: carpetas de origen
  drive_modified TEXT,
  text_status    TEXT NOT NULL            -- ok | ocr | sin_texto
);

-- Fragmento citable: una página (PDF) o una sección (DOCX).
CREATE TABLE chunks (
  id       INTEGER PRIMARY KEY,
  doc_id   TEXT NOT NULL REFERENCES documents(id),
  page     INTEGER,                       -- nº de página (NULL en DOCX)
  section  TEXT,                          -- título de la página/sección
  ord      INTEGER NOT NULL,
  text     TEXT NOT NULL,                 -- texto literal del manual (limpio)
  image    TEXT                           -- captura de la página (ruta relativa)
);
CREATE INDEX chunks_doc ON chunks(doc_id, ord);

-- Fichas de respuesta en tono humano, redactadas a partir de los manuales.
-- Cada paso guarda el fragmento y la cita LITERAL que lo respalda (validado por check_cards.py),
-- más los círculos rojos (coordenadas 0..1 sobre la captura de la página) y el recorte a mostrar.
CREATE TABLE cards (
  id      TEXT PRIMARY KEY,
  module  TEXT NOT NULL,
  title   TEXT NOT NULL,
  ask     TEXT NOT NULL,                  -- JSON: formas en que lo pregunta un residente
  intro   TEXT NOT NULL,
  body    TEXT NOT NULL                   -- JSON: { steps: [...], tips: [...] }
);

-- Modelo de casos para cuando haya backend propio (hoy los casos viven en la
-- Google Sheet vía Apps Script y, en la demo, en el navegador). Vacías en el build.
CREATE TABLE cases (
  id           TEXT PRIMARY KEY,          -- RES-XXXXXX
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  status       TEXT NOT NULL,             -- abierto | pendiente | resuelto
  problem      TEXT NOT NULL,
  module       TEXT,
  barrio       TEXT,
  residente    TEXT,
  lote         TEXT,
  celular      TEXT,
  correo       TEXT,
  escalated    TEXT NOT NULL DEFAULT 'no' -- no | enviado | error
);
CREATE TABLE case_events (
  id       INTEGER PRIMARY KEY,
  case_id  TEXT NOT NULL REFERENCES cases(id),
  at       TEXT NOT NULL,
  kind     TEXT NOT NULL,                 -- consulta | aclaracion | respuesta | confirmacion | derivacion
  detail   TEXT NOT NULL,
  chunk_id INTEGER REFERENCES chunks(id)  -- fragmento citado, si corresponde
);
