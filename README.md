# Dead Quarantine II Web

## Desarrollo local

1. Instala Node.js 20.9 o posterior.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env.local` y reemplaza los valores de ejemplo con
   los datos de conexión de MySQL. `.env.local` está excluido de Git: no guardes
   credenciales reales en `.env.example` ni las subas al repositorio.
4. Ejecuta `npm run dev` y abre `http://localhost:3000`.

La página está en `public/index.html`; las APIs se ejecutan en Next.js y usan la
conexión MySQL configurada por variables de entorno.

## Sincronización de usuarios del juego

Antes de desplegar las rutas actualizadas, ejecuta una vez
`database/add_external_user_id.sql` en la base MySQL. La migración agrega el
identificador externo `user_id` a `usuarios` y `ranking` sin cambiar los IDs
internos existentes.

Para guardar dificultad por partida, ejecuta también una vez
`database/add_ranking_difficulty.sql`. El ranking mostrará modo y dificultad
desde cada registro guardado en la base.

El juego puede registrar o actualizar el nombre de un usuario con un `POST` a
`/api/usuarios`, enviando `{ "user_id": "id-externo", "username": "Jugador" }`.
Las nuevas puntuaciones pueden enviar `user_id`, `modo` y `dificultad` a
`/api/ranking`; así las actualizaciones de nombre se reflejan en sus registros
históricos. Por ejemplo, al terminar una partida:

```js
await fetch('/api/ranking', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'id-externo',
    username: 'Jugador',
    puntos: 1200,
    modo: 'Horda',
    dificultad: 'Pesadilla'
  })
});
```

## Pruebas

Ejecuta `npm test` para probar las APIs con una base de datos simulada, la
configuración de MySQL, las redirecciones y las interacciones de las páginas
HTML/CSS/JavaScript. Las pruebas no necesitan credenciales ni conexión a MySQL.

## Wasmer Edge

Despliega la raíz del repositorio como una app Next.js. Desde la raíz, inicia
sesión en Wasmer CLI y ejecuta `wasmer deploy`, o conecta este repositorio desde
el panel de Wasmer.

En la configuración del servicio web de Wasmer, crea secretos/variables de
entorno con estos nombres exactos y los valores de conexión del servicio MySQL
de Aiven: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` y
`MYSQL_DATABASE`. La aplicación los lee directamente de `process.env`; los
secretos de Aiven no se comparten automáticamente con Wasmer. Para verificar el
certificado TLS de Aiven, configura además `MYSQL_SSL_CA` con el contenido de su
certificado CA. En `.env.local`, encierra el certificado PEM completo entre
comillas dobles para conservar los saltos de línea; en Wasmer, pega el PEM
completo como secreto multilínea o usa `\n` entre las líneas. La aplicación
convierte los `\n` escapados y verifica la cadena del certificado cuando se
configura la CA. Si el certificado no se valida, descarga la CA actual desde
Aiven y actualiza `MYSQL_SSL_CA`; no desactives la verificación TLS.

Guarda los secretos en Wasmer y reinicia o vuelve a desplegar el servicio para
que Node.js los reciba. No agregues credenciales al código ni a `.env.example`.
Si alguna contraseña real estuvo guardada en un archivo del proyecto, rótala
en Aiven antes de desplegar.

Después del despliegue, valida `/`, `/api/ranking` y `/api/logros/globales`.
`GET /api/ranking` debe devolver registros con `username` y `puntos`; una
respuesta HTTP 200 que sólo contenga usuarios no confirma que el ranking
actualizado esté desplegado.
