import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Navbar } from "@/components/layout/Navbar";

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
