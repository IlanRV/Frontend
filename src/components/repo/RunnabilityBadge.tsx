import { Badge } from "@/components/ui/badge";
import type { RunnabilityResult } from "@/types";

interface RunnabilityBadgeProps {
  result?: RunnabilityResult;
}

export function RunnabilityBadge({ result }: RunnabilityBadgeProps) {
  if (!result) {
    return <Badge variant="secondary">Checking runnability</Badge>;
  }

  if (result.canRun) {
    return <Badge variant="success">Runnable via npm run {result.entryPoint}</Badge>;
  }

  return <Badge variant="warning">{result.blockers.length} run blocker(s)</Badge>;
}
