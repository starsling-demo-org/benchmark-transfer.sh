import { describe, expect, it } from 'vitest'
import { config, manifest, reference, sample } from './reference-fixture.ts'
import { compareWithReference } from '../src/reference.ts'
import { generateExperimentReport } from '../src/reporter.ts'
import { renderShowcase } from '../src/showcase.ts'
import type { VariantId } from '../src/types.ts'

describe('parity and jobs an adaptation turned off on purpose', () => {
  const WF = '.github/workflows/CI.yml'
  const off = [{ workflowFile: WF, jobId: 'deploy' }]
  const workflowJobs = {
    [WF]: {
      build: { needs: [] },
      test: { needs: [] },
      deploy: { name: 'Deploy binaries', needs: ['build'] },
      notify: { needs: ['deploy'] },
    },
  }
  const upstream = reference([
    { name: 'build', conclusion: 'success' },
    { name: 'test', conclusion: 'success' },
    { name: 'Deploy binaries', conclusion: 'success' },
  ])

  it('does not call a disabled job missing, and lists it as bench-only', () => {
    const plain = compareWithReference(upstream, sample('github-baseline'))
    expect(plain.passed).toBe(false)
    expect(plain.missingJobs).toEqual([`${WF} › Deploy binaries`])
    const c = compareWithReference(upstream, sample('github-baseline'), { adaptationDisabledJobs: off, workflowJobs })
    expect(c.passed).toBe(true)
    expect(c.missingJobs).toEqual([])
    expect(c.conclusionMismatches).toEqual([])
    expect(c.intentionallyNotRun).toEqual([`${WF} › Deploy binaries`])
  })

  it('also covers a job that needs the disabled one, and a matrix of it', () => {
    const ref = reference([
      { name: 'build', conclusion: 'success' },
      { name: 'test', conclusion: 'success' },
      { name: 'Deploy binaries (linux, x64)', conclusion: 'success' },
      { name: 'notify', conclusion: 'success' },
    ])
    const c = compareWithReference(ref, sample('github-baseline'), { adaptationDisabledJobs: off, workflowJobs })
    expect(c.passed).toBe(true)
    expect(c.intentionallyNotRun).toEqual([`${WF} › Deploy binaries (linux, x64)`, `${WF} › notify`])
  })

  it('still fails any other missing job', () => {
    const ref = reference([
      { name: 'build', conclusion: 'success' },
      { name: 'test', conclusion: 'success' },
      { name: 'Deploy binaries', conclusion: 'success' },
      { name: 'lint', conclusion: 'success' },
    ])
    const c = compareWithReference(ref, sample('github-baseline'), { adaptationDisabledJobs: off, workflowJobs })
    expect(c.passed).toBe(false)
    expect(c.missingJobs).toEqual([`${WF} › lint`])
    expect(c.intentionallyNotRun).toEqual([`${WF} › Deploy binaries`])
  })

  it('reaches the report, the claim and the README through the adaptations in the config', () => {
    const adapted = structuredClone(config)
    adapted.adaptations = [
      {
        id: 'no-deploy',
        kind: 'workflow-setting',
        workflowFile: WF,
        jobId: 'deploy',
        setPath: ['if'],
        setValue: false,
        fromPattern: '',
        toReplacement: '',
        reason: 'would publish releases',
      },
    ]
    const samples = (['github-baseline', 'starsling-baseline'] as VariantId[]).map((v) => sample(v))
    const report = generateExperimentReport({
      experimentId: 'diag',
      config: adapted,
      manifest,
      samples,
      references: { 'main-push': upstream },
      workflowJobs,
    })
    expect(report.upstreamParityByScenario['main-push']?.passed).toBe(true)
    const readme = renderShowcase({ report, config: adapted })
    expect(readme).toContain('Deploy binaries')
    expect(readme).toContain('bench-only')
    // Without the adaptation, the same replay does not match.
    const unadapted = generateExperimentReport({
      experimentId: 'diag',
      config,
      manifest,
      samples,
      references: { 'main-push': upstream },
    })
    expect(unadapted.upstreamParityByScenario['main-push']?.passed).toBe(false)
  })
  it('does not take a job off when a text guard only turns off one of its steps', () => {
    const adapted = structuredClone(config)
    adapted.adaptations = [
      {
        id: 'no-registry-login',
        kind: 'deployment-guard',
        workflowFile: WF,
        jobId: 'test',
        fromPattern: "github.event_name == 'push'",
        toReplacement: "false && (github.event_name == 'push')",
        reason: 'login step only; the job still runs',
      },
    ]
    // Upstream ran build and test; the replay ran them too. `test` must be compared, not called bench-only.
    const ref = reference([
      { name: 'build', conclusion: 'success' },
      { name: 'test', conclusion: 'success' },
    ])
    const samples = (['github-baseline', 'starsling-baseline'] as VariantId[]).map((v) => sample(v))
    const report = generateExperimentReport({
      experimentId: 'diag',
      config: adapted,
      manifest,
      samples,
      references: { 'main-push': ref },
      workflowJobs,
    })
    const parity = report.upstreamParityByScenario['main-push']
    expect(parity?.comparisons.flatMap((c) => c.intentionallyNotRun ?? [])).toEqual([])
    expect(parity?.comparisons.flatMap((c) => c.unexpectedJobs)).toEqual([])
    expect(parity?.passed).toBe(true)
  })
})
