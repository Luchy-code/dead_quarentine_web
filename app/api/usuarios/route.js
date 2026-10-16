import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

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
  const username = typeof body.username === 'string'
    ? body.username.trim().slice(0, 50)
    : '';

  if (!userId || userId.length > 255 || !username) {
    return Response.json(
      { error: 'user_id y username son requeridos' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO usuarios (user_id, username, creado_en, actualizado_en)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE username = VALUES(username), actualizado_en = NOW()`,
      [userId, username]
    );
    await pool.query(
      'UPDATE ranking SET username = ? WHERE user_id = ?',
      [username, userId]
    );

    return Response.json(
      { message: 'Usuario sincronizado correctamente' },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error al sincronizar usuario:', error);
    return Response.json(
      { error: 'Error en base de datos' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
