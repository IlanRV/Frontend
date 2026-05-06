import { MessageSquare, Plus, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessage } from "@/components/chat/ChatMessage";
import {
  chatPanelCacheKey,
  chatPanelMessageCacheKey,
  getCachedChatConversations,
  getCachedChatMessages,
  removeCachedChatMessages,
  setCachedChatConversations,
  setCachedChatMessages,
} from "@/components/chat/chatPanelStore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, normalizeChatMessages } from "@/lib/api";
import { cn, createClientId } from "@/lib/utils";
import type { ChatConversationSummary, ChatMessage as ChatMessageType } from "@/types";

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

const defaultConversationId = "default";

function defaultConversation(): ChatConversationSummary {
  return {
    id: defaultConversationId,
    conversationId: defaultConversationId,
    title: "Chat 1",
    updatedAt: new Date(0).toISOString(),
    messageCount: 0,
  };
}

function getInitialConversations(key: string) {
  return getCachedChatConversations(key) ?? [defaultConversation()];
}

function titleFromContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized || "New chat";
}

function emptyConversationTitle(conversationId: string) {
  return conversationId === defaultConversationId ? "Chat 1" : "New chat";
}

function nextConversationTitle(
  conversationId: string,
  existing: ChatConversationSummary | undefined,
  messageCount: number,
  content?: string,
) {
  if (messageCount === 0) {
    return emptyConversationTitle(conversationId);
  }

  if (existing?.messageCount) {
    return existing.title;
  }

  return content ? titleFromContent(content) : existing?.title ?? emptyConversationTitle(conversationId);
}

function mergeConversations(remote: ChatConversationSummary[], local: ChatConversationSummary[]) {
  const conversations = new Map<string, ChatConversationSummary>();

  for (const conversation of local) {
    conversations.set(conversation.id, conversation);
  }

  for (const conversation of remote) {
    conversations.set(conversation.id, conversation);
  }

  const merged = [...conversations.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return merged.length > 0 ? merged : [defaultConversation()];
}

export function ChatPanel({ scope, title = "AI chat", className }: ChatPanelProps) {
  const key = chatPanelCacheKey(scope);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>(() => getInitialConversations(key));
  const [activeConversationId, setActiveConversationId] = useState(() => getInitialConversations(key)[0].id);
  const messageKey = chatPanelMessageCacheKey(key, activeConversationId);
  const [messages, setMessages] = useState<ChatMessageType[]>(() => getCachedChatMessages(messageKey) ?? []);
  const [isLoading, setIsLoading] = useState(() => !getCachedChatMessages(messageKey));
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const setCachedMessages = useCallback((updater: ChatMessageType[] | ((current: ChatMessageType[]) => ChatMessageType[])) => {
    setMessages((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      setCachedChatMessages(messageKey, next);
      return next;
    });
  }, [messageKey]);

  const setCachedConversationList = useCallback((updater: ChatConversationSummary[] | ((current: ChatConversationSummary[]) => ChatConversationSummary[])) => {
    setConversations((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      setCachedChatConversations(key, next);
      return next;
    });
  }, [key]);

  const touchActiveConversation = useCallback((content?: string, messageCountDelta = 0) => {
    const now = new Date().toISOString();

    setCachedConversationList((current) => {
      const existing = current.find((conversation) => conversation.id === activeConversationId);
      const messageCount = Math.max(0, (existing?.messageCount ?? 0) + messageCountDelta);
      const nextConversation: ChatConversationSummary = {
        id: activeConversationId,
        conversationId: activeConversationId,
        title: nextConversationTitle(activeConversationId, existing, messageCount, content),
        updatedAt: now,
        messageCount,
      };

      return [nextConversation, ...current.filter((conversation) => conversation.id !== activeConversationId)];
    });
  }, [activeConversationId, setCachedConversationList]);

  const loadConversations = useCallback(async () => {
    const cached = getCachedChatConversations(key);

    if (cached) {
      setConversations(cached);
    }

    try {
      const remoteConversations = scope.type === "workspace"
        ? await api.chat.listWorkspaceConversations(scope.id)
        : await api.chat.listRepoConversations(scope.id);

      setCachedConversationList((current) => {
        const next = mergeConversations(remoteConversations, current);
        const remoteConversationIds = new Set(remoteConversations.map((conversation) => conversation.id));
        setActiveConversationId((currentConversationId) => (
          next.some((conversation) => conversation.id === currentConversationId) && (
            currentConversationId !== defaultConversationId || remoteConversationIds.has(currentConversationId) || remoteConversations.length === 0
          )
            ? currentConversationId
            : next[0].id
        ));
        return next;
      });
    } catch {
      // Conversation metadata is helpful, but message loading below remains the source of truth.
    }
  }, [key, scope.id, scope.type, setCachedConversationList]);

  const loadMessages = useCallback(async () => {
    const cached = getCachedChatMessages(messageKey);

    if (cached) {
      setMessages(cached);
    } else {
      setMessages([]);
    }

    setIsLoading(!cached);
    setError(undefined);

    try {
      const response =
        scope.type === "workspace"
          ? await api.chat.getWorkspaceConversation(scope.id, activeConversationId)
          : await api.chat.getRepoConversation(scope.id, activeConversationId);
      setCachedMessages(normalizeChatMessages(response));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load chat history"));
    } finally {
      setIsLoading(false);
    }
  }, [activeConversationId, messageKey, scope.id, scope.type, setCachedMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMessage: ChatMessageType = {
        id: createClientId("msg"),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };

      setCachedMessages((current) => [...current, userMessage]);
      touchActiveConversation(content, 1);
      setIsThinking(true);

      try {
        const response =
          scope.type === "workspace"
            ? await api.chat.sendWorkspace(scope.id, content, activeConversationId)
            : await api.chat.sendRepo(scope.id, content, activeConversationId);

        if (response.degraded) {
          toast.warning("AI provider is unavailable, showing saved-context fallback");
        } else if (response.cached) {
          toast.info("Reused the previous reply for this duplicate message");
        }

        setCachedMessages((current) => [
          ...current,
          {
            id: createClientId("msg"),
            role: "assistant",
            content: response.reply,
            createdAt: new Date().toISOString(),
          },
        ]);
        touchActiveConversation(undefined, 1);
      } catch (sendError) {
        const message = getErrorMessage(sendError, "Unable to send message");
        toast.error(message);
        setCachedMessages((current) => current.filter((item) => item.id !== userMessage.id));
        touchActiveConversation(undefined, -1);
      } finally {
        setIsThinking(false);
      }
    },
    [activeConversationId, scope.id, scope.type, setCachedMessages, touchActiveConversation],
  );

  const startNewConversation = useCallback(() => {
    const conversationId = createClientId("chat");
    const conversation: ChatConversationSummary = {
      id: conversationId,
      conversationId,
      title: "New chat",
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };

    setCachedConversationList((current) => [conversation, ...current]);
    setActiveConversationId(conversationId);
    setMessages([]);
    setCachedChatMessages(chatPanelMessageCacheKey(key, conversationId), []);
    setIsLoading(false);
    setError(undefined);
  }, [key, setCachedConversationList]);

  const clearActiveConversation = useCallback(async () => {
    const deletingConversationId = activeConversationId;
    setError(undefined);
    setCachedMessages([]);

    try {
      if (scope.type === "workspace") {
        await api.chat.clearWorkspace(scope.id, deletingConversationId);
      } else {
        await api.chat.clearRepo(scope.id, deletingConversationId);
      }

      // Remove the conversation from the list and clean up its message cache
      removeCachedChatMessages(chatPanelMessageCacheKey(key, deletingConversationId));

      // Atomically remove the conversation and switch to the next available one
      setCachedConversationList((current) => {
        const filtered = current.filter((conversation) => conversation.id !== deletingConversationId);
        const next = filtered.length > 0 ? filtered : [defaultConversation()];
        setActiveConversationId(next[0].id);
        setMessages(getCachedChatMessages(chatPanelMessageCacheKey(key, next[0].id)) ?? []);
        return next;
      });

      toast.success("Chat history cleared");
    } catch (clearError) {
      toast.error(getErrorMessage(clearError, "Unable to clear chat history"));
      void loadMessages();
    }
  }, [activeConversationId, key, loadMessages, scope.id, scope.type, setCachedConversationList, setCachedMessages]);

  useEffect(() => {
    const nextConversations = getInitialConversations(key);
    const nextConversationId = nextConversations[0].id;

    setConversations(nextConversations);
    setActiveConversationId(nextConversationId);
    setMessages(getCachedChatMessages(chatPanelMessageCacheKey(key, nextConversationId)) ?? []);
    setError(undefined);
  }, [key]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

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
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
            <h2 className="text-sm font-semibold">{title}</h2>
          </div>
          <select
            aria-label="Chat conversation"
            value={activeConversationId}
            onChange={(event) => setActiveConversationId(event.target.value)}
            className="h-8 min-w-0 max-w-[12rem] rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
            ))}
          </select>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={startNewConversation} title="New chat" disabled={isThinking}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void clearActiveConversation()} title="Delete chat" disabled={isLoading || isThinking || messages.length === 0}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void loadMessages()} title="Reload chat">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
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
