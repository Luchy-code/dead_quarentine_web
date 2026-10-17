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
      'SELECT id, username, creado_en, actualizado_en FROM usuarios ORDER BY actualizado_en DESC'
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

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 50) : '';

  if (!userId || !username) {
    return Response.json(
      { error: 'user_id y username son requeridos' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();

    // 1. Guardar o actualizar en la tabla usuarios (UPSERT)
    await pool.query(
      `INSERT INTO usuarios (id, username, creado_en, actualizado_en)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE username = VALUES(username), actualizado_en = NOW()`,
      [userId, username]
    );

    // 2. Propagar el nuevo nombre a todo su historial en el ranking
    await pool.query(
      `UPDATE ranking SET username = ? WHERE user_id = ?`,
      [username, userId]
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