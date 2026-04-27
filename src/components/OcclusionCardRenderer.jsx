export function OcclusionCardRenderer({ card, revealed }) {
  const { imageUrl, occlusionRegions, occlusionRegionId } = card
  if (!imageUrl || !occlusionRegions) return null
  return (
    <div style={{ position:'relative', display:'inline-block', maxWidth:'100%' }}>
      <img src={imageUrl} style={{ display:'block', maxWidth:'100%', userSelect:'none' }} alt="Occlusion card" />
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}
           viewBox="0 0 100 100" preserveAspectRatio="none">
        {occlusionRegions.map(r => {
          const isTarget = r.id === occlusionRegionId
          const fillColor = isTarget && !revealed ? '#2D6E52' : 'rgba(45,110,82,0.35)'
          const cx = r.type === 'polygon' && r.points
            ? r.points.reduce((s, p) => s + p.x, 0) / r.points.length
            : (r.x || 0) + (r.width || 0) / 2
          const cy = r.type === 'polygon' && r.points
            ? r.points.reduce((s, p) => s + p.y, 0) / r.points.length
            : (r.y || 0) + (r.height || 0) / 2
          return (
            <g key={r.id}>
              {r.type === 'polygon' && r.points ? (
                <polygon
                  points={r.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                  fill={fillColor} stroke="#2D6E52" strokeWidth="0.5"
                />
              ) : (
                <rect
                  x={(r.x || 0) * 100} y={(r.y || 0) * 100}
                  width={(r.width || 0) * 100} height={(r.height || 0) * 100}
                  fill={fillColor} stroke="#2D6E52" strokeWidth="0.5"
                />
              )}
              {(revealed || !isTarget) && (
                <text
                  x={cx * 100} y={cy * 100}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="3" fill={isTarget ? '#fff' : '#1a3d2b'} fontWeight="600"
                >
                  {r.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
