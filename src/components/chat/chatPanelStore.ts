import type { ChatConversationSummary, ChatMessage as ChatMessageType } from "@/types";

interface ChatScopeKeyInput {
  type: "workspace" | "repo";
  id: string;
}

const messageCache = new Map<string, ChatMessageType[]>();
const conversationCache = new Map<string, ChatConversationSummary[]>();

export function chatPanelCacheKey(scope: ChatScopeKeyInput) {
  return `${scope.type}:${scope.id}`;
}

export function chatPanelMessageCacheKey(scopeKey: string, conversationId: string) {
  return `${scopeKey}:conversation:${conversationId}`;
}

export function getCachedChatMessages(key: string) {
  return messageCache.get(key);
}

export function setCachedChatMessages(key: string, messages: ChatMessageType[]) {
  messageCache.set(key, messages);
}

export function getCachedChatConversations(key: string) {
  return conversationCache.get(key);
}

export function setCachedChatConversations(key: string, conversations: ChatConversationSummary[]) {
  conversationCache.set(key, conversations);
}

export function clearChatPanelCache() {
  messageCache.clear();
  conversationCache.clear();
}
