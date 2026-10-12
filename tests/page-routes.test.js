import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect }));

import Home from '../app/page.js';
import { GET as rankingRedirect } from '../app/ranking.html/route.js';
import { GET as achievementsRedirect } from '../app/logros_globales.html/route.js';

beforeEach(() => {
  redirect.mockReset();
});

describe('Home page redirect', () => {
  it('redirects to the dashboard without a view query', async () => {
    redirect.mockImplementation((path) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    await expect(Home({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow('NEXT_REDIRECT:/index.html');
    expect(redirect).toHaveBeenCalledWith('/index.html');
  });

  it('preserves and URI-encodes the requested dashboard view', async () => {
    redirect.mockImplementation((path) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    await expect(Home({ searchParams: Promise.resolve({ view: 'logros&mode=all' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/index.html?view=logros%26mode%3Dall');
  });

  it('does not append an empty view parameter', async () => {
    redirect.mockImplementation((path) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    await expect(Home({ searchParams: Promise.resolve({ view: '' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/index.html');
  });
});

describe('legacy page redirects', () => {
  it('redirects ranking.html to the ranking tab', async () => {
    const response = await rankingRedirect(new Request('https://example.test/ranking.html'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.test/?view=ranking');
  });

  it('redirects logros_globales.html to the achievements tab', async () => {
    const response = await achievementsRedirect(
      new Request('https://example.test/logros_globales.html')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.test/?view=logros');
  });
});
