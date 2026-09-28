/**
 * @recidivist/memory: the ONLY package that talks to Hindsight.
 *
 *   setupBank      one bank per client (missions, skeptical disposition, directives)
 *   recallHistory  "have we seen this before?" for each new finding
 *   reflectOnScan  verdicts for the whole scan (structured output)
 *   retainFindings / retainFixes   remember scans and fixes
 *   ensureProfile / getProfile     auto-refreshing client security profile (mental model)
 */
export { hs, hindsightConfig } from "./client";
export { traced } from "./trace";
export {
  bankIdFor,
  consolidateAndWait,
  deleteBank,
  hindsightVersion,
  isNotFound,
  repoTag,
  setupBank,
} from "./bank";
export {
  PROFILE_ID,
  ensureProfile,
  findingNarrative,
  fixNarrative,
  forgetFindings,
  getProfile,
  recallHistory,
  recallQuery,
  reflectOnScan,
  reflectPrompt,
  refreshProfile,
  retainFindings,
  retainFixes,
  type FindingMemo,
  type FixMemo,
  type Profile,
  type ReflectVerdict,
} from "./operations";
