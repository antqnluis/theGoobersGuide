// `npm run art:check`: fails on any off-palette colour, partial alpha, extra
// PNG chunk, or size that disagrees with the manifest.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { masterColors } from '../../src/features/campaigns/camp/masterPalette.ts'
import { checkManifestFiles, checkPng, type Manifest } from './checkArt.ts'
import { artDir, manifestPath } from './paths.ts'

const problems: string[] = []
if (!existsSync(manifestPath)) {
  console.error(`No manifest at ${manifestPath}. Run npm run art:placeholder or art:build.`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
const files = readdirSync(artDir).filter((name) => name.endsWith('.png'))
problems.push(...checkManifestFiles(manifest, files))

const allowed = new Set(masterColors())
for (const layer of manifest.layers) {
  const path = join(artDir, layer.file)
  if (!existsSync(path)) continue
  for (const problem of checkPng(readFileSync(path), {
    allowed,
    expected: { width: layer.width, height: layer.height },
  })) {
    problems.push(`${layer.file}: ${problem}`)
  }
}

const placeholders = manifest.layers.filter(({ status }) => status === 'placeholder').length
if (problems.length) {
  console.error(problems.map((problem) => `  - ${problem}`).join('\n'))
  console.error(`art:check failed with ${problems.length} problem(s).`)
  process.exit(1)
}
console.log(
  `art:check passed: ${manifest.layers.length} layer(s), ${placeholders} still PLACEHOLDER.`,
)
