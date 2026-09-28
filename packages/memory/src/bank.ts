import { HindsightError } from "@vectorize-io/hindsight-client";
import { hindsightFetch, hs } from "./client";
import { traced } from "./trace";

export const bankIdFor = (clientSlug: string) => `client-${clientSlug}`;
export const repoTag = (repo: string) => `repo:${repo}`;

const retainMission =
  "This bank stores application-security findings and remediation events for one client. " +
  "Always extract: the vulnerability class with its CWE id, severity, scan round and date, file, endpoint, " +
  "the shared code path or helper the issue flows through, the root cause, and for fixes exactly what the fix " +
  "changed AND what it did not change. Ignore scanner boilerplate.";

const observationsMission =
  "Build durable knowledge about this client's security posture: vulnerability classes that recur across scan rounds, " +
  "shared code (helpers, templates, config) that keeps producing findings, fixes that held versus fixes that regressed, " +
  "and remediation habits of the team (for example fixing one endpoint at a time instead of the shared root cause).";

const reflectMission = (clientName: string) =>
  `I am Recidivist, a senior application-security auditor who has audited ${clientName} across several engagements. ` +
  "I judge every new finding against the full history of findings and fixes for this client. " +
  "I do not trust a fix until the issue stays absent in later scans, and I call out when a team keeps fixing symptoms " +
  "(single endpoints or templates) instead of the shared root cause.";

const directives = [
  {
    name: "Cite history",
    content:
      "When calling a finding recurring, a regression or persistent, cite the scan round and date of each earlier occurrence.",
  },
  {
    name: "Fix skepticism",
    content: "Treat a fix as having held only when the issue is absent from at least two later scans.",
  },
  {
    name: "Client confidentiality",
    content: "Only use this client's own history. Never refer to other clients or engagements.",
  },
];

/** Create (or update) a client's memory bank: missions, skeptical auditor disposition, directives. Idempotent. */
export async function setupBank(input: { bankId: string; clientName: string; clientId?: number }) {
  const { bankId, clientName, clientId } = input;
  const config = {
    reflectMission: reflectMission(clientName),
    retainMission,
    observationsMission,
    enableObservations: true,
  };
  await traced({ op: "bank", bankId, clientId, label: "create bank", request: config }, () =>
    hs().createBank(bankId, config),
  );

  const disposition = { dispositionSkepticism: 5, dispositionLiteralism: 4, dispositionEmpathy: 1 };
  await traced({ op: "bank", bankId, clientId, label: "set disposition", request: disposition }, () =>
    hs().updateBankConfig(bankId, disposition),
  );

  const existing = await hs().listDirectives(bankId);
  const existingNames = new Set(existing.items.map((d) => d.name));
  for (const d of directives) {
    if (existingNames.has(d.name)) continue;
    await traced({ op: "bank", bankId, clientId, label: `directive · ${d.name}`, request: d }, () =>
      hs().createDirective(bankId, d.name, d.content),
    );
  }
}

export async function deleteBank(bankId: string) {
  try {
    await hindsightFetch(`/v1/default/banks/${encodeURIComponent(bankId)}`, { method: "DELETE" });
  } catch (err) {
    if (!String(err).includes(" 404 ")) throw err;
  }
}

type OperationStatus = {
  operation_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "not_found";
  error_message?: string | null;
};

export async function waitForOperation(bankId: string, operationId: string, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await hindsightFetch<OperationStatus>(
      `/v1/default/banks/${encodeURIComponent(bankId)}/operations/${encodeURIComponent(operationId)}`,
    );
    if (op.status === "completed" || op.status === "not_found") return op;
    if (op.status === "failed" || op.status === "cancelled") {
      throw new Error(`Hindsight operation ${operationId} ${op.status}: ${op.error_message ?? ""}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for Hindsight operation ${operationId}`);
}

/** Run observation consolidation now and wait for it, so the next scan can recall fresh observations. */
export async function consolidateAndWait(bankId: string, trace: { clientId?: number; scanId?: number } = {}) {
  return traced({ op: "consolidate", bankId, label: "consolidate observations", request: {}, ...trace }, async () => {
    const res = await hindsightFetch<{ operation_id: string }>(
      `/v1/default/banks/${encodeURIComponent(bankId)}/consolidate`,
      { method: "POST", body: "{}" },
    );
    return waitForOperation(bankId, res.operation_id);
  });
}

export function isNotFound(err: unknown) {
  return err instanceof HindsightError && err.statusCode === 404;
}

export async function hindsightVersion() {
  return hs().getVersion();
}
