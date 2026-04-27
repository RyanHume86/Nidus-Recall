import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"

export function OnboardingView({ onCreateDeck, onCreateSampleDeck }) {
  // "See how it works" modal removed in Session 3: the sample deck (Common Pharmacology: Essentials)
  // demonstrates all card types in context, making the modal redundant. Users learn by doing.
  // The secondary action is kept as an outline button for users who prefer to build from scratch.
  return (
    <div className="rapp-wrap rapp-fadein" style={{ textAlign:"center", paddingTop:60 }}>
      <div style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>Welcome to Nidus Recall</div>
      <div style={{ fontSize:14, color:C.textSec, marginBottom:32, lineHeight:1.65 }}>
        Build your own flashcard decks. Study using active recall.<br/>Let spaced repetition handle the scheduling.
      </div>
      <button className="rapp-btn rapp-btn-primary" onClick={onCreateSampleDeck} style={{ width:"100%", marginBottom:12 }}>
        {Ico.plus(14)} Try a sample deck
      </button>
      <button className="rapp-btn rapp-btn-ghost" onClick={onCreateDeck} style={{ width:"100%", marginBottom:16 }}>
        Create your first deck
      </button>
      <p style={{ fontSize:12, color:C.textMut, lineHeight:1.6 }}>
        The sample deck includes basic, cloze, and image occlusion card types so you can explore each format before building your own content.
      </p>
    </div>
  )
}
