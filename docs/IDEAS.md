# SILA — Canal de ingreso de leads para silicon-access.com

## Concepto: "Tu ingreso"
El formulario ES un control de acceso. Cada pregunta es un **checkpoint** con barrera:
respondés → la barrera sube → pasás al siguiente. Al final se **emite tu pase**
(credencial con tus datos) = el lead calificado.

- **Intro** (≈3 s, saltable, 1 vez por sesión): un haz de escaneo barre la pantalla,
  las 7 piezas del isotipo de Silicon (5 bloques + 2 chaflanes) entran y se traban,
  "ACCESO VERIFICADO", y la cámara atraviesa el bloque central → arranca la 1ª pregunta.
- **Ruta de checkpoints** arriba: los siguientes aparecen bloqueados y borrosos
  (candado) → da curiosidad por ver qué viene.
- **Log de eventos** estilo consola de guardia: "✓ INGRESO REGISTRADO · 300–600 lotes".
- **Tu pase** se arma en vivo al costado (PC) / en un cajón inferior (celular).
- **Cada opción = tarjeta con ilustración propia** (vectorial, estilo plano de obra
  + bloque azul del logo). Los rangos se dibujan como densidad (más lotes = más casitas).
- Fin: pase emitido con número, patrón tipo QR y "un asesor te contacta en 24 hs hábiles"
  + botón opcional a WhatsApp con el resumen.

## Por qué así (y no un chat)
Un chat con burbujas es lo genérico. El flujo SILA es de opciones cerradas: la tarjeta
visual es más rápida en celular (1 toque) y el "pase" convierte el formulario en algo
que el usuario quiere completar.

## Arquitectura 100% gratis
| Pieza | Opción gratis | Nota |
|---|---|---|
| Front | HTML/CSS/JS puro, sin build | ~1 archivo HTML + 4 JS |
| Hosting | GitHub Pages o Cloudflare Pages | dominio propio opcional (`sila.silicon-access.com`) |
| Integración web | `embed/launcher.js` en Webflow (Footer code) | botón flotante + engancha "CONTACTANOS"/"SOLICITÁ UNA DEMO" → overlay a pantalla completa |
| Destino del lead | **HubSpot Forms API** (CRM gratis, sin token) | el flujograma ya dice "pasa a HubSpot" |
| Respaldo | Google Apps Script → Google Sheet + mail | `backend/apps-script.gs` |
| Aviso inmediato | mail del Apps Script / link WhatsApp (wa.me) | sin costo |

Extra sin costo: captura UTM/referrer, "temperatura" del lead (frío/tibio/caliente) para
priorizar, y anti-spam con honeypot + tiempo mínimo.

## Preguntas abiertas (el proyecto avanza con defaults)
1. ¿Tienen HubSpot? (portalId + formGuid) → default: Apps Script + Sheet.
2. ¿Botón flotante en todo el sitio, o sólo enganchar CONTACTANOS/DEMO? → default: ambos.
3. ¿Número de WhatsApp comercial para el cierre? → default: oculto.
4. Los nodos de nombre dicen "Para terminar…" pero después siguen N3/N4/contacto.
   ¿Lo cambiamos a "Antes de seguir…"? → default: texto original del flujograma.
