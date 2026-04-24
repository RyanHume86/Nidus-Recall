import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Trophy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StudyProgress({ total, correct, incorrect, onRestart, onExit }) {
  const answered = correct + incorrect;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  const getMessage = () => {
    if (accuracy >= 90) return "Outstanding! 🏆";
    if (accuracy >= 70) return "Great job! 🎉";
    if (accuracy >= 50) return "Keep going! 💪";
    return "Keep practicing! 📚";
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md mx-auto bg-card border border-border rounded-3xl shadow-lg p-8 text-center"
    >
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <Trophy className="w-8 h-8 text-primary" />
      </div>
      <h2 className="font-playfair text-2xl font-bold mb-1">Session Complete!</h2>
      <p className="text-muted-foreground mb-6">{getMessage()}</p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-secondary rounded-2xl p-3">
          <p className="text-2xl font-bold text-foreground">{total}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-3">
          <p className="text-2xl font-bold text-emerald-600">{correct}</p>
          <p className="text-xs text-emerald-600/70 mt-0.5">Correct</p>
        </div>
        <div className="bg-rose-50 rounded-2xl p-3">
          <p className="text-2xl font-bold text-rose-600">{incorrect}</p>
          <p className="text-xs text-rose-600/70 mt-0.5">Wrong</p>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">Accuracy</span>
          <span className="font-semibold">{accuracy}%</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-2.5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${accuracy}%` }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
            className="h-2.5 rounded-full bg-gradient-to-r from-primary to-indigo-400"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onExit}>
          Exit Deck
        </Button>
        <Button className="flex-1" onClick={onRestart}>
          <RotateCcw className="w-4 h-4 mr-2" /> Study Again
        </Button>
      </div>
    </motion.div>
  );
}