import { describe, expect, it } from 'vitest'
import { GitHubActionsApi, GitHubClient } from '../src/github.ts'

class RecordedGitHub extends GitHubClient {
  readonly requests: string[] = []
  constructor() {
    super('fixture/repo')
  }
  override async request(path: string): Promise<unknown> {
    this.requests.push(path)
    if (path.startsWith('actions/runs?'))
      return {
        workflow_runs: [
          {
            id: 12,
            name: 'CI',
            path: '.github/workflows/ci.yml',
            event: 'push',
            head_branch: 'main',
            head_sha: 'a'.repeat(40),
            pull_requests: [],
            run_number: 1,
            run_attempt: 1,
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-11-06T00:00:00Z',
            run_started_at: null,
            updated_at: '2026-11-06T00:01:00Z',
            html_url: 'https://github.com/fixture/repo/actions/runs/12',
          },
        ],
      }
    if (path.includes('/jobs'))
      return {
        jobs: [
          {
            id: 23,
            name: 'Custom display name',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-11-06T00:00:00Z',
            completed_at: '2026-11-06T00:01:00Z',
            labels: ['ubuntu-24.04'],
            runner_name: 'GitHub Actions 1',
            steps: [],
          },
        ],
      }
    return { artifacts: [] }
  }
  override async text(): Promise<string> {
    return '2026-11-06T00:00:01Z BENCH_JOB_ID=test\n'
  }
}
describe('documented GitHub payload normalization', () => {
  it('keeps absent timestamps unknown and enriches job IDs from captured context', async () => {
    const client = new RecordedGitHub()
    const api = new GitHubActionsApi(client)
    const runs = await api.listWorkflowRunsPage({ page: 1, perPage: 100 })
    expect(runs.runs[0]?.run_started_at).toBeNull()
    expect(runs.runs[0]?.triggering_run_id).toBeUndefined()
    const jobs = await api.listJobsForRunAttemptPage({ runId: 12, attempt: 1, page: 1, perPage: 100 })
    expect(jobs.jobs[0]?.workflow_job_id).toBe('test')
    expect(jobs.jobs[0]?.created_at).toBeNull()
    expect(client.requests).toContain('actions/runs/12/attempts/1/jobs?per_page=100&page=1')
  })
})

class CascadingGitHub extends GitHubClient {
  readonly logReads: number[] = []
  readonly requests: string[] = []
  constructor() {
    super('fixture/repo')
  }
  override async request(path: string): Promise<unknown> {
    this.requests.push(path)
    if (path.startsWith('actions/runs?'))
      return { workflow_runs: [{ id: 12, event: 'workflow_run', status: 'completed', run_attempt: 1 }] }
    if (path.includes('/jobs?')) {
      const page = new URLSearchParams(path.split('?')[1]).get('page')
      const ids = page === '1' ? Array.from({ length: 100 }, (_, index) => index + 1) : [101, 102]
      return {
        jobs: ids.map((id) => ({
          id,
          name: `job ${id}`,
          status: 'completed',
          conclusion: id <= 100 ? 'skipped' : 'success',
          labels: ['ubuntu-24.04'],
        })),
      }
    }
    throw new Error(`Unexpected request ${path}`)
  }
  override async text(path: string): Promise<string> {
    const id = Number(path.split('/')[2])
    this.logReads.push(id)
    return id === 101 ? 'BENCH_PARENT_RUN_ID=11\nBENCH_JOB_ID=verify\n' : 'No harness context'
  }
}

it('shares immutable job context across downstream discovery, job collection and repeated polling', async () => {
  const client = new CascadingGitHub()
  const api = new GitHubActionsApi(client)
  const runs = await api.listWorkflowRunsPage({ page: 1, perPage: 100 })
  expect(runs.runs[0]?.triggering_run_id).toBe(11)
  expect(client.requests).toContain('actions/runs/12/attempts/1/jobs?per_page=100&page=2')
  const jobs = await api.listJobsForRunAttemptPage({ runId: 12, attempt: 1, page: 2, perPage: 100 })
  expect(jobs.jobs[0]?.workflow_job_id).toBe('verify')
  expect(jobs.jobs[1]?.workflow_job_id).toBeUndefined()
  await api.listWorkflowRunsPage({ page: 1, perPage: 100 })
  await api.listJobsForRunAttemptPage({ runId: 12, attempt: 1, page: 2, perPage: 100 })
  expect(client.logReads).toEqual([101, 102])
  expect(client.requests.filter((path) => path.endsWith('jobs?per_page=100&page=1'))).toHaveLength(1)
})

class MissingLogsGitHub extends GitHubClient {
  readonly logReads: number[] = []
  readonly failure: string
  constructor(failure: string) {
    super('fixture/repo')
    this.failure = failure
  }
  override async request(path: string): Promise<unknown> {
    if (!path.includes('/jobs?')) throw new Error(`Unexpected request ${path}`)
    return {
      jobs: [
        // Ran and logged its id.
        {
          id: 1,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-11-06T00:00:00Z',
          runner_name: 'r1',
          labels: [],
        },
        // Cancelled before it ever got a runner: no started_at, no runner, no logs.
        {
          id: 2,
          name: 'deploy-demo',
          status: 'completed',
          conclusion: 'cancelled',
          started_at: null,
          runner_name: null,
          labels: [],
        },
        // Started, but GitHub answers its logs with the configured failure.
        {
          id: 3,
          name: 'late',
          status: 'completed',
          conclusion: 'cancelled',
          started_at: '2026-11-06T00:00:00Z',
          runner_name: 'r2',
          labels: [],
        },
      ],
    }
  }
  override async text(path: string): Promise<string> {
    const id = Number(path.split('/')[2])
    this.logReads.push(id)
    if (id === 1) return 'BENCH_JOB_ID=build\n'
    throw new Error(`Command failed: gh api ${path}\n${this.failure}`)
  }
}

describe('jobs that never started have no logs', () => {
  it('does not fetch logs for a never-started job and tolerates a 404 on logs', async () => {
    const client = new MissingLogsGitHub('gh: Not Found (HTTP 404)')
    const api = new GitHubActionsApi(client)
    const { jobs } = await api.listJobsForRunAttemptPage({ runId: 12, attempt: 1, page: 1, perPage: 100 })
    expect(jobs.map((job) => job.workflow_job_id)).toEqual(['build', undefined, undefined])
    expect(client.logReads).not.toContain(2)
  })
  it('still fails on a server error fetching logs', async () => {
    const api = new GitHubActionsApi(new MissingLogsGitHub('gh: Server Error (HTTP 500)'))
    await expect(api.listJobsForRunAttemptPage({ runId: 12, attempt: 1, page: 1, perPage: 100 })).rejects.toThrow(
      /HTTP 500/,
    )
  })
})
