import { getPool } from '../../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const usuarioId = (params.get('id_local') || params.get('id_usuario') || '').trim();

  if (!usuarioId || usuarioId.length > 191) {
    return Response.json(
      { success: false, error: 'El parámetro id_local es obligatorio' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();
    // Versiones anteriores guardaban los logros usando google_id como id_usuario.
    // Recupera también ese identificador asociado a la cuenta autenticada.
    const [[cuenta]] = await pool.query(
      'SELECT google_id FROM usuario WHERE id_usuario = ? LIMIT 1',
      [usuarioId]
    );
    const idsUsuario = [...new Set([usuarioId, String(cuenta?.google_id || '').trim()].filter(Boolean))];
    const placeholders = idsUsuario.map(() => '?').join(', ');
    const [sublogros] = await pool.query(
      `SELECT
        s.sublogro_clave,
        s.rango,
        us.progreso_actual,
        s.objetivo_cantidad,
        us.completado
      FROM usuario_sublogro us
      INNER JOIN sublogro s ON s.id_sublogro = us.id_sublogro
      WHERE us.id_usuario IN (${placeholders}) AND us.completado = TRUE
      ORDER BY s.id_logro ASC, s.id_sublogro ASC`,
      idsUsuario
    );

    return Response.json(
      { success: true, id_local: usuarioId, sublogros },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error al obtener los logros del usuario:', error);
    return Response.json(
      { success: false, error: 'Error interno en base de datos' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}