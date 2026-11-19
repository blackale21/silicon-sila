# SILA Ayuda: cómo avisarle al chat que la persona ya inició sesión

El chat de ayuda tiene dos modos:

| Modo | Qué responde |
|---|---|
| **Sin sesión** (por defecto) | Solo cómo **ingresar** a la cuenta de Silicon Access, en la app o en la web: las fichas de *Acceso y contraseña* y de *Invitación y registración*. Si preguntan otra cosa, les pide que entren primero y les ofrece que la central los contacte. |
| **Con sesión** | Toda la ayuda de los manuales de residentes. El material de Guardia está apagado en los dos modos. |

El chat **no puede leer la cuenta de Silicon por su cuenta**: lo tiene que avisar la web o la app donde está puesto. Cualquiera de estas tres formas funciona:

1. **Link con parámetro**: el chat que se muestra dentro de la web/app ya logueada se abre con `?sesion=1`
   (ej. `https://…/index.html?ayuda=1&sesion=1`). El de la pantalla de login va sin el parámetro.
2. **Variable antes de cargar el chat**: `window.SILA_SESION = true;`
3. **Aviso de la página que lo contiene** (si el chat va en un iframe o WebView):
   ```js
   chatIframe.contentWindow.postMessage({ type: 'sila-sesion', logueado: true }, '*');   // al iniciar sesión
   chatIframe.contentWindow.postMessage({ type: 'sila-sesion', logueado: false }, '*');  // al cerrar sesión
   ```

## Seguridad

Estas formas **no son una verificación**: alguien que conozca el parámetro puede abrir el modo completo. Hoy no es un problema,
porque el chat solo explica los manuales de residentes (nada personal ni privado). Si más adelante hace falta que no se pueda
falsificar, Silicon tendría que mandar un *token firmado* que el servidor del chat verifique.

## Mientras tanto (pruebas)

En el encabezado del chat hay un botón **PRUEBA · Sin sesión / Con sesión** para simular los dos modos.
Se oculta poniendo `simularSesion: false` en `js/config.js` cuando Silicon conecte el aviso real.

Cada consulta queda registrada con el modo. En la central, las que llegaron sin sesión preguntando otro tema aparecen como
**"Sin sesión · otro tema"**, y tienen su propio filtro en la pestaña Chats.
