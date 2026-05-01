import { useState, useRef, useCallback, DragEvent } from 'react'
import { C } from '@/lib/theme'
import { genId } from '@/lib/dates'
import { saveImage } from '@/api/storage'

interface Region {
  id: string
  label: string
  type: 'rect' | 'polygon'
  x?: number
  y?: number
  width?: number
  height?: number
  points?: Array<{ x: number; y: number }>
}

interface ImageMeta {
  width: number
  height: number
  mimeType: string
}

interface ImageUploadProps {
  onSave: (imageId: string, imageUrl: string, regions: Region[]) => void
}

const MAX_DIMENSION = 1920

async function compressImage(file: File): Promise<{ dataUrl: string } & ImageMeta> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const dataUrl = canvas.toDataURL(mimeType, 0.85)
      resolve({ dataUrl, width: w, height: h, mimeType })
    }
    img.onerror = reject
    img.src = objectUrl
  })
}

export function ImageUpload({ onSave }: ImageUploadProps) {
  const [imageUrl, setImageUrl]     = useState<string | null>(null)
  const [imageMeta, setImageMeta]   = useState<ImageMeta | null>(null)
  const [regions, setRegions]       = useState<Region[]>([])
  const [drawing, setDrawing]       = useState<any>(null)
  const [selected, setSelected]     = useState<string | null>(null)
  const [drawMode, setDrawMode]     = useState<'rect' | 'poly'>('rect')
  const [polyPoints, setPolyPoints] = useState<Array<{ x: number; y: number }>>([])
  const [saving, setSaving]         = useState(false)
  const [dragOver, setDragOver]     = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    const { dataUrl, width, height, mimeType } = await compressImage(file)
    setImageUrl(dataUrl)
    setImageMeta({ width, height, mimeType })
    setRegions([])
    setSelected(null)
    setPolyPoints([])
    setDrawing(null)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const getFractionalCoords = (e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (!imageUrl || drawMode !== 'rect') return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setDrawing({ startX: coords.x, startY: coords.y, x: coords.x, y: coords.y, w: 0, h: 0 })
    setSelected(null)
    e.preventDefault()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing || drawMode !== 'rect') return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setDrawing((d: any) => ({
      ...d,
      x: Math.min(d.startX, coords.x),
      y: Math.min(d.startY, coords.y),
      w: Math.abs(coords.x - d.startX),
      h: Math.abs(coords.y - d.startY),
    }))
  }

  const onMouseUp = () => {
    if (drawMode !== 'rect') return
    if (!drawing || drawing.w < 0.02 || drawing.h < 0.02) { setDrawing(null); return }
    const newRegion: Region = {
      id: genId(), label: 'Region ' + (regions.length + 1),
      type: 'rect', x: drawing.x, y: drawing.y, width: drawing.w, height: drawing.h,
    }
    setRegions(r => [...r, newRegion])
    setSelected(newRegion.id)
    setDrawing(null)
  }

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!imageUrl || drawMode !== 'poly') return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setPolyPoints(pts => [...pts, coords])
  }

  const onSvgDblClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawMode !== 'poly') return
    e.preventDefault()
    closePoly()
  }

  const closePoly = () => {
    if (polyPoints.length < 3) { setPolyPoints([]); return }
    const newRegion: Region = {
      id: genId(), label: 'Region ' + (regions.length + 1),
      type: 'polygon', points: polyPoints,
    }
    setRegions(r => [...r, newRegion])
    setSelected(newRegion.id)
    setPolyPoints([])
  }

  const deleteSelected = () => {
    setRegions(r => r.filter(reg => reg.id !== selected))
    setSelected(null)
  }

  const updateLabel = (id: string, label: string) => {
    setRegions(r => r.map(reg => reg.id === id ? { ...reg, label } : reg))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'r' || e.key === 'R') { setDrawMode('rect'); setPolyPoints([]); return }
    if (e.key === 'p' || e.key === 'P') { setDrawMode('poly'); setDrawing(null); return }
    if (e.key === 'Enter' && drawMode === 'poly' && polyPoints.length >= 3) { closePoly(); return }
    if (e.key === 'Escape') { setPolyPoints([]); setDrawing(null); return }
    const target = e.target as HTMLElement
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && target.tagName !== 'INPUT') {
      deleteSelected()
    }
  }

  const handleSave = async () => {
    if (!imageUrl || regions.length === 0 || !imageMeta) return
    setSaving(true)
    try {
      const entity = await saveImage({
        url: imageUrl,
        mimeType: imageMeta.mimeType,
        width: imageMeta.width,
        height: imageMeta.height,
        occlusionRegions: regions,
        linkedCardIds: [],
      })
      onSave(entity.id, imageUrl, regions)
    } finally {
      setSaving(false)
    }
  }

  const sel = regions.find(r => r.id === selected)

  const renderRegion = (r: Region) => {
    const isSelected = r.id === selected
    const fill = isSelected ? 'rgba(45,110,82,0.5)' : 'rgba(45,110,82,0.3)'
    const sw = isSelected ? '1' : '0.5'
    if (r.type === 'polygon' && r.points) {
      const pts = r.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')
      return (
        <polygon key={r.id} points={pts} fill={fill} stroke="#2D6E52" strokeWidth={sw}
          style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setSelected(r.id) }} />
      )
    }
    return (
      <rect key={r.id}
        x={(r.x || 0) * 100} y={(r.y || 0) * 100}
        width={(r.width || 0) * 100} height={(r.height || 0) * 100}
        fill={fill} stroke="#2D6E52" strokeWidth={sw}
        style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setSelected(r.id) }} />
    )
  }

  if (!imageUrl) {
    return (
      <div
        data-testid="image-drop-zone"
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        style={{
          border: `2px dashed ${dragOver ? C.accent : C.border}`,
          borderRadius: 8, padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
          background: dragOver ? `${C.accent}18` : 'transparent',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onClick={() => document.getElementById('nid-img-upload-input')?.click()}
      >
        <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 4px' }}>Drop an image here, or click to browse</p>
        <p style={{ fontSize: 12, color: C.textMut, margin: 0 }}>Resized to 1920 px max · JPEG / PNG</p>
        <input
          id="nid-img-upload-input"
          data-testid="image-file-input"
          type="file" accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    )
  }

  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} style={{ outline: 'none' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['rect', 'poly'] as const).map(m => (
          <button key={m}
            className={drawMode === m ? 'rapp-btn rapp-btn-primary' : 'rapp-btn rapp-btn-ghost'}
            style={{ padding: '6px 14px', fontSize: 12 }}
            onClick={() => { setDrawMode(m); setPolyPoints([]); setDrawing(null) }}>
            {m === 'rect' ? 'Rectangle (R)' : 'Polygon (P)'}
          </button>
        ))}
        <button className="rapp-btn rapp-btn-ghost"
          style={{ padding: '6px 14px', fontSize: 12, marginLeft: 'auto' }}
          onClick={() => { setImageUrl(null); setImageMeta(null); setRegions([]) }}>
          Change image
        </button>
        {drawMode === 'poly' && polyPoints.length > 0 && (
          <span style={{ fontSize: 12, color: C.textMut, alignSelf: 'center' }}>
            {polyPoints.length} vertices — double-click or Enter to close.
          </span>
        )}
      </div>

      <div
        style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', cursor: 'crosshair', marginBottom: 12, userSelect: 'none' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
      >
        <img ref={imgRef} src={imageUrl} style={{ display: 'block', maxWidth: '100%' }} alt="Occlusion source" draggable={false} />
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          viewBox="0 0 100 100" preserveAspectRatio="none"
          onClick={onSvgClick} onDoubleClick={onSvgDblClick}
        >
          {regions.map(renderRegion)}
          {drawing && drawMode === 'rect' && (
            <rect
              x={drawing.x * 100} y={drawing.y * 100}
              width={drawing.w * 100} height={drawing.h * 100}
              fill="rgba(45,110,82,0.2)" stroke="#2D6E52" strokeWidth="0.8" strokeDasharray="2,1" />
          )}
          {drawMode === 'poly' && polyPoints.length > 0 && (
            <polyline
              points={polyPoints.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
              fill="rgba(45,110,82,0.15)" stroke="#2D6E52" strokeWidth="0.8" strokeDasharray="2,1" />
          )}
        </svg>
      </div>

      {sel && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input className="rapp-input" value={sel.label}
            onChange={e => updateLabel(sel.id, e.target.value)}
            style={{ flex: 1 }} placeholder="Region label" />
          <button className="rapp-btn rapp-btn-ghost"
            style={{ padding: '8px 12px', fontSize: 12, color: C.again, borderColor: '#E8B0A0' }}
            onClick={deleteSelected}>Delete</button>
        </div>
      )}

      <p style={{ fontSize: 12, color: C.textMut, marginBottom: 8, lineHeight: 1.6 }}>
        Rectangle: drag to draw. Polygon: click vertices, double-click or Enter to close. Delete key removes selected.
      </p>
      <p style={{ fontSize: 12, color: C.textMut, marginBottom: 12 }}>
        {regions.length === 0 ? 'No regions drawn yet.' : `${regions.length} region${regions.length !== 1 ? 's' : ''} drawn.`}
      </p>

      <button
        data-testid="image-upload-save-btn"
        className="rapp-btn rapp-btn-primary"
        style={{ width: '100%' }}
        disabled={regions.length === 0 || saving}
        onClick={handleSave}
      >
        {saving ? 'Saving…' : `Save regions (${regions.length} card${regions.length !== 1 ? 's' : ''} will be created)`}
      </button>
    </div>
  )
}
