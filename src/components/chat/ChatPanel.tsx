import { MessageSquare, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, normalizeChatMessages } from "@/lib/api";
import { cn, createClientId } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/types";

type ChatScope =
  | {
      type: "workspace";
      id: string;
    }
  | {
      type: "repo";
      id: string;
    };

interface ChatPanelProps {
  scope: ChatScope;
  title?: string;
  className?: string;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ChatPanel({ scope, title = "AI chat", className }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const response =
        scope.type === "workspace"
          ? await api.chat.getWorkspace(scope.id)
          : await api.chat.getRepo(scope.id);
      setMessages(normalizeChatMessages(response));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load chat history"));
    } finally {
      setIsLoading(false);
    }
  }, [scope.id, scope.type]);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMessage: ChatMessageType = {
        id: createClientId("msg"),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, userMessage]);
      setIsThinking(true);

      try {
        const response =
          scope.type === "workspace"
            ? await api.chat.sendWorkspace(scope.id, content)
            : await api.chat.sendRepo(scope.id, content);

        setMessages((current) => [
          ...current,
          {
            id: createClientId("msg"),
            role: "assistant",
            content: response.reply,
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch (sendError) {
        const message = getErrorMessage(sendError, "Unable to send message");
        toast.error(message);
        setMessages((current) => current.filter((item) => item.id !== userMessage.id));
      } finally {
        setIsThinking(false);
      }
    },
    [scope.id, scope.type],
  );

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isThinking]);

  return (
    <section
      className={cn(
        "flex min-h-[30rem] flex-col overflow-hidden rounded-lg border border-border bg-background",
        className,
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void loadMessages()} title="Reload chat">
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-16 w-4/5" />
            <Skeleton className="ml-auto h-16 w-3/5" />
            <Skeleton className="h-20 w-5/6" />
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadMessages()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && messages.length === 0 && (
          <div className="flex h-full min-h-64 items-center justify-center text-center text-sm text-muted-foreground">
            Start a conversation about the code in this context.
          </div>
        )}

        {!isLoading &&
          !error &&
          messages.map((message) => <ChatMessage key={message.id} message={message} />)}

        {isThinking && (
          <div className="text-sm text-muted-foreground">Thinking...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput disabled={isLoading || isThinking} onSend={sendMessage} />
    </section>
  );
}
