import fixtureConfig from './fixtures/definitelytyped.config.ts'
import type { SampleMeasurementResult } from '../src/collector.ts'
import { createExperimentManifest } from '../src/manifest.ts'
import type { ScenarioReference } from '../src/reference.ts'
import type { VariantId } from '../src/types.ts'

export const config = structuredClone(fixtureConfig)
config.execution.repetitions = 1
export const manifest = createExperimentManifest({
  config,
  experimentId: 'diag',
  scenarioNames: ['main-push'],
  profileNames: ['cold'],
})
const seconds: Record<VariantId, { build: number; test: number }> = {
  'github-baseline': { build: 600, test: 300 },
  'github-patched': { build: 120, test: 300 },
  'starsling-baseline': { build: 240, test: 120 },
  'starsling-patched': { build: 60, test: 120 },
}
export const at = (offset: number) => new Date(Date.UTC(2026, 10, 6) + offset * 1000).toISOString()
export const sample = (
  variant: VariantId,
  overrides: Partial<SampleMeasurementResult> = {},
): SampleMeasurementResult => {
  const request = manifest.samples.find((s) => s.variant === variant)
  if (!request) throw new Error('missing request')
  const { build, test } = seconds[variant]
  const label = variant.startsWith('github') ? 'ubuntu-24.04' : 'starsling-ubuntu-24.04'
  const job = (id: number, name: string, duration: number) => ({
    jobRecordId: id,
    runId: id,
    runAttempt: 1,
    workflowPath: '.github/workflows/CI.yml',
    jobName: name,
    logicalJobId: name,
    conclusion: 'success' as const,
    durationSeconds: duration,
    dependencyWaitSeconds: 0,
    runnerQueueSeconds: 0,
    resolution: '1s' as const,
    labels: [label],
    steps: [
      {
        number: 1,
        name: 'Set up job',
        conclusion: 'success' as const,
        durationSeconds: 1,
        resolution: '1s' as const,
        isHarnessInstrumentation: false,
      },
      {
        number: 2,
        name: `Run ${name}`,
        conclusion: 'success' as const,
        durationSeconds: duration - 1,
        resolution: '1s' as const,
        isHarnessInstrumentation: false,
      },
    ],
  })
  return {
    ...request,
    inputFingerprint: manifest.inputFingerprint,
    complete: true,
    incompleteReasons: [],
    missingWorkflows: [],
    missingJobs: [],
    cancelledJobs: [],
    failedJobs: [],
    partialTimestampJobs: [],
    timestampResolution: '1s',
    artifacts: [],
    metrics: {
      rawRunnerSeconds: build + test,
      repoMinutes: (build + test) / 60,
      wallClockSeconds: build + test,
      prWallClockSeconds: null,
      mainWallClockSeconds: build + test,
      triggerLatencySeconds: 2,
      harnessOverheadSeconds: 0,
    },
    workflows: [
      {
        runId: 100,
        runAttempt: 1,
        priorAttemptsCount: 0,
        workflowPath: '.github/workflows/CI.yml',
        workflowName: 'CI',
        event: 'push',
        conclusion: 'success',
        durationSeconds: build + test,
        startedAt: at(0),
        completedAt: at(build + test),
        htmlUrl: `https://github.com/bench/replay/actions/runs/${variant}`,
        artifacts: [],
        jobs: [job(1, 'build', build), job(2, 'test', test)],
      },
    ],
    ...overrides,
  }
}
export const reference = (jobs: { name: string; conclusion: string }[]): ScenarioReference => ({
  schemaVersion: 1,
  scenarioName: 'main-push',
  upstreamRepository: config.upstream.repository,
  event: 'push',
  headSha: config.upstream.commitSha,
  retrievedAt: at(0),
  metrics: { wallClockSeconds: 930, runnerSeconds: 930 },
  runs: [
    {
      runId: 41515783490,
      attempt: 1,
      workflowPath: '.github/workflows/CI.yml',
      workflowName: 'CI',
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      htmlUrl: 'https://github.com/DefinitelyTyped/DefinitelyTyped/actions/runs/41515783490',
      createdAt: at(0),
      startedAt: at(0),
      jobs: jobs.map((j, i) => ({
        id: i,
        name: j.name,
        status: 'completed',
        conclusion: j.conclusion,
        startedAt: at(0),
        completedAt: at(60),
        durationSeconds: 60,
        labels: ['ubuntu-24.04'],
        steps: [
          { number: 1, name: 'Set up job', conclusion: 'success', durationSeconds: 1 },
          { number: 2, name: `Run ${j.name}`, conclusion: 'success', durationSeconds: 59 },
          { number: 3, name: 'Install (cache miss)', conclusion: 'success', durationSeconds: 5 },
        ],
      })),
    },
  ],
})
