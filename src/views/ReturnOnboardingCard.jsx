import { C } from "@/lib/theme"

export function ReturnOnboardingCard({ daysSince, dueCount, onCatchUp, onReviewTen }) {
  return (
    <div className="rapp-wrap rapp-fadein" style={{ paddingTop:32 }}>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:80, fontWeight:700, letterSpacing:-4, color:C.text, lineHeight:1 }}>{daysSince}</div>
        <div style={{ fontSize:15, color:C.textMut, marginTop:8 }}>day{daysSince!==1?"s":""} since your last session</div>
      </div>

      <div className="rapp-card rapp-mb24">
        <div style={{ fontSize:18, fontWeight:600, color:C.text, marginBottom:10 }}>
          {dueCount} card{dueCount!==1?"s":""} ready for review
        </div>
        <p style={{ fontSize:14, color:C.textSec, lineHeight:1.75 }}>
          Your prior learning is still there; spaced repetition builds on what you've retained, not from zero.
        </p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button className="rapp-btn rapp-btn-primary rapp-btn-full" onClick={onCatchUp}>
          Start catch-up
        </button>
        <button className="rapp-btn rapp-btn-ghost rapp-btn-full" onClick={onReviewTen}>
          Review 10 cards today
        </button>
      </div>
    </div>
  )
}
