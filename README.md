# Dead Quarantine II Web

## Desarrollo local

1. Instala Node.js 20.9 o posterior.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env.local` y reemplaza los valores de ejemplo con
   los datos reales de la base de datos MySQL. No subas `.env.local` a Git.
4. Ejecuta `npm run dev` y abre `http://localhost:3000`.

La página está en `public/index.html`; las APIs se ejecutan en Next.js y usan la
conexión MySQL configurada por variables de entorno.

## Sincronización de usuarios del juego

Antes de desplegar las rutas actualizadas, ejecuta una vez
`database/add_external_user_id.sql` en la base MySQL. La migración agrega el
identificador externo `user_id` a `usuarios` y `ranking` sin cambiar los IDs
internos existentes.

El juego puede registrar o actualizar el nombre de un usuario con un `POST` a
`/api/usuarios`, enviando `{ "user_id": "id-externo", "username": "Jugador" }`.
Las nuevas puntuaciones pueden enviar también `user_id` a `/api/ranking`; así
las actualizaciones de nombre se reflejan en sus registros históricos.

## Pruebas

Ejecuta `npm test` para probar las APIs con una base de datos simulada, la
configuración de MySQL, las redirecciones y las interacciones de las páginas
HTML/CSS/JavaScript. Las pruebas no necesitan credenciales ni conexión a MySQL.

## Wasmer Edge

Despliega la raíz del repositorio como una app Next.js. Desde la raíz, inicia
sesión en Wasmer CLI y ejecuta `wasmer deploy`, o conecta este repositorio desde
el panel de Wasmer.

Configura `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` y
`MYSQL_DATABASE` como secretos/variables de entorno de la app con los datos de
la base MySQL existente. Rota primero la contraseña de MySQL que estaba en el
código anterior y guarda la nueva solamente en Wasmer; no la incluyas en Git.

Después del despliegue, valida `/`, `/api/ranking` y `/api/logros/globales`.
