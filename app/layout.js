export const metadata = {
  title: 'Dead Quarantine II - Sector 07',
  description: 'Explora el Sector 07, conoce a sus supervivientes y consulta la telemetría de Dead Quarantine II.',
  icons: {
    icon: '/img/logo2.0.jpeg',
    shortcut: '/img/logo2.0.jpeg',
    apple: '/img/logo2.0.jpeg'
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
