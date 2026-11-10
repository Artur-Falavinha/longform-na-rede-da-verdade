export function workerUrl(path: string) {
  const origin = import.meta.env.PUBLIC_WORKER_ORIGIN;
  return origin ? new URL(path, origin).href : path;
}
