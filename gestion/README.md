# Central SILA · gestión + experiencia

Capas 2 y 3 de `SiliconAccess_2.docx`: la app propia que reemplaza Monday.com y la medición de experiencia.
Vanilla HTML/CSS/JS, sin build. **Sin datos de ejemplo**: todo lo que se ve entró por el chat de residentes.
Lo único simulado son los envíos (WhatsApp, email formal, pedido de reseña): se muestran rotulados SIMULADO y no sale nada.

## Conexión
- Lee `../js/config.js → SILA_CONFIG.ayuda.backendUrl` (Apps Script, `backend/ayuda-casos.gs`). Vacío → "Falta conectar el backend" y no muestra nada.
- `POST` con `Content-Type: text/plain;charset=utf-8` (sin preflight). Acciones:
  `central_estado`, `central_crear_clave`, `login`, `yo`, `logout`, `clave_cambiar`, `usuarios_listar`, `usuario_guardar`, `usuario_baja`, `casos_listar` (con `desde`), `caso_actualizar`, `kv_get`, `kv_set` (todas con `token`).
- **Usuarios**: la primera clave que se crea es la de Dirección (usuario `direccion`). Después cada persona entra con su usuario y su clave (`login` → token que vence a las 6 h sin uso en `localStorage.sila_central_token`; la clave no se guarda). "Mi cuenta" cambia la clave propia; "Salir" cierra la sesión.
  - El rol y los barrios los da el servidor (`yo`). "Ver como" queda sólo para Dirección, como vista previa.
  - Config → Usuarios (sólo Dirección): crear (nombre, usuario, rol, barrios, clave inicial), editar, resetear clave y dar de baja (se le corta la sesión).
  - Como `usuarios_listar` es sólo de Dirección, Dirección publica en `sila_central_cfg.equipo` un directorio sin claves para que los operadores asignen técnicos.
- **Casos**: refresco cada 9 s con `desde`. `BroadcastChannel('sila-demo')` sólo adelanta el refresco.
  - `derivado_central === 'sí'` → ticket con consulta, pasos intentados, fuentes y contacto. Se anota `monday_ticket` en el caso.
  - Cerrar el ticket → `caso_actualizar {estado:'resuelto', resultado}`.
  - Casos que resolvió el bot → encuesta por WhatsApp (simulada) y métrica "Resueltos por el bot".
  - Barrios y lotes se dan de alta solos con lo que escribe el residente (Dirección puede renombrarlos o unir duplicados).
- **Estado compartido** (`kv_set` con versión, ~1 s de espera; ante `conflicto` se re-aplican los cambios pendientes):
  - `sila_central_cfg`: categorías, umbral, barrios `{id, nombre, alias, google}` y directorio del equipo. La leen todos; la escribe Dirección.
  - `sila_central_b_<barrio>_tickets|encuestas|alertas`: lo de cada barrio. Dirección carga todos; operador y técnico, sólo los suyos.
  - El id de ticket sale del caso (`RES-ABC123` → `TK-ABC123`): no hace falta un contador global.
  - Los barrios se dan de alta con lo que escribe el residente y esa forma queda como alias (el servidor filtra los casos por nombre o alias).
  - Migración única: si `sila_central_cfg` no existe, Dirección pasa las claves de la versión anterior (`sila_central_tickets`, `_config`, `_barrios`, …) a la estructura nueva.
- Indicador arriba: "Conectado · actualizado hace X s" / "Sin conexión".

## Qué carga Dirección (Config.)
- Categorías de SLA (nombre, horas, palabras clave para categorizar solo). Hay un atajo para los dos plazos del contrato: barrera caída 2 h, cambio de datos 24 h. Sin categoría el semáforo queda en gris.
- Umbral de alerta (75 % por defecto).
- Barrios: nombre, perfil de Google (link, calificación, cantidad de reseñas) y "es el mismo que…" para unificar.

## Vistas
Tickets (semáforo SLA, alerta al umbral, vencido → Dirección) · Lotes (historial consolidado: tickets + consultas del chat del mismo lote) · Experiencia (CSAT/NPS, detractores con protocolo, pedidos de reseña) · Reputación por barrio · Config.
