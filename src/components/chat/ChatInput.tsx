import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  disabled?: boolean;
  onSend: (message: string) => Promise<void>;
}

export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();

    if (!trimmed || disabled) {
      return;
    }

    setMessage("");
    await onSend(trimmed);
  }

  return (
    <form className="flex gap-2 border-t border-border p-3" onSubmit={handleSubmit}>
      <Textarea
        value={message}
        rows={1}
        disabled={disabled}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="Ask about this codebase..."
        className="max-h-32 min-h-10 resize-none"
      />
      <Button type="submit" size="icon" disabled={disabled || message.trim().length === 0} title="Send message">
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
