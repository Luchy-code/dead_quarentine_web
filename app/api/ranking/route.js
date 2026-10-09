import { getPool } from '../../../lib/mysql';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const country = searchParams.get('country');
  const mode = searchParams.get('mode');
  const vpnOnly = searchParams.get('vpnOnly');
  const search = searchParams.get('search');
  let query = 'SELECT id, username, puntos, modo, ip, pais, codigo_pais, usa_vpn, creado_en FROM ranking WHERE 1=1';
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

  query += ' ORDER BY puntos DESC LIMIT 100';

  try {
    const [rows] = await getPool().query(query, params);
    return Response.json(rows);
  } catch (error) {
    console.error('Error al obtener el ranking:', error);
    return Response.json({ error: 'Error al obtener ranking' }, { status: 500 });
  }
}
