import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function DeckFormModal({ open, onClose, onSave, deck }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deck) {
      setTitle(deck.title || "");
      setDescription(deck.description || "");
    } else {
      setTitle("");
      setDescription("");
    }
  }, [deck, open]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), description: description.trim() });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-playfair text-xl">
            {deck ? "Edit Deck" : "New Deck"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="deck-title">Title</Label>
            <Input
              id="deck-title"
              placeholder="e.g. Biology 101"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deck-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="deck-desc"
              placeholder="What is this deck about?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? "Saving..." : deck ? "Save Changes" : "Create Deck"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}