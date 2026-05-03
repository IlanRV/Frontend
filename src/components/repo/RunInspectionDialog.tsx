import type { RefObject } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RepoProjectKind, SecurityScan, TerminalLine } from "@/types";

interface RunInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portalUrl?: string;
  previewPath?: string;
  previewPaths?: string[];
  riskLevel?: SecurityScan["riskLevel"];
  command?: string;
  projectKind?: RepoProjectKind;
  runtimeEventCount?: number;
  isStopping?: boolean;
  onStop?: () => void;
  terminalLines: TerminalLine[];
  terminalRef?: RefObject<HTMLDivElement | null>;
}

export function RunInspectionDialog({ open, onOpenChange }: RunInspectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run inspector</DialogTitle>
          <DialogDescription>Inspect BrowserPod output and preview.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}