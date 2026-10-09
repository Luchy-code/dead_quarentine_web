import { redirect } from 'next/navigation';

export default async function Home({ searchParams }) {
  const { view } = await searchParams;
  const query = view ? `?view=${encodeURIComponent(view)}` : '';

  redirect(`/index.html${query}`);
}
