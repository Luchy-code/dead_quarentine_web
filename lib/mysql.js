import mysql from 'mysql2/promise';

let pool;

export function getPool() {
  if (pool) {
    return pool;
  }

  const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno de MySQL: ${missing.join(', ')}`);
  }

  const port = Number(process.env.MYSQL_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MYSQL_PORT debe ser un puerto válido.');
  }

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }
  });

  return pool;
}
