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

    // Verificamos si rawUserId es un número entero válido existente en la tabla
    let numericId = null;
    if (rawUserId && /^\d+$/.test(rawUserId)) {
      numericId = parseInt(rawUserId, 10);
    }

    // CASO 1: Ya tenemos un ID numérico válido asignado a este usuario
    if (numericId !== null) {
      const [existeUsuario] = await pool.query(
        `SELECT id FROM usuarios WHERE id = ? LIMIT 1`,
        [numericId]
      );

      if (existeUsuario.length > 0) {
        // Actualizar el nombre en usuarios
        await pool.query(
          `UPDATE usuarios SET username = ?, actualizado_en = NOW() WHERE id = ?`,
          [username, numericId]
        );

        // Actualizar los puntajes previos del ranking
        await pool.query(
          `UPDATE ranking SET username = ? WHERE user_id = ?`,
          [username, numericId]
        );

        return Response.json({
          message: 'Usuario actualizado con éxito',
          user_id: String(numericId),
          username
        }, { status: 200, headers: corsHeaders });
      }
    }

    // CASO 2: Primer registro o ID previo no numérico (UUID)
    // Buscamos si el nombre ya existe en la tabla usuarios
    const [existentes] = await pool.query(
      `SELECT id FROM usuarios WHERE username = ? LIMIT 1`,
      [username]
    );

    let idFinal;
    if (existentes.length > 0) {
      idFinal = existentes[0].id;
      await pool.query(
        `UPDATE usuarios SET actualizado_en = NOW() WHERE id = ?`,
        [idFinal]
      );
    } else {
      // Inserción limpia: MySQL genera el id autoincremental (11, 12, etc.)
      const [insertado] = await pool.query(
        `INSERT INTO usuarios (username, creado_en, actualizado_en) VALUES (?, NOW(), NOW())`,
        [username]
      );
      idFinal = insertado.insertId;
    }

    // Opcional: enlazar partidas previas que tuvieran este nombre y user_id en NULL
    await pool.query(
      `UPDATE ranking SET user_id = ? WHERE username = ? AND user_id IS NULL`,
      [idFinal, username]
    );

    return Response.json({
      message: 'Usuario registrado correctamente',
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