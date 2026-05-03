import type { ChatMessage as ChatMessageType } from "@/types";

interface ChatScopeKeyInput {
  type: "workspace" | "repo";
  id: string;
}

const messageCache = new Map<string, ChatMessageType[]>();

export function chatPanelCacheKey(scope: ChatScopeKeyInput) {
  return `${scope.type}:${scope.id}`;
}

export function getCachedChatMessages(key: string) {
  return messageCache.get(key);
}

export function setCachedChatMessages(key: string, messages: ChatMessageType[]) {
  messageCache.set(key, messages);
}

export function clearChatPanelCache() {
  messageCache.clear();
}
