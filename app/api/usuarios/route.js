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

  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 50) : '';
  const userId = body.user_id ? String(body.user_id).trim() : null;

  if (!username) {
    return Response.json({ error: 'El campo username es obligatorio' }, { status: 400, headers: corsHeaders });
  }

  try {
    const pool = getPool();

    // Caso A: El jugador ya tiene un user_id asignado -> Actualizamos su nombre
    if (userId) {
      await pool.query(
        `UPDATE usuarios 
         SET username = ?, actualizado_en = NOW() 
         WHERE id = ?`,
        [username, userId]
      );

      // Sincronizar también su nombre en sus registros de ranking
      await pool.query(
        `UPDATE ranking SET username = ? WHERE user_id = ?`,
        [username, userId]
      );

      return Response.json({ 
        message: 'Usuario actualizado', 
        user_id: userId, 
        username 
      }, { status: 200, headers: corsHeaders });
    }

    // Caso B: Primer ingreso -> Insertar o recuperar el id
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
      user_id: idFinal, 
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