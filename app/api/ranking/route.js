import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    id, username, puntos, modo, pais, codigo_pais, usa_vpn, creado_en,
    CASE
      WHEN puntos >= 13000 THEN 'Pesadilla'
      WHEN puntos >= 9000 THEN 'Difícil'
      WHEN puntos >= 5000 THEN 'Normal'
      ELSE 'Fácil'
    END AS dificultad
    FROM ranking WHERE 1=1`;
  const params = [];

  if (country && country !== 'ALL') {
    query += ' AND codigo_pais = ?';
    params.push(country);
  }
  if (mode && mode !== 'ALL') {
    query += ' AND modo = ?';
    params.push(mode);
  }
  if (vpnOnly === 'true') {
    query += ' AND usa_vpn = 0';
  }
  if (search) {
    query += ' AND username LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY puntos DESC LIMIT ?';
  params.push(limit);

  try {
    const [rows] = await getPool().query(query, params);
    return Response.json(rows, { headers: corsHeaders });
  } catch (error) {
    console.error('Error al obtener el ranking:', error);
    return Response.json(
      { error: 'Error al obtener ranking' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
