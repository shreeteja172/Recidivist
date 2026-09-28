import { createHash } from "node:crypto";
import { z } from "zod";

export const FindingInputSchema = z.object({
  key: z.string().min(1),
  ruleId: z.string().min(1),
  cwe: z.string().regex(/^CWE-\d+$/, "cwe must look like CWE-89"),
  cweName: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().nonnegative(),
  endpoint: z.string().min(1).nullable().default(null),
  sink: z.string().min(1).nullable().default(null),
  description: z.string().min(1),
});

/** The scan upload format (also the format of data/<client>/round-N.json). */
export const ScanFileSchema = z
  .object({
    client: z.string().min(1),
    repo: z.string().min(1),
    round: z.number().int().positive(),
    scannedAt: z.iso.datetime({ offset: true }),
    tool: z.string().min(1).default("semgrep"),
    findings: z.array(FindingInputSchema).min(1),
  })
  .superRefine((scan, ctx) => {
    const seen = new Set<string>();
    for (const f of scan.findings) {
      if (seen.has(f.key)) ctx.addIssue({ code: "custom", message: `duplicate finding key ${f.key}` });
      seen.add(f.key);
    }
  });

export const ClientsFileSchema = z.array(
  z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    industry: z.string().min(1),
    repo: z.string().min(1),
    stack: z.string().min(1),
    prefix: z.string().min(1),
  }),
);

export const FixesFileSchema = z.array(
  z.object({
    key: z.string().min(1),
    fixedAt: z.iso.date(),
    note: z.string().min(1),
  }),
);

export const MarkFixedSchema = z.object({
  note: z.string().min(3, "Describe how it was fixed"),
  fixedAt: z.iso.datetime({ offset: true }).optional(),
});

export type FindingInput = z.infer<typeof FindingInputSchema>;
export type ScanFile = z.infer<typeof ScanFileSchema>;
export type ClientsFile = z.infer<typeof ClientsFileSchema>;
export type FixesFile = z.infer<typeof FixesFileSchema>;

/** Same CWE + same file + same endpoint = the same issue (used for exact regression / persistent checks). */
export function fingerprint(f: { cwe: string; file: string; endpoint: string | null }) {
  return createHash("sha1").update(`${f.cwe}|${f.file}|${f.endpoint ?? ""}`).digest("hex");
}
