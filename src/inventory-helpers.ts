import {
  evaluateCondition,
  type ExpressionContext,
  type ExpressionValue,
  UNKNOWN,
  unwrapExpression,
} from './expressions.ts'
import { isBranchEvent, isPullRequestEvent } from './config.ts'
import type {
  RepositoryAdaptationRule,
  RunnerMappingConfig,
  ScenarioConfig,
  SetupBlocker,
  WorkflowFileInventory,
  WorkflowJobInventory,
} from './types.ts'

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

export function matchGlobPattern(pattern: string, target: string): boolean {
  const normalizedPattern = pattern.replace(/^\/+/, '')
  const normalizedTarget = target.replace(/^\/+/, '')

  const regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__GLOBSTAR_SLASH__/g, '(?:.+/)?')
    .replace(/__GLOBSTAR__/g, '.*')

  const regex = new RegExp(`^${regexStr}$`)
  return regex.test(normalizedTarget)
}

function orderedMatch(patterns: string[], target: string): boolean {
  let matched = false
  for (const pattern of patterns) {
    const negative = pattern.startsWith('!')
    if (matchGlobPattern(negative ? pattern.slice(1) : pattern, target)) matched = !negative
  }
  return matched
}

export function matchesBranchFilter(branch: string, branches?: string[], branchesIgnore?: string[]): boolean {
  if (branchesIgnore && branchesIgnore.length > 0) {
    if (branchesIgnore.some((pat) => matchGlobPattern(pat, branch))) {
      return false
    }
  }
  if (branches && branches.length > 0) {
    return orderedMatch(branches, branch)
  }
  return true
}

type EventFilter = NonNullable<WorkflowFileInventory['triggers']['eventFilters']>[string]

/** `tags` / `tags-ignore` of one `on.<event>` block, as eventFilters fields. */
export function tagFilters(evtCfg: Record<string, unknown>): Pick<EventFilter, 'tags' | 'tagsIgnore'> {
  const list = (v: unknown) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.map(String) : undefined)
  const tags = list(evtCfg.tags)
  const tagsIgnore = list(evtCfg['tags-ignore'])
  return { ...(tags ? { tags } : {}), ...(tagsIgnore ? { tagsIgnore } : {}) }
}

/**
 * Why a workflow's branch filter keeps it from starting on this scenario's target branch, or undefined. GitHub: a
 * push filter that names only tags (tags / tags-ignore, no branches / branches-ignore) does not start the workflow
 * for a branch push, and every replayed push is a branch push.
 */
export function branchFilterExclusion(
  event: string,
  targetBranch: string,
  filter: EventFilter | undefined,
): string | undefined {
  if (event === 'push' && (filter?.tags || filter?.tagsIgnore) && !filter.branches && !filter.branchesIgnore)
    return 'Push trigger filters on tags only; a branch push does not start it'
  if (!matchesBranchFilter(targetBranch, filter?.branches, filter?.branchesIgnore))
    return `Target branch "${targetBranch}" excluded by branch filter`
  return undefined
}

export function matchesPathFilter(changedPaths: string[], paths?: string[], pathsIgnore?: string[]): boolean {
  if (changedPaths.length === 0) {
    return !paths || paths.length === 0
  }

  let effectivePaths = changedPaths
  if (pathsIgnore && pathsIgnore.length > 0) {
    effectivePaths = changedPaths.filter((p) => !pathsIgnore.some((pat) => matchGlobPattern(pat, p)))
    if (effectivePaths.length === 0) {
      return false
    }
  }

  if (paths && paths.length > 0) {
    return effectivePaths.some((p) => orderedMatch(paths, p))
  }

  return true
}

export type JobRunnerMapping = {
  github: string
  starsling: string
  retainedOnGitHub: boolean
  retentionReason?: string
  /** Which rule decided: a job override, a compound selector, an unsupported OS/arch, the default map, or none. */
  kind: 'override' | 'compound' | 'unsupported' | 'mapped' | 'unmapped'
}

/** An explicit `{ github, starsling }` pair stays on GitHub when both sides name the same non-StarSling label. */
const explicitTarget = (
  target: { github: string; starsling: string },
  kind: 'override' | 'mapped',
): JobRunnerMapping => ({
  github: target.github,
  starsling: target.starsling,
  retainedOnGitHub: target.github === target.starsling && !target.starsling.startsWith('starsling'),
  kind,
})

export function resolveJobRunnerMapping(
  workflowFile: string,
  jobId: string,
  runsOn: WorkflowJobInventory['runsOn'],
  runnerMapping: RunnerMappingConfig,
): JobRunnerMapping {
  const primaryLabel = typeof runsOn === 'string' ? runsOn : JSON.stringify(runsOn)
  const overrideKey = `${workflowFile}#${jobId}`
  const jobOverride = runnerMapping.jobOverrides?.[overrideKey] ?? runnerMapping.jobOverrides?.[jobId]
  if (jobOverride) return explicitTarget(jobOverride, 'override')

  if (typeof runsOn !== 'string')
    return {
      github: primaryLabel,
      starsling: primaryLabel,
      retainedOnGitHub: true,
      retentionReason: 'Compound runner selectors require an explicit job mapping; preserved unchanged',
      kind: 'compound',
    }

  // An explicit defaultMap entry decides first, for macOS, Windows and Arm labels too: that is how a
  // `macos-latest` or `windows-latest` label (or matrix value) gets a pinned label on both sides.
  const mapped = runnerMapping.defaultMap[primaryLabel]
  if (mapped) return explicitTarget(mapped, 'mapped')

  const lower = primaryLabel.toLowerCase()
  const isUnsupportedNonLinuxOrArm =
    lower.includes('macos') || lower.includes('windows') || lower.includes('arm') || lower.includes('-arm64')

  if (isUnsupportedNonLinuxOrArm) {
    return {
      github: primaryLabel,
      starsling: primaryLabel,
      retainedOnGitHub: true,
      retentionReason: `Unsupported OS/arch runner "${primaryLabel}" kept on original GitHub runner`,
      kind: 'unsupported',
    }
  }

  return {
    github: primaryLabel,
    starsling: primaryLabel,
    retainedOnGitHub: true,
    kind: 'unmapped',
    ...(primaryLabel.startsWith('ubuntu')
      ? {}
      : { retentionReason: `Unmapped runner "${primaryLabel}" retained on original label` }),
  }
}

/**
 * The mapping for one literal value of a job's `runs-on: ${{ matrix.<key> }}`: a per-job, per-value
 * `matrixOverrides` entry, else the same rules as a plain label (job-wide overrides do not apply per value).
 */
export function resolveMatrixValueMapping(
  workflowFile: string,
  jobId: string,
  value: string,
  runnerMapping: RunnerMappingConfig,
): JobRunnerMapping {
  const perJob = runnerMapping.matrixOverrides?.[`${workflowFile}#${jobId}`] ?? runnerMapping.matrixOverrides?.[jobId]
  const override = perJob?.[value]
  if (override) return explicitTarget(override, 'override')
  const { jobOverrides: _ignored, ...withoutJobOverrides } = runnerMapping
  return resolveJobRunnerMapping(workflowFile, jobId, value, withoutJobOverrides)
}

export type DependencyStatus = 'executed' | 'skipped' | 'failed' | 'conditional'

/** Context values the replay knows before dispatch. Event payload details GitHub fills in stay unknown. */
export function buildScenarioExpressionContext(
  scenario: ScenarioConfig,
  executionRepository: string,
  dependencyStatuses: Record<string, DependencyStatus>,
): ExpressionContext {
  const values: Record<string, ExpressionValue> = {
    'github.event_name': scenario.event,
    'github.repository': executionRepository,
    'github.repository_owner': executionRepository.split('/')[0] ?? '',
  }
  if (scenario.main && isBranchEvent(scenario.event)) {
    Object.assign(values, {
      'github.ref': `refs/heads/${scenario.main.branch}`,
      'github.ref_name': scenario.main.branch,
      'github.ref_type': 'branch',
      'github.base_ref': '',
      'github.head_ref': '',
    })
  }
  if (scenario.pr && isPullRequestEvent(scenario.event)) {
    Object.assign(values, {
      'github.base_ref': scenario.pr.baseRef,
      'github.event.action': scenario.pr.activityType,
      'github.event.pull_request.base.ref': scenario.pr.baseRef,
      'github.event.pull_request.draft': false,
      'github.event.pull_request.labels.*.name': [...scenario.pr.labels],
    })
  }
  const statuses = Object.entries(dependencyStatuses)
  for (const [dep, status] of statuses)
    if (status !== 'conditional')
      values[`needs.${dep.toLowerCase()}.result`] =
        status === 'executed' ? 'success' : status === 'failed' ? 'failure' : 'skipped'
  const allExecuted = statuses.every(([, status]) => status === 'executed')
  return {
    values,
    status: {
      // A conditional dependency may be skipped natively, so success() is unknown until GitHub decides.
      success: allExecuted ? true : statuses.some(([, s]) => s === 'skipped' || s === 'failed') ? false : UNKNOWN,
      // The replay assumes upstream dependencies succeed; failure() only holds for a known failed dependency.
      failure: statuses.some(([, s]) => s === 'failed'),
      cancelled: false,
    },
  }
}

export function evaluateJobIfCondition(
  ifCondition: string | undefined,
  scenario: ScenarioConfig,
  upstreamRepo: string,
  adaptations: RepositoryAdaptationRule[],
  dependencyStatuses: Record<string, DependencyStatus>,
  executionRepository = upstreamRepo,
): { shouldExecute: boolean; unresolved?: boolean; skipReason?: string; requiresRepoIdentityAdaptation: boolean } {
  const context = buildScenarioExpressionContext(scenario, executionRepository, dependencyStatuses)
  const blockingDependency = Object.entries(dependencyStatuses).find(([, st]) => st === 'skipped' || st === 'failed')
  if (!ifCondition) {
    if (blockingDependency)
      return {
        shouldExecute: false,
        skipReason: `Upstream dependency "${blockingDependency[0]}" is ${blockingDependency[1]}`,
        requiresRepoIdentityAdaptation: false,
      }
    if (context.status.success === UNKNOWN)
      return {
        shouldExecute: true,
        unresolved: true,
        skipReason: 'Depends on a job whose condition GitHub evaluates natively',
        requiresRepoIdentityAdaptation: false,
      }
    return { shouldExecute: true, requiresRepoIdentityAdaptation: false }
  }

  const normalized = unwrapExpression(ifCondition)
  const repoGuardRegex = new RegExp(`github\\.repository\\s*[!=]=\\s*'${escapeRegExp(upstreamRepo)}'`, 'i')
  const hasRepoGuard = repoGuardRegex.test(normalized)
  const hasAdaptation = adaptations.some(
    (a) => a.kind === 'repository-identity-remap' && normalized.includes(a.fromPattern),
  )
  const result = evaluateCondition(normalized, context)
  if (result.value === false) {
    return {
      shouldExecute: false,
      skipReason:
        !result.usesStatusFunction && blockingDependency
          ? `Dependency "${blockingDependency[0]}" is ${blockingDependency[1]}`
          : `Condition is false: ${normalized}`,
      requiresRepoIdentityAdaptation: hasRepoGuard && !hasAdaptation,
    }
  }
  return {
    shouldExecute: true,
    ...(result.value === undefined
      ? {
          unresolved: true,
          skipReason: result.parseError
            ? `Unparsed expression (${result.parseError}); GitHub evaluates natively: ${normalized}`
            : `Requires native evaluation: ${normalized}`,
        }
      : {}),
    requiresRepoIdentityAdaptation: hasRepoGuard && !hasAdaptation,
  }
}

export function scanJobBlockers(params: {
  workflow: WorkflowFileInventory
  job: WorkflowJobInventory
  upstreamRepo: string
  adaptations: RepositoryAdaptationRule[]
}): SetupBlocker[] {
  const { workflow, job, upstreamRepo, adaptations } = params
  const blockers: SetupBlocker[] = []
  // Text replacements that the generator applies to this job: scoped to its file and job, with a real pattern
  // (`workflow-setting` rules set a YAML path and carry no pattern, so they never cover a text check).
  const appliesHere = (a: RepositoryAdaptationRule, text: string | undefined) =>
    a.kind !== 'workflow-setting' &&
    a.fromPattern !== '' &&
    (!a.workflowFile || a.workflowFile === workflow.filePath) &&
    (!a.jobId || a.jobId === job.jobId) &&
    Boolean(text?.includes(a.fromPattern))

  // 1. Repository identity guard without explicit adaptation
  const checkRepoIdentity = (expr: string | undefined, stepIndex?: number, stepName?: string) => {
    if (!expr) return
    if (expr.includes(upstreamRepo) && expr.includes('github.repository')) {
      const covered = adaptations.some((a) => a.kind === 'repository-identity-remap' && appliesHere(a, expr))
      if (!covered) {
        blockers.push({
          id: `repo-identity-${workflow.filePath}-${job.jobId}-${stepIndex ?? 'job'}`,
          category: 'repository_identity_guard',
          severity: 'blocker',
          sourceLocation: {
            file: workflow.filePath,
            jobId: job.jobId,
            ...(stepIndex !== undefined ? { stepIndex } : {}),
            ...(stepName !== undefined ? { stepName } : {}),
          },
          evidence: `Condition "${expr}" checks upstream repository identity "${upstreamRepo}" and will skip in benchmark repository.`,
          nextAction: `Add a narrowly targeted "repository-identity-remap" rule to config.adaptations for ${workflow.filePath}#${job.jobId}.`,
        })
      }
    }
  }

  checkRepoIdentity(job.ifCondition)
  for (const step of job.steps) {
    checkRepoIdentity(step.ifCondition, step.index, step.name)
  }

  // 2. Unadapted secrets
  for (const secretName of job.referencedSecrets) {
    if (secretName === 'GITHUB_TOKEN') continue
    const covered = adaptations.some(
      (a) =>
        (a.kind === 'secret-gate-annotation' || a.kind === 'external-dependency-stub') &&
        a.fromPattern.includes(secretName),
    )
    if (!covered) {
      blockers.push({
        id: `missing-secret-${workflow.filePath}-${job.jobId}-${secretName}`,
        category: 'missing_secret',
        severity: 'blocker',
        sourceLocation: { file: workflow.filePath, jobId: job.jobId },
        evidence: `Job "${job.jobId}" references secret "secrets.${secretName}" which is unavailable in clean public replay.`,
        nextAction: `Configure secret "${secretName}" or record an explicit adaptation in config.adaptations (note: stripping required secrets blocks full-parity claims).`,
      })
    }
  }

  // 3. External inaccessible reusable workflow
  if (job.usesReusableWorkflow && !job.usesReusableWorkflow.startsWith('./')) {
    const repoPrefix = job.usesReusableWorkflow.split('/.github/')[0] ?? ''
    const remapped = adaptations.some((a) => appliesHere(a, job.usesReusableWorkflow))
    if (repoPrefix.startsWith(upstreamRepo) && !remapped) {
      blockers.push({
        id: `external-reusable-wf-${workflow.filePath}-${job.jobId}`,
        category: 'inaccessible_external_workflow',
        severity: 'blocker',
        sourceLocation: { file: workflow.filePath, jobId: job.jobId },
        evidence: `Job "${job.jobId}" calls upstream-qualified reusable workflow "${job.usesReusableWorkflow}" instead of local relative path.`,
        nextAction:
          'Add an adaptation remapping the reusable workflow reference to the local replay checkout or verify external workflow access.',
      })
    }
  }

  // 4. Fork semantics check
  if (
    job.ifCondition?.includes('github.event.pull_request.head.repo.fork') ||
    job.ifCondition?.includes('github.event.pull_request.head.repo.full_name')
  ) {
    const covered = adaptations.some((a) => appliesHere(a, job.ifCondition))
    if (!covered) {
      blockers.push({
        id: `fork-semantics-${workflow.filePath}-${job.jobId}`,
        category: 'unreproduced_fork_semantics',
        severity: 'blocker',
        sourceLocation: { file: workflow.filePath, jobId: job.jobId },
        evidence: `Job "${job.jobId}" branches on fork PR identity ("${job.ifCondition}"), which differs in single-repo topic-branch PR replay.`,
        nextAction:
          'Record an explicit adaptation for fork PR condition or mark scenario as blocked for fork-specific parity.',
      })
    }
  }

  // 5. Deployment environment guard
  if (job.environment) {
    const covered = adaptations.some((a) => a.kind === 'environment-strip' || a.kind === 'deployment-guard')
    if (!covered) {
      blockers.push({
        id: `deployment-env-${workflow.filePath}-${job.jobId}`,
        category: 'altered_deployment_behavior',
        severity: 'blocker',
        sourceLocation: { file: workflow.filePath, jobId: job.jobId },
        evidence: `Job "${job.jobId}" targets protected deployment environment "${job.environment}".`,
        nextAction:
          'Record a deployment-guard or environment-strip adaptation (blocks full-parity if deployment steps are altered).',
      })
    }
  }

  return blockers
}

export function expandMatrix(
  matrix: Record<string, unknown>,
  includes: Record<string, unknown>[],
): Record<string, unknown>[] {
  const axes = Object.entries(matrix).filter(([key]) => key !== 'include' && key !== 'exclude')
  let originals: Record<string, unknown>[] = axes.length ? [{}] : []
  for (const [key, values] of axes) {
    if (!Array.isArray(values)) throw new Error(`Unsupported matrix axis ${key}`)
    originals = originals.flatMap((row) => values.map((value) => ({ ...row, [key]: value })))
    if (originals.length > 256) throw new Error('Matrix exceeds 256 jobs')
  }
  const excluded = Array.isArray(matrix.exclude) ? (matrix.exclude as Record<string, unknown>[]) : []
  originals = originals.filter(
    (row) =>
      !excluded.some((ex) =>
        Object.entries(ex).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value)),
      ),
  )
  const rows = originals.map((row) => ({ ...row }))
  for (const include of includes) {
    let merged = false
    originals.forEach((original, index) => {
      if (
        Object.entries(include).every(
          ([key, value]) => !(key in original) || JSON.stringify(original[key]) === JSON.stringify(value),
        )
      ) {
        rows[index] = { ...rows[index], ...include }
        merged = true
      }
    })
    if (!merged) rows.push({ ...include })
  }
  return rows
}
