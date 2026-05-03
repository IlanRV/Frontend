import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Navbar } from "@/components/layout/Navbar";
import { ResponsiveChatLayout } from "@/components/layout/ResponsiveChatLayout";

function mockMediaQuery(matches: boolean) {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches,
    media: "(min-width: 1280px)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

describe("Navbar", () => {
  it("renders navigation links", () => {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /DevHub/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("uses stored themes and toggles dark mode", async () => {
    window.localStorage.setItem("devhub-theme", "dark");
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );

    expect(document.documentElement).toHaveClass("dark");
    await userEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("devhub-theme")).toBe("light");
  });

  it("falls back to system preference", () => {
    vi.mocked(window.matchMedia).mockReturnValueOnce({
      matches: true,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );

    expect(document.documentElement).toHaveClass("dark");
  });
});

describe("ResponsiveChatLayout", () => {
  it("keeps chat pinned in a desktop complementary region", () => {
    mockMediaQuery(true);

    render(
      <ResponsiveChatLayout
        mainLabel="Repository workspace"
        chatLabel="Repository AI chat"
        chatTitle="Repo AI"
        chat={<div>Chat content</div>}
      >
        <h1>Repository content</h1>
      </ResponsiveChatLayout>,
    );

    expect(screen.getByRole("region", { name: "Repository workspace" })).toHaveTextContent("Repository content");
    expect(screen.getByRole("complementary", { name: "Repository AI chat" })).toHaveTextContent("Chat content");
    expect(screen.queryByRole("button", { name: "Open Repo AI" })).not.toBeInTheDocument();
  });

  it("uses an accessible chat drawer trigger on smaller screens", async () => {
    mockMediaQuery(false);

    render(
      <ResponsiveChatLayout
        mainLabel="Workspace content"
        chatLabel="Workspace AI chat"
        chatTitle="Workspace AI"
        chat={<div>Workspace chat content</div>}
      >
        <h1>Workspace content</h1>
      </ResponsiveChatLayout>,
    );

    expect(screen.queryByRole("complementary", { name: "Workspace AI chat" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open Workspace AI" }));

    expect(screen.getByRole("dialog", { name: "Workspace AI" })).toHaveTextContent("Workspace chat content");
  });
});
