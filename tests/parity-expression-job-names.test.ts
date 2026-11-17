import { describe, expect, it } from 'vitest'
import { reference, sample } from './reference-fixture.ts'
import { compareWithReference } from '../src/reference.ts'

// biome-ignore lint/suspicious/noTemplateCurlyInString: the name is a GitHub expression, not a JS template
describe('parity: a disabled job whose name is a ${{ }} template', () => {
  const WF = '.github/workflows/CI.yml'
  const off = [{ workflowFile: WF, jobId: 'build' }]
  const workflowJobs = {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub expression, not a JS template
    [WF]: { build: { name: 'Build ${{ matrix.goos }}/${{ matrix.goarch }}${{ matrix.suffix }}', needs: [] } },
  }

  it('treats the expanded matrix legs as bench-only, not missing', () => {
    const ref = reference([
      { name: 'Build linux/amd64', conclusion: 'success' },
      { name: 'Build windows/amd64_mws', conclusion: 'success' },
    ])
    const c = compareWithReference(ref, sample('github-baseline'), { adaptationDisabledJobs: off, workflowJobs })
    expect(c.missingJobs).toEqual([])
    expect(c.intentionallyNotRun).toEqual([`${WF} › Build linux/amd64`, `${WF} › Build windows/amd64_mws`])
  })

  it('still fails a job that merely shares the prefix', () => {
    const ref = reference([{ name: 'Lint linux/amd64', conclusion: 'success' }])
    const c = compareWithReference(ref, sample('github-baseline'), { adaptationDisabledJobs: off, workflowJobs })
    expect(c.missingJobs).toEqual([`${WF} › Lint linux/amd64`])
    expect(c.intentionallyNotRun ?? []).toEqual([])
  })
})
