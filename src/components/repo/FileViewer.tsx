import Editor from "@monaco-editor/react";
import { Loader2, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface FileViewerProps {
  path?: string;
  content: string;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
}

function languageForPath(path?: string) {
  if (!path) {
    return "plaintext";
  }

  if (path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".js")) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  if (path.endsWith(".env") || path.endsWith(".gitignore")) return "shell";
  return "plaintext";
}

function useEditorTheme() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains("dark") ? "vs-dark" : "light",
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "vs-dark" : "light");
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}

export function FileViewer({ path, content, isLoading, error, onRetry }: FileViewerProps) {
  const theme = useEditorTheme();

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading file
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[28rem] items-center justify-center p-6 text-center">
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

  if (!path) {
    return (
      <div className="flex h-full min-h-[28rem] items-center justify-center text-center text-sm text-muted-foreground">
        Select a supported file from the tree.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[32rem] overflow-hidden rounded-lg border border-border">
      <div className="flex h-10 items-center border-b border-border bg-muted/40 px-3 text-xs text-muted-foreground">
        <span className="truncate">{path}</span>
      </div>
      <Editor
        height="calc(100% - 2.5rem)"
        language={languageForPath(path)}
        theme={theme}
        value={content}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontLigatures: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          lineNumbersMinChars: 3,
          renderLineHighlight: "line",
          tabSize: 2,
        }}
      />
    </div>
  );
}
