import { FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePod } from "@/hooks/usePod";
import { saveCachedFileTree } from "@/lib/fileTreeCache";
import type { Repo } from "@/types";

interface AddRepoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (githubUrl: string) => Promise<Repo>;
  onComplete: () => void;
}

function isLikelyGithubUrl(value: string) {
  return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/.test(value);
}

const MODAL_STEP_TIMEOUT_MS = 120_000;

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), MODAL_STEP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export function AddRepoModal({ open, onOpenChange, onAdd, onComplete }: AddRepoModalProps) {
  const [githubUrl, setGithubUrl] = useState("");
  const [phase, setPhase] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pod = usePod(undefined);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = githubUrl.trim();

    if (!isLikelyGithubUrl(trimmedUrl)) {
      toast.error("Enter a GitHub repository URL like https://github.com/org/repo");
      return;
    }

    setIsSubmitting(true);
    let repo: Repo | undefined;

    try {
      setPhase("Creating repo record");
      repo = await onAdd(trimmedUrl);

      setPhase("Booting BrowserPod and reading source tree");
      const fileTree = await withTimeout(
        pod.bootstrapRepoFiles(trimmedUrl),
        "Timed out while preparing the repo source tree. Please retry the clone.",
      );
      saveCachedFileTree(repo.id, fileTree);

      setPhase("Sending source context for AI extraction");
      const payload = await withTimeout(
        pod.collectAiExtractionPayload(fileTree),
        "Timed out while reading source files for extraction. Please retry the repo.",
      );
      const extraction = await withTimeout(
        api.ai.extract(repo.id, payload),
        "Timed out while starting the extraction job. Please retry from the repo page.",
      );

      toast.success(extraction.cached ? "Repo added with cached AI extraction" : "Repo added and AI extraction started");
      setGithubUrl("");
      onComplete();
      onOpenChange(false);
    } catch (error) {
      if (repo) {
        await api.repos.delete(repo.id).catch(() => undefined);
        onComplete();
      }

      toast.error(error instanceof Error ? error.message : "Unable to add repo");
    } finally {
      await pod.terminate().catch(() => undefined);
      setPhase(undefined);
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add repo</DialogTitle>
          <DialogDescription>
            DevHub will clone the repo in BrowserPod, read its file tree, and send code context for AI extraction.
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="repo-url">GitHub URL</Label>
            <Input
              id="repo-url"
              type="url"
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              placeholder="https://github.com/org/repo"
              disabled={isSubmitting}
            />
          </div>

          <div
            className={cn(
              "min-h-0 overflow-hidden rounded-lg border border-border bg-muted/30",
              !isSubmitting && "hidden",
            )}
          >
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              {phase ?? pod.snapshot.state}
            </div>
            <div className="bp-modal-terminal h-36 overflow-auto p-3 text-xs">
              <div ref={pod.terminalRef} className="h-full min-h-0 overflow-hidden" />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding repo..." : "Add repo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
