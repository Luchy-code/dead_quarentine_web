import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
// Importá acá tu conexión a la base de datos (ej. pool de mysql2 o prisma)
import { db } from '@/lib/db'; 

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // Tu Client ID de GCP
const client = new OAuth2Client(CLIENT_ID);

export async function POST(request) {
  try {
    const { id_token } = await request.json();

    // 1. Google valida la autenticidad del token
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const googleId = payload['sub']; // ID permanente de Google
    const email = payload['email'];
    const nombre = payload['name'];

    // 2. Buscar si el usuario ya existe en tu base
    const [usuarios] = await db.query(
      'SELECT * FROM usuarios WHERE google_id = ?',
      [googleId]
    );

    let usuario = usuarios[0];

    // 3. Si no existe, crearlo como nuevo jugador
    if (!usuario) {
      const [insertResult] = await db.query(
        'INSERT INTO usuarios (google_id, email, nombre, nivel, record) VALUES (?, ?, ?, 1, 0)',
        [googleId, email, nombre]
      );
      
      const [nuevoUsuario] = await db.query(
        'SELECT * FROM usuarios WHERE id = ?',
        [insertResult.insertId]
      );
      usuario = nuevoUsuario[0];
    }

    // 4. Devolver los datos del jugador a Unity
    return NextResponse.json({
      success: true,
      usuario: {
        id: usuario.id,
        google_id: usuario.google_id,
        nombre: usuario.nombre,
        email: usuario.email,
        nivel: usuario.nivel,
        record: usuario.record,
      },
    });

  } catch (error) {
    console.error('Error al autenticar token:', error);
    return NextResponse.json(
      { success: false, error: 'Token inválido o expirado' },
      { status: 401 }
    );
  }
}