import { HindsightClient } from "@vectorize-io/hindsight-client";

let client: HindsightClient | undefined;

export function hindsightConfig() {
  return {
    baseUrl: process.env.HINDSIGHT_BASE_URL ?? "http://localhost:8888",
    apiKey: process.env.HINDSIGHT_API_KEY || undefined,
  };
}

export function hs(): HindsightClient {
  client ??= new HindsightClient(hindsightConfig());
  return client;
}

/** For the few endpoints the typed client doesn't wrap (delete bank, consolidate, operation status). */
export async function hindsightFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, apiKey } = hindsightConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Hindsight ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
