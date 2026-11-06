import { OAuth2Client } from 'google-auth-library';
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
    return Response.json({ success: false, error: 'JSON inválido' }, {
      status: 400,
      headers: corsHeaders
    });
  }

  const idToken = typeof body?.id_token === 'string' ? body.id_token.trim() : '';
  if (!idToken) {
    return Response.json({ success: false, error: 'id_token es requerido' }, {
      status: 400,
      headers: corsHeaders
    });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error('Falta configurar GOOGLE_CLIENT_ID.');
    return Response.json({ success: false, error: 'Autenticación no configurada' }, {
      status: 500,
      headers: corsHeaders
    });
  }

  let payload;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch (error) {
    console.error('Error al verificar token de Google:', error);
    return Response.json({ success: false, error: 'Token inválido o expirado' }, {
      status: 401,
      headers: corsHeaders
    });
  }

  const googleId = typeof payload?.sub === 'string' ? payload.sub : '';
  const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
  const nombreGoogle = typeof payload?.name === 'string' && payload.name.trim() 
    ? payload.name.trim().slice(0, 50) 
    : email.split('@')[0].slice(0, 50);

  if (!googleId || !email || email.length > 320 || payload.email_verified !== true) {
    return Response.json({ success: false, error: 'Token inválido o expirado' }, {
      status: 401,
      headers: corsHeaders
    });
  }

  try {
    const pool = getPool();

    // 1. Verificar si ya existe por google_id o por email
    const [existingUsers] = await pool.query(
      'SELECT id_usuario, username, email, google_id, nivel, record FROM usuario WHERE google_id = ? OR email = ? LIMIT 1',
      [googleId, email]
    );

    let usuarioFinal;

    if (existingUsers.length > 0) {
      usuarioFinal = existingUsers[0];
      // Si ya existía, actualizar google_id y timestamp
      await pool.query(
        `UPDATE usuario 
         SET google_id = ?, 
             email = ?, 
             updated_at = NOW() 
         WHERE id_usuario = ?`,
        [googleId, email, usuarioFinal.id_usuario]
      );
      usuarioFinal.google_id = googleId;
      usuarioFinal.email = email;
    } else {
      // 2. Si es nuevo, generar ID alfanumérico para id_usuario (PRIMARY KEY)
      const nuevoIdUsuario = `usr_${googleId.slice(0, 15)}_${Date.now().toString(36)}`;
      
      await pool.query(
        `INSERT INTO usuario (id_usuario, google_id, username, email, nivel, record, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 0, NOW(), NOW())`,
        [nuevoIdUsuario, googleId, nombreGoogle, email]
      );

      usuarioFinal = {
        id_usuario: nuevoIdUsuario,
        google_id: googleId,
        username: nombreGoogle,
        email: email,
        nivel: 1,
        record: 0
      };
    }

    // 3. Responder con la estructura exacta que mapea PerfilUsuarioData en Unity
    return Response.json({
      success: true,
      usuario: {
        id: 0,
        id_local: usuarioFinal.id_usuario,
        google_id: usuarioFinal.google_id,
        email: usuarioFinal.email,
        nombre: usuarioFinal.username,
        nivel: Number(usuarioFinal.nivel) || 1,
        record: Number(usuarioFinal.record) || 0
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error al autenticar usuario en la base de datos:', error);
    return Response.json(
      { success: false, error: 'Error en base de datos', detalle: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}