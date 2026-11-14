# Dead Quarantine II Web

## Desarrollo local

1. Instala Node.js 20.9 o posterior.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env.local` y reemplaza los valores de ejemplo con
   los datos de conexión de MySQL. `.env.local` está excluido de Git: no guardes
   credenciales reales en `.env.example` ni las subas al repositorio.
4. Ejecuta `npm run dev` y abre `http://localhost:3000`.

La portada está en `public/index.html`; el dashboard anterior de ranking y
logros se conserva en `public/telemetria.html` y se abre desde los accesos de
ranking y logros. Las APIs se ejecutan en Next.js y usan la conexión MySQL
configurada por variables de entorno.
La portada consulta `/api/telemetria` para mostrar el total de usuarios
registrados, la cantidad/porcentaje de usuarios con al menos un récord, logro o
sublogro, y los usuarios sin actividad registrada. Se consideran activos los
usuarios cuyo `id_usuario` tiene un récord en `ranking` o una fila en
`usuario_logro` o `usuario_sublogro`.

## Sincronización de usuarios del juego

La tabla `usuario` usa las columnas `id_usuario` (AUTO_INCREMENT), `username`,
`email`, `created_at` y `updated_at`. El inicio de sesión con Google busca la
cuenta por email y devuelve `id_usuario`; el juego debe conservar ese ID y
enviarlo al registrar nombres, puntajes y logros. La tabla `ranking` debe tener
únicamente `id_ranking` (AUTO_INCREMENT), `id_usuario`, `puntos`, `modo`,
`dificultad` y `creado_en`. `id_ranking` es un contador interno, no un conteo de
filas: MySQL puede dejar saltos tras eliminaciones, errores o escrituras
duplicadas anteriores. `id_usuario` guarda la clave primaria de `usuario` y es
obligatorio al registrar un puntaje. El nombre no se duplica en `ranking`: las
APIs lo leen de `usuario`.
Las migraciones SQL de `database/` que modifican `usuarios` pertenecen al
esquema anterior y no deben ejecutarse sobre esta tabla.
Para impedir usernames repetidos (ignorando mayúsculas y espacios al inicio o
al final), ejecuta `database/add_unique_username.sql` sobre la base actual. Si
ya existen nombres equivalentes, resuélvelos antes de aplicar la migración;
MySQL rechazará crear el índice mientras esos duplicados sigan presentes.
Modo y dificultad se guardan normalizados como `singleplayer` o `multiplayer`,
y `normal`, `dificil` o `pesadilla`, respectivamente. El país, la IP y el
estado de VPN no se guardan ni se ofrecen como filtros del ranking.

El juego puede actualizar el nombre con un `POST` a `/api/usuarios`, enviando
`{ "id_usuario": 1, "username": "Jugador" }`. Para desbloquear un logro, envía
`id_usuario` y `sublogro_clave` a `/api/logros/desbloquear`; el progreso queda
asociado a la clave primaria del usuario aunque cambie su nombre. Para guardar
una puntuación, envía `id_usuario`, `username`, `puntos`, `modo` y
`dificultad` a `/api/ranking`; el nombre se actualiza en `usuario` y no se
duplica en `ranking`. Por ejemplo, al terminar una partida:

```js
await fetch('/api/ranking', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id_usuario: 1,
    username: 'Jugador',
    puntos: 1200,
    modo: 'multiplayer',
    dificultad: 'pesadilla'
  })
});
```

Para registrar o iniciar sesión con Google, configura `GOOGLE_CLIENT_ID` con el
ID de cliente OAuth y envía el ID token a `POST /api/auth` como
`{ "id_token": "..." }`. La API verifica el token y el email, busca o crea la
cuenta en `usuario`, y devuelve `id_usuario` para usarlo en las siguientes
solicitudes. Al crear la cuenta, el username inicial es el email (hasta 50
caracteres).

La página web consulta `GET /api/ranking?view=table` y pagina los registros de
la base (hasta 100 filas por petición). Para conservar el comportamiento del
juego, este debe seguir consultando `GET /api/ranking` sin `view=table`: esa
respuesta mantiene el formato del top 5 y el récord personal del jugador.

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
`MYSQL_DATABASE`. Para la autenticación con Google, configura también
`GOOGLE_CLIENT_ID` con el ID de cliente OAuth. La aplicación los lee
directamente de `process.env`; los
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
