import type {
  ClientDetail,
  ClientSummary,
  HealthStatus,
  MemoryCall,
  MentalModel,
  ScanDetail,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let message = `API request failed: ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

export async function fetchHealth(): Promise<HealthStatus> {
  return request<HealthStatus>("/health");
}

export async function fetchClients(): Promise<ClientSummary[]> {
  return request<ClientSummary[]>("/clients");
}

export async function fetchClientDetail(
  slug: string,
  withProfile = true
): Promise<ClientDetail> {
  return request<ClientDetail>(`/clients/${slug}${withProfile ? "?profile=1" : ""}`);
}

export async function fetchClientProfile(slug: string): Promise<{ bankId: string; profile: MentalModel | null }> {
  return request<{ bankId: string; profile: MentalModel | null }>(`/clients/${slug}/profile`);
}

export async function refreshClientProfile(slug: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/clients/${slug}/profile/refresh`, {
    method: "POST",
  });
}

export async function fetchScanDetail(scanId: number): Promise<ScanDetail> {
  return request<ScanDetail>(`/scans/${scanId}`);
}

export async function uploadScan(payload: unknown): Promise<{ scanId: number }> {
  return request<{ scanId: number }>("/scans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rerunScan(scanId: number): Promise<{ scanId: number }> {
  return request<{ scanId: number }>(`/scans/${scanId}/rerun`, {
    method: "POST",
  });
}

export async function deleteScan(scanId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/scans/${scanId}`, {
    method: "DELETE",
  });
}

export async function markFindingFixed(
  findingId: number,
  note: string,
  fixedAt?: string
): Promise<{ finding: unknown; memory: { ok: boolean; error: string | null } }> {
  return request<{ finding: unknown; memory: { ok: boolean; error: string | null } }>(
    `/findings/${findingId}/fix`,
    {
      method: "POST",
      body: JSON.stringify({ note, fixedAt }),
    }
  );
}

export async function fetchSampleScan(client: string, round: number): Promise<unknown> {
  return request<unknown>(`/samples/${client}/${round}`);
}

export async function fetchMemoryCalls(params?: {
  scanId?: number;
  clientSlug?: string;
  limit?: number;
}): Promise<MemoryCall[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));

  if (params?.scanId) {
    return request<MemoryCall[]>(`/scans/${params.scanId}/memory-calls?${query}`);
  }
  if (params?.clientSlug) {
    return request<MemoryCall[]>(`/clients/${params.clientSlug}/memory-calls?${query}`);
  }
  return request<MemoryCall[]>(`/memory-calls?${query}`);
}
