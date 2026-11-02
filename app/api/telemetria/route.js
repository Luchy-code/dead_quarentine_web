import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [[counts]] = await getPool().query(`
      SELECT
        (SELECT COUNT(*) FROM usuarios) AS usuarios_totales,
        (
          SELECT COUNT(*)
          FROM usuarios u
          WHERE EXISTS (
            SELECT 1 FROM ranking r WHERE r.user_id = u.id_local
          )
          OR EXISTS (
            SELECT 1 FROM usuario_logros ul WHERE ul.usuario_id = u.id
          )
          OR EXISTS (
            SELECT 1 FROM usuario_sublogros us WHERE us.usuario_id = u.id
          )
        ) AS usuarios_activos
    `);

    const usuariosTotales = Number(counts.usuarios_totales);
    const usuariosActivos = Number(counts.usuarios_activos);
    if (!Number.isSafeInteger(usuariosTotales) || usuariosTotales < 0 ||
        !Number.isSafeInteger(usuariosActivos) || usuariosActivos < 0 ||
        usuariosActivos > usuariosTotales) {
      throw new Error('La base de datos devolvió conteos de usuarios inválidos.');
    }

    return Response.json({
      usuarios_totales: usuariosTotales,
      usuarios_activos: usuariosActivos,
      porcentaje_activos: usuariosTotales > 0
        ? Number(((usuariosActivos / usuariosTotales) * 100).toFixed(1))
        : 0
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('Error al obtener la telemetría de usuarios:', error);
    return Response.json(
      { error: 'No se pudo obtener la telemetría de usuarios' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
