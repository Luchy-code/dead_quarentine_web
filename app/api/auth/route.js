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

  const nombre = email.slice(0, 50);

  try {
    const pool = getPool();
    const [existingUser] = await pool.query(
      'SELECT id FROM usuarios WHERE id_local = ? LIMIT 1',
      [googleId]
    );

    if (existingUser.length > 0) {
      await pool.query(
        'UPDATE usuarios SET email = ?, nombre = ? WHERE id_local = ?',
        [email, nombre, googleId]
      );
    } else {
      await pool.query(
        `INSERT INTO usuarios (id_local, email, nombre, creado_en)
         VALUES (?, ?, ?, NOW())`,
        [googleId, email, nombre]
      );
    }

    const [usuarios] = await pool.query(
      'SELECT id, id_local, email, nombre, creado_en FROM usuarios WHERE id_local = ? LIMIT 1',
      [googleId]
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
    return Response.json({ success: false, error: 'Error en base de datos' }, {
      status: 500,
      headers: corsHeaders
    });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
