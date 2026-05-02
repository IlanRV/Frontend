import { Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RunButtonProps {
  canRun: boolean;
  isRunning: boolean;
  isBusy?: boolean;
  onRun: () => void;
  onStop: () => void;
}

export function RunButton({ canRun, isRunning, isBusy, onRun, onStop }: RunButtonProps) {
  if (isRunning) {
    return (
      <Button variant="outline" size="sm" onClick={onStop} disabled={isBusy} title="Stop project">
        <Square className="h-4 w-4" />
        Stop
      </Button>
    );
  }

  return (
    <Button variant="success" size="sm" onClick={onRun} disabled={!canRun || isBusy} title="Run project">
      <Play className="h-4 w-4" />
      Run
    </Button>
  );
}
