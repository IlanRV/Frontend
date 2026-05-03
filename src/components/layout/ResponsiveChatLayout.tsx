import { MessageSquare } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ResponsiveChatLayoutProps {
  children: ReactNode;
  chat: ReactNode;
  chatTitle: string;
  mainLabel: string;
  chatLabel?: string;
  className?: string;
  chatClassName?: string;
}

const DESKTOP_CHAT_QUERY = "(min-width: 1280px)";

function readMediaQuery(query: string) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }

  return window.matchMedia(query).matches;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => readMediaQuery(query));

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

export function ResponsiveChatLayout({
  children,
  chat,
  chatTitle,
  mainLabel,
  chatLabel = "AI chat",
  className,
  chatClassName,
}: ResponsiveChatLayoutProps) {
  const isDesktop = useMediaQuery(DESKTOP_CHAT_QUERY);
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className={cn("grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]", className)}>
      <section aria-label={mainLabel} className="min-w-0 space-y-5">
        {children}
      </section>

      {isDesktop ? (
        <aside
          aria-label={chatLabel}
          className={cn("min-w-0 self-start xl:sticky xl:top-6", chatClassName)}
        >
          {chat}
        </aside>
      ) : (
        <>
          <div className="fixed bottom-4 right-4 z-40 xl:hidden">
            <Button
              type="button"
              className="rounded-full px-4 shadow-lg"
              aria-haspopup="dialog"
              aria-expanded={isChatOpen}
              onClick={() => setIsChatOpen(true)}
            >
              <MessageSquare className="h-4 w-4" />
              Open {chatTitle}
            </Button>
          </div>
          <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
            <DialogContent className="bottom-0 top-auto flex max-h-[88vh] min-h-[70vh] w-full max-w-none translate-y-0 grid-rows-[auto_1fr] gap-3 rounded-b-none p-4 sm:bottom-auto sm:top-1/2 sm:max-w-2xl sm:-translate-y-1/2 sm:rounded-lg">
              <DialogHeader>
                <DialogTitle>{chatTitle}</DialogTitle>
                <DialogDescription>
                  Ask AI about this context without losing your place.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-hidden">{chat}</div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}