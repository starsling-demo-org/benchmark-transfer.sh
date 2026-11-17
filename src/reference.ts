/**
 * Upstream reference runs: what the public project's own GitHub Actions actually ran for a scenario's commit.
 *
 * A replay reaches CI parity when its baseline variants run the same workflows and jobs, with the same
 * conclusions, as the upstream reference. Step lists are reported but do not gate parity, because cache
 * state legitimately changes which steps run (for example `if: steps.cache.outputs.cache-hit != 'true'`).
 */
import { diffSecondsWhole, type SampleMeasurementResult } from './collector.ts'
import { isPullRequestEvent } from './config.ts'
import { array, type GitHubReader, nullableString as str, object } from './github.ts'
import { resolveMatrixValueMapping } from './inventory-helpers.ts'
import type { ExcludedJobSpec, ReferenceRunSpec, RunnerMappingConfig, ScenarioConfig } from './types.ts'

export interface ReferenceStep {
  number: number
  name: string
  conclusion: string | null
  durationSeconds: number | null
}

export interface ReferenceJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  durationSeconds: number | null
  labels: string[]
  steps: ReferenceStep[]
}

export interface ReferenceRun {
  runId: number
  attempt: number
  workflowPath: string
  workflowName: string
  event: string
  status: string
  conclusion: string | null
  htmlUrl: string
  createdAt: string
  startedAt: string | null
  jobs: ReferenceJob[]
}

export interface ScenarioReference {
  schemaVersion: 1
  scenarioName: string
  upstreamRepository: string
  event: string
  headSha: string
  retrievedAt: string
  runs: ReferenceRun[]
  metrics: { wallClockSeconds: number | null; runnerSeconds: number | null }
}

export interface ReferenceComparison {
  scenarioName: string
  sampleId: string
  variant: string
  passed: boolean
  referenceRunIds: number[]
  missingWorkflows: string[]
  unexpectedWorkflows: string[]
  missingJobs: string[]
  unexpectedJobs: string[]
  /**
   * Jobs that ran upstream and are deliberately off in the bench (an adaptation disabled them, or they need one that
   * is): not missing and not a mismatch, listed here so the README can say so. Absent when there are none.
   */
  intentionallyNotRun?: string[]
  conclusionMismatches: { job: string; reference: string; replay: string }[]
  /**
   * Conclusion differences on jobs in `execution.excludedJobs` (they run but do not gate a sample): reported, but
   * they do not fail parity. Absent when there are none.
   */
  excludedConclusionMismatches?: { job: string; reference: string; replay: string }[]
  /** Informational: executed-step differences for jobs present on both sides. */
  stepDifferences: { job: string; missing: string[]; unexpected: string[] }[]
  referenceWallClockSeconds: number | null
  replayWallClockSeconds: number | null
}

function normalizeRun(raw: unknown): Omit<ReferenceRun, 'jobs'> {
  const r = object(raw)
  return {
    runId: Number(r.id),
    attempt: Number(r.run_attempt ?? 1),
    workflowPath: String(r.path ?? '').split('@')[0] ?? '',
    workflowName: String(r.name ?? ''),
    event: String(r.event),
    status: String(r.status),
    conclusion: str(r.conclusion),
    htmlUrl: String(r.html_url ?? ''),
    createdAt: String(r.created_at),
    startedAt: str(r.run_started_at),
  }
}

function normalizeJob(raw: unknown): ReferenceJob {
  const j = object(raw)
  const startedAt = str(j.started_at)
  const completedAt = str(j.completed_at)
  return {
    id: Number(j.id),
    name: String(j.name),
    status: String(j.status),
    conclusion: str(j.conclusion),
    startedAt,
    completedAt,
    durationSeconds: j.conclusion === 'skipped' ? 0 : diffSecondsWhole(startedAt, completedAt),
    labels: array(j.labels ?? []).map(String),
    steps: array(j.steps ?? []).map((rawStep) => {
      const s = object(rawStep)
      return {
        number: Number(s.number),
        name: String(s.name),
        conclusion: str(s.conclusion),
        durationSeconds: s.conclusion === 'skipped' ? 0 : diffSecondsWhole(str(s.started_at), str(s.completed_at)),
      }
    }),
  }
}

/** Head SHA and branch whose upstream runs represent the scenario. */
export function scenarioReferenceTarget(scenario: ScenarioConfig): { headSha: string; branch?: string } {
  if (scenario.pr) return { headSha: scenario.pr.headSha }
  if (scenario.main) return { headSha: scenario.main.afterSha, branch: scenario.main.branch }
  throw new Error(`Scenario ${scenario.name} has no locked commit context`)
}

/**
 * Choose the upstream runs a scenario's event started: direct runs of the scenario event (earliest run per
 * workflow, which is the run the push itself caused) plus `workflow_run` listeners on the same head commit.
 */
export function selectReferenceRuns(
  runs: Omit<ReferenceRun, 'jobs'>[],
  scenario: ScenarioConfig,
  headBranch?: (runId: number) => string | undefined,
): Omit<ReferenceRun, 'jobs'>[] {
  const target = scenarioReferenceTarget(scenario)
  const direct = new Map<string, Omit<ReferenceRun, 'jobs'>>()
  const downstream: Omit<ReferenceRun, 'jobs'>[] = []
  for (const run of runs) {
    if (run.workflowPath.startsWith('dynamic/')) continue
    const matchesEvent = isPullRequestEvent(scenario.event)
      ? isPullRequestEvent(run.event)
      : run.event === scenario.event
    if (matchesEvent) {
      if (target.branch && headBranch && headBranch(run.runId) !== target.branch) continue
      const existing = direct.get(run.workflowPath)
      if (!existing || Date.parse(run.createdAt) < Date.parse(existing.createdAt)) direct.set(run.workflowPath, run)
    } else if (run.event === 'workflow_run') downstream.push(run)
  }
  return [...direct.values(), ...downstream].sort((a, b) => a.runId - b.runId)
}

function referenceMetrics(runs: ReferenceRun[]): ScenarioReference['metrics'] {
  let start: number | null = null
  let end: number | null = null
  let runnerSeconds = 0
  let partial = false
  for (const run of runs) {
    const started = run.startedAt ? Date.parse(run.startedAt) : Number.NaN
    if (!Number.isNaN(started)) start = start === null ? started : Math.min(start, started)
    for (const job of run.jobs) {
      if (job.conclusion === 'skipped') continue
      if (job.durationSeconds === null) partial = true
      else runnerSeconds += job.durationSeconds
      const completed = job.completedAt ? Date.parse(job.completedAt) : Number.NaN
      if (!Number.isNaN(completed)) end = end === null ? completed : Math.max(end, completed)
    }
  }
  return {
    wallClockSeconds: start !== null && end !== null ? Math.max(0, Math.round((end - start) / 1000)) : null,
    runnerSeconds: partial ? null : runnerSeconds,
  }
}

async function withJobs(client: GitHubReader, run: Omit<ReferenceRun, 'jobs'>): Promise<ReferenceRun> {
  const jobs = await client.all(`actions/runs/${run.runId}/attempts/${run.attempt}/jobs`, 'jobs')
  return { ...run, jobs: jobs.map(normalizeJob) }
}

/** Discover the upstream runs for a scenario's commit (used by `bench init` before reference runs are locked). */
export async function discoverReferenceRuns(
  client: GitHubReader,
  scenario: ScenarioConfig,
): Promise<ReferenceRunSpec[]> {
  const target = scenarioReferenceTarget(scenario)
  const raw = await client.all(`actions/runs?head_sha=${target.headSha}`, 'workflow_runs')
  const branches = new Map(raw.map((r) => [Number(object(r).id), String(object(r).head_branch)]))
  return selectReferenceRuns(raw.map(normalizeRun), scenario, (id) => branches.get(id)).map((run) => ({
    workflowPath: run.workflowPath,
    runId: run.runId,
    attempt: run.attempt,
    htmlUrl: run.htmlUrl,
  }))
}

/** Fetch the locked reference runs (immutable run IDs and attempts) with their jobs and steps. */
export async function fetchScenarioReference(params: {
  client: GitHubReader
  upstreamRepository: string
  scenario: ScenarioConfig
  retrievedAt?: string
}): Promise<ScenarioReference> {
  const { client, scenario } = params
  if (!scenario.referenceRuns.length)
    throw new Error(`Scenario ${scenario.name} has no locked upstream reference runs; run bench init or add them`)
  const runs: ReferenceRun[] = []
  for (const spec of scenario.referenceRuns) {
    const meta = normalizeRun(await client.request(`actions/runs/${spec.runId}`))
    const attempt = spec.attempt ?? meta.attempt
    if (meta.workflowPath !== spec.workflowPath)
      throw new Error(`Reference run ${spec.runId} is ${meta.workflowPath}, not ${spec.workflowPath}`)
    runs.push(await withJobs(client, { ...meta, attempt }))
  }
  return {
    schemaVersion: 1,
    scenarioName: scenario.name,
    upstreamRepository: params.upstreamRepository,
    event: scenario.event,
    headSha: scenarioReferenceTarget(scenario).headSha,
    retrievedAt: params.retrievedAt ?? new Date().toISOString(),
    runs,
    metrics: referenceMetrics(runs),
  }
}

function countBy(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return counts
}

function multisetDifference(left: string[], right: string[]): string[] {
  const remaining = countBy(right)
  const missing: string[] = []
  for (const key of left) {
    const count = remaining.get(key) ?? 0
    if (count > 0) remaining.set(key, count - 1)
    else missing.push(key)
  }
  return missing
}

const jobKey = (workflowPath: string, name: string) => `${workflowPath} › ${name}`

/** Steps a self-hosted runner adds to every job (StarSling's lifecycle); not part of the workflow upstream ran. */
const RUNNER_LIFECYCLE_STEPS = new Set(['Set up runner', 'Complete runner'])

/** What the parity check needs to know about jobs the bench turns off on purpose. */
export interface ParityAdaptationContext {
  /** Jobs an adaptation switched off (see `adaptationDisabledJobs`). */
  adaptationDisabledJobs?: { workflowFile: string; jobId: string }[]
  /** Per workflow path, per job id: the display name and `needs`, to find jobs downstream of a disabled one. */
  workflowJobs?: Record<string, Record<string, { name?: string; needs: string[]; if?: string }>>
  /**
   * The config's runner mapping. A matrix leg's name lists its axis values, and prepare rewrites a runner-label
   * value to the variant's target, so `build (linux/amd64, ubuntu-latest)` runs as
   * `build (linux/amd64, ubuntu-26.04-4core)`. Parity compares jobs, not runner labels.
   */
  runnerMapping?: RunnerMappingConfig
  /** `execution.excludedJobs`: their conclusions are reported but do not fail parity. */
  excludedJobs?: Pick<ExcludedJobSpec, 'workflowFile' | 'jobId'>[]
}

/** The job id a display name belongs to (a matrix leg is `Name (axes)`), or undefined. */
function jobIdOf(
  context: ParityAdaptationContext | undefined,
  workflowPath: string,
  baseName: string,
): string | undefined {
  const jobs = context?.workflowJobs?.[workflowPath]
  if (!jobs) return undefined
  for (const [id, info] of Object.entries(jobs)) if ((info.name ?? id) === baseName) return id
  return undefined
}

/**
 * The name a reference matrix leg runs under in this variant: every axis value that is a mapped runner label
 * replaced by the variant's target (GitHub side for github-*, StarSling side for starsling-*). Undefined when no
 * axis value maps to something else.
 */
function runnerMappedName(
  context: ParityAdaptationContext | undefined,
  workflowPath: string,
  name: string,
  variant: string,
): string | undefined {
  const mapping = context?.runnerMapping
  const legs = /^(.*) \((.*)\)$/.exec(name)
  if (!mapping || !legs) return undefined
  const [, base = '', axes = ''] = legs
  const jobId = jobIdOf(context, workflowPath, base) ?? base
  const side = variant.startsWith('starsling') ? 'starsling' : 'github'
  let changed = false
  const mapped = axes.split(', ').map((value) => {
    const resolved = resolveMatrixValueMapping(workflowPath, jobId, value, mapping)
    if (resolved.kind !== 'mapped' && resolved.kind !== 'override') return value
    const target = resolved[side]
    if (target !== value) changed = true
    return target
  })
  return changed ? `${base} (${mapped.join(', ')})` : undefined
}

/** Display-name matcher for `execution.excludedJobs` (a matrix job matches every leg). */
function excludedKeys(
  context: ParityAdaptationContext | undefined,
  replayJobs: { key: string; workflowPath: string; job: { logicalJobId: string } }[],
): (key: string) => boolean {
  const names = new Set<string>()
  for (const e of context?.excludedJobs ?? []) {
    names.add(jobKey(e.workflowFile, context?.workflowJobs?.[e.workflowFile]?.[e.jobId]?.name ?? e.jobId))
    for (const r of replayJobs)
      if (r.job.logicalJobId === e.jobId && r.workflowPath === e.workflowFile) names.add(r.key)
  }
  return (key) => [...names].some((n) => key === n || key.startsWith(`${n} (`))
}

/** Job names, `needs` and job-level `if:` per workflow path, from a repository inventory (`inspectRepository`). */
export function workflowJobsOf(inventory: {
  workflows: Record<string, { jobs: Record<string, { name?: string; needs: string[]; ifCondition?: string }> }>
}): NonNullable<ParityAdaptationContext['workflowJobs']> {
  return Object.fromEntries(
    Object.entries(inventory.workflows).map(([path, wf]) => [
      path,
      Object.fromEntries(
        Object.entries(wf.jobs).map(([id, job]) => [
          id,
          {
            ...(job.name ? { name: job.name } : {}),
            needs: job.needs,
            ...(job.ifCondition ? { if: job.ifCondition } : {}),
          },
        ]),
      ),
    ]),
  )
}

/** Display names (as upstream's runs list them) of the disabled jobs and every job that needs one, transitively. */
function intentionallyOffKeys(
  context: ParityAdaptationContext | undefined,
  replayJobs: { key: string; workflowPath: string; job: { logicalJobId: string } }[],
): ((key: string) => boolean) | undefined {
  const disabled = context?.adaptationDisabledJobs ?? []
  if (!disabled.length) return undefined
  const names = new Set<string>()
  for (const d of disabled) {
    const jobs = context?.workflowJobs?.[d.workflowFile] ?? {}
    const off = new Set([d.jobId])
    for (let grew = true; grew; ) {
      grew = false
      for (const [id, info] of Object.entries(jobs))
        if (!off.has(id) && info.needs.some((n) => off.has(n))) {
          off.add(id)
          grew = true
        }
    }
    for (const id of off) {
      names.add(jobKey(d.workflowFile, jobs[id]?.name ?? id))
      for (const r of replayJobs) if (r.job.logicalJobId === id && r.workflowPath === d.workflowFile) names.add(r.key)
    }
  }
  // A matrix job is listed as `Name (axis, axis)`; a name written as a `${{ }}` template is listed expanded.
  const matchers = [...names].map((n) => {
    if (!n.includes('${{')) return (key: string) => key === n || key.startsWith(`${n} (`)
    const source = n
      .split(/\$\{\{[^}]*\}\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.+')
    const re = new RegExp(`^${source}(?: \\(.*\\))?$`)
    return (key: string) => re.test(key)
  })
  return (key) => matchers.some((m) => m(key))
}

/** Compare one replay sample with the upstream reference for its scenario. */
export function compareWithReference(
  reference: ScenarioReference,
  sample: SampleMeasurementResult,
  context?: ParityAdaptationContext,
): ReferenceComparison {
  const refPaths = [...new Set(reference.runs.map((r) => r.workflowPath))].sort()
  const replayPaths = [...new Set(sample.workflows.map((w) => w.workflowPath))].sort()
  const replayJobs = sample.workflows.flatMap((wf) =>
    wf.jobs.map((job) => ({ key: jobKey(wf.workflowPath, job.jobName), workflowPath: wf.workflowPath, job })),
  )
  // An upstream matrix leg keeps its own name when the replay has it; otherwise it matches under the runner label
  // the bench mapped it to, if the replay has that one.
  const replayKeys = new Set(replayJobs.map((j) => j.key))
  const refKey = (workflowPath: string, name: string) => {
    const key = jobKey(workflowPath, name)
    if (replayKeys.has(key)) return key
    const mapped = runnerMappedName(context, workflowPath, name, sample.variant)
    return mapped && replayKeys.has(jobKey(workflowPath, mapped)) ? jobKey(workflowPath, mapped) : key
  }
  const refJobs = reference.runs.flatMap((run) =>
    run.jobs.map((job) => ({ key: refKey(run.workflowPath, job.name), job })),
  )
  const isExcluded = excludedKeys(context, replayJobs)
  const isOff = intentionallyOffKeys(context, replayJobs)
  const refRan = refJobs.filter((j) => j.job.conclusion !== 'skipped')
  const intentionallyNotRun = isOff ? refRan.filter((j) => isOff(j.key)).map((j) => j.key) : []
  const refExecuted = isOff ? refRan.filter((j) => !isOff(j.key)) : refRan
  const replayExecuted = replayJobs.filter((j) => j.job.conclusion !== 'skipped')
  const missingJobs = multisetDifference(
    refExecuted.map((j) => j.key),
    replayExecuted.map((j) => j.key),
  )
  const unexpectedJobs = multisetDifference(
    replayExecuted.map((j) => j.key),
    refExecuted.map((j) => j.key),
  )
  const conclusionMismatches: ReferenceComparison['conclusionMismatches'] = []
  const excludedConclusionMismatches: ReferenceComparison['conclusionMismatches'] = []
  const stepDifferences: ReferenceComparison['stepDifferences'] = []
  const replayByKey = new Map<string, (typeof replayExecuted)[number][]>()
  for (const entry of replayExecuted) replayByKey.set(entry.key, [...(replayByKey.get(entry.key) ?? []), entry])
  for (const { key, job } of refExecuted) {
    const candidates = replayByKey.get(key)
    const match = candidates?.shift()
    if (!match) continue
    if ((job.conclusion ?? 'unknown') !== (match.job.conclusion ?? 'unknown'))
      (isExcluded(key) ? excludedConclusionMismatches : conclusionMismatches).push({
        job: key,
        reference: job.conclusion ?? 'unknown',
        replay: match.job.conclusion ?? 'unknown',
      })
    const refSteps = job.steps.filter((s) => s.conclusion !== 'skipped').map((s) => s.name)
    const replaySteps = match.job.steps
      .filter((s) => s.conclusion !== 'skipped' && !s.isHarnessInstrumentation && !RUNNER_LIFECYCLE_STEPS.has(s.name))
      .map((s) => s.name)
    const missing = multisetDifference(refSteps, replaySteps)
    const unexpected = multisetDifference(replaySteps, refSteps)
    if (missing.length || unexpected.length) stepDifferences.push({ job: key, missing, unexpected })
  }
  const missingWorkflows = refPaths.filter((p) => !replayPaths.includes(p))
  const unexpectedWorkflows = replayPaths.filter((p) => !refPaths.includes(p))
  return {
    scenarioName: reference.scenarioName,
    sampleId: sample.sampleId,
    variant: sample.variant,
    passed:
      !missingWorkflows.length &&
      !unexpectedWorkflows.length &&
      !missingJobs.length &&
      !unexpectedJobs.length &&
      !conclusionMismatches.length,
    referenceRunIds: reference.runs.map((r) => r.runId),
    missingWorkflows,
    unexpectedWorkflows,
    missingJobs,
    unexpectedJobs,
    ...(intentionallyNotRun.length ? { intentionallyNotRun } : {}),
    conclusionMismatches,
    ...(excludedConclusionMismatches.length ? { excludedConclusionMismatches } : {}),
    stepDifferences,
    referenceWallClockSeconds: reference.metrics.wallClockSeconds,
    replayWallClockSeconds: sample.metrics.wallClockSeconds,
  }
}

export interface UpstreamParity {
  referenceAvailable: boolean
  passed: boolean
  referenceWallClockSeconds: number | null
  referenceRunUrls: string[]
  comparisons: ReferenceComparison[]
  /**
   * Patches (IDs) that are part of the baseline. Present only for a stacked baseline, whose "baseline" is upstream
   * plus these patches: then it is not upstream's own CI and `passed` is never true, whatever the comparisons say.
   */
  baselineIncludesPatches?: string[]
}

/**
 * Upstream parity of a scenario's replays: every complete replay with the CI unchanged (a baseline variant) runs
 * the same workflows and jobs, with the same conclusions, as the locked upstream runs. Without a locked reference
 * or a complete baseline replay, parity is unchecked, which never counts as passed.
 */
export function assessUpstreamParity(
  reference: ScenarioReference | undefined,
  samples: SampleMeasurementResult[],
  baselinePatchIds: string[] = [],
  context?: ParityAdaptationContext,
): UpstreamParity {
  const referenceAvailable = Boolean(reference?.runs.length)
  const comparisons = reference
    ? samples
        .filter((s) => s.complete && (s.variant === 'github-baseline' || s.variant === 'starsling-baseline'))
        .map((sample) => compareWithReference(reference, sample, context))
    : []
  return {
    referenceAvailable,
    passed:
      baselinePatchIds.length === 0 &&
      referenceAvailable &&
      comparisons.length > 0 &&
      comparisons.every((c) => c.passed),
    referenceWallClockSeconds: reference?.metrics.wallClockSeconds ?? null,
    referenceRunUrls: reference?.runs.map((r) => r.htmlUrl).filter(Boolean) ?? [],
    comparisons,
    ...(baselinePatchIds.length ? { baselineIncludesPatches: [...baselinePatchIds] } : {}),
  }
}

/** Human-readable next actions for the setup loop. */
export function describeReferenceComparison(comparison: ReferenceComparison): string[] {
  const lines: string[] = []
  for (const path of comparison.missingWorkflows)
    lines.push(`Workflow ran upstream but not in the replay: ${path} (check triggers, path filters, adaptations).`)
  for (const path of comparison.unexpectedWorkflows)
    lines.push(`Workflow ran in the replay but not upstream: ${path} (check branch/path filters and event type).`)
  for (const job of comparison.missingJobs)
    lines.push(
      `Job ran upstream but was skipped or absent in the replay: ${job} (check if: conditions, identity guards, needs).`,
    )
  for (const job of comparison.unexpectedJobs)
    lines.push(`Job ran in the replay but not upstream: ${job} (check fork/identity conditions and matrix rows).`)
  for (const job of comparison.intentionallyNotRun ?? [])
    lines.push(`Intentionally not run (bench-only, an adaptation turned it off): ${job}. Not a mismatch.`)
  for (const m of comparison.conclusionMismatches)
    lines.push(
      `Conclusion differs for ${m.job}: upstream ${m.reference}, replay ${m.replay} (inspect the replay logs).`,
    )
  for (const m of comparison.excludedConclusionMismatches ?? [])
    lines.push(
      `Conclusion differs for excluded job ${m.job}: upstream ${m.reference}, replay ${m.replay}. Not a mismatch (execution.excludedJobs).`,
    )
  return lines
}
