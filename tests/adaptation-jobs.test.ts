import { describe, expect, it } from 'vitest'
import { adaptationDisabledJobs, jobLevelGuard } from '../src/adaptation-jobs.ts'
import type { RepositoryAdaptationRule } from '../src/types.ts'

const rule = (over: Partial<RepositoryAdaptationRule>): RepositoryAdaptationRule => ({
  id: 'r',
  kind: 'deployment-guard',
  workflowFile: '.github/workflows/release.yml',
  jobId: 'build',
  fromPattern: 'x',
  toReplacement: 'y',
  reason: 'z',
  ...over,
})

describe('adaptationDisabledJobs', () => {
  it('finds jobs switched off by a workflow-setting or a text guard, and ignores other rules', () => {
    const found = adaptationDisabledJobs([
      rule({ id: 'a', kind: 'workflow-setting', setPath: ['if'], setValue: false }),
      rule({ id: 'b', jobId: 'sign', toReplacement: "if: false && github.event_name == 'push'" }),
      rule({ id: 'c', jobId: 'other', toReplacement: 'if: github.ref == main' }),
      { ...rule({ id: 'd', toReplacement: 'if: false' }), jobId: undefined } as unknown as RepositoryAdaptationRule,
    ])
    expect(found).toEqual([
      { workflowFile: '.github/workflows/release.yml', jobId: 'build' },
      { workflowFile: '.github/workflows/release.yml', jobId: 'sign' },
    ])
  })
})

describe('adaptationDisabledJobs with the job conditions known', () => {
  const login = "github.event_name == 'push' || github.event_name == 'workflow_dispatch'"
  const guards = jobLevelGuard({
    '.github/workflows/release.yml': {
      build: { needs: [] },
      publish: { needs: ['build'], if: `${login} && github.repository == 'up/stream'` },
    },
  })

  it('does not call a job off when the text guard sits on one of its steps', () => {
    const stepGuard = rule({ id: 'login', fromPattern: login, toReplacement: `false && (${login})` })
    expect(adaptationDisabledJobs([stepGuard], guards)).toEqual([])
  })

  it('still finds a text guard on the job-level if', () => {
    const jobGuard = rule({ id: 'pub', jobId: 'publish', fromPattern: login, toReplacement: `false && (${login})` })
    expect(adaptationDisabledJobs([jobGuard], guards)).toEqual([
      { workflowFile: '.github/workflows/release.yml', jobId: 'publish' },
    ])
  })

  it('keeps workflow-setting if rules, which are job-level by construction', () => {
    const setting = rule({ id: 's', kind: 'workflow-setting', setPath: ['if'], setValue: false })
    expect(adaptationDisabledJobs([setting], guards)).toEqual([
      { workflowFile: '.github/workflows/release.yml', jobId: 'build' },
    ])
  })
})
