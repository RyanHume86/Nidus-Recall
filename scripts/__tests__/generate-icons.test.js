/**
 * Validates that generate-icons.js produced PNG files with correct dimensions.
 * Runs the script via child_process so the test stays independent of sharp internals.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import sharp from 'sharp'
import { spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..', '..')

const ICONS = [
  { path: resolve(root, 'public', 'icons', 'icon-512.png'), size: 512 },
  { path: resolve(root, 'public', 'icons', 'icon-192.png'), size: 192 },
  { path: resolve(root, 'public', 'apple-touch-icon.png'), size: 180 },
]

describe('generate-icons', () => {
  beforeAll(() => {
    // Re-run the script to ensure outputs are fresh
    const result = spawnSync('node', ['scripts/generate-icons.js'], {
      cwd: root,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      throw new Error(`generate-icons.js failed:\n${result.stderr}`)
    }
  })

  for (const { path, size } of ICONS) {
    it(`${size}x${size} PNG exists`, () => {
      expect(existsSync(path)).toBe(true)
    })

    it(`${size}x${size} PNG has correct dimensions`, async () => {
      const meta = await sharp(path).metadata()
      expect(meta.format).toBe('png')
      expect(meta.width).toBe(size)
      expect(meta.height).toBe(size)
    })
  }
})
