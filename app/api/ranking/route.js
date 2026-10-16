import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const country = searchParams.get('country');
  const mode = searchParams.get('mode');
  const vpnOnly = searchParams.get('vpnOnly');
  const search = searchParams.get('search');
  const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100)
    : 100;

  let query = `SELECT
    r.id,
    COALESCE(u.username, r.username) AS username,
    r.user_id,
    r.puntos,
    r.modo,
    r.pais,
    r.codigo_pais,
    r.usa_vpn,
    r.creado_en,
    CASE
      WHEN r.puntos >= 13000 THEN 'Pesadilla'
      WHEN r.puntos >= 9000 THEN 'Difícil'
      WHEN r.puntos >= 5000 THEN 'Normal'
      ELSE 'Fácil'
    END AS dificultad
    FROM ranking r
    LEFT JOIN usuarios u ON r.user_id = u.id        --  usa la columna id de la tabla usuarios
    WHERE 1=1`;
  const params = [];

  if (country && country !== 'ALL') {
    query += ' AND r.codigo_pais = ?';
    params.push(country);
  }
  if (mode && mode !== 'ALL') {
    query += ' AND r.modo = ?';
    params.push(mode);
  }
  if (vpnOnly === 'true') {
    query += ' AND r.usa_vpn = 0';
  }
  if (search) {
    query += ' AND COALESCE(u.username, r.username) LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY r.puntos DESC LIMIT ?';
  params.push(limit);

  try {
    const [rows] = await getPool().query(query, params);
    return Response.json(rows, { headers: corsHeaders });
  } catch (error) {
    console.error('Error al obtener el ranking:', error);
    return Response.json(
      { error: 'Error al obtener ranking', detalle: error.sqlMessage || error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'El cuerpo debe ser JSON válido' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json(
      { error: 'El cuerpo debe ser un objeto JSON' },
      { status: 400, headers: corsHeaders }
    );
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const puntos = Number(body.puntos);

  if (!username || body.puntos === undefined || body.puntos === null || !Number.isFinite(puntos) || puntos < 0) {
    return Response.json(
      { error: 'username y puntos válidos son obligatorios' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (body.user_id !== undefined && body.user_id !== null
    && (typeof body.user_id !== 'string' || body.user_id.trim().length > 255)) {
    return Response.json(
      { error: 'user_id debe ser una cadena de hasta 255 caracteres' },
      { status: 400, headers: corsHeaders }
    );
  }
  const userId = typeof body.user_id === 'string' && body.user_id.trim()
    ? body.user_id.trim()
    : null;

  // 1. IP
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const rawIp = body.ip || request.headers.get('x-real-ip') || forwardedIp || '127.0.0.1';
  const ip = typeof rawIp === 'string' ? rawIp.slice(0, 45) : '127.0.0.1';

  // 2. Código de País (máximo 5 caracteres para columnas cortas como VARCHAR(2) o VARCHAR(5))
  const rawCodigoPais = body.codigo_pais || request.headers.get('cf-ipcountry') || 'AR';
  const codigoPais = typeof rawCodigoPais === 'string' ? rawCodigoPais.trim().slice(0, 5) : 'AR';

  // 3. País
  const pais = typeof body.pais === 'string' && body.pais.trim() ? body.pais.trim().slice(0, 100) : 'Argentina';

  // 4. Modo de juego: Singleplayer o Multiplayer
  const modo = typeof body.modo === 'string' && body.modo.trim()
    ? body.modo.trim().slice(0, 50)
    : 'Singleplayer';
  // 5. USA VPN: Forzar a 0 o 1
  const usaVpn = (body.usa_vpn === 1 || body.usa_vpn === '1' || body.usa_vpn === true) ? 1 : 0;

  try {
    const pool = getPool();
    const [resultado] = await pool.query(
      `INSERT INTO ranking
        (user_id, username, puntos, modo, ip, pais, codigo_pais, usa_vpn, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        username,
        puntos,
        modo,
        ip,
        pais,
        codigoPais,
        usaVpn
      ]
    );

    return Response.json(
      { message: 'Puntuación guardada exitosamente', id: resultado.insertId },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error detallado de MySQL al guardar puntaje:', {
      sqlMessage: error.sqlMessage,
      code: error.code,
      message: error.message
    });

    return Response.json(
      { 
        error: 'Error al insertar en la base de datos',
        detalle: error.sqlMessage || error.message || String(error)
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}