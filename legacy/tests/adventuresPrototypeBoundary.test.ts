import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const previewRoot = resolve(root, 'src/prototypes/adventures');
function graph(entry: string): Map<string, string> {
  const visited = new Map<string, string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    const source = readFileSync(file, 'utf8');
    visited.set(file, source);
    if (file.endsWith('.css')) return;
    // Static ESM only: reject dynamic loading rather than silently skipping it.
    if (file.startsWith(previewRoot))
      expect(source).not.toMatch(/\b(?:import|require)\s*\(/);
    for (const match of source.matchAll(
      /^\s*(?:import|export)\s+(?:type\s+)?(?:[\w$*{},\s]+?\s+from\s*)?['"]([^'"]+)['"]/gm,
    )) {
      const name = match[1];
      if (!name.startsWith('.')) {
        expect(['react', 'react-dom/client']).toContain(name);
      } else {
        const base = resolve(dirname(file), name);
        const target = [base, `${base}.ts`, `${base}.tsx`].find((candidate) =>
          existsSync(candidate),
        );
        if (!target) throw new Error(`Unresolved boundary import: ${name}`);
        visit(target);
      }
    }
  }
  visit(resolve(root, entry));
  return visited;
}
describe('Adventures preview isolation boundary', () => {
  it('limits transitive imports to preview files, shared CSS, and the storage-free dice components', () => {
    const shared = new Set([
      'src/index.css',
      'src/features/dice/DiceRoller.tsx',
      'src/features/dice/rollDice.ts',
      'src/features/dice/rollHistory.ts',
    ]);
    for (const [file, source] of graph('src/prototypes/adventures/main.tsx')) {
      expect(
        file.startsWith(`${previewRoot}/`) || shared.has(relative(root, file)),
        relative(root, file),
      ).toBe(true);
      expect(source).not.toMatch(
        /\b(?:localStorage|sessionStorage|indexedDB|AppRepository|XMLHttpRequest|WebSocket)\b/,
      );
      expect(source).not.toMatch(/\b(?:fetch|require|eval)\s*\(/);
    }
  });
  it('keeps the production dependency graph independent from the prototype', () => {
    for (const file of graph('src/main.tsx').keys())
      expect(file.startsWith(`${previewRoot}/`)).toBe(false);
    expect(readFileSync(resolve(root, 'index.html'), 'utf8')).not.toContain(
      'adventures',
    );
    expect(
      readFileSync(resolve(root, 'adventures-preview.html'), 'utf8'),
    ).toContain('/src/prototypes/adventures/main.tsx');
  });
});
