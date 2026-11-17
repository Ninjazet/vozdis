# REALMS VOZ — Sala privada para Minecraft Bedrock

Una web en español para 20 amigos. **Solo el propietario crea cuentas**: cada jugador entra con **usuario y contraseña**, sin correo ni registro público. Diseño adaptable a móvil y PC.

## Qué incluye

- Inicio de sesión por nombre y contraseña.
- Una sala compartida de voz, micrófono, silenciar, salir y lista de conectados.
- Panel del administrador para **crear hasta 20 cuentas**, cambiar contraseñas y borrar cuentas.
- Las contraseñas de los jugadores se guardan con hash `scrypt`; el navegador recibe cookies `HttpOnly`.
- Ningún secreto de Supabase o LiveKit se expone al navegador.
- No incluye cámara, mensajes, canales adicionales, registro público ni complementos de Minecraft.

## Requisitos (una vez, para el propietario)

1. Cuenta de **GitHub**, para subir el código.
2. Cuenta de **Vercel** o **Netlify**, para alojar la web.
3. Proyecto en **Supabase**, para guardar los usuarios.
4. Proyecto de **LiveKit Cloud**, para transportar el audio.

**Los jugadores no necesitan ninguna de estas cuentas.** Solo entran a tu enlace y usan las credenciales que tú creaste.

### Configuración paso a paso

1. Descomprime el ZIP. Abre **Supabase**: https://supabase.com/ y crea un proyecto.
2. En `SQL Editor`, pega y ejecuta el contenido de `schema.sql`. No crees usuarios directamente en la tabla: usa el panel de la web.
3. En ajustes/API del proyecto copia `SUPABASE_URL` y una clave **secret** (o `service_role` de versiones anteriores). Esta clave **solo** debe guardarse como variable del servidor.
4. En https://cloud.livekit.io/ crea un proyecto y copia `LIVEKIT_URL` (de tipo `wss://`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
5. Sube todos los archivos descomprimidos a un repositorio **privado** de GitHub. **No subas `.env.local` ni contraseñas**.
6. En https://vercel.com/ importa el repositorio como proyecto Next.js. En `Settings > Environment Variables` configura:

   | Variable | Valor |
   |---|---|
   | `ADMIN_USERNAME` | tu nombre de administrador (3 a 20 letras/números/guiones) |
   | `ADMIN_PASSWORD` | contraseña larga para tu cuenta administrativa |
   | `SESSION_SECRET` | al menos 32 caracteres aleatorios distintos a tu contraseña |
   | `SUPABASE_URL` | URL del proyecto de Supabase |
   | `SUPABASE_SECRET_KEY` | clave secreta del servidor de Supabase (o usa `SUPABASE_SERVICE_ROLE_KEY`) |
   | `LIVEKIT_URL` | URL `wss://` de LiveKit |
   | `LIVEKIT_API_KEY` | API key de LiveKit |
   | `LIVEKIT_API_SECRET` | secreto de esa key |

7. Despliega con **Deploy**; si agregaste las variables después del primer despliegue, realiza **Redeploy**.
   - **Si prefieres Netlify**: importa el mismo repositorio en https://app.netlify.com/ (incluye `netlify.toml`), agrega exactamente las mismas 7 variables en `Site configuration > Environment variables` y despliega.
8. Entra con `ADMIN_USERNAME` y `ADMIN_PASSWORD`. Verás el panel de jugadores, donde podrás crear sus cuentas y repartirles nombre/clave por privado.
9. Prueba la sala con **dos teléfonos** (y prueba cambiar a Minecraft durante una llamada) antes de anunciarla al grupo.

> Si recibes un error de base de datos, revisa que ejecutaste `schema.sql` y que la clave de Supabase sea **secret**/`service_role` (nunca la pública/anon).

### Prueba local (opcional)

Requiere Node.js 20 o más reciente.

```bash
npm install
cp .env.example .env.local
# Edita .env.local con tus credenciales
npm run dev
```

Abre http://localhost:3000

## Límites importantes

- **El audio puede detenerse en segundo plano.** En Android y, especialmente, iPhone, el navegador puede dejar de transmitir el micrófono al abrir Minecraft. No hay ajuste de Vercel que garantice lo contrario. Una PWA no lo soluciona automáticamente.
- La página de Vercel puede recibir visitantes sin que estés conectado, pero las cuentas y el audio dependen de **Supabase** y **LiveKit**, que tienen cuotas y condiciones propias. En planes gratuitos pueden existir pausas o límites; revisa sus condiciones actuales.
- No hace falta mantener un servidor casero encendido; LiveKit gestiona la comunicación y solo hay sala cuando la ocupan usuarios.
- Al eliminar una cuenta, ya no podrá volver a entrar y el servidor intenta desconectarla de la sala de voz activa. Si solo cambias su contraseña, su sesión web actual sigue abierta hasta que salga o caduque (salvo que rotes `SESSION_SECRET`).
- Los administradores también pueden entrar a hablar. Las sesiones de la web duran hasta 7 días.
- Esta versión es un proyecto listo para **configurar y desplegar**, no un servicio ya alojado. Necesita las credenciales externas anteriores.

## Seguridad sencilla

- Sin registro público.
- Las contraseñas de amigos se almacenan con `scrypt`.
- Base de datos con políticas RLS y acceso privado desde el servidor.
- Cookies de sesión firmadas, con `HttpOnly`, `SameSite=Lax`, HTTPS en producción.
- No reveles las claves de Supabase o LiveKit ni publiques `.env.local`.
- Si cambias `SESSION_SECRET`, todas las sesiones iniciadas se invalidan.
- Esta plantilla no incluye protección avanzada contra fuerza bruta; emplea claves no evidentes y, si abres el servicio a más personas, agrega limitación de intentos.

## Documentación útil

- Vercel: https://vercel.com/docs/frameworks/full-stack/nextjs
- Supabase: https://supabase.com/docs/guides/api/securing-your-api
- LiveKit: https://docs.livekit.io/home/server/generating-tokens/
