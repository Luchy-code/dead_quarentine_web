import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function GET() {
  try {
    const [usuarios] = await getPool().query(
      'SELECT id, id_local, nombre, creado_en FROM usuarios ORDER BY creado_en DESC'
    );
    return Response.json(usuarios, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: 'Error al obtener usuarios', detalle: error.sqlMessage || error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400, headers: corsHeaders });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json(
      { error: 'El cuerpo debe ser un objeto JSON' },
      { status: 400, headers: corsHeaders }
    );
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 50) : '';

  if (!userId || userId.length > 255 || !username) {
    return Response.json(
      { error: 'user_id y username son requeridos' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();

    // 1. Guardar o actualizar el usuario usando el ID local del juego.
    await pool.query(
      `INSERT INTO usuarios (id_local, nombre, creado_en)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
      [userId, username]
    );

    return Response.json({
      message: 'Usuario sincronizado exitosamente',
      user_id: userId,
      username
    }, { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error('Error al sincronizar usuario:', error);
    return Response.json(
      { error: 'Error en base de datos', detalle: error.sqlMessage || error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}