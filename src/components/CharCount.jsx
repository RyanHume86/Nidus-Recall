export function CharCount({ current, max }) {
  const pct = current / max
  return <div className={`nid-char-count${pct>1?" over":pct>0.8?" warn":""}`}>{current}/{max}</div>
}
