import { redirect } from 'next/navigation';

export default async function Home({ searchParams }) {
  const { view } = await searchParams;
  const destination = view
    ? `/telemetria.html?view=${encodeURIComponent(view)}`
    : '/index.html';

  redirect(destination);
}
