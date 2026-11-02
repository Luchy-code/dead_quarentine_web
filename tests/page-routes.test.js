import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect }));

import Home from '../app/page.js';

beforeEach(() => {
  redirect.mockReset();
});

describe('Home page redirect', () => {
  it('redirects to the homepage without a view query', async () => {
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
      .rejects.toThrow('NEXT_REDIRECT:/telemetria.html?view=logros%26mode%3Dall');
  });

  it('does not append an empty view parameter', async () => {
    redirect.mockImplementation((path) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });

    await expect(Home({ searchParams: Promise.resolve({ view: '' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/index.html');
  });
});
