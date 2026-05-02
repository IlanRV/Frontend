import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { CreateWorkspaceModal } from "@/components/workspace/CreateWorkspaceModal";
import { WorkspaceCard } from "@/components/workspace/WorkspaceCard";
import { makeWorkspace } from "@/test/factories";

describe("CreateWorkspaceModal", () => {
  it("validates names and workspace limits", async () => {
    const onCreate = vi.fn();
    const { rerender } = render(
      <CreateWorkspaceModal open onOpenChange={vi.fn()} onCreate={onCreate} workspaceCount={0} workspaceLimit={3} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    expect(toast.error).toHaveBeenCalledWith("Workspace name is required");

    rerender(<CreateWorkspaceModal open onOpenChange={vi.fn()} onCreate={onCreate} workspaceCount={3} workspaceLimit={3} />);
    expect(screen.getByRole("button", { name: "Create workspace" })).toBeDisabled();
  });

  it("creates workspaces with trimmed fields and closes", async () => {
    const onCreate = vi.fn().mockResolvedValue(makeWorkspace());
    const onOpenChange = vi.fn();
    render(<CreateWorkspaceModal open onOpenChange={onOpenChange} onCreate={onCreate} workspaceCount={1} workspaceLimit={3} />);

    await userEvent.type(screen.getByLabelText("Name"), "  Payments  ");
    await userEvent.type(screen.getByLabelText("Description"), "  Billing repos  ");
    await userEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: "Payments", description: "Billing repos" }));
    expect(toast.success).toHaveBeenCalledWith("Workspace created");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows create errors", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("create failed"));
    render(<CreateWorkspaceModal open onOpenChange={vi.fn()} onCreate={onCreate} workspaceCount={0} workspaceLimit={3} />);

    await userEvent.type(screen.getByLabelText("Name"), "Workspace");
    await userEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("create failed"));
  });
});

describe("WorkspaceCard", () => {
  it("renders workspace details and navigates on click", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<WorkspaceCard workspace={makeWorkspace()} onDelete={vi.fn()} />} />
          <Route path="/workspace/workspace-1" element={<div>Workspace route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Workspace One")).toBeInTheDocument();
    expect(screen.getByText("1 repos")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link"));
    expect(screen.getByText("Workspace route")).toBeInTheDocument();
  });

  it("calls delete without navigating", async () => {
    const onDelete = vi.fn();
    render(
      <MemoryRouter>
        <WorkspaceCard workspace={makeWorkspace()} onDelete={onDelete} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.getByText("Workspace One")).toBeInTheDocument();
  });

  it("opens with keyboard activation", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<WorkspaceCard workspace={makeWorkspace()} onDelete={vi.fn()} />} />
          <Route path="/workspace/workspace-1" element={<div>Keyboard route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    screen.getByRole("link").focus();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByText("Keyboard route")).toBeInTheDocument();
  });
});
