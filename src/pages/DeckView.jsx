import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Edit3, Trash2, BookOpen, GraduationCap, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CardFormModal from "@/components/flashcards/CardFormModal";
import FlashCard from "@/components/flashcards/FlashCard";
import StudyProgress from "@/components/study/StudyProgress";
import { getDeckColor } from "@/components/decks/DeckCard";

const MASTERY_LABELS = ["New", "Learning", "Familiar", "Confident", "Mastered", "Expert"];
const MASTERY_COLORS = [
  "bg-gray-100 text-gray-600",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-yellow-100 text-yellow-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
];

export default function DeckView() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("list"); // list | study
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);

  // Study state
  const [studyQueue, setStudyQueue] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionIncorrect, setSessionIncorrect] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);

  const loadData = async () => {
    const [deckData, cardData] = await Promise.all([
      base44.entities.Deck.filter({ id: deckId }),
      base44.entities.Flashcard.filter({ deck_id: deckId }),
    ]);
    setDeck(deckData[0] || null);
    setCards(cardData);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [deckId]);

  const startStudy = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setStudyQueue(shuffled);
    setCurrentIdx(0);
    setSessionCorrect(0);
    setSessionIncorrect(0);
    setSessionDone(false);
    setMode("study");
  };

  const handleCorrect = async () => {
    const card = studyQueue[currentIdx];
    const newCorrect = (card.times_correct || 0) + 1;
    const total = newCorrect + (card.times_incorrect || 0);
    const newMastery = Math.min(5, Math.floor((newCorrect / total) * 5 + 0.5));
    await base44.entities.Flashcard.update(card.id, {
      times_correct: newCorrect,
      mastery_level: newMastery,
      last_studied: new Date().toISOString(),
    });
    setSessionCorrect(c => c + 1);
    advanceCard();
  };

  const handleIncorrect = async () => {
    const card = studyQueue[currentIdx];
    const newIncorrect = (card.times_incorrect || 0) + 1;
    const totalCorrect = card.times_correct || 0;
    const total = totalCorrect + newIncorrect;
    const newMastery = Math.max(0, Math.floor((totalCorrect / total) * 5));
    await base44.entities.Flashcard.update(card.id, {
      times_incorrect: newIncorrect,
      mastery_level: newMastery,
      last_studied: new Date().toISOString(),
    });
    setSessionIncorrect(c => c + 1);
    advanceCard();
  };

  const advanceCard = () => {
    if (currentIdx + 1 >= studyQueue.length) {
      setSessionDone(true);
    } else {
      setCurrentIdx(i => i + 1);
    }
  };

  const handleSaveCard = async (data) => {
    if (editingCard) {
      await base44.entities.Flashcard.update(editingCard.id, data);
    } else {
      await base44.entities.Flashcard.create({ ...data, deck_id: deckId, mastery_level: 0, times_correct: 0, times_incorrect: 0 });
      await base44.entities.Deck.update(deckId, { card_count: cards.length + 1 });
    }
    setEditingCard(null);
    loadData();
  };

  const handleDeleteCard = async (card) => {
    await base44.entities.Flashcard.delete(card.id);
    await base44.entities.Deck.update(deckId, { card_count: Math.max(0, cards.length - 1) });
    loadData();
  };

  const color = getDeckColor(0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-7 h-7 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Deck not found.</p>
        <Button onClick={() => navigate("/")} variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Go Home</Button>
      </div>
    );
  }

  // STUDY MODE
  if (mode === "study") {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
            <button onClick={() => setMode("list")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /> Back to deck
            </button>
            {!sessionDone && (
              <span className="text-sm text-muted-foreground font-medium">
                {currentIdx + 1} / {studyQueue.length}
              </span>
            )}
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-5 py-10">
          {/* Progress bar */}
          {!sessionDone && (
            <div className="w-full bg-secondary rounded-full h-1.5 mb-8">
              <motion.div
                className="h-1.5 rounded-full bg-gradient-to-r from-primary to-indigo-400"
                animate={{ width: `${((currentIdx) / studyQueue.length) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          )}

          {sessionDone ? (
            <StudyProgress
              total={studyQueue.length}
              correct={sessionCorrect}
              incorrect={sessionIncorrect}
              onRestart={startStudy}
              onExit={() => { setMode("list"); loadData(); }}
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIdx}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
              >
                <FlashCard
                  card={studyQueue[currentIdx]}
                  onCorrect={handleCorrect}
                  onIncorrect={handleIncorrect}
                />
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    );
  }

  // LIST MODE
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" /> All Decks
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditingCard(null); setCardModalOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Card
            </Button>
            <Button size="sm" onClick={startStudy} disabled={cards.length === 0}>
              <GraduationCap className="w-4 h-4 mr-1.5" /> Study
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10">
        {/* Deck header */}
        <div className="mb-8">
          <h1 className="font-playfair text-3xl font-bold text-foreground">{deck.title}</h1>
          {deck.description && <p className="text-muted-foreground mt-1">{deck.description}</p>}
          <p className="text-sm text-muted-foreground mt-2">{cards.length} card{cards.length !== 1 ? "s" : ""}</p>
        </div>

        {cards.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="w-16 h-16 bg-accent rounded-3xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7 text-accent-foreground" />
            </div>
            <h2 className="font-playfair text-xl font-bold mb-2">No cards yet</h2>
            <p className="text-muted-foreground mb-5">Add your first flashcard to this deck</p>
            <Button onClick={() => setCardModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Card
            </Button>
          </motion.div>
        ) : (
          <div className="grid gap-3">
            {cards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group bg-card border border-border rounded-2xl px-5 py-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground mb-1 line-clamp-2">{card.question}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">{card.answer}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-xs ${MASTERY_COLORS[card.mastery_level ?? 0]}`} variant="secondary">
                      {MASTERY_LABELS[card.mastery_level ?? 0]}
                    </Badge>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingCard(card); setCardModalOpen(true); }}
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCard(card)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                {card.times_correct + card.times_incorrect > 0 && (
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-emerald-600">✓ {card.times_correct} correct</span>
                    <span className="text-xs text-rose-600">✗ {card.times_incorrect} wrong</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <CardFormModal
        open={cardModalOpen}
        onClose={() => { setCardModalOpen(false); setEditingCard(null); }}
        onSave={handleSaveCard}
        card={editingCard}
      />
    </div>
  );
}