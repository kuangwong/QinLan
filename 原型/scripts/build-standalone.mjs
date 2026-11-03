import { readFile, writeFile } from 'node:fs/promises';

let html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const jsMatch = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if (!jsMatch || !cssMatch) throw new Error('Build assets not found. Run vite build first.');
const assetUrl = path => new URL(`../dist/${path.replace(/^\.?\//, '')}`, import.meta.url);
const script = await readFile(assetUrl(jsMatch[1]), 'utf8');
const css = await readFile(assetUrl(cssMatch[1]), 'utf8');
const favicon = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
html = html.replace(jsMatch[0], '');
html = html.replace(cssMatch[0], () => `<style>${css}</style>`);
html = html.replace('href="/favicon.svg"', () => `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`);
html = html.replace('</body>', () => `<script>${script.replace(/<\/script/gi, '<\\/script')}</script></body>`);
await writeFile(new URL('../prototype.html', import.meta.url), html);
console.log('✓ prototype.html — standalone page, no server or network required');
