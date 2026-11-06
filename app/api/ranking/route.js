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
  const currentUserId = String(
    searchParams.get('id_usuario') ?? searchParams.get('user_id') ?? ''
  ).trim();
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

    // Apply mode, difficulty, and search filters after ranking to preserve global positions.
    const filterConditions = [];
    const filterParams = [];

    if (mode && mode !== 'all' && mode !== 'todos') {
      filterConditions.push('modo = ?');
      filterParams.push(mode);
    }
    if (difficulty && difficulty !== 'all' && difficulty !== 'todos') {
      filterConditions.push('dificultad = ?');
      filterParams.push(difficulty);
    }
    if (search) filterConditions.push('(username LIKE ? OR user_id LIKE ?)');
    const searchValues = search ? [`%${search}%`, `%${search}%`] : [];
    const filteredConditions = filterConditions.length
      ? `WHERE ${filterConditions.join(' AND ')}`
      : '';
    const filteredParams = [...filterParams, ...searchValues];

    if (tableView) {
      const requestedPage = Number(searchParams.get('page'));
      const requestedLimit = Number(searchParams.get('limit'));
      const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 10;
      const offset = (page - 1) * limit;
      const filteredRanking = `
        WITH ranking_general AS (
          SELECT ROW_NUMBER() OVER (
                   ORDER BY r.puntos DESC, r.creado_en ASC, r.id_ranking ASC
                 ) AS puesto,
                 r.id_ranking AS id,
                 COALESCE(u.username, r.id_usuario) AS username,
                 r.id_usuario AS user_id,
                 r.puntos, r.modo, r.dificultad, r.creado_en
          FROM ranking r
          LEFT JOIN usuario u ON r.id_usuario = u.id_usuario
        ),
        filtered_ranking AS (
          SELECT * FROM ranking_general
          ${filteredConditions}
        )
      `;
      const [rows] = await pool.query(
        `${filteredRanking}
         SELECT * FROM filtered_ranking
         ORDER BY puntos DESC, creado_en ASC, id ASC
         LIMIT ? OFFSET ?`,
        [...filteredParams, limit, offset]
      );
      const [[{ total }]] = await pool.query(
        `${filteredRanking}
         SELECT COUNT(*) AS total FROM filtered_ranking`,
        filteredParams
      );
      const [top] = await pool.query(
        `${filteredRanking}
         SELECT puesto, username, user_id, puntos, modo, dificultad, creado_en
         FROM filtered_ranking
         ORDER BY puntos DESC, creado_en ASC, id ASC
         LIMIT 3`,
        filteredParams
      );
      const [facets] = await pool.query(
        `SELECT DISTINCT modo, dificultad
         FROM ranking
         WHERE modo IS NOT NULL OR dificultad IS NOT NULL
         ORDER BY modo, dificultad`
      );
      const [[statistics]] = await pool.query(
        `SELECT COUNT(*) AS puntajes_totales,
                COALESCE(MAX(puntos), 0) AS mejor_puntaje
         FROM ranking`
      );

      return Response.json(
        {
          rows,
          top,
          total: Number(total),
          statistics: {
            puntajes_totales: Number(statistics.puntajes_totales),
            mejor_puntaje: Number(statistics.mejor_puntaje)
          },
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
          ROW_NUMBER() OVER (
            ORDER BY r.puntos DESC, r.creado_en ASC, r.id_ranking ASC
          ) AS puesto,
          r.id_ranking AS id,
          COALESCE(u.username, r.id_usuario) AS username,
          r.id_usuario AS user_id,
          r.puntos,
          r.modo,
          r.dificultad,
          r.creado_en
        FROM ranking r
        LEFT JOIN usuario u ON r.id_usuario = u.id_usuario
      ),
      filtered_ranking AS (
        SELECT * FROM ranking_general
        ${filteredConditions}
      ),
      top5 AS (
        SELECT * FROM filtered_ranking ORDER BY puesto LIMIT 5
      ),
      mi_mejor_puntaje AS (
        SELECT * FROM filtered_ranking
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

    const queryParams = [...filteredParams, currentUserId];

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
  const rawUserId = body.id_usuario;
  const userId = typeof rawUserId === 'number' ||
    (typeof rawUserId === 'string' && /^\d+$/.test(rawUserId.trim()))
    ? Number(rawUserId)
    : Number.NaN;

  if (
    !username ||
    !Number.isSafeInteger(userId) ||
    userId < 1 ||
    !modo ||
    !dificultad ||
    body.puntos === undefined ||
    body.puntos === null ||
    body.puntos === '' ||
    !Number.isFinite(puntos) ||
    puntos < 0
  ) {
    return Response.json(
      { error: 'id_usuario, username, modo, dificultad y puntos válidos son obligatorios' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const pool = getPool();

    const [existingUser] = await pool.query(
      'SELECT id_usuario FROM usuario WHERE id_usuario = ? LIMIT 1',
      [userId]
    );

    if (existingUser.length === 0) {
      return Response.json(
        { error: 'Usuario no encontrado' },
        { status: 404, headers: corsHeaders }
      );
    }

    await pool.query(
      'UPDATE usuario SET username = ?, updated_at = NOW() WHERE id_usuario = ?',
      [username, userId]
    );

    const [resultado] = await pool.query(
      `INSERT INTO ranking
        (id_usuario, puntos, modo, dificultad, creado_en)
       VALUES (?, ?, ?, ?, NOW())`,
      [userId, puntos, modo, dificultad]
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