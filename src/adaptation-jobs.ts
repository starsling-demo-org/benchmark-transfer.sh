import type { RepositoryAdaptationRule } from './types.ts'

/**
 * Jobs an adaptation switches off on purpose: a rule scoped to one job that sets its `if` to false, either as a
 * `workflow-setting` or as a text rule whose replacement is `if: false ...` / `false && ...`.
 *
 * A text rule is scoped to a job but may rewrite one of its steps' `if:` (a registry login, a notify step): the job
 * still runs. `guardsJob` says whether a text rule rewrites the job's own `if:`; without it every such rule counts.
 */
export function adaptationDisabledJobs(
  adaptations: RepositoryAdaptationRule[],
  guardsJob?: (rule: RepositoryAdaptationRule) => boolean,
): { workflowFile: string; jobId: string }[] {
  const off = /^\s*(?:if:\s*)?(?:\$\{\{\s*)?false\b/
  const out: { workflowFile: string; jobId: string }[] = []
  for (const a of adaptations) {
    if (!a.workflowFile || !a.jobId) continue
    const viaSetting =
      a.kind === 'workflow-setting' &&
      a.setPath?.length === 1 &&
      a.setPath[0] === 'if' &&
      (a.setValue === false || (typeof a.setValue === 'string' && off.test(a.setValue)))
    const viaText = a.kind !== 'workflow-setting' && off.test(a.toReplacement) && (guardsJob?.(a) ?? true)
    if (viaSetting || viaText) out.push({ workflowFile: a.workflowFile, jobId: a.jobId })
  }
  return out
}

/** `guardsJob` from each job's upstream `if:` (as `workflowJobsOf` lists it): the rule's pattern is in it. */
export function jobLevelGuard(
  workflowJobs: Record<string, Record<string, { name?: string; needs?: string[]; if?: string }>>,
): (rule: RepositoryAdaptationRule) => boolean {
  return (rule) => {
    const condition = rule.workflowFile && rule.jobId ? workflowJobs[rule.workflowFile]?.[rule.jobId]?.if : undefined
    return Boolean(condition && rule.fromPattern && condition.includes(rule.fromPattern))
  }
}
