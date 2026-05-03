import { MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui/button";

interface FloatingRepoChatProps {
  repoId: string;
}

export function FloatingRepoChat({ repoId }: FloatingRepoChatProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-3">
      {isOpen && (
        <aside
          aria-label="Inspector chat"
          className="w-[min(calc(100vw-2rem),26rem)] overflow-hidden rounded-xl border border-cyan-200/70 bg-background shadow-[0_24px_80px_rgba(8,47,73,0.28)] dark:border-cyan-900/60"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
              Repo AI
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)} title="Close repo chat">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ChatPanel
            scope={{ type: "repo", id: repoId }}
            title="Repo AI"
            className="max-h-[min(34rem,calc(100vh-8rem))] min-h-[28rem] rounded-none border-0 shadow-none"
          />
        </aside>
      )}
      <Button
        type="button"
        variant={isOpen ? "secondary" : "success"}
        className="rounded-full px-4 shadow-[0_14px_40px_rgba(8,47,73,0.35)]"
        onClick={() => setIsOpen((open) => !open)}
      >
        <MessageSquare className="h-4 w-4" />
        {isOpen ? "Hide repo chat" : "Open repo chat"}
      </Button>
    </div>,
    document.body,
  );
}
