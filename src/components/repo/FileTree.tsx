import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileTreeNode } from "@/types";

interface FileTreeProps {
  tree?: FileTreeNode;
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  className?: string;
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedPath?: string;
  onToggle: (path: string) => void;
  onSelectFile: (path: string) => void;
}

function fileIcon(node: FileTreeNode) {
  if (node.extension === ".json") {
    return <FileJson className="h-4 w-4 text-amber-600 dark:text-amber-300" />;
  }

  if (node.extension === ".md") {
    return <FileText className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />;
  }

  if (node.supported) {
    return <FileCode2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />;
  }

  return <File className="h-4 w-4 text-muted-foreground" />;
}

function TreeNode({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelectFile,
}: TreeNodeProps) {
  const isDirectory = node.type === "directory";
  const isOpen = expanded.has(node.path);
  const isSelected = selectedPath === node.path;

  if (isDirectory) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="flex h-8 w-full items-center gap-1 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {isOpen ? (
            <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-300" />
          ) : (
            <Folder className="h-4 w-4 text-amber-600 dark:text-amber-300" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!node.supported}
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        isSelected && "bg-accent text-accent-foreground",
      )}
      style={{ paddingLeft: `${depth * 12 + 28}px` }}
    >
      {fileIcon(node)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function initialExpandedPaths(tree?: FileTreeNode) {
  if (!tree) {
    return new Set<string>();
  }

  const paths = new Set<string>([tree.path]);
  for (const child of tree.children ?? []) {
    if (child.type === "directory") {
      paths.add(child.path);
    }
  }
  return paths;
}

export function FileTree({ tree, selectedPath, onSelectFile, className }: FileTreeProps) {
  const initialPaths = useMemo(() => initialExpandedPaths(tree), [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(initialPaths);

  useEffect(() => {
    setExpanded(initialPaths);
  }, [initialPaths]);

  function handleToggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  if (!tree) {
    return (
      <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
        File tree will appear after the repo is cloned.
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-y-auto p-2", className)}>
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Files</span>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(initialExpandedPaths(tree))}>
          Reset
        </Button>
      </div>
      <TreeNode
        node={tree}
        depth={0}
        expanded={expanded}
        selectedPath={selectedPath}
        onToggle={handleToggle}
        onSelectFile={onSelectFile}
      />
    </div>
  );
}
