# Dead Quarantine II Web

Sitio web y API de **Dead Quarantine II**. El sitio publica las páginas del
juego y las APIs que conectan el cliente Unity con MySQL para autenticación,
usuarios, puntajes y logros.

## Contenido

- [Funciones y páginas](#funciones-y-páginas)
- [Tecnologías](#tecnologías)
- [Desarrollo local](#desarrollo-local)
- [Base de datos](#base-de-datos)
- [API](#api)
- [Pruebas](#pruebas)
- [Despliegue en Wasmer](#despliegue-en-wasmer)
- [Seguridad y solución de problemas](#seguridad-y-solución-de-problemas)

## Funciones y páginas

| Ruta | Descripción |
| --- | --- |
| `/` o `/index.html` | Portada e información del juego |
| `/ranking.html` | Ranking global con búsqueda, filtros y paginación |
| `/logros_globales.html` | Logros y sublogros con porcentajes globales |
| `/telemetria.html` | Dashboard de telemetría |

Las páginas están en `public/`. Consultan las APIs del mismo sitio; no se
conectan directamente a MySQL. La portada muestra el total de usuarios y la
cantidad de usuarios activos. Se considera activo a quien tenga un puntaje,
logro o sublogro registrado.

## Tecnologías

- Node.js 20.9 o posterior
- Next.js 16 y React 19
- MySQL mediante `mysql2`
- Google ID Token mediante `google-auth-library`
- Vitest para las pruebas

## Desarrollo local

1. Instala Node.js 20.9 o posterior.
2. Instala dependencias:

   ```sh
   npm install
   ```

3. Copia `.env.example` como `.env.local` y completa los valores de tu entorno.
   En PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   En macOS o Linux:

   ```sh
   cp .env.example .env.local
   ```

4. Inicia el servidor:

   ```sh
   npm run dev
   ```

5. Abre <http://localhost:3000>.

### Variables de entorno

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `MYSQL_HOST` | Sí | Host del servidor MySQL |
| `MYSQL_PORT` | Sí | Puerto MySQL |
| `MYSQL_USER` | Sí | Usuario de la base de datos |
| `MYSQL_PASSWORD` | Sí | Contraseña de MySQL |
| `MYSQL_DATABASE` | Sí | Base de datos |
| `MYSQL_SSL_CA` | No | Certificado CA PEM para validar TLS |
| `GOOGLE_CLIENT_ID` | Para Google | ID de cliente OAuth usado para verificar ID tokens |

`MYSQL_SSL_CA` puede contener el PEM con saltos de línea o `\n` escapados. La
aplicación convierte los saltos escapados y valida el certificado cuando se
proporciona la CA.

## Base de datos

La aplicación necesita una base MySQL ya provisionada. Los archivos de
`database/` son migraciones puntuales, no un esquema inicial completo. Antes de
desplegar, verifica que existan las tablas y columnas usadas por las APIs:

- `usuario`: `id_usuario`, `google_id`, `username`, `email`, `nivel`, `record`,
  `created_at` y `updated_at`.
- `ranking`: `id_ranking`, `id_usuario`, `puntos`, `modo`, `dificultad` y
  `creado_en`.
- `logro`, `sublogro`, `usuario_logro` y `usuario_sublogro`, con las claves y
  columnas consultadas por sus APIs.

`id_usuario` debe admitir IDs de texto: la autenticación de Google genera IDs
como `usr_...`, y el cliente del juego también puede enviar un ID como texto.
No configures esta columna únicamente como un entero autoincremental. El
`id_usuario` de `ranking` y de las tablas de progreso debe referenciar al mismo
ID de `usuario`.

### Unicidad de username

Ejecuta `database/add_unique_username.sql` una sola vez en la base actual. La
migración agrega un índice único sobre `LOWER(TRIM(username))`: no permite
duplicados que solo cambien en mayúsculas/minúsculas o espacios al principio o
al final. La API `POST /api/usuarios` también responde HTTP `409` si el nombre
ya está ocupado.

Si la tabla ya contiene usernames equivalentes, resuélvelos antes de aplicar la
migración. MySQL no podrá crear el índice mientras esos duplicados existan.
La migración no borra ni renombra cuentas automáticamente.

No ejecutes todas las migraciones a ciegas: algunos archivos modifican el
esquema anterior (`usuarios`, en plural), mientras que esta aplicación usa
`usuario`. Revisa cada archivo y confirma que corresponde al esquema de tu
base antes de aplicarlo.

## API

Todas las respuestas son JSON. Las APIs de escritura aceptan JSON con
`Content-Type: application/json`.

| Ruta | Método | Uso |
| --- | --- | --- |
| `/api/auth` | `POST` | Verifica un ID token de Google y busca o crea la cuenta |
| `/api/usuarios` | `GET` | Lista usuarios o consulta uno con `user_id` / `id_usuario` |
| `/api/usuarios` | `POST` | Crea o actualiza el username asociado a un ID |
| `/api/ranking` | `GET` | Ranking para Unity, posición por puntaje o vista tabular web |
| `/api/ranking` | `POST` | Registra un puntaje |
| `/api/logros/globales` | `GET` | Logros, sublogros y porcentajes globales |
| `/api/logros/desbloquear` | `POST` | Registra un sublogro completado |
| `/api/telemetria` | `GET` | Total y porcentaje de usuarios activos |

### Autenticación con Google

Envía el ID token obtenido por el cliente de Google:

```json
{ "id_token": "GOOGLE_ID_TOKEN" }
```

La respuesta incluye `usuario.id_local`, que es el ID que debe conservar el
juego para las siguientes solicitudes. El token debe corresponder al mismo
`GOOGLE_CLIENT_ID` configurado en el servidor.

### Actualizar el username

```json
{
  "id_usuario": "usr_...",
  "username": "Jugador"
}
```

También se acepta `user_id` en lugar de `id_usuario`. Los usernames tienen un
límite de 50 caracteres. Si el nombre ya pertenece a otro usuario, el endpoint
responde `409 Conflict`.

### Registrar un puntaje

Envía `id_usuario` (o `user_id`), `puntos` y, opcionalmente, `username`, `modo`
y `dificultad` a `POST /api/ranking`:

```js
await fetch('/api/ranking', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id_usuario: 'usr_...',
    username: 'Jugador',
    puntos: 1200,
    modo: 'multiplayer',
    dificultad: 'pesadilla'
  })
});
```

Los valores usados por el juego para modo son `singleplayer` y `multiplayer`;
las dificultades esperadas son `normal`, `dificil` y `pesadilla`. El ranking
guarda el ID del usuario y obtiene el username desde `usuario`, no duplica el
nombre en cada puntaje.

Para la respuesta simplificada del juego, consulta `GET /api/ranking` y, si
corresponde, envía `id_usuario` para obtener también el mejor puntaje propio.
La página web usa `GET /api/ranking?view=table`; acepta `page`, `limit` (máximo
100), `search`, `mode` o `modo` y `dificultad`. Para calcular la posición
preliminar de un puntaje, se puede enviar `score`.

### Registrar un sublogro

Envía el ID del usuario y la clave del sublogro a
`POST /api/logros/desbloquear`:

```json
{
  "id_local": "usr_...",
  "sublogro_clave": "clave_del_sublogro",
  "username": "Jugador"
}
```

También se acepta `id_usuario` en lugar de `id_local`. La clave debe existir en
la tabla `sublogro`. Al completar el rango final, la API registra el logro
principal correspondiente.

## Pruebas

Ejecuta todas las pruebas con:

```sh
npm test
```

Las pruebas usan una conexión MySQL simulada y no requieren credenciales ni
acceso a una base real.

## Despliegue en Wasmer

Despliega la raíz del repositorio como una aplicación Next.js con Wasmer CLI o
desde el panel de Wasmer. Configura como secretos/variables de entorno del
servicio:

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `GOOGLE_CLIENT_ID` si se habilita el inicio de sesión con Google
- `MYSQL_SSL_CA` si el servidor MySQL requiere una CA específica

Los secretos de Aiven no se transfieren automáticamente a Wasmer. Si usas Aiven,
configura su CA actual en `MYSQL_SSL_CA`; no desactives la verificación TLS para
resolver errores de certificado. Después de guardar variables, reinicia o
vuelve a desplegar la aplicación.

Tras el despliegue, comprueba `/`, `/api/telemetria`, `/api/ranking` y
`/api/logros/globales`. Una respuesta HTTP 200 del ranking debería incluir
registros con `username` y `puntos`.

## Seguridad y solución de problemas

- No guardes contraseñas, tokens ni certificados privados en el repositorio.
  `.env.local` está excluido de Git; `.env.example` debe contener solo valores
  de ejemplo.
- Si una variable de MySQL falta o es inválida, revisa los nombres y valores
  configurados en el entorno donde se ejecuta Next.js.
- Si falla la autenticación, confirma que `GOOGLE_CLIENT_ID` coincide con la
  audiencia del ID token.
- Si falla la migración de username, busca y resuelve primero nombres repetidos
  tras normalizar mayúsculas y espacios.
- Las tablas del esquema actual usan singular (`usuario`); las migraciones que
  mencionan `usuarios` pueden pertenecer a un esquema anterior.
