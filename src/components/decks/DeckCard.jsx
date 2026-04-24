import { BookOpen, MoreVertical, Trash2, Edit3 } from "lucide-react";
import { motion } from "framer-motion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const DECK_COLORS = [
  { bg: "from-violet-500 to-indigo-600", light: "bg-violet-50 text-violet-700" },
  { bg: "from-rose-500 to-pink-600", light: "bg-rose-50 text-rose-700" },
  { bg: "from-amber-500 to-orange-600", light: "bg-amber-50 text-amber-700" },
  { bg: "from-emerald-500 to-teal-600", light: "bg-emerald-50 text-emerald-700" },
  { bg: "from-sky-500 to-blue-600", light: "bg-sky-50 text-sky-700" },
  { bg: "from-fuchsia-500 to-purple-600", light: "bg-fuchsia-50 text-fuchsia-700" },
];

export function getDeckColor(index) {
  return DECK_COLORS[index % DECK_COLORS.length];
}

export default function DeckCard({ deck, index, onStudy, onEdit, onDelete }) {
  const color = getDeckColor(index);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="group relative bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer"
      onClick={() => onStudy(deck)}
    >
      {/* Color bar top */}
      <div className={`h-2 w-full bg-gradient-to-r ${color.bg}`} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center shadow-sm`}>
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit(deck)}>
                <Edit3 className="w-4 h-4 mr-2" /> Edit Deck
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(deck)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 className="font-semibold text-foreground text-base mb-1 leading-snug">{deck.title}</h3>
        {deck.description && (
          <p className="text-muted-foreground text-sm line-clamp-2 mb-3">{deck.description}</p>
        )}

        <div className="flex items-center justify-between mt-4">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${color.light}`}>
            {deck.card_count ?? 0} cards
          </span>
          <span className="text-xs text-muted-foreground">Tap to study →</span>
        </div>
      </div>
    </motion.div>
  );
}