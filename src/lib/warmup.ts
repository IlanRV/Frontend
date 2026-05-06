/**
 * Fires a lightweight GET to the backend health endpoint to wake up
 * a cold Render.com instance. Called once on app mount so the backend
 * is already warm by the time the user navigates to a data page.
 *
 * Also prefetches the workspace list into sessionStorage so the
 * Dashboard page can render instantly from cache.
 */

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001/api").replace(
  /\/$/,
  "",
);

let warmedUp = false;

export function warmupBackend(): void {
  if (warmedUp) {
    return;
  }

  warmedUp = true;

  // 1. Fire-and-forget health ping to spin up the Render instance
  fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store", priority: "low" as RequestPriority }).catch(
    () => undefined,
  );

  // 2. Prefetch workspace list into sessionStorage so the dashboard
  //    can render from cache before the fresh fetch finishes
  fetch(`${API_BASE_URL}/workspaces`, { method: "GET", cache: "default" })
    .then(async (response) => {
      if (!response.ok) {
        return;
      }

      const data = await response.json();

      try {
        sessionStorage.setItem("devhub:workspaces", JSON.stringify(data));
      } catch {
        // Storage full or unavailable — non-critical.
      }
    })
    .catch(() => undefined);
}
