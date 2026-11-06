import { getPool } from '../../../../lib/mysql';

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
    return Response.json(
      { success: false, error: 'El cuerpo de la solicitud no es JSON válido' },
      { status: 400, headers: corsHeaders }
    );
  }

  // Soporta tanto 'id_local' (el que envía AchievementsManager.cs) como 'id_usuario'
  const rawUsuarioId = body?.id_local || body?.id_usuario;
  const usuarioId = typeof rawUsuarioId === 'string' ? rawUsuarioId.trim() : String(rawUsuarioId || '').trim();
  
  const sublogroClave = typeof body?.sublogro_clave === 'string' ? body.sublogro_clave.trim() : '';
  const username = typeof body?.username === 'string' && body.username.trim() ? body.username.trim() : 'Superviviente';

  if (!usuarioId || !sublogroClave) {
    return Response.json(
      { success: false, error: 'Faltan campos obligatorios (id_local y sublogro_clave son requeridos)' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();

    // 1. Asegurar que el usuario exista en la tabla 'usuario' (lo crea si es su primera vez)
    await pool.query(
      `INSERT INTO usuario (id_usuario, username, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE username = VALUES(username), updated_at = NOW()`,
      [usuarioId, username]
    );

    // 2. Buscar el sublogro correspondiente por su sublogro_clave
    const [[sublogro]] = await pool.query(
      'SELECT id_sublogro, id_logro, rango, objetivo_cantidad FROM sublogro WHERE sublogro_clave = ? LIMIT 1',
      [sublogroClave]
    );

    if (!sublogro) {
      return Response.json(
        { success: false, error: `Sublogro '${sublogroClave}' no encontrado en la base de datos.` },
        { status: 404, headers: corsHeaders }
      );
    }

    // 3. Registrar o actualizar el sublogro completado en usuario_sublogro
    await pool.query(
      `INSERT INTO usuario_sublogro (id_usuario, id_sublogro, progreso_actual, completado, updated_at)
       VALUES (?, ?, ?, TRUE, NOW())
       ON DUPLICATE KEY UPDATE completado = TRUE, progreso_actual = VALUES(progreso_actual), updated_at = NOW()`,
      [usuarioId, sublogro.id_sublogro, sublogro.objetivo_cantidad]
    );

    // 4. Desbloquear el logro padre principal si completó el rango final ('Oro' o 'Unico')
    let logroDesbloqueado = null;
    if (sublogro.rango === 'Oro' || sublogro.rango === 'Unico') {
      const [[logroInfo]] = await pool.query(
        'SELECT id_logro, nombre FROM logro WHERE id_logro = ? LIMIT 1',
        [sublogro.id_logro]
      );

      if (logroInfo) {
        await pool.query(
          `INSERT IGNORE INTO usuario_logro (id_usuario, id_logro, fecha_desbloqueo)
           VALUES (?, ?, NOW())`,
          [usuarioId, sublogro.id_logro]
        );
        logroDesbloqueado = logroInfo.nombre;
      }
    }

    return Response.json({
      success: true,
      mensaje: 'Sublogro registrado con éxito',
      logro_padre_desbloqueado: logroDesbloqueado
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error al desbloquear sublogro:', error);
    return Response.json(
      { success: false, error: 'Error interno en base de datos', detalle: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}