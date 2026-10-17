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
  const difficulty = searchParams.get('dificultad');
  const vpnOnly = searchParams.get('vpnOnly');
  const search = searchParams.get('search');
  const tableView = searchParams.get('view') === 'table';

  try {
    const pool = getPool();

    const score = searchParams.get('score');
    if (score !== null && score !== '' && Number.isFinite(Number(score))) {
      const [r] = await pool.query(
        'SELECT COUNT(*) + 1 AS puesto FROM ranking WHERE puntos >= ?',
        [Number(score)]
      );
      return Response.json({ puesto: Number(r[0].puesto) }, { headers: rankingHeaders });
    }

    // Filtros dinámicos ranking_general
    let whereConditions = 'WHERE 1=1';
    const params = [];

    if (country && country !== 'ALL') {
      whereConditions += ' AND r.codigo_pais = ?';
      params.push(country);
    }
    if (mode && mode !== 'ALL' && mode !== 'Todos') {
      whereConditions += ' AND r.modo = ?';
      params.push(mode);
    }
    if (difficulty && difficulty !== 'ALL' && difficulty !== 'Todos') {
      whereConditions += ' AND r.dificultad = ?';
      params.push(difficulty);
    }
    if (vpnOnly === 'true') {
      whereConditions += ' AND r.usa_vpn = 0';
    }
    if (search) {
      whereConditions += ' AND (COALESCE(u.username, r.username) LIKE ? OR r.user_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (tableView) {
      const requestedPage = Number(searchParams.get('page'));
      const requestedLimit = Number(searchParams.get('limit'));
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 10;
      const offset = (page - 1) * limit;
      const from = `
        FROM ranking r
        LEFT JOIN usuarios u ON r.user_id = u.user_id
        ${whereConditions}
      `;
      const [rows] = await pool.query(
        `SELECT ROW_NUMBER() OVER (ORDER BY r.puntos DESC, r.creado_en ASC, r.id ASC) AS puesto,
                r.id, COALESCE(u.username, r.username) AS username, r.user_id,
                r.puntos, r.modo, r.dificultad, r.pais, r.codigo_pais,
                r.creado_en
         ${from}
         ORDER BY r.puntos DESC, r.creado_en ASC, r.id ASC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total ${from}`,
        params
      );
      const [top] = await pool.query(
        `SELECT COALESCE(u.username, r.username) AS username, r.user_id, r.puntos,
                r.modo, r.dificultad, r.pais, r.codigo_pais, r.creado_en
         ${from}
         ORDER BY r.puntos DESC, r.creado_en ASC, r.id ASC
         LIMIT 3`,
        params
      );
      const [facets] = await pool.query(
        `SELECT DISTINCT modo, dificultad, codigo_pais, pais
         FROM ranking
         WHERE modo IS NOT NULL OR dificultad IS NOT NULL
               OR codigo_pais IS NOT NULL OR pais IS NOT NULL
         ORDER BY modo, dificultad, codigo_pais`
      );
      const paises = [...new Map(
        facets
          .filter((row) => row.codigo_pais)
          .map((row) => [row.codigo_pais, { codigo_pais: row.codigo_pais, pais: row.pais }])
      ).values()];

      return Response.json(
        {
          rows,
          top,
          total: Number(total),
          page,
          limit,
          modos: [...new Set(facets.map((row) => row.modo).filter(Boolean))],
          dificultades: [...new Set(facets.map((row) => row.dificultad).filter(Boolean))],
          paises
        },
        { headers: rankingHeaders }
      );
    }

    // Query CTE oiporúva UNION ALL: Top 5 + '...' + Ne récord iporãvéva
    const sql = `
      WITH ranking_general AS (
        SELECT 
          ROW_NUMBER() OVER (ORDER BY r.puntos DESC, r.creado_en ASC) AS puesto,
          r.id,
          COALESCE(u.username, r.username) AS username,
          r.user_id,
          r.puntos,
          r.modo,
          r.dificultad,
          r.pais,
          r.codigo_pais,
          r.usa_vpn,
          r.creado_en
        FROM ranking r
        LEFT JOIN usuarios u ON r.user_id = u.user_id
        ${whereConditions}
      ),
      top5 AS (
  SELECT * FROM ranking_general ORDER BY puesto LIMIT 5
),
      mi_mejor_puntaje AS (
        SELECT * FROM ranking_general
        WHERE user_id = ?
        ORDER BY puntos DESC, creado_en ASC
        LIMIT 1
      )
      -- Bloque 1: Top 5
      SELECT 
        CAST(puesto AS CHAR) AS puesto, 
        id, 
        username, 
        user_id, 
        puntos, 
        modo, 
        dificultad,
        pais, 
        codigo_pais, 
        usa_vpn, 
        creado_en, 
        1 AS bloque_orden,
        puesto AS orden
      FROM top5

      UNION ALL

      -- Bloque 2: Fila orekóva '...' (oñemoĩnte puesto > 5 jave)
      SELECT 
        '...' AS puesto, 
        NULL AS id, 
        '...' AS username, 
        NULL AS user_id, 
        0 AS puntos, 
        '...' AS modo, 
        '...' AS dificultad,
        '...' AS pais, 
        '...' AS codigo_pais, 
        0 AS usa_vpn, 
        NULL AS creado_en, 
        2 AS bloque_orden,
        0 AS orden
      FROM mi_mejor_puntaje 
      WHERE puesto > 5

      UNION ALL

      -- Bloque 3: Nde récord iporãvéva
      SELECT 
        CAST(puesto AS CHAR) AS puesto, 
        id, 
        username, 
        user_id, 
        puntos, 
        modo, 
        dificultad,
        pais, 
        codigo_pais, 
        usa_vpn, 
        creado_en, 
        3 AS bloque_orden,
        puesto AS orden
      FROM mi_mejor_puntaje 
      WHERE puesto > 5

      ORDER BY bloque_orden ASC, orden ASC;
    `;

    const queryParams = [...params, currentUserId];

    const [rows] = await pool.query(sql, queryParams);
    return Response.json(rows, { headers: rankingHeaders });

  } catch (error) {
    console.error('Error al obtener ranking:', error);
    return Response.json(
      { error: 'Error al obtener ranking', detalle: error.sqlMessage || error.message },
      { status: 500, headers: rankingHeaders }
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
  const dificultad = typeof body.dificultad === 'string' && body.dificultad.trim()
    ? body.dificultad.trim().slice(0, 50)
    : null;
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
        `INSERT INTO usuarios (user_id, username, creado_en, actualizado_en)
         VALUES (?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE username = VALUES(username), actualizado_en = NOW()`,
        [userId, username]
      );
    }

    const [resultado] = await pool.query(
      `INSERT INTO ranking
        (user_id, username, puntos, modo, dificultad, ip, pais, codigo_pais, usa_vpn, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, username, puntos, modo, dificultad, ip, pais, codigoPais, usaVpn]
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