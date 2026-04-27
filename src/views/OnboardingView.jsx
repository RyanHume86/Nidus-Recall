import { useState, useRef, useEffect } from "react"
import { C } from "@/lib/theme"
import { Ico } from "@/lib/icons"

function saveName(name) {
  const trimmed = name.trim().slice(0, 60)
  if (trimmed) localStorage.setItem("nidus.firstName", trimmed)
  return trimmed
}

export function OnboardingView({ onCreateDeck, onCreateSampleDeck }) {
  const stored = localStorage.getItem("nidus.firstName") || ""
  const [step, setStep] = useState(stored ? "welcome" : "name")
  const [draft, setDraft] = useState("")
  const inputRef = useRef(null)

  useEffect(() => {
    if (step === "name" && inputRef.current) inputRef.current.focus()
  }, [step])

  function handleContinue() {
    const name = saveName(draft)
    setStep(name ? "meet" : "welcome")
  }

  function handleSkip() {
    setStep("welcome")
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleContinue()
  }

  if (step === "name") {
    return (
      <div className="rapp-wrap rapp-fadein" style={{ textAlign: "center", paddingTop: 60, maxWidth: 400, margin: "0 auto" }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>What should we call you?</div>
        <div style={{ fontSize: 14, color: C.textSec, marginBottom: 28, lineHeight: 1.65 }}>
          Just a first name. We'll use it to say hello.
        </div>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Your first name"
          maxLength={60}
          className="rapp-input"
          style={{ width: "100%", marginBottom: 12, fontSize: 16 }}
        />
        <button
          className="rapp-btn rapp-btn-primary"
          onClick={handleContinue}
          style={{ width: "100%", marginBottom: 10 }}
        >
          Continue
        </button>
        <button
          className="rapp-btn rapp-btn-ghost"
          onClick={handleSkip}
          style={{ width: "100%" }}
        >
          Skip
        </button>
      </div>
    )
  }

  if (step === "meet") {
    const name = localStorage.getItem("nidus.firstName") || ""
    return (
      <div className="rapp-wrap rapp-fadein" style={{ textAlign: "center", paddingTop: 60, maxWidth: 400, margin: "0 auto" }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Nice to meet you, {name}.</div>
        <div style={{ fontSize: 14, color: C.textSec, marginBottom: 32, lineHeight: 1.65 }}>
          Ready to build something worth remembering?
        </div>
        <button
          className="rapp-btn rapp-btn-primary"
          onClick={() => setStep("welcome")}
          style={{ width: "100%" }}
        >
          Let's go
        </button>
      </div>
    )
  }

  return (
    <div className="rapp-wrap rapp-fadein" style={{ textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Welcome to Nidus Recall</div>
      <div style={{ fontSize: 14, color: C.textSec, marginBottom: 32, lineHeight: 1.65 }}>
        Build your own flashcard decks. Study using active recall.<br />Let spaced repetition handle the scheduling.
      </div>
      <button className="rapp-btn rapp-btn-primary" onClick={onCreateSampleDeck} style={{ width: "100%", marginBottom: 12 }}>
        {Ico.plus(14)} Try a sample deck
      </button>
      <button className="rapp-btn rapp-btn-ghost" onClick={onCreateDeck} style={{ width: "100%", marginBottom: 16 }}>
        Create your first deck
      </button>
      <p style={{ fontSize: 12, color: C.textMut, lineHeight: 1.6 }}>
        The sample deck includes basic, cloze, and image occlusion card types so you can explore each format before building your own content.
      </p>
    </div>
  )
}
