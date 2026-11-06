import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function GET() {
  try {
    const [usuario] = await getPool().query(
      'SELECT id_usuario, username, email, created_at, updated_at FROM usuario ORDER BY created_at DESC'
    );
    return Response.json(usuario, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: 'Error al obtener usuario', detalle: error.sqlMessage || error.message },
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

  const rawUserId = body.id_usuario;
  const userId = typeof rawUserId === 'number' ||
    (typeof rawUserId === 'string' && /^\d+$/.test(rawUserId.trim()))
    ? Number(rawUserId)
    : Number.NaN;
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 50) : '';

  if (!Number.isSafeInteger(userId) || userId < 1 || !username) {
    return Response.json(
      { error: 'id_usuario y username son requeridos' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();

    const [existingUsers] = await pool.query(
      'SELECT id_usuario FROM usuario WHERE LOWER(TRIM(username)) = LOWER(?) AND id_usuario <> ? LIMIT 1',
      [username, userId]
    );
    if (existingUsers.length > 0) {
      return Response.json(
        { error: 'Ese nombre ya está en uso. Elegí otro.' },
        { status: 409, headers: corsHeaders }
      );
    }

    const [existingUser] = await pool.query(
      'SELECT id_usuario FROM usuario WHERE id_usuario = ? LIMIT 1',
      [userId]
    );

    if (existingUser.length === 0) {
      return Response.json(
        { error: 'Usuario no encontrado' },
        { status: 404, headers: corsHeaders }
      );
    }

    await pool.query(
      'UPDATE usuario SET username = ?, updated_at = NOW() WHERE id_usuario = ?',
      [username, userId]
    );

    return Response.json({
      message: 'Usuario sincronizado exitosamente',
      id_usuario: userId,
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