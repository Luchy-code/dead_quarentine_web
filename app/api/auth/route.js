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
  if (!googleId || !email || email.length > 320 || payload.email_verified !== true) {
    return Response.json({ success: false, error: 'Token inválido o expirado' }, {
      status: 401,
      headers: corsHeaders
    });
  }

  const usernameInicial = email.slice(0, 50);

  try {
    const pool = getPool();
    const [existingUsers] = await pool.query(
      'SELECT id_usuario FROM usuario WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers.length > 0) {
      await pool.query(
        'UPDATE usuario SET updated_at = NOW() WHERE id_usuario = ?',
        [existingUsers[0].id_usuario]
      );
    } else {
      await pool.query(
        `INSERT INTO usuario (email, username, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())`,
        [email, usernameInicial]
      );
    }

    const [usuarios] = await pool.query(
      'SELECT id_usuario, username, email, created_at, updated_at FROM usuario WHERE email = ? LIMIT 1',
      [email]
    );
    const usuario = usuarios[0];

    if (!usuario) {
      throw new Error('No se pudo recuperar el usuario autenticado.');
    }

    return Response.json({
      success: true,
      usuario: {
        ...usuario,
        google_id: googleId
      }
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error al autenticar usuario en la base de datos:', error);
    return Response.json(
      { success: false, error: 'Error en base de datos' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}