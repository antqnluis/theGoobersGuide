import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Manifest } from './checkArt.ts'

const root = join(import.meta.dirname, '..', '..')

export const sourceDir = join(root, 'art-src', 'camp')
export const artDir = join(root, 'src', 'features', 'campaigns', 'camp', 'art')
export const manifestPath = join(artDir, 'manifest.json')

export function readManifest(panorama: { width: number; height: number }): Manifest {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  } catch {
    return { version: 1, panorama, layers: [] }
  }
}
