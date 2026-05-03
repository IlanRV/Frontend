import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { clearChatPanelCache } from "@/components/chat/chatPanelStore";
import { api } from "@/lib/api";
import { makeChatMessage } from "@/test/factories";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      chat: {
        getWorkspace: vi.fn(),
        sendWorkspace: vi.fn(),
        getRepo: vi.fn(),
        sendRepo: vi.fn(),
      },
    },
  };
});

const chatApi = vi.mocked(api.chat);

describe("ChatInput", () => {
  it("sends trimmed messages and clears the textarea", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatInput onSend={onSend} />);

    await userEvent.type(screen.getByPlaceholderText("Ask about this codebase..."), "  hello  ");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSend).toHaveBeenCalledWith("hello");
    expect(screen.getByPlaceholderText("Ask about this codebase...")).toHaveValue("");
  });

  it("submits with Enter and keeps Shift+Enter as a newline", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatInput onSend={onSend} />);
    const input = screen.getByPlaceholderText("Ask about this codebase...");

    await userEvent.type(input, "hello{Shift>}{Enter}{/Shift}there");
    expect(input).toHaveValue("hello\nthere");
    await userEvent.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("hello\nthere");
  });

  it("does not send blank or disabled messages", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ChatInput onSend={onSend} />);

    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    rerender(<ChatInput onSend={onSend} disabled />);
    expect(screen.getByPlaceholderText("Ask about this codebase...")).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("ChatMessage", () => {
  it("renders assistant and user messages", () => {
    const { rerender } = render(<ChatMessage message={makeChatMessage({ role: "assistant", content: "AI reply" })} />);

    expect(screen.getByText("AI reply")).toBeInTheDocument();
    rerender(<ChatMessage message={makeChatMessage({ role: "user", content: "User prompt" })} />);
    expect(screen.getByText("User prompt")).toBeInTheDocument();
  });
});

describe("ChatPanel", () => {
  beforeEach(() => {
    clearChatPanelCache();
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
  });

  it("loads and displays workspace messages", async () => {
    chatApi.getWorkspace.mockResolvedValueOnce({ messages: [makeChatMessage({ content: "Saved answer" })] });

    render(<ChatPanel scope={{ type: "workspace", id: "workspace-1" }} />);

    await waitFor(() => expect(screen.getByText("Saved answer")).toBeInTheDocument());
    expect(chatApi.getWorkspace).toHaveBeenCalledWith("workspace-1");
  });

  it("shows load errors and retries", async () => {
    chatApi.getRepo
      .mockRejectedValueOnce(new Error("history failed"))
      .mockResolvedValueOnce([]);

    render(<ChatPanel scope={{ type: "repo", id: "repo-1" }} />);

    await waitFor(() => expect(screen.getByText("history failed")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Start a conversation about the code in this context.")).toBeInTheDocument());
  });

  it("optimistically sends repo messages and appends replies", async () => {
    chatApi.getRepo.mockResolvedValueOnce([]);
    chatApi.sendRepo.mockResolvedValueOnce({ reply: "Assistant reply" });

    render(<ChatPanel scope={{ type: "repo", id: "repo-1" }} />);

    await waitFor(() => expect(screen.getByText("Start a conversation about the code in this context.")).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText("Ask about this codebase..."), "What is this?");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("What is this?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Assistant reply")).toBeInTheDocument());
    expect(chatApi.sendRepo).toHaveBeenCalledWith("repo-1", "What is this?");
  });

  it("keeps repo chat history when another panel opens", async () => {
    chatApi.getRepo.mockResolvedValueOnce([]);
    chatApi.sendRepo.mockResolvedValueOnce({ reply: "Assistant reply" });

    const { unmount } = render(<ChatPanel scope={{ type: "repo", id: "repo-1" }} />);

    await waitFor(() => expect(screen.getByText("Start a conversation about the code in this context.")).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText("Ask about this codebase..."), "Explain this repo");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByText("Assistant reply")).toBeInTheDocument());

    unmount();
    chatApi.getRepo.mockImplementationOnce(() => new Promise(() => undefined));
    render(<ChatPanel scope={{ type: "repo", id: "repo-1" }} />);

    expect(screen.getByText("Explain this repo")).toBeInTheDocument();
    expect(screen.getByText("Assistant reply")).toBeInTheDocument();
  });

  it("removes optimistic messages when send fails", async () => {
    chatApi.getWorkspace.mockResolvedValueOnce([]);
    chatApi.sendWorkspace.mockRejectedValueOnce(new Error("send failed"));

    render(<ChatPanel scope={{ type: "workspace", id: "workspace-1" }} />);

    await waitFor(() => expect(screen.getByText("Start a conversation about the code in this context.")).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText("Ask about this codebase..."), "broken");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.queryByText("broken")).not.toBeInTheDocument());
  });
});
