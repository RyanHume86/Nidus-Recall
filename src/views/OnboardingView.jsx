import NidusLogo from "@/components/NidusLogo"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"

export function OnboardingView({ onCreateDeck, onCreateSampleDeck }) {
  const name = localStorage.getItem("nidus.firstName") || ""
  const heading = name ? `Welcome, ${name}.` : "Welcome to Nidus Recall."

  return (
    <div className="rapp-wrap rapp-fadein" style={{ textAlign: "center", paddingTop: 48 }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
        <NidusLogo size={48} theme="light" withWordmark withStrapline />
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 8, color: C.text }}>
        {heading}
      </div>
      <div style={{ fontSize: 14, color: C.textSec, marginBottom: 32, lineHeight: 1.65 }}>
        Build your own flashcard decks. Study using active recall.<br />
        Let spaced repetition handle the scheduling.
      </div>

      <button className="rapp-btn rapp-btn-primary" onClick={onCreateSampleDeck} style={{ width: "100%", marginBottom: 12 }}>
        {Ico.plus(14)} Try a sample deck
      </button>
      <button className="rapp-btn rapp-btn-ghost" onClick={onCreateDeck} style={{ width: "100%", marginBottom: 20 }}>
        Create your first deck
      </button>

      <p style={{ fontSize: 12, color: C.textMut, lineHeight: 1.6 }}>
        The sample deck includes basic, cloze, and image occlusion card types so you can explore each format before building your own content.
      </p>
    </div>
  )
}
