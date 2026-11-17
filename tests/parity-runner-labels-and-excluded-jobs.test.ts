import { describe, expect, it } from 'vitest'
import { reference, sample } from './reference-fixture.ts'
import type { SampleMeasurementResult } from '../src/collector.ts'
import { compareWithReference } from '../src/reference.ts'
import type { VariantId } from '../src/types.ts'

const WF = '.github/workflows/CI.yml'

/** The fixture's sample plus one extra job named `name` in CI.yml. */
function withJob(variant: VariantId, name: string, conclusion: 'success' | 'failure' = 'success') {
  const base = sample(variant)
  const [wf] = base.workflows
  if (!wf) throw new Error('fixture has no workflow')
  const template = wf.jobs[0]
  if (!template) throw new Error('fixture has no job')
  const extra = { ...template, jobRecordId: 9, jobName: name, logicalJobId: 'docker', conclusion }
  return { ...base, workflows: [{ ...wf, jobs: [...wf.jobs, extra] }] } as SampleMeasurementResult
}

describe('parity: a runner label in a matrix job name', () => {
  const runnerMapping = {
    defaultMap: {
      'ubuntu-latest': { github: 'ubuntu-26.04-4core', starsling: 'starsling-ubuntu-26.04' },
      'ubuntu-22.04-arm': { github: 'ubuntu-22.04-arm-4core', starsling: 'ubuntu-22.04-arm-4core' },
    },
    runnerSpecs: {},
  }
  const ref = reference([
    { name: 'build', conclusion: 'success' },
    { name: 'test', conclusion: 'success' },
    { name: 'docker (linux/amd64, ubuntu-latest)', conclusion: 'success' },
    { name: 'docker (linux/arm64, ubuntu-22.04-arm)', conclusion: 'success' },
  ])

  it('matches the GitHub-side label the bench mapped the leg to', () => {
    const s = withJob('github-baseline', 'docker (linux/amd64, ubuntu-26.04-4core)')
    s.workflows[0]?.jobs.push({
      ...(s.workflows[0]?.jobs[2] as SampleMeasurementResult['workflows'][number]['jobs'][number]),
      jobRecordId: 10,
      jobName: 'docker (linux/arm64, ubuntu-22.04-arm-4core)',
    })
    const c = compareWithReference(ref, s, { runnerMapping })
    expect(c.missingJobs).toEqual([])
    expect(c.unexpectedJobs).toEqual([])
    expect(c.passed).toBe(true)
  })

  it('matches the StarSling-side label on a StarSling variant', () => {
    const s = withJob('starsling-baseline', 'docker (linux/amd64, starsling-ubuntu-26.04)')
    s.workflows[0]?.jobs.push({
      ...(s.workflows[0]?.jobs[2] as SampleMeasurementResult['workflows'][number]['jobs'][number]),
      jobRecordId: 10,
      jobName: 'docker (linux/arm64, ubuntu-22.04-arm-4core)',
    })
    const c = compareWithReference(ref, s, { runnerMapping })
    expect(c.missingJobs).toEqual([])
    expect(c.unexpectedJobs).toEqual([])
    expect(c.passed).toBe(true)
  })

  it('still fails a leg mapped to the other side or not run at all', () => {
    const s = withJob('github-baseline', 'docker (linux/amd64, starsling-ubuntu-26.04)')
    const c = compareWithReference(ref, s, { runnerMapping })
    expect(c.missingJobs).toEqual([
      `${WF} › docker (linux/amd64, ubuntu-latest)`,
      `${WF} › docker (linux/arm64, ubuntu-22.04-arm)`,
    ])
    expect(c.unexpectedJobs).toEqual([`${WF} › docker (linux/amd64, starsling-ubuntu-26.04)`])
    expect(c.passed).toBe(false)
  })

  it('keeps an exact name match when the replay kept the upstream label', () => {
    const r = reference([
      { name: 'build', conclusion: 'success' },
      { name: 'test', conclusion: 'success' },
      { name: 'docker (ubuntu-latest)', conclusion: 'success' },
    ])
    const c = compareWithReference(r, withJob('github-baseline', 'docker (ubuntu-latest)'), { runnerMapping })
    expect(c.passed).toBe(true)
  })
})

describe('parity: a conclusion difference on an excluded job', () => {
  const excludedJobs = [{ workflowFile: WF, jobId: 'docker', reason: 'fails on live advisories in every setup' }]
  const ref = reference([
    { name: 'build', conclusion: 'success' },
    { name: 'test', conclusion: 'success' },
    { name: 'docker', conclusion: 'success' },
  ])

  it('is reported but does not fail parity', () => {
    const c = compareWithReference(ref, withJob('github-baseline', 'docker', 'failure'), { excludedJobs })
    expect(c.conclusionMismatches).toEqual([])
    expect(c.excludedConclusionMismatches).toEqual([{ job: `${WF} › docker`, reference: 'success', replay: 'failure' }])
    expect(c.passed).toBe(true)
  })

  it('still fails parity for a job that is not excluded', () => {
    const c = compareWithReference(ref, withJob('github-baseline', 'docker', 'failure'), {
      excludedJobs: [{ workflowFile: WF, jobId: 'build' }],
    })
    expect(c.conclusionMismatches).toEqual([{ job: `${WF} › docker`, reference: 'success', replay: 'failure' }])
    expect(c.passed).toBe(false)
  })

  it('still fails parity when an excluded job is missing from the replay', () => {
    const c = compareWithReference(ref, sample('github-baseline'), { excludedJobs })
    expect(c.missingJobs).toEqual([`${WF} › docker`])
    expect(c.passed).toBe(false)
  })
})
