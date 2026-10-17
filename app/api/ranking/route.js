import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const rankingHeaders = { ...corsHeaders, 'Cache-Control': 'no-store' };

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const currentUserId = searchParams.get('user_id') ? String(searchParams.get('user_id')).trim() : '';
  const country = searchParams.get('country');
  const mode = searchParams.get('mode');
  const vpnOnly = searchParams.get('vpnOnly');
  const search = searchParams.get('search');

  try {
    const pool = getPool();

    // 1. Si userId es un número entero, intentamos actualizar/crear en 'usuarios'
    // Si es un UUID (string con letras/guiones), no forzamos el insert numérico en 'usuarios' para evitar el Error 3780
    if (userId && /^\d+$/.test(userId)) {
      try {
        await pool.query(
          `INSERT INTO usuarios (id, username, creado_en, actualizado_en)
           VALUES (?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE username = VALUES(username), actualizado_en = NOW()`,
          [parseInt(userId, 10), username]
        );
      } catch (e) {
        console.warn('Aviso: No se pudo actualizar tabla usuarios:', e.message);
      }
    }

    // 2. Insertar el score en la tabla ranking
    const [resultado] = await pool.query(
      `INSERT INTO ranking
        (user_id, username, puntos, modo, ip, pais, codigo_pais, usa_vpn, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, username, puntos, modo, ip, pais, codigoPais, usaVpn]
    );

    return Response.json(
      { message: 'Puntuación guardada exitosamente', id: resultado.insertId },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error al insertar score:', error);
    return Response.json(
      { error: 'Error al insertar en la base de datos', detalle: error.sqlMessage || error.message },
      { status: 500, headers: corsHeaders }
    );
  }



}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'El cuerpo debe ser JSON válido' }, { status: 400, headers: corsHeaders });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json(
      { error: 'El cuerpo debe ser un objeto JSON' },
      { status: 400, headers: corsHeaders }
    );
  }

  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 50) : '';
  const puntos = typeof body.puntos === 'number' ||
    (typeof body.puntos === 'string' && body.puntos.trim() !== '')
    ? Number(body.puntos)
    : Number.NaN;
  const userId = body.user_id === undefined || body.user_id === null
    ? null
    : typeof body.user_id === 'string'
      ? body.user_id.trim()
      : '';

  if (
    !username ||
    body.puntos === undefined ||
    body.puntos === null ||
    body.puntos === '' ||
    !Number.isFinite(puntos) ||
    puntos < 0 ||
    userId === '' ||
    (userId !== null && userId.length > 255)
  ) {
    return Response.json(
      { error: 'username y puntos válidos son obligatorios' },
      { status: 400, headers: corsHeaders }
    );
  }

  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const rawIp = request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    forwardedIp ||
    body.ip ||
    '127.0.0.1';
  const ip = typeof rawIp === 'string' ? rawIp.slice(0, 45) : '127.0.0.1';

  const rawCodigoPais = request.headers.get('cf-ipcountry') || body.codigo_pais;
  const codigoPais = typeof rawCodigoPais === 'string' && rawCodigoPais.trim()
    ? rawCodigoPais.trim().slice(0, 5)
    : null;

  const pais = typeof body.pais === 'string' && body.pais.trim()
    ? body.pais.trim().slice(0, 100)
    : codigoPais || 'Desconocido';
  const modo = typeof body.modo === 'string' && body.modo.trim() ? body.modo.trim().slice(0, 50) : 'Singleplayer';
  const usaVpn = body.usa_vpn === true || body.usa_vpn === 1 ||
    body.usa_vpn === '1' || body.usa_vpn === 'true'
    ? 1
    : body.usa_vpn === false || body.usa_vpn === 0 ||
      body.usa_vpn === '0' || body.usa_vpn === 'false'
      ? 0
      : null;

  try {
    const pool = getPool();

    // Sincronizar peteĩha usuarios reheve oimérõ ou userId
    if (userId) {
      await pool.query(
        `INSERT INTO usuarios (id, username, creado_en, actualizado_en)
         VALUES (?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE username = VALUES(username), actualizado_en = NOW()`,
        [userId, username]
      );
    }

    const [resultado] = await pool.query(
      `INSERT INTO ranking
        (user_id, username, puntos, modo, ip, pais, codigo_pais, usa_vpn, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, username, puntos, modo, ip, pais, codigoPais, usaVpn]
    );

    return Response.json(
      { message: 'Puntuación guardada exitosamente', id: resultado.insertId },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error al insertar score:', error);
    return Response.json(
      { error: 'Error al insertar en la base de datos', detalle: error.sqlMessage || error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}