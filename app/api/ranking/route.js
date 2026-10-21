import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const rankingHeaders = { ...corsHeaders, 'Cache-Control': 'no-store' };

function normalizeGameValue(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const currentUserId = searchParams.get('user_id') ? String(searchParams.get('user_id')).trim() : '';
  const rawMode = searchParams.get('mode');
  const mode = rawMode ? normalizeGameValue(rawMode.trim()) : '';
  const rawDifficulty = searchParams.get('dificultad');
  const difficulty = rawDifficulty ? normalizeGameValue(rawDifficulty.trim()) : '';
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

    if (mode && mode !== 'all' && mode !== 'todos') {
      whereConditions += ' AND r.modo = ?';
      params.push(mode);
    }
    if (difficulty && difficulty !== 'all' && difficulty !== 'todos') {
      whereConditions += ' AND r.dificultad = ?';
      params.push(difficulty);
    }
    if (search) {
      whereConditions += ' AND (COALESCE(u.nombre, r.user_id) LIKE ? OR r.user_id LIKE ?)';
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
        LEFT JOIN usuarios u ON r.user_id = u.id_local
        ${whereConditions}
      `;
      const [rows] = await pool.query(
        `SELECT ROW_NUMBER() OVER (ORDER BY r.puntos DESC, r.creado_en ASC, r.id ASC) AS puesto,
                r.id, COALESCE(u.nombre, r.user_id) AS username, r.user_id,
                r.puntos, r.modo, r.dificultad, r.creado_en
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
        `SELECT COALESCE(u.nombre, r.user_id) AS username, r.user_id, r.puntos,
                r.modo, r.dificultad, r.creado_en
         ${from}
         ORDER BY r.puntos DESC, r.creado_en ASC, r.id ASC
         LIMIT 3`,
        params
      );
      const [facets] = await pool.query(
        `SELECT DISTINCT modo, dificultad
         FROM ranking
         WHERE modo IS NOT NULL OR dificultad IS NOT NULL
         ORDER BY modo, dificultad`
      );

      return Response.json(
        {
          rows,
          top,
          total: Number(total),
          page,
          limit,
          modos: [...new Set(facets.map((row) => row.modo).filter(Boolean))],
          dificultades: [...new Set(facets.map((row) => row.dificultad).filter(Boolean))]
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
          COALESCE(u.nombre, r.user_id) AS username,
          r.user_id,
          r.puntos,
          r.modo,
          r.dificultad,
          r.creado_en
        FROM ranking r
        LEFT JOIN usuarios u ON r.user_id = u.id_local
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

  const rawModo = typeof body.modo === 'string' && body.modo.trim()
    ? normalizeGameValue(body.modo.trim())
    : 'singleplayer';
  const modo = ['singleplayer', 'multiplayer'].includes(rawModo) ? rawModo : '';
  const rawDificultad = typeof body.dificultad === 'string' && body.dificultad.trim()
    ? normalizeGameValue(body.dificultad.trim())
    : 'normal';
  const dificultad = ['normal', 'dificil', 'pesadilla'].includes(rawDificultad)
    ? rawDificultad
    : '';
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 50) : '';
  const puntos = typeof body.puntos === 'number' ||
    (typeof body.puntos === 'string' && body.puntos.trim() !== '')
    ? Number(body.puntos)
    : Number.NaN;
  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';

  if (
    !username ||
    !userId ||
    !modo ||
    !dificultad ||
    body.puntos === undefined ||
    body.puntos === null ||
    body.puntos === '' ||
    !Number.isFinite(puntos) ||
    puntos < 0 ||
    userId.length > 255
  ) {
    return Response.json(
      { error: 'user_id, username, modo, dificultad y puntos válidos son obligatorios' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();

    await pool.query(
      `INSERT INTO usuarios (id_local, nombre, creado_en)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
      [userId, username]
    );

    const [resultado] = await pool.query(
      `INSERT INTO ranking
        (puntos, modo, dificultad, creado_en, user_id)
       VALUES (?, ?, ?, NOW(), ?)`,
      [puntos, modo, dificultad, userId]
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