import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SampleMeasurementResult } from '../src/collector.ts'
import { type EvidenceExtractor, collectEvidence } from '../src/evidence-collect.ts'
import { type SampleEvidence, verifyEvidenceBundle } from '../src/evidence.ts'
import { createExperimentManifest } from '../src/manifest.ts'
import type { TestInputFingerprint } from '../src/parity.ts'
import type { PreparedExperiment } from '../src/prepared.ts'
import type { ExperimentRecord } from '../src/runtime.ts'
import fixtureConfig from './fixtures/definitelytyped.config.ts'

const FP: TestInputFingerprint = {
  sourceDepsHash: 's',
  testCodeHash: 't',
  configHash: 'c',
  lockfilesHash: 'l',
  toolchain: 'go1.27.4',
  platform: 'linux/amd64',
  envHash: 'e',
}

let jobIds = 1000
function measured(
  sampleId: string,
  base: Omit<SampleMeasurementResult, 'sampleId' | 'complete' | 'workflows'>,
  runId: number,
) {
  const jobId = jobIds++
  return {
    ...base,
    sampleId,
    complete: true,
    workflows: [
      {
        runId,
        runAttempt: 1,
        priorAttemptsCount: 0,
        workflowPath: 'ci.yml',
        workflowName: 'CI',
        event: 'push',
        conclusion: 'success',
        durationSeconds: 60,
        startedAt: '2026-11-06T00:00:00Z',
        completedAt: '2026-11-06T00:01:00Z',
        htmlUrl: 'https://github.com/example/repo/actions/runs/1',
        artifacts: [],
        jobs: [
          {
            jobRecordId: jobId,
            runId,
            runAttempt: 1,
            workflowPath: 'ci.yml',
            jobName: 'test',
            logicalJobId: 'test',
            conclusion: 'success',
            durationSeconds: 60,
            dependencyWaitSeconds: null,
            runnerQueueSeconds: null,
            resolution: '1s',
            labels: ['ubuntu-24.04'],
            steps: [],
          },
        ],
      },
    ],
  } as SampleMeasurementResult
}

/** A warm experiment: one baseline sample whose `sum` result was replayed from the cache its seed run left behind. */
function warmExperiment(seedLog: string) {
  const config = structuredClone(fixtureConfig)
  config.execution.repetitions = 1
  const manifest = createExperimentManifest({
    config,
    experimentId: 'warm-proof',
    scenarioNames: ['main-push'],
    profileNames: ['warm'],
  })
  const request = manifest.samples.find((s) => s.variant === 'github-baseline')
  if (!request) throw new Error('Missing baseline request')
  const common = {
    ...request,
    inputFingerprint: manifest.inputFingerprint,
    incompleteReasons: [],
    missingWorkflows: [],
    missingJobs: [],
    cancelledJobs: [],
    failedJobs: [],
    partialTimestampJobs: [],
    timestampResolution: '1s' as const,
    artifacts: [],
    metrics: {
      rawRunnerSeconds: 60,
      repoMinutes: 1,
      wallClockSeconds: 60,
      prWallClockSeconds: null,
      mainWallClockSeconds: 60,
      triggerLatencySeconds: 1,
      harnessOverheadSeconds: 0,
    },
  }
  const sample = measured(request.sampleId, common, 1)
  const seed = measured(`${request.sampleId}-seed`, common, 2)
  const record = {
    schemaVersion: 1,
    manifest: { ...manifest, samples: [request] },
    config,
    samples: [sample],
    seedSamples: [seed],
    cacheSnapshots: {},
  } as unknown as ExperimentRecord
  const inventory = {
    scenarioName: 'main-push',
    triggeredWorkflows: ['ci.yml'],
    excludedWorkflows: [],
    downstreamWorkflowRuns: [],
    jobExpectations: [],
    mixedRunnerOnStarSling: false,
    movedJobs: [],
    retainedJobs: [],
    blockers: [],
  }
  const prepared = {
    variants: { 'main-push': { 'github-baseline': { inventory } } },
  } as unknown as PreparedExperiment
  const logs: Record<number, string> = {
    [sample.workflows[0]?.jobs[0]?.jobRecordId ?? 0]: 'ok sum (cached)',
    [seed.workflows[0]?.jobs[0]?.jobRecordId ?? 0]: seedLog,
  }
  return { config, record, prepared, sample, seed, logs }
}

/** Reports `sum` as reused and links it to the seed job that ran it, when that seed job's log shows the run. */
const extractor: EvidenceExtractor = ({ jobs, seed }) => {
  const cached = jobs.some((j) => j.log.includes('(cached)'))
  const seedJob = seed?.jobs.find((j) => j.log === 'ok sum')
  return {
    tests: [
      {
        testId: 'sum',
        verdict: 'passed',
        mode: cached ? 'reused' : 'executed',
        ...(cached && seedJob
          ? { seedLink: { seedJobId: seedJob.jobId, seedFingerprint: FP }, currentFingerprint: FP }
          : {}),
      },
    ],
    obligations: [],
    commands: [],
  }
}

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function collectAndVerify(seedLog: string, collector: EvidenceExtractor = extractor) {
  const { config, record, prepared, logs } = warmExperiment(seedLog)
  const directory = mkdtempSync(join(tmpdir(), 'seed-provenance-'))
  dirs.push(directory)
  const downloaded: number[] = []
  const result = await collectEvidence({
    record,
    prepared,
    config,
    extractor: collector,
    directory,
    deps: {
      downloadLog: async (jobId) => {
        downloaded.push(jobId)
        return logs[jobId] ?? ''
      },
      listCaches: async () => [],
    },
  })
  const assessments = await verifyEvidenceBundle({
    manifest: record.manifest,
    samples: record.samples,
    evidence: result.evidence,
    profiles: config.profiles,
    readSource: async (path) => readFileSync(join(directory, 'evidence', path)),
  })
  return { result, record, assessments, downloaded }
}

describe('seed provenance for reused test results', () => {
  it('links a reused result to the seed job the collector traced it to', async () => {
    const { result, record, assessments } = await collectAndVerify('ok sum')
    const evidence = result.evidence[0] as SampleEvidence
    const seedRun = record.seedSamples[0]?.workflows[0]?.runId
    expect(evidence.execution.tests[0]).toEqual({
      testId: 'sum',
      verdict: 'passed',
      mode: 'reused',
      seedProvenance: { seedRunId: seedRun, seedSucceeded: true, seedFingerprint: FP },
      currentFingerprint: FP,
    })
    const assessment = assessments[evidence.sampleId]
    expect(assessment?.parity.semantic.issues).toEqual([])
    expect(assessment?.parity.passed).toBe(true)
  })

  it('still fails a reused result the collector cannot trace to its seed', async () => {
    const { result, assessments } = await collectAndVerify('FAIL sum')
    const evidence = result.evidence[0] as SampleEvidence
    expect(evidence.execution.tests[0]?.seedProvenance).toBeUndefined()
    expect(assessments[evidence.sampleId]?.parity.semantic.issues).toContain(
      'Reused test "sum" is missing seed provenance link.',
    )
  })

  it('does not accept a link to a job outside the seed, or provenance the collector writes itself', async () => {
    const forging: EvidenceExtractor = () => ({
      tests: [
        {
          testId: 'sum',
          verdict: 'passed',
          mode: 'reused',
          seedLink: { seedJobId: 999_999, seedFingerprint: FP },
          seedProvenance: { seedRunId: 1, seedSucceeded: true, seedFingerprint: FP },
          currentFingerprint: FP,
        },
      ],
      obligations: [],
      commands: [],
    })
    const { result, assessments } = await collectAndVerify('ok sum', forging)
    const evidence = result.evidence[0] as SampleEvidence
    expect(evidence.execution.tests[0]?.seedProvenance).toBeUndefined()
    expect(assessments[evidence.sampleId]?.parity.passed).toBe(false)
  })

  it('does not download seed logs when no result was reused', async () => {
    const { record, downloaded } = await collectAndVerify('ok sum', () => ({
      tests: [{ testId: 'sum', verdict: 'passed', mode: 'executed' }],
      obligations: [],
      commands: [],
    }))
    const seedJob = record.seedSamples[0]?.workflows[0]?.jobs[0]?.jobRecordId
    expect(downloaded).not.toContain(seedJob)
  })

  it('writes the linked results to the hashed tests source, not the raw link', async () => {
    const { result } = await collectAndVerify('ok sum')
    const evidence = result.evidence[0] as SampleEvidence
    const tests = JSON.parse(
      readFileSync(join(result.evidencePath, '..', `${evidence.sampleId}/tests.json`), 'utf8'),
    ) as { tests: Record<string, unknown>[] }
    expect(tests.tests[0]?.seedLink).toBeUndefined()
    expect(tests.tests[0]?.seedProvenance).toBeDefined()
  })
})
