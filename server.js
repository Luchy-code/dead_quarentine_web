const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/ranking.html', (req, res) => res.redirect(302, '/?view=ranking'));
app.get('/logros_globales.html', (req, res) => res.redirect(302, '/?view=logros'));

app.use(express.static(path.join(__dirname, 'public')));

// Pool de conexión a MySQL (Aiven)
const pool = mysql.createPool({
  host: 'mysql-dq-lucianaoviedodanielawanuffelen-ec30.i.aivencloud.com',
  port: 26286, 
  user: 'avnadmin',
  password: 'AVNS_zoHBjnhG6qlbKErOaKN',
  database: 'defaultdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

// 1. Endpoint: Matriz de Logros y Sublogros con Estadísticas Globales
app.get('/api/logros/globales', async (req, res) => {
  try {
    const [[{ total_usuarios }]] = await pool.query('SELECT COUNT(*) AS total_usuarios FROM usuarios');

    // Obtener logros principales y porcentaje de desbloqueo
    const [logros] = await pool.query(`
      SELECT 
        l.id, l.clave, l.titulo, l.descripcion, l.categoria, l.modo, l.sublogros_requeridos,
        COUNT(DISTINCT ul.usuario_id) AS completados_global,
        ROUND((COUNT(DISTINCT ul.usuario_id) * 100.0) / NULLIF(?, 0), 1) AS porcentaje_global
      FROM logros l
      LEFT JOIN usuario_logros ul ON l.id = ul.logro_id
      GROUP BY l.id, l.clave, l.titulo, l.descripcion, l.categoria, l.modo, l.sublogros_requeridos
      ORDER BY l.id ASC
    `, [total_usuarios]);

    // Obtener sublogros y su porcentaje individual
    const [sublogros] = await pool.query(`
      SELECT 
        s.id, s.logro_id, s.clave, s.titulo, s.orden,
        COUNT(DISTINCT us.usuario_id) AS completados_global,
        ROUND((COUNT(DISTINCT us.usuario_id) * 100.0) / NULLIF(?, 0), 1) AS porcentaje_global
      FROM sublogros s
      LEFT JOIN usuario_sublogros us ON s.id = us.sublogro_id
      GROUP BY s.id, s.logro_id, s.clave, s.titulo, s.orden
      ORDER BY s.logro_id ASC, s.orden ASC
    `, [total_usuarios]);

    // Anidar sublogros dentro de cada logro
    const data = logros.map(logro => ({
      ...logro,
      sublogros: sublogros.filter(s => s.logro_id === logro.id)
    }));

    res.json({ total_usuarios, logros: data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener logros' });
  }
});

// 2. Endpoint: Ranking Global con Filtros
app.get('/api/ranking', async (req, res) => {
  try {
    const { country, mode, vpnOnly, search } = req.query;
    let query = 'SELECT id, username, puntos, modo, ip, pais, codigo_pais, usa_vpn, creado_en FROM ranking WHERE 1=1';
    const params = [];

    if (country && country !== 'ALL') {
      query += ' AND codigo_pais = ?';
      params.push(country);
    }
    if (mode && mode !== 'ALL') {
      query += ' AND modo = ?';
      params.push(mode);
    }
    if (vpnOnly === 'true') {
      query += ' AND usa_vpn = 0';
    }
    if (search) {
      query += ' AND username LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY puntos DESC LIMIT 100';

    const [filas] = await pool.query(query, params);
    res.json(filas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener ranking' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en http://localhost:${PORT}`));