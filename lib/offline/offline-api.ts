import { offlineDB, SyncQueueItem } from './offline-db';

const API_BASE = '/api/backend';
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 1000;

export interface OfflineRequestOptions {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  integrity?: string;
  keepalive?: boolean;
  signal?: AbortSignal | null;
  offline?: boolean;
  priority?: 'high' | 'normal' | 'low';
}

export class OfflineAPIClient {
  private static instance: OfflineAPIClient;
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncInProgress = false;
  private syncListeners: Set<(online: boolean) => void> = new Set();
  private pendingSyncCount = 0;

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));
    }
  }

  static getInstance(): OfflineAPIClient {
    if (!OfflineAPIClient.instance) {
      OfflineAPIClient.instance = new OfflineAPIClient();
    }
    return OfflineAPIClient.instance;
  }

  private handleOnline() {
    this.online = true;
    this.notifyListeners(true);
    this.processSyncQueue();
  }

  private handleOffline() {
    this.online = false;
    this.notifyListeners(false);
  }

  private notifyListeners(online: boolean) {
    this.syncListeners.forEach(listener => listener(online));
  }

  onOnlineStatusChange(listener: (online: boolean) => void) {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  isOnline(): boolean {
    return this.online;
  }

  getPendingSyncCount(): number {
    return this.pendingSyncCount;
  }

  async request(endpoint: string, options: OfflineRequestOptions = {}): Promise<Response> {
    const { offline = true, priority = 'normal', ...fetchOptions } = options;
    const url = `${API_BASE}${endpoint}`;

    if (this.online) {
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          headers: {
            'Content-Type': 'application/json',
            ...fetchOptions.headers,
          },
        });

        if (response.ok || response.status === 401 || response.status === 403) {
          return response;
        }

        if (!offline) {
          return response;
        }
      } catch (error) {
        if (!offline) throw error;
      }
    }

    if (fetchOptions.method === 'GET' || fetchOptions.method === 'HEAD') {
      return this.serveFromCache(endpoint);
    }

    if (offline) {
      await this.queueMutation(endpoint, fetchOptions, priority);
      return new Response(JSON.stringify({ queued: true, offline: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Offline and no cache available');
  }

  private async serveFromCache(endpoint: string): Promise<Response> {
    const cacheMap: Record<string, string> = {
      '/api/users': 'users',
      '/api/academic/grades': 'examResults',
      '/api/attendance': 'attendance',
      '/api/activities': 'posts',
      '/api/conversations': 'conversations',
      '/api/events': 'events',
      '/api/notifications': 'notifications',
    };

    const tableName = cacheMap[endpoint] || 'posts';
    try {
      const table = offlineDB.table(tableName);
      const data = await table.toArray();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async queueMutation(
    endpoint: string,
    options: RequestInit,
    priority: 'high' | 'normal' | 'low'
  ) {
    const body = options.body ? JSON.parse(options.body as string) : null;
    await offlineDB.syncQueue.add({
      endpoint,
      method: options.method || 'POST',
      body,
      timestamp: Date.now(),
      retries: 0,
      priority,
    });
    this.pendingSyncCount = await offlineDB.syncQueue.count();
  }

  async processSyncQueue(): Promise<void> {
    if (this.syncInProgress || !this.online) return;
    this.syncInProgress = true;

    try {
      const queue = await offlineDB.syncQueue
        .orderBy(['priority', 'timestamp'])
        .reverse()
        .toArray();

      for (const item of queue) {
        if (!this.online) break;

        if (item.retries >= MAX_RETRIES) {
          await offlineDB.syncQueue.delete(item.id!);
          continue;
        }

        try {
          const response = await fetch(`${API_BASE}${item.endpoint}`, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: item.body ? JSON.stringify(item.body) : undefined,
          });

          if (response.ok) {
            await offlineDB.syncQueue.delete(item.id!);
            await this.invalidateCache(item.endpoint);
          } else if (response.status === 401 || response.status === 403) {
            await offlineDB.syncQueue.update(item.id!, { retries: item.retries + 1 });
          } else {
            await offlineDB.syncQueue.update(item.id!, { retries: item.retries + 1 });
          }
        } catch {
          await offlineDB.syncQueue.update(item.id!, { retries: item.retries + 1 });
        }
      }
    } finally {
      this.syncInProgress = false;
      this.pendingSyncCount = await offlineDB.syncQueue.count();
    }
  }

  private async invalidateCache(endpoint: string): Promise<void> {
    const cacheMap: Record<string, string> = {
      '/api/users': 'users',
      '/api/academic/grades': 'examResults',
      '/api/attendance': 'attendance',
      '/api/activities': 'posts',
      '/api/conversations': 'conversations',
      '/api/events': 'events',
    };

    const tableName = cacheMap[endpoint];
    if (tableName) {
      // In a real implementation, you'd invalidate specific entries
      // For now, we rely on the next fetch to update from server
    }
  }

  async getCachedData(tableName: string): Promise<unknown[]> {
    try {
      const table = offlineDB.table(tableName);
      return await table.toArray();
    } catch {
      return [];
    }
  }

  async updateCache(tableName: string, data: unknown[]): Promise<void> {
    try {
      const table = offlineDB.table(tableName);
      await table.clear();
      await table.bulkAdd(data as never);
    } catch (error) {
      console.error(`Failed to update cache for ${tableName}:`, error);
    }
  }

  async clearAllData(): Promise<void> {
    await offlineDB.transaction('rw', offlineDB.tables, async () => {
      for (const table of offlineDB.tables) {
        await table.clear();
      }
    });
  }
}

export const offlineAPI = OfflineAPIClient.getInstance();