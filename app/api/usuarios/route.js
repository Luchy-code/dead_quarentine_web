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
      'SELECT id, username, creado_en, actualizado_en FROM usuarios ORDER BY id ASC'
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

  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 50) : '';
  const rawUserId = body.user_id !== undefined && body.user_id !== null ? String(body.user_id).trim() : null;

  if (!username) {
    return Response.json({ error: 'El campo username es obligatorio' }, { status: 400, headers: corsHeaders });
  }

  try {
    const pool = getPool();

    // CASO 1: Unity nos mandó un user_id (sea número o string)
    if (rawUserId) {
      // Verificamos si existe ese id en usuarios
      const [existeUsuario] = await pool.query(
        `SELECT id, username FROM usuarios WHERE id = ? LIMIT 1`,
        [rawUserId]
      );

      if (existeUsuario.length > 0) {
        // Actualizar el nombre del usuario
        await pool.query(
          `UPDATE usuarios 
           SET username = ?, actualizado_en = NOW() 
           WHERE id = ?`,
          [username, rawUserId]
        );

        // Actualizar automáticamente todas las partidas históricas en ranking
        await pool.query(
          `UPDATE ranking 
           SET username = ? 
           WHERE user_id = ?`,
          [username, rawUserId]
        );

        return Response.json({ 
          message: 'Usuario y partidas actualizados con éxito', 
          user_id: rawUserId, 
          username 
        }, { status: 200, headers: corsHeaders });
      } else {
        // Si mandó un ID pero no está en la tabla (por ejemplo si la tabla usa VARCHAR para id)
        const [insertado] = await pool.query(
          `INSERT INTO usuarios (id, username, creado_en, actualizado_en)
           VALUES (?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE username = VALUES(username), actualizado_en = NOW()`,
          [rawUserId, username]
        );

        return Response.json({ 
          message: 'Usuario creado con ID especificado', 
          user_id: rawUserId, 
          username 
        }, { status: 200, headers: corsHeaders });
      }
    }

    // CASO 2: No viene user_id (primer inicio o usuario nuevo)
    const [existentes] = await pool.query(
      `SELECT id FROM usuarios WHERE username = ? LIMIT 1`,
      [username]
    );

    let idFinal;
    if (existentes.length > 0) {
      idFinal = existentes[0].id;
    } else {
      const [insertado] = await pool.query(
        `INSERT INTO usuarios (username, creado_en, actualizado_en) VALUES (?, NOW(), NOW())`,
        [username]
      );
      idFinal = insertado.insertId;
    }

    return Response.json({ 
      message: 'Usuario registrado', 
      user_id: String(idFinal), 
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