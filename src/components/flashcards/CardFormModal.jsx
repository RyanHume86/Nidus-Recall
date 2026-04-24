import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function CardFormModal({ open, onClose, onSave, card }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (card) {
      setQuestion(card.question || "");
      setAnswer(card.answer || "");
      setAdditionalInfo(card.additional_info || "");
    } else {
      setQuestion(""); setAnswer(""); setAdditionalInfo("");
    }
  }, [card, open]);

  const handleSave = async () => {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    await onSave({
      question: question.trim(),
      answer: answer.trim(),
      additional_info: additionalInfo.trim(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-playfair text-xl">
            {card ? "Edit Card" : "Add New Card"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Question <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="What is the question?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Answer <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="What is the answer?"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Additional Information / Reasoning <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              placeholder="Provide extra context, reasoning, or memory tips..."
              value={additionalInfo}
              onChange={e => setAdditionalInfo(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!question.trim() || !answer.trim() || saving}>
              {saving ? "Saving..." : card ? "Save Changes" : "Add Card"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}