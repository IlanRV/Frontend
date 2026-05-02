import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { App } from "@/App";

vi.mock("@/pages/LandingPage", () => ({ LandingPage: () => <div>Landing page</div> }));
vi.mock("@/pages/DashboardPage", () => ({ DashboardPage: () => <div>Dashboard page</div> }));
vi.mock("@/pages/WorkspacePage", () => ({ WorkspacePage: () => <div>Workspace page</div> }));
vi.mock("@/pages/RepoPage", () => ({ RepoPage: () => <div>Repo page</div> }));

describe("App", () => {
  it("renders the navbar and landing route", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("DevHub")).toBeInTheDocument();
    expect(screen.getByText("Landing page")).toBeInTheDocument();
  });

  it("renders nested routes", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/workspace/workspace-1"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("Workspace page")).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter initialEntries={["/workspace/workspace-1/repo/repo-1"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("Repo page")).toBeInTheDocument();
  });
});
