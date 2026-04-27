import { useState, useRef } from "react"
import { C } from "@/lib/theme"
import { genId } from "@/lib/dates"

// Lets the user load an image and draw rectangular or polygon mask regions.
// Coordinates stored as fractions (0.0 to 1.0) so geometry scales with display size.
// Design follows Image Occlusion Enhanced addon convention (AnKing, Pepper Pharm).
// Keyboard: R = rectangle mode, P = polygon mode.
// Rectangle: drag to draw. Polygon: click to add vertices, double-click or Enter to close.
export function ImageOcclusionEditor({ onSave }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [regions, setRegions] = useState([])
  const [drawing, setDrawing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [drawMode, setDrawMode] = useState("rect")
  const [polyPoints, setPolyPoints] = useState([])
  const imgRef = useRef(null)

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImageUrl(ev.target.result)
    reader.readAsDataURL(file)
    setRegions([]); setSelected(null); setPolyPoints([]); setDrawing(null)
  }

  const getFractionalCoords = (e) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }

  const onMouseDown = (e) => {
    if (!imageUrl || drawMode !== "rect") return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setDrawing({ startX: coords.x, startY: coords.y, x: coords.x, y: coords.y, w: 0, h: 0 })
    setSelected(null)
    e.preventDefault()
  }

  const onMouseMove = (e) => {
    if (!drawing || drawMode !== "rect") return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setDrawing(d => ({
      ...d,
      x: Math.min(d.startX, coords.x), y: Math.min(d.startY, coords.y),
      w: Math.abs(coords.x - d.startX), h: Math.abs(coords.y - d.startY),
    }))
  }

  const onMouseUp = () => {
    if (drawMode !== "rect") return
    if (!drawing || drawing.w < 0.02 || drawing.h < 0.02) { setDrawing(null); return }
    const newRegion = {
      id: genId(),
      label: 'Region ' + (regions.length + 1),
      type: 'rect',
      x: drawing.x, y: drawing.y, width: drawing.w, height: drawing.h,
    }
    setRegions(r => [...r, newRegion])
    setSelected(newRegion.id)
    setDrawing(null)
  }

  const onSvgClick = (e) => {
    if (!imageUrl || drawMode !== "poly") return
    const coords = getFractionalCoords(e)
    if (!coords) return
    setPolyPoints(pts => [...pts, coords])
  }

  const onSvgDblClick = (e) => {
    if (drawMode !== "poly") return
    e.preventDefault()
    closePoly()
  }

  const closePoly = () => {
    if (polyPoints.length < 3) { setPolyPoints([]); return }
    const newRegion = {
      id: genId(),
      label: 'Region ' + (regions.length + 1),
      type: 'polygon',
      points: polyPoints,
    }
    setRegions(r => [...r, newRegion])
    setSelected(newRegion.id)
    setPolyPoints([])
  }

  const deleteSelected = () => {
    setRegions(r => r.filter(reg => reg.id !== selected))
    setSelected(null)
  }

  const updateLabel = (id, label) => {
    setRegions(r => r.map(reg => reg.id === id ? { ...reg, label } : reg))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'r' || e.key === 'R') { setDrawMode("rect"); setPolyPoints([]); return }
    if (e.key === 'p' || e.key === 'P') { setDrawMode("poly"); setDrawing(null); return }
    if (e.key === 'Enter' && drawMode === "poly" && polyPoints.length >= 3) { closePoly(); return }
    if (e.key === 'Escape') { setPolyPoints([]); setDrawing(null); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && e.target.tagName !== 'INPUT') {
      deleteSelected()
    }
  }

  const sel = regions.find(r => r.id === selected)

  const renderRegion = (r) => {
    const isSelected = r.id === selected
    const fill = isSelected ? 'rgba(45,110,82,0.5)' : 'rgba(45,110,82,0.3)'
    const strokeWidth = isSelected ? '1' : '0.5'
    if (r.type === 'polygon' && r.points) {
      const pts = r.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')
      return (
        <polygon key={r.id} points={pts}
          fill={fill} stroke="#2D6E52" strokeWidth={strokeWidth}
          style={{ cursor:'pointer' }}
          onClick={(e) => { e.stopPropagation(); setSelected(r.id) }}
        />
      )
    }
    return (
      <rect key={r.id}
        x={r.x * 100} y={r.y * 100}
        width={(r.width || 0) * 100} height={(r.height || 0) * 100}
        fill={fill} stroke="#2D6E52" strokeWidth={strokeWidth}
        style={{ cursor:'pointer' }}
        onClick={(e) => { e.stopPropagation(); setSelected(r.id) }}
      />
    )
  }

  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} style={{ outline:'none' }}>
      <div className="rapp-mb12">
        <label className="rapp-label">Image file</label>
        <input type="file" accept="image/*" onChange={handleFile}
          style={{ width:'100%', fontSize:13, color:C.text, fontFamily:'inherit', padding:'8px 0', cursor:'pointer' }} />
      </div>
      {imageUrl && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            {[
              { id:'rect', label:'Rectangle (R)' },
              { id:'poly', label:'Polygon (P)' },
            ].map(m => (
              <button key={m.id}
                className={drawMode === m.id ? 'rapp-btn rapp-btn-primary' : 'rapp-btn rapp-btn-ghost'}
                style={{ padding:'6px 14px', fontSize:12 }}
                onClick={() => { setDrawMode(m.id); setPolyPoints([]); setDrawing(null) }}>
                {m.label}
              </button>
            ))}
            {drawMode === 'poly' && polyPoints.length > 0 && (
              <span style={{ fontSize:12, color:C.textMut, alignSelf:'center' }}>
                {polyPoints.length} vertices. Double-click or Enter to close.
              </span>
            )}
          </div>
          <div style={{ position:'relative', display:'inline-block', maxWidth:'100%', cursor:'crosshair', marginBottom:12, userSelect:'none' }}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
            <img ref={imgRef} src={imageUrl} style={{ display:'block', maxWidth:'100%' }} alt="Occlusion source" draggable={false} />
            <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
                 viewBox="0 0 100 100" preserveAspectRatio="none"
                 onClick={onSvgClick} onDoubleClick={onSvgDblClick}>
              {regions.map(renderRegion)}
              {drawing && drawMode === 'rect' && (
                <rect x={drawing.x * 100} y={drawing.y * 100}
                  width={drawing.w * 100} height={drawing.h * 100}
                  fill="rgba(45,110,82,0.2)" stroke="#2D6E52" strokeWidth="0.8" strokeDasharray="2,1" />
              )}
              {drawMode === 'poly' && polyPoints.length > 0 && (
                <polyline
                  points={polyPoints.map(p => `${p.x*100},${p.y*100}`).join(' ')}
                  fill="rgba(45,110,82,0.15)" stroke="#2D6E52" strokeWidth="0.8" strokeDasharray="2,1" />
              )}
            </svg>
          </div>
          {sel && (
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
              <input className="rapp-input" value={sel.label}
                onChange={e => updateLabel(sel.id, e.target.value)}
                style={{ flex:1 }} placeholder="Region label" />
              <button className="rapp-btn rapp-btn-ghost"
                style={{ padding:'8px 12px', fontSize:12, color:C.again, borderColor:'#E8B0A0' }}
                onClick={deleteSelected}>Delete</button>
            </div>
          )}
          <p style={{ fontSize:12, color:C.textMut, marginBottom:8, lineHeight:1.6 }}>
            Rectangle mode: drag to draw. Polygon mode: click vertices, double-click or Enter to close. Delete key removes selected region.
          </p>
          <p style={{ fontSize:12, color:C.textMut, marginBottom:12 }}>
            {regions.length === 0 ? 'No regions drawn yet.' : `${regions.length} region${regions.length !== 1 ? 's' : ''} drawn.`}
          </p>
          <button className="rapp-btn rapp-btn-primary" style={{ width:'100%' }}
            disabled={regions.length === 0}
            onClick={() => onSave(imageUrl, regions)}>
            Save regions ({regions.length} card{regions.length !== 1 ? 's' : ''} will be created)
          </button>
        </>
      )}
    </div>
  )
}
