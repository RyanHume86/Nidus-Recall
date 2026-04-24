import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeckCard from "@/components/decks/DeckCard";
import DeckFormModal from "@/components/decks/DeckFormModal";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);

  const loadDecks = async () => {
    const data = await base44.entities.Deck.list("-created_date");
    setDecks(data);
    setLoading(false);
  };

  useEffect(() => { loadDecks(); }, []);

  const handleSave = async (data) => {
    if (editingDeck) {
      await base44.entities.Deck.update(editingDeck.id, data);
    } else {
      await base44.entities.Deck.create({ ...data, card_count: 0 });
    }
    setEditingDeck(null);
    loadDecks();
  };

  const handleDelete = async (deck) => {
    await base44.entities.Deck.delete(deck.id);
    loadDecks();
  };

  const handleEdit = (deck) => {
    setEditingDeck(deck);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-indigo-400 rounded-xl flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="font-playfair text-xl font-bold text-foreground">MemoryDeck</span>
          </div>
          <Button onClick={() => { setEditingDeck(null); setModalOpen(true); }} size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> New Deck
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : decks.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24"
          >
            <div className="w-20 h-20 bg-accent rounded-3xl flex items-center justify-center mx-auto mb-5">
              <BookOpen className="w-9 h-9 text-accent-foreground" />
            </div>
            <h2 className="font-playfair text-2xl font-bold mb-2">No decks yet</h2>
            <p className="text-muted-foreground mb-6">Create your first deck to start studying</p>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create a Deck
            </Button>
          </motion.div>
        ) : (
          <>
            <div className="mb-7">
              <h1 className="font-playfair text-3xl font-bold text-foreground">Your Decks</h1>
              <p className="text-muted-foreground mt-1">{decks.length} deck{decks.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {decks.map((deck, i) => (
                  <DeckCard
                    key={deck.id}
                    deck={deck}
                    index={i}
                    onStudy={(d) => navigate(`/deck/${d.id}`)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </main>

      <DeckFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingDeck(null); }}
        onSave={handleSave}
        deck={editingDeck}
      />
    </div>
  );
}