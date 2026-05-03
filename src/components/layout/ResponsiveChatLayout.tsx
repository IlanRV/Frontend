import type { ReactNode } from "react";

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

export function ResponsiveChatLayout({
  children,
  chat,
  chatTitle: _chatTitle,
  mainLabel,
  chatLabel = "AI chat",
  className,
  chatClassName,
}: ResponsiveChatLayoutProps) {
  return (
    <div className={cn("grid gap-5", className)}>
      <section aria-label={mainLabel} className="min-w-0 space-y-5">
        {children}
      </section>
      <aside aria-label={chatLabel} className={cn("min-w-0", chatClassName)}>
        {chat}
      </aside>
    </div>
  );
}