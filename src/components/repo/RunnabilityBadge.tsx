import { Badge } from "@/components/ui/badge";
import { getAutoPreviewCommand, isAnalysisOnly, isManualOnly } from "@/lib/security";
import type { RunnabilityResult } from "@/types";

interface RunnabilityBadgeProps {
  result?: RunnabilityResult;
}

export function RunnabilityBadge({ result }: RunnabilityBadgeProps) {
  if (!result) {
    return <Badge variant="secondary">Checking runnability</Badge>;
  }

  const autoCommand = getAutoPreviewCommand(result);

  if ((result.runtimeProfile || result.autoCommand) && autoCommand) {
    return <Badge variant="success">Auto preview via {autoCommand}</Badge>;
  }

  if (isManualOnly(result)) {
    return <Badge variant="warning">Manual BrowserPod commands</Badge>;
  }

  if (isAnalysisOnly(result)) {
    return <Badge variant="secondary">Analysis only</Badge>;
  }

  if (result.canRun && result.entryPoint) {
    return <Badge variant="success">Runnable via npm run {result.entryPoint}</Badge>;
  }

  return <Badge variant="warning">{result.blockers.length} run blocker(s)</Badge>;
}
