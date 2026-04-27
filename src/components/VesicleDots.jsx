const DOTS = [
  { cx: "12%", cy: "18%", r: 3.2, op: 0.07 },
  { cx: "78%", cy: "11%", r: 2.4, op: 0.05 },
  { cx: "88%", cy: "55%", r: 3.8, op: 0.06 },
  { cx: "22%", cy: "72%", r: 2.8, op: 0.05 },
  { cx: "60%", cy: "85%", r: 2.0, op: 0.04 },
  { cx: "45%", cy: "30%", r: 1.6, op: 0.03 },
  { cx: "5%",  cy: "48%", r: 2.4, op: 0.04 },
]

export default function VesicleDots({ color = "#8AAD91", className = "" }) {
  return (
    <svg
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      className={className}
    >
      {DOTS.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={color} opacity={d.op} />
      ))}
    </svg>
  )
}
