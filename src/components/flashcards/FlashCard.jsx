import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";

export default function FlashCard({ card, onCorrect, onIncorrect }) {
  const [flipped, setFlipped] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [answered, setAnswered] = useState(false);

  const handleFlip = () => {
    if (!answered) setFlipped(f => !f);
  };

  const handleCorrect = (e) => {
    e.stopPropagation();
    setAnswered(true);
    onCorrect();
  };

  const handleIncorrect = (e) => {
    e.stopPropagation();
    setAnswered(true);
    onIncorrect();
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-5">
      {/* Flip card */}
      <div
        className="card-flip w-full cursor-pointer select-none"
        style={{ height: "320px" }}
        onClick={handleFlip}
      >
        <div className={`card-flip-inner w-full h-full ${flipped ? "flipped" : ""}`}>
          {/* Front */}
          <div className="card-face w-full h-full bg-card border border-border rounded-3xl shadow-md flex flex-col items-center justify-center p-8 relative">
            <span className="absolute top-4 left-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Question</span>
            <p className="font-playfair text-2xl text-center text-foreground leading-relaxed">{card.question}</p>
            <span className="absolute bottom-4 text-xs text-muted-foreground">Tap to reveal answer</span>
          </div>

          {/* Back */}
          <div className="card-face card-back bg-card border border-border rounded-3xl shadow-md flex flex-col p-8 relative">
            <span className="absolute top-4 left-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Answer</span>
            <div className="flex-1 flex items-center justify-center">
              <p className="font-playfair text-2xl text-center text-foreground leading-relaxed">{card.answer}</p>
            </div>
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <RotateCcw className="w-3 h-3" /> Tap to flip back
            </div>
          </div>
        </div>
      </div>

      {/* Additional info toggle (only when flipped) */}
      <AnimatePresence>
        {flipped && card.additional_info && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full"
          >
            <button
              onClick={() => setShowInfo(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3 bg-accent text-accent-foreground rounded-2xl text-sm font-medium hover:bg-accent/80 transition-colors"
            >
              <span>Additional Information & Reasoning</span>
              {showInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <AnimatePresence>
              {showInfo && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-2 bg-accent/50 border border-border rounded-2xl px-5 py-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap"
                >
                  {card.additional_info}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Answer buttons (only when flipped and not yet answered) */}
      <AnimatePresence>
        {flipped && !answered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex gap-3 w-full"
          >
            <button
              onClick={handleIncorrect}
              className="flex-1 py-3 rounded-2xl border-2 border-rose-200 bg-rose-50 text-rose-700 font-semibold text-sm hover:bg-rose-100 transition-colors"
            >
              ✗ Got it wrong
            </button>
            <button
              onClick={handleCorrect}
              className="flex-1 py-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold text-sm hover:bg-emerald-100 transition-colors"
            >
              ✓ Got it right
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}