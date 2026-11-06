import { getPool } from '../../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

export async function GET() {
  try {
    const pool = getPool();

    // 1. Total de usuarios registrados para calcular porcentajes
    const [[{ total_usuarios }]] = await pool.query(
      'SELECT COUNT(*) AS total_usuarios FROM usuario'
    );

    const totalJugadores = Number(total_usuarios) || 0;

    // 2. Consulta de logros principales con su porcentaje global
    const [logros] = await pool.query(
      `SELECT
        l.id_logro,
        l.nombre,
        l.descripcion,
        l.categoria,
        l.modo,
        COUNT(DISTINCT ul.id_usuario) AS completados_global,
        IF(? > 0, ROUND((COUNT(DISTINCT ul.id_usuario) * 100.0) / ?, 1), 0.0) AS porcentaje_global
      FROM logro l
      LEFT JOIN usuario_logro ul ON l.id_logro = ul.id_logro
      GROUP BY l.id_logro, l.nombre, l.descripcion, l.categoria, l.modo
      ORDER BY l.id_logro ASC`,
      [totalJugadores, totalJugadores]
    );

    // 3. Consulta de sublogros con sus porcentajes individuales
    const [sublogros] = await pool.query(
      `SELECT
        s.id_sublogro,
        s.id_logro,
        s.sublogro_clave,
        s.rango,
        s.nombre,
        s.objetivo_cantidad,
        COUNT(DISTINCT us.id_usuario) AS completados_global,
        IF(? > 0, ROUND((COUNT(DISTINCT us.id_usuario) * 100.0) / ?, 1), 0.0) AS porcentaje_global
      FROM sublogro s
      LEFT JOIN usuario_sublogro us ON s.id_sublogro = us.id_sublogro AND us.completado = TRUE
      GROUP BY s.id_sublogro, s.id_logro, s.sublogro_clave, s.rango, s.nombre, s.objetivo_cantidad
      ORDER BY s.id_logro ASC, s.id_sublogro ASC`,
      [totalJugadores, totalJugadores]
    );

    // 4. Anidar sublogros dentro de su logro correspondiente
    const data = logros.map((logro) => ({
      ...logro,
      sublogros: sublogros.filter((s) => Number(s.id_logro) === Number(logro.id_logro))
    }));

    return Response.json(
      { total_usuarios: totalJugadores, logros: data },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error al obtener logros y porcentajes:', error);
    return Response.json(
      { error: 'Error al obtener logros', detalle: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}