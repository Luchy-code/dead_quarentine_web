import { getPool } from '../../../../lib/mysql';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'El cuerpo de la solicitud no es JSON válido' }, { status: 400 });
  }

  const idLocal = typeof body?.id_local === 'string' ? body.id_local.trim() : '';
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const sublogroClave = typeof body?.sublogro_clave === 'string'
    ? body.sublogro_clave.trim()
    : '';

  if (!idLocal || idLocal.length > 255 || !username || !sublogroClave) {
    return Response.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
  }

  try {
    const pool = getPool();

    const [existingUser] = await pool.query(
      'SELECT id FROM usuarios WHERE id_local = ? LIMIT 1',
      [idLocal]
    );

    if (existingUser.length > 0) {
      await pool.query('UPDATE usuarios SET nombre = ? WHERE id_local = ?', [username, idLocal]);
    } else {
      await pool.query(
        `INSERT INTO usuarios (id_local, nombre, creado_en)
         VALUES (?, ?, NOW())`,
        [idLocal, username]
      );
    }

    const [[usuario]] = await pool.query(
      'SELECT id FROM usuarios WHERE id_local = ?',
      [idLocal]
    );

    if (!usuario) {
      throw new Error('No se pudo obtener el usuario después de crearlo.');
    }

    const [[sublogro]] = await pool.query(
      'SELECT id, logro_id FROM sublogros WHERE clave = ?',
      [sublogroClave]
    );

    if (!sublogro) {
      return Response.json({ error: 'Sublogro no encontrado en la base' }, { status: 404 });
    }

    const [[sublogroExistente]] = await pool.query(
      'SELECT usuario_id FROM usuario_sublogros WHERE usuario_id = ? AND sublogro_id = ? LIMIT 1',
      [usuario.id, sublogro.id]
    );
    if (!sublogroExistente) {
      await pool.query(
        'INSERT IGNORE INTO usuario_sublogros (usuario_id, sublogro_id) VALUES (?, ?)',
        [usuario.id, sublogro.id]
      );
    }

    const [[{ total_completados }]] = await pool.query(
      `SELECT COUNT(*) AS total_completados
      FROM usuario_sublogros us
      JOIN sublogros s ON us.sublogro_id = s.id
      WHERE us.usuario_id = ? AND s.logro_id = ?`,
      [usuario.id, sublogro.logro_id]
    );

    const [[logroInfo]] = await pool.query(
      'SELECT titulo, sublogros_requeridos FROM logros WHERE id = ?',
      [sublogro.logro_id]
    );

    if (!logroInfo) {
      throw new Error(`No se encontró el logro padre para el sublogro ${sublogro.id}.`);
    }

    let logroDesbloqueado = null;
    if (total_completados >= logroInfo.sublogros_requeridos) {
      const [[logroExistente]] = await pool.query(
        'SELECT usuario_id FROM usuario_logros WHERE usuario_id = ? AND logro_id = ? LIMIT 1',
        [usuario.id, sublogro.logro_id]
      );
      if (!logroExistente) {
        await pool.query(
          'INSERT IGNORE INTO usuario_logros (usuario_id, logro_id) VALUES (?, ?)',
          [usuario.id, sublogro.logro_id]
        );
      }
      logroDesbloqueado = logroInfo.titulo;
    }

    return Response.json({
      success: true,
      mensaje: 'Sublogro registrado con éxito',
      logro_padre_desbloqueado: logroDesbloqueado
    });
  } catch (error) {
    console.error('Error al desbloquear sublogro:', error);
    return Response.json({ error: 'Error interno en base de datos' }, { status: 500 });
  }
}
