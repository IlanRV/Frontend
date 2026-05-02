import {
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  FileCode2,
  GitBranch,
  Play,
  Sparkles,
  Terminal,
} from "lucide-react";
import { MouseEvent, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const repoRows = [
  { name: "api-gateway", status: "ready", tone: "text-emerald-300" },
  { name: "web-client", status: "running", tone: "text-cyan-300" },
  { name: "agent-worker", status: "indexed", tone: "text-amber-300" },
];

const codeLines = [
  "git clone https://github.com/team/project /repo",
  "npm install",
  "npm run dev",
  "portal opened on browserpod.dev",
];

const steps = [
  {
    icon: GitBranch,
    title: "Collect repos",
    copy: "Put related GitHub projects into one workspace.",
  },
  {
    icon: Play,
    title: "Run in browser",
    copy: "Launch runnable apps through BrowserPod portals.",
  },
  {
    icon: Bot,
    title: "Ask the code",
    copy: "Chat with AI across a repo or the full workspace.",
  },
];

type ActiveCta = "primary" | "secondary" | null;

export function LandingPage() {
  const [pointer, setPointer] = useState({ x: 50, y: 45 });
  const [activeCta, setActiveCta] = useState<ActiveCta>(null);

  function handlePointerMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <main className="overflow-hidden bg-background text-foreground">
      <section
        className="relative isolate flex min-h-[86vh] items-center justify-center overflow-hidden border-b border-slate-900 bg-slate-950 px-4 py-20 sm:px-6 lg:px-8"
        onMouseMove={handlePointerMove}
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#082f49_0%,#0f172a_42%,#111827_100%)]" />
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 ease-out",
            activeCta ? "opacity-0" : "opacity-100",
          )}
          style={{
            background: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, rgba(34, 211, 238, 0.34), rgba(20, 184, 166, 0.12) 18%, transparent 36%)`,
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />

        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-slate-950 to-transparent" />

        <div className="absolute left-[8%] top-[18%] hidden w-72 rotate-[-5deg] rounded-lg border border-white/15 bg-white/10 p-4 text-white shadow-2xl backdrop-blur md:block">
          <div className="mb-3 flex items-center gap-2 text-xs text-cyan-100">
            <Boxes className="h-4 w-4" />
            Workspace
          </div>
          <div className="space-y-2">
            {repoRows.map((repo) => (
              <div key={repo.name} className="flex items-center justify-between rounded-md bg-black/25 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <GitBranch className="h-4 w-4 shrink-0" />
                  <span className="truncate">{repo.name}</span>
                </span>
                <span className={cn("text-xs", repo.tone)}>{repo.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute right-[7%] top-[20%] hidden w-80 rotate-[4deg] rounded-lg border border-white/15 bg-black/45 p-4 font-mono text-xs text-zinc-100 shadow-2xl backdrop-blur lg:block">
          <div className="mb-3 flex items-center gap-2 text-cyan-200">
            <Terminal className="h-4 w-4" />
            BrowserPod
          </div>
          <div className="space-y-2">
            {codeLines.map((line, index) => (
              <div key={line} className="flex gap-2">
                <span className="text-zinc-500">{index + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-20 left-1/2 hidden w-[min(58rem,80vw)] -translate-x-1/2 rounded-lg border border-white/10 bg-white/10 p-3 text-white shadow-2xl backdrop-blur sm:block">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["24 files indexed", FileCode2],
              ["AI README ready", Sparkles],
              ["portal live", CheckCircle2],
            ].map(([label, Icon]) => {
              const TypedIcon = Icon as typeof FileCode2;
              return (
                <div key={label as string} className="flex items-center gap-2 rounded-md bg-black/20 px-3 py-2 text-sm">
                  <TypedIcon className="h-4 w-4 text-cyan-200" />
                  <span>{label as string}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center text-white">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm text-cyan-100 backdrop-blur">
            <Sparkles className="h-4 w-4" />
            Multi-repo workspaces powered by BrowserPod
          </div>
          <h1 className="text-5xl font-semibold tracking-normal sm:text-6xl lg:text-7xl">DevHub</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-cyan-50/90 sm:text-lg">
            Upload GitHub repos, browse code in a familiar file viewer, run projects inside the browser, and ask AI what the code is doing.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              asChild
              onPointerEnter={() => setActiveCta("primary")}
              onPointerLeave={() => setActiveCta(null)}
              onPointerDown={() => setActiveCta("primary")}
              onFocus={() => setActiveCta("primary")}
              onBlur={() => setActiveCta(null)}
              className={cn(
                "group relative overflow-hidden bg-white text-slate-950 transition-all duration-300 hover:bg-white focus-visible:ring-cyan-200",
                activeCta === "primary" &&
                  "scale-[1.02] shadow-[0_0_60px_rgba(125,249,255,0.78),0_0_16px_rgba(255,255,255,0.7)]",
              )}
            >
              <Link to="/dashboard">
                <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(125,249,255,0.92),rgba(255,255,255,0.86)_28%,transparent_64%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />
                <span className="relative z-10">Create workspace</span>
                <ArrowRight className="relative z-10 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              onPointerEnter={() => setActiveCta("secondary")}
              onPointerLeave={() => setActiveCta(null)}
              onPointerDown={() => setActiveCta("secondary")}
              onFocus={() => setActiveCta("secondary")}
              onBlur={() => setActiveCta(null)}
              className={cn(
                "group relative overflow-hidden border-white/25 bg-white/10 text-white transition-all duration-300 hover:bg-white/10 hover:text-white focus-visible:ring-cyan-200",
                activeCta === "secondary" &&
                  "scale-[1.02] border-cyan-100/70 shadow-[0_0_54px_rgba(34,211,238,0.58),inset_0_0_24px_rgba(255,255,255,0.16)]",
              )}
            >
              <Link to="/dashboard">
                <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.42),rgba(255,255,255,0.2)_30%,transparent_68%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />
                <span className="relative z-10">Open dashboard</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-3 lg:px-8">
        {steps.map((step) => (
          <div key={step.title} className="rounded-lg border border-border bg-card p-5 shadow-subtle">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
              <step.icon className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.copy}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
