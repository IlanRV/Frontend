import { Bot, Check, Copy, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SectionLoading } from "@/components/ui/section-loading";
import type { AiReadme, AnalysisProgress } from "@/types";

interface AiReadmeViewerProps {
  readme?: AiReadme;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
  progress?: AnalysisProgress | null;
}

function listSection(title: string, items: string[] | undefined) {
  if (!items?.length) {
    return "";
  }

  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""].join("\n");
}

function buildMarkdownReadme(readme: AiReadme) {
  if (readme.raw?.trim()) {
    return readme.raw.trim();
  }

  const sections = [
    `# ${readme.title ?? "AI README"}`,
    "",
    readme.summary?.trim() ?? "",
    "",
    listSection("Stack", readme.stack),
    readme.runCommand ? ["## Run", "", `\`${readme.runCommand}\``, ""].join("\n") : "",
    listSection("Setup", readme.setup),
    readme.notableFiles?.length
      ? [
          "## Notable Files",
          "",
          ...readme.notableFiles.map((file) => `- \`${file.path}\`: ${file.note}`),
          "",
        ].join("\n")
      : "",
    listSection("Risks", readme.risks),
  ];

  return sections
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function AiReadmeViewer({ readme, isLoading, error, onRetry, progress }: AiReadmeViewerProps) {
  const [hasCopied, setHasCopied] = useState(false);
  const markdown = useMemo(() => (readme ? buildMarkdownReadme(readme) : ""), [readme]);

  async function handleCopy() {
    if (!markdown) {
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      setHasCopied(true);
      toast.success("AI README copied");
      window.setTimeout(() => setHasCopied(false), 1600);
    } catch {
      toast.error("Unable to copy README");
    }
  }

  if (isLoading) {
    return (
      <SectionLoading
        title="Building AI README"
        message={progress?.message ?? "Waiting for generated documentation"}
        percent={progress?.percent ?? 84}
        detail="This updates from the live extraction status while the repo analysis finishes."
        className="min-h-[36rem] rounded-none border-0"
      />
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-medium text-red-600 dark:text-red-300">{error}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              <RotateCw className="h-4 w-4" />
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!readme) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center text-center text-sm text-muted-foreground">
        AI README will appear after extraction finishes.
      </div>
    );
  }

  return (
    <article className="p-4">
      <header className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{readme.title ?? "AI README"}</h2>
            <p className="text-sm text-muted-foreground">Rendered Markdown README</p>
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void handleCopy()}>
          {hasCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {hasCopied ? "Copied" : "Copy"}
        </Button>
      </header>

      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    </article>
  );
}
