import type { Socket } from 'socket.io-client';

export function createWsSubscription<T extends Record<string, unknown>>(
  socket: Socket | null,
  event: string,
  filterKey: string | undefined,
  filterValue: unknown | undefined,
  callback: (data: T) => void
): () => void {
  if (!socket) return () => {};
  const listener = (data: unknown) => {
    const d = data as T;
    if (filterKey && filterValue !== undefined) {
      if ((d as Record<string, unknown>)[filterKey] !== filterValue) return;
    }
    callback(d);
  };
  socket.on(event, listener);
  return () => { socket.off(event, listener); };
}
