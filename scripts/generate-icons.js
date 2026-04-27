#!/usr/bin/env node
/**
 * Generate PNG icons from public/icons/icon-512.svg.
 * Outputs into public/icons/ (192x192, 512x512) and public/ (apple-touch-icon 180x180).
 *
 * Usage:
 *   node scripts/generate-icons.js
 *   npm run build:icons
 */

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root      = resolve(__dirname, '..')
const srcSvg    = resolve(root, 'public', 'icons', 'icon-512.svg')
const svgBuf    = readFileSync(srcSvg)

const targets = [
  { size: 512, dest: resolve(root, 'public', 'icons', 'icon-512.png') },
  { size: 192, dest: resolve(root, 'public', 'icons', 'icon-192.png') },
  { size: 180, dest: resolve(root, 'public', 'apple-touch-icon.png') },
]

for (const { size, dest } of targets) {
  await sharp(svgBuf).resize(size, size).png().toFile(dest)
  console.log(`Generated ${dest} (${size}x${size})`)
}
