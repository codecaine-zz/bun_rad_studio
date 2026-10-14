/**
 * A studio started by the File Manager (`--server`) must not outlive it. The File Manager passes its process id in
 * STUDIO_PARENT_PID; when that process is gone (closed, crashed or killed) the studio ends itself.
 * Started any other way, the variable is absent and nothing is watched.
 */
export function watchParentProcess(env: Record<string, string | undefined> = process.env, intervalMs = 2000): void {
  const pid = Number(env.STUDIO_PARENT_PID);
  if (!Number.isInteger(pid) || pid <= 1) return;
  const timer = setInterval(() => {
    try {
      process.kill(pid, 0);
    } catch (err) {
      // EPERM means the process exists but isn't ours to signal: still alive.
      if ((err as NodeJS.ErrnoException)?.code !== "EPERM") process.exit(0);
    }
  }, intervalMs);
  (timer as { unref?: () => void }).unref?.();
}
