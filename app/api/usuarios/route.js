import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const requestedUserId = String(
      searchParams.get('user_id') ?? searchParams.get('id_usuario') ?? ''
    ).trim();

    const pool = getPool();

    // 1. Si Unity consulta por un usuario específico (para recuperar o transferir cuenta)
    if (requestedUserId) {
      const [rows] = await pool.query(
        'SELECT id_usuario AS user_id, username, email, nivel, record, created_at, updated_at FROM usuario WHERE id_usuario = ? LIMIT 1',
        [requestedUserId]
      );

      if (rows.length === 0) {
        return Response.json(
          { error: 'Usuario no encontrado' },
          { status: 404, headers: corsHeaders }
        );
      }

      return Response.json(rows[0], { headers: corsHeaders });
    }

    // 2. Si no especifica user_id, devuelve el listado general
    const [usuarios] = await pool.query(
      'SELECT id_usuario AS user_id, username, email, created_at, updated_at FROM usuario ORDER BY created_at DESC LIMIT 50'
    );
    return Response.json(usuarios, { headers: corsHeaders });

  } catch (error) {
    console.error('Error al obtener usuario(s):', error);
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

  // Acepta 'user_id' (enviado por CharacterRenameManager.cs) o 'id_usuario'
  const rawUserId = body.user_id ?? body.id_usuario ?? '';
  const userId = String(rawUserId).trim();
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 50) : '';

  if (!userId || !username) {
    return Response.json(
      { error: 'user_id y username son requeridos' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();

    // 1. Validar que el nombre no esté duplicado por otro usuario distinto
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

    // 2. Insertar nuevo usuario o actualizar su nombre si ya existía (Upsert atómico)
    await pool.query(
      `INSERT INTO usuario (id_usuario, username, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE 
         username = VALUES(username), 
         updated_at = NOW()`,
      [userId, username]
    );

    return Response.json({
      success: true,
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