# Dead Quarantine II Web

## Desarrollo local

1. Instala Node.js 20.9 o posterior.
2. Ejecuta `npm install`.
3. Configura las variables `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
   `MYSQL_PASSWORD` y `MYSQL_DATABASE` en el entorno.
4. Ejecuta `npm run dev` y abre `http://localhost:3000`.

La página está en `public/index.html`; las APIs se ejecutan en Next.js y usan la
conexión MySQL configurada por variables de entorno.

## Wasmer Edge

Despliega la raíz del repositorio como una app Next.js. Desde la raíz, inicia
sesión en Wasmer CLI y ejecuta `wasmer deploy`, o conecta este repositorio desde
el panel de Wasmer.

Configura `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` y
`MYSQL_DATABASE` como secretos/variables de entorno de la app con los datos de
la base MySQL existente. Rota primero la contraseña de MySQL que estaba en el
código anterior y guarda la nueva solamente en Wasmer; no la incluyas en Git.

Después del despliegue, valida `/`, `/api/ranking` y `/api/logros/globales`.
