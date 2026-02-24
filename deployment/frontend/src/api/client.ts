/**
 * API Client for Azure deployment
 * Replaces all Supabase JS client calls with fetch() to Express backend
 *
 * Usage:
 *   import { api } from '@/api/client';
 *
 *   // CRUD
 *   const projects = await api.from('projects').select();
 *   const project  = await api.from('projects').select('id');
 *   const created  = await api.from('projects').insert({ name: 'New' });
 *   const updated  = await api.from('projects').update({ name: 'X' }).eq('id', '...');
 *   const deleted  = await api.from('projects').delete().eq('id', '...');
 *
 *   // Edge function replacement
 *   const result = await api.functions.invoke('browser-use', { body: { action: 'create_task' } });
 */

import { getAccessToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || '';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });

    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: new Error(body || `HTTP ${res.status}`) };
    }

    const data = await res.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ─── Query builder (mimics supabase.from('table').select/insert/update/delete) ─

type FilterOp = { column: string; value: unknown };

class QueryBuilder<T = unknown> {
  private table: string;
  private method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET';
  private body: Record<string, unknown> | null = null;
  private filters: FilterOp[] = [];
  private queryParams: Record<string, string> = {};
  private singleRow = false;
  private targetId: string | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string) {
    this.method = 'GET';
    if (columns) this.queryParams.select = columns;
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this.method = 'POST';
    this.body = Array.isArray(data) ? data[0] : data;
    return this;
  }

  update(data: Record<string, unknown>) {
    this.method = 'PATCH';
    this.body = data;
    return this;
  }

  delete() {
    this.method = 'DELETE';
    return this;
  }

  eq(column: string, value: unknown) {
    // If filtering by 'id', treat as path param for PATCH/DELETE
    if (column === 'id' && (this.method === 'PATCH' || this.method === 'DELETE')) {
      this.targetId = String(value);
    } else {
      this.filters.push({ column, value });
    }
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.queryParams.order_by = column;
    this.queryParams.order = opts?.ascending ? 'asc' : 'desc';
    return this;
  }

  limit(n: number) {
    this.queryParams.limit = String(n);
    return this;
  }

  single() {
    this.singleRow = true;
    return this;
  }

  maybeSingle() {
    this.singleRow = true;
    return this;
  }

  async then<TResult = { data: T | T[] | null; error: Error | null }>(
    resolve: (value: { data: T | T[] | null; error: Error | null }) => TResult
  ): Promise<TResult> {
    const result = await this.execute();
    return resolve(result);
  }

  private async execute(): Promise<{ data: T | T[] | null; error: Error | null }> {
    // Build URL
    let path = `/api/${this.table}`;
    if (this.targetId) path += `/${this.targetId}`;

    // For GET with id filter
    if (this.method === 'GET' && !this.targetId) {
      const idFilter = this.filters.find(f => f.column === 'id');
      if (idFilter && this.singleRow) {
        path += `/${idFilter.value}`;
        this.filters = this.filters.filter(f => f.column !== 'id');
      }
    }

    // Build query string
    const params = new URLSearchParams(this.queryParams);
    for (const f of this.filters) {
      if (f.column !== 'user_id') { // user_id is handled by backend auth
        params.set(f.column, String(f.value));
      }
    }
    const qs = params.toString();
    if (qs) path += `?${qs}`;

    const opts: RequestInit = { method: this.method };
    if (this.body && (this.method === 'POST' || this.method === 'PATCH')) {
      opts.body = JSON.stringify(this.body);
    }

    const { data, error } = await request<T | T[]>(path, opts);

    if (this.singleRow && Array.isArray(data)) {
      return { data: (data as T[])[0] ?? null, error };
    }

    return { data, error };
  }
}

// ─── Functions (replaces supabase.functions.invoke) ─────────────────────────

const functions = {
  async invoke<T = unknown>(
    name: string,
    options?: { body?: unknown }
  ): Promise<{ data: T | null; error: Error | null }> {
    return request<T>(`/api/${name}`, {
      method: 'POST',
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
  },
};

// ─── Channel stub (replaces supabase.channel — use polling in Azure version) ─

function channel(_name: string) {
  return {
    on: (_event: string, _filter: unknown, _callback: (payload: unknown) => void) => {
      // Realtime not available in Azure version — use polling instead
      return channel(_name);
    },
    subscribe: () => {
      console.info('[api] Realtime channels not available in Azure deployment. Use polling.');
      return { unsubscribe: () => {} };
    },
  };
}

function removeChannel(_channel: unknown) {
  // no-op
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const api = {
  from<T = unknown>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(table);
  },
  functions,
  channel,
  removeChannel,
};

// Default export for drop-in replacement
export default api;
