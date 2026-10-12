import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = process.cwd();

export function readProjectFile(...pathParts) {
  return readFile(join(root, ...pathParts), 'utf8');
}

export async function createPage(fileName, url = 'https://dead-quarantine.test/') {
  const html = await readProjectFile('public', fileName);
  return new JSDOM(html, { runScripts: 'outside-only', url });
}

export function executeInlineScript(dom, predicate) {
  const script = [...dom.window.document.querySelectorAll('script')]
    .find((element) => predicate(element.textContent));

  if (!script) {
    throw new Error('No se encontró el script inline solicitado.');
  }

  dom.window.eval(script.textContent);
}

export function jsonRequest(body, headers = {}) {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}
