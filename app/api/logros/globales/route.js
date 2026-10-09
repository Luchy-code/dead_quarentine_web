import { getPool } from '../../../../lib/mysql';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pool = getPool();
    const [[{ total_usuarios }]] = await pool.query(
      'SELECT COUNT(*) AS total_usuarios FROM usuarios'
    );

    const [logros] = await pool.query(
      `SELECT
        l.id, l.clave, l.titulo, l.descripcion, l.categoria, l.modo, l.sublogros_requeridos,
        COUNT(DISTINCT ul.usuario_id) AS completados_global,
        ROUND((COUNT(DISTINCT ul.usuario_id) * 100.0) / NULLIF(?, 0), 1) AS porcentaje_global
      FROM logros l
      LEFT JOIN usuario_logros ul ON l.id = ul.logro_id
      GROUP BY l.id, l.clave, l.titulo, l.descripcion, l.categoria, l.modo, l.sublogros_requeridos
      ORDER BY l.id ASC`,
      [total_usuarios]
    );

    const [sublogros] = await pool.query(
      `SELECT
        s.id, s.logro_id, s.clave, s.titulo, s.orden,
        COUNT(DISTINCT us.usuario_id) AS completados_global,
        ROUND((COUNT(DISTINCT us.usuario_id) * 100.0) / NULLIF(?, 0), 1) AS porcentaje_global
      FROM sublogros s
      LEFT JOIN usuario_sublogros us ON s.id = us.sublogro_id
      GROUP BY s.id, s.logro_id, s.clave, s.titulo, s.orden
      ORDER BY s.logro_id ASC, s.orden ASC`,
      [total_usuarios]
    );

    const data = logros.map((logro) => ({
      ...logro,
      sublogros: sublogros.filter((sublogro) => sublogro.logro_id === logro.id)
    }));

    return Response.json({ total_usuarios, logros: data });
  } catch (error) {
    console.error('Error al obtener logros:', error);
    return Response.json({ error: 'Error al obtener logros' }, { status: 500 });
  }
}
