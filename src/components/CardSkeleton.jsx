export function CardSkeleton({ count = 5 }) {
  return (
    <div data-testid="card-skeleton" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rapp-skel"
          style={{ height: 68, borderRadius: 12, opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  )
}
