/**
 * Evidence extractor for dutchcoders/transfer.sh CI (build-docker-images.yml and test.yml).
 *
 * Units (ids never contain a job name, a Go-version matrix label as written in the workflow, a BuildKit step
 * number, a stage-platform arrow or a timing, so they are the same before and after the Dockerfile cross-compile
 * lever and the Go tip cache lever):
 *   go-test:<go>:<package>     one `go test ./...` package result per Go toolchain (`go1.26`, `go1.27`, `tip`)
 *   go-vet:<go>                `go vet ./...` per Go toolchain (it runs before the tests in the same step)
 *   lint:golangci-lint         the golangci-lint verdict of the Linting job
 *   go-binary:<platform>       the `go build` vertex of the Docker build for that target platform
 *   image:<platform>           the final image stage that receives the binary, per target platform
 *   image-noroot:<platform>    the same for the second (RUNAS=noroot) image of the same step
 *
 * Verdicts come only from the job logs. A unit passes when its result line says so (`ok`, a BuildKit `DONE`), is
 * `reused` when Go replayed a cached test result or BuildKit restored the vertex from cache, and fails on `FAIL`,
 * `ERROR` or when it cannot be found in the log. A package with `[no test files]` is `skipped` and is not part of
 * the coverage scope (there is nothing to verify).
 */
import { createHash } from 'node:crypto'
import type { EvidenceExtractor, EvidenceJob, EvidenceSeed, ExtractedTest } from '../src/evidence-collect.ts'
import type { TestCaseVerdictRecord, TestInputFingerprint } from '../src/parity.ts'

export const MODULE = 'github.com/dutchcoders/transfer.sh'
export const PLATFORMS = ['linux/386', 'linux/amd64', 'linux/arm/v7', 'linux/arm64'] as const
export const KNOWN_GO = ['go1.26', 'go1.27', 'tip'] as const
export const KNOWN_PACKAGES = ['.', 'cmd', 'server', 'server/storage'] as const

export interface BuildkitVertex {
  /** 0 for the first `docker buildx build` of the job, 1 for the second, and so on. */
  build: number
  /** Target platform: `linux/arm64` for a native `[linux/arm64 ...]` and a cross `[linux/amd64->arm64 ...]` step; '' when unprefixed. */
  target: string
  stage: string
  command: string
  done: boolean
  cached: boolean
  error: boolean
}

function platformOf(raw: string | undefined): string {
  if (!raw) return ''
  return raw.startsWith('linux/') ? raw : `linux/${raw}`
}

const STEP = /^#(\d+) \[(?:(linux\/\w+(?:\/v\d+)?)(?:->((?:linux\/)?\w+(?:\/v\d+)?))? )?([\w-]+) \d+\/\d+\] (.*)$/

/** BuildKit's plain-progress vertices, split per build (each build starts with `load build definition`). */
export function buildkitVertices(log: string): BuildkitVertex[] {
  const vertices = new Map<string, BuildkitVertex>()
  let build = -1
  for (const line of log.split('\n')) {
    if (/^#\d+ \[internal\] load build definition from /.test(line)) build++
    const step = STEP.exec(line)
    if (step) {
      const [, id = '', platform, cross, stage = '', command = ''] = step
      const key = `${build}:${id}`
      if (!vertices.has(key))
        vertices.set(key, {
          build: Math.max(build, 0),
          target: platformOf(cross ?? platform),
          stage,
          command: command.replace(/\s+/g, ' ').trim(),
          done: false,
          cached: false,
          error: false,
        })
      continue
    }
    const end = /^#(\d+) (DONE|CACHED|ERROR)\b/.exec(line)
    const vertex = end ? vertices.get(`${build}:${end[1] ?? ''}`) : undefined
    if (!vertex) continue
    if (end?.[2] === 'DONE') vertex.done = true
    else if (end?.[2] === 'CACHED') vertex.cached = true
    else vertex.error = true
  }
  return [...vertices.values()]
}

/** The platform a `go build` vertex builds for: a literal GOOS/GOARCH in the expanded command wins, else the prefix. */
function goBuildTarget(v: BuildkitVertex): string {
  const arch = /\bGOARCH=(\w+)/.exec(v.command)?.[1]
  if (!arch) return v.target
  if (arch === 'arm') {
    const arm = /\bGOARM=(\d)/.exec(v.command)?.[1]
    return arm ? `linux/arm/v${arm}` : v.target.startsWith('linux/arm/') ? v.target : 'linux/arm/v7'
  }
  return `linux/${arch}`
}

type Verdict = Pick<TestCaseVerdictRecord, 'verdict' | 'mode'>

function vertexVerdict(vertices: BuildkitVertex[], buildFailed: boolean): Verdict {
  if (buildFailed || !vertices.length || vertices.some((v) => v.error)) return { verdict: 'failed', mode: 'executed' }
  if (vertices.every((v) => v.done)) return { verdict: 'passed', mode: 'executed' }
  // Restored from BuildKit's cache: the unit did not run in this sample.
  if (vertices.every((v) => v.done || v.cached)) return { verdict: 'passed', mode: 'reused' }
  return { verdict: 'failed', mode: 'executed' }
}

function dockerUnits(job: EvidenceJob | undefined, commands: Set<string>): Map<string, Verdict> {
  const units = new Map<string, Verdict>()
  const vertices = job ? buildkitVertices(job.log) : []
  const step = job?.steps.find((s) => /^Docker Buildx \(build\)/i.test(s.name))
  const stepPassed = job ? (step ? step.conclusion === 'success' : job.conclusion === 'success') : false
  for (const line of job?.log.split('\n') ?? []) {
    const run = /^##\[group\]Run docker buildx build .*?(--platform \S+)/.exec(line)
    if (run) commands.add(`docker buildx build ${run[1]}`)
  }
  const first = vertices.filter((v) => v.build === 0)
  const second = vertices.filter((v) => v.build === 1)
  const binaryCopy = (v: BuildkitVertex) => /^COPY --from=\S+ .*\/go\/bin\/transfersh\b/.test(v.command)
  for (const platform of PLATFORMS) {
    const failed = (build: BuildkitVertex[]) => !stepPassed || build.some((v) => v.error && v.target === platform)
    const set = (id: string, unit: BuildkitVertex[], build: BuildkitVertex[]) =>
      units.set(id, vertexVerdict(unit, failed(build)))
    set(`go-binary:${platform}`, first.filter((v) => /\bgo build\b/.test(v.command) && goBuildTarget(v) === platform), first)
    set(`image:${platform}`, first.filter((v) => v.target === platform && binaryCopy(v)), first)
    set(`image-noroot:${platform}`, second.filter((v) => v.target === platform && binaryCopy(v)), second)
  }
  return units
}

function pkgId(pkg: string): string {
  if (pkg === MODULE) return '.'
  return pkg.startsWith(`${MODULE}/`) ? pkg.slice(MODULE.length + 1) : pkg
}

export function goTestResults(log: string): Map<string, Verdict> {
  const results = new Map<string, Verdict>()
  const put = (pkg: string, verdict: Verdict) => {
    if (results.get(pkg)?.verdict === 'failed') return
    results.set(pkg, verdict)
  }
  for (const line of log.split('\n')) {
    const ok = /^ok\s+(\S+)\s+(.*)$/.exec(line)
    if (ok) {
      put(pkgId(ok[1] ?? ''), /\(cached\)/.test(ok[2] ?? '') ? { verdict: 'passed', mode: 'reused' } : { verdict: 'passed', mode: 'executed' })
      continue
    }
    const fail = /^FAIL\s+(\S+)/.exec(line)
    if (fail) {
      put(pkgId(fail[1] ?? ''), { verdict: 'failed', mode: 'executed' })
      continue
    }
    const none = /^\?\s+(\S+)\s+\[no test files\]/.exec(line)
    if (none) put(pkgId(none[1] ?? ''), { verdict: 'skipped', mode: 'skipped' })
  }
  return results
}

const RESULT_LINE = /^(?:ok|FAIL)\s+\S+|^\?\s+\S+\s+\[no test files\]/

/** `tip` or `go1.NN`, from the toolchain that ran the tests, not from the matrix label in the job name. */
export function goLabel(job: EvidenceJob): string {
  const lines = job.log.split('\n')
  if (
    /\btip\b/i.test(job.jobName) ||
    // Every matrix leg lists the tip-only steps; only a leg that ran one is the tip leg.
    job.steps.some((s) => s.conclusion !== 'skipped' && /gotip/i.test(s.name)) ||
    lines.some((l) => /^`?go env GOPATH`?\/bin\/gotip (?:version|vet|test)\b/.test(l))
  )
    return 'tip'
  const first = lines.findIndex((l) => RESULT_LINE.test(l))
  let version: string | undefined
  for (const line of first < 0 ? lines : lines.slice(0, first)) {
    const m = /^go version (go\d+\.\d+)(\S*)/.exec(line)
    if (m) version = /devel/.test(m[2] ?? '') ? 'tip' : m[1]
  }
  if (version) return version
  const named = /(\d+\.\d+)/.exec(job.jobName)?.[1]
  return named ? `go${named}` : job.jobName.toLowerCase().replace(/[^a-z0-9.]+/g, '-')
}

/** `go1.27.4` / `devel go1.27-abc…` and `linux/amd64` from the last `go version` line before the test results. */
function testedToolchain(log: string): { toolchain: string; platform: string } | undefined {
  const lines = log.split('\n')
  const first = lines.findIndex((l) => RESULT_LINE.test(l))
  let found: { toolchain: string; platform: string } | undefined
  for (const line of first < 0 ? lines : lines.slice(0, first)) {
    const m = /^go version (.+) (\w+\/\w+)$/.exec(line.trim())
    if (m) found = { toolchain: m[1] ?? '', platform: m[2] ?? '' }
  }
  return found
}

/** The `env:` block of the step that printed the test results (GOTOOLCHAIN, GOFLAGS, ...), hashed. */
function testEnvHash(log: string): string {
  const lines = log.split('\n')
  const first = lines.findIndex((l) => RESULT_LINE.test(l))
  const before = first < 0 ? lines : lines.slice(0, first)
  const start = before.findLastIndex((l) => l.startsWith('##[group]Run '))
  const end = start < 0 ? -1 : before.indexOf('##[endgroup]', start)
  const group = start < 0 ? [] : before.slice(start, end < 0 ? undefined : end)
  const envAt = group.indexOf('env:')
  const env = envAt < 0 ? [] : group.slice(envAt + 1).filter((l) => /^ {2}\S/.test(l))
  return createHash('sha256').update(env.map((l) => l.trim()).sort().join('\n')).digest('hex')
}

/** Actions cache keys the job restored by exact match, and the keys it saved. */
const exactRestores = (log: string) => [...log.matchAll(/^Cache hit for: (.+)$/gm)].map((m) => (m[1] ?? '').trim())
// actions/cache writes `Cache saved with key: K`, actions/setup-go `Cache saved with the key: K`.
const savedKeys = (log: string) => [...log.matchAll(/^Cache saved with (?:the )?key: (.+)$/gm)].map((m) => (m[1] ?? '').trim())

/**
 * The inputs of a Go test result as the log shows them. Go keys its test cache on the package's sources, deps, test
 * files and flags; the log does not print that key, so those three fields name the package and the comparison rests
 * on what the log does show: the toolchain, the platform, the step env and the module cache key (go.sum hash).
 */
function goTestFingerprint(job: EvidenceJob, pkg: string, cacheKey: string): TestInputFingerprint | undefined {
  const tc = testedToolchain(job.log)
  if (!tc) return undefined
  const unit = `go-test-cache:${pkg}`
  return {
    sourceDepsHash: unit,
    testCodeHash: unit,
    configHash: unit,
    lockfilesHash: cacheKey,
    toolchain: tc.toolchain,
    platform: tc.platform,
    envHash: testEnvHash(job.log),
  }
}

/**
 * Links a result Go replayed `(cached)` to the seed job that produced it: a seed job of the same toolchain that ran
 * the package itself (`ok`, not cached) and saved the exact cache key this job restored. Anything else stays unlinked.
 */
function linkToSeed(
  job: EvidenceJob,
  label: string,
  pkg: string,
  seed: EvidenceSeed,
): Pick<ExtractedTest, 'seedLink' | 'currentFingerprint'> {
  const restored = exactRestores(job.log)
  const tc = testedToolchain(job.log)
  for (const seedJob of seed.jobs.filter(isTestJob)) {
    if (goLabel(seedJob) !== label || testedToolchain(seedJob.log)?.toolchain !== tc?.toolchain) continue
    const ran = goTestResults(seedJob.log).get(pkg)
    if (ran?.verdict !== 'passed' || ran.mode !== 'executed') continue
    const key = savedKeys(seedJob.log).find((k) => restored.includes(k))
    if (!key) continue
    const seedFingerprint = goTestFingerprint(seedJob, pkg, key)
    const currentFingerprint = goTestFingerprint(job, pkg, key)
    if (!seedFingerprint || !currentFingerprint) continue
    return { seedLink: { seedJobId: seedJob.jobId, seedFingerprint }, currentFingerprint }
  }
  return {}
}

function isTestJob(job: EvidenceJob): boolean {
  return job.logicalJobId === 'test' || (/test\.yml$/.test(job.workflowPath) && /^Test with /.test(job.jobName))
}

function isLintJob(job: EvidenceJob): boolean {
  return job.logicalJobId === 'golangci' || (/test\.yml$/.test(job.workflowPath) && /^Lint/i.test(job.jobName))
}

function isDockerJob(job: EvidenceJob): boolean {
  return job.logicalJobId === 'buildx' || /build-docker-images\.yml$/.test(job.workflowPath)
}

const extract: EvidenceExtractor = ({ jobs, seed }) => {
  const tests = new Map<string, ExtractedTest>()
  const commands = new Set<string>()
  const obligations = new Set<string>()
  const record = (testId: string, v: Verdict) => tests.set(testId, { testId, ...v })

  // Go test and vet, one set of units per toolchain.
  const goJobs = new Map<string, EvidenceJob>()
  for (const job of jobs.filter(isTestJob)) goJobs.set(goLabel(job), job)
  const labels = [...new Set<string>([...KNOWN_GO, ...goJobs.keys()])]
  for (const label of labels) {
    const job = goJobs.get(label)
    const results = job ? goTestResults(job.log) : new Map<string, Verdict>()
    const packages = [...new Set<string>([...KNOWN_PACKAGES, ...results.keys()])]
    for (const pkg of packages) {
      const v = results.get(pkg) ?? { verdict: 'failed', mode: 'executed' }
      const link = job && seed && v.mode === 'reused' ? linkToSeed(job, label, pkg, seed) : {}
      tests.set(`go-test:${label}:${pkg}`, { testId: `go-test:${label}:${pkg}`, ...v, ...link })
    }
    const vetStep = job?.steps.find((s) => /Vet and test/i.test(s.name))
    const vetLogged = !!job && /^`?(?:go env GOPATH`?\/bin\/gotip|go) vet \.\/\.\.\./m.test(job.log)
    const vetPassed = vetLogged && (results.size > 0 || vetStep?.conclusion === 'success')
    record(`go-vet:${label}`, { verdict: vetPassed ? 'passed' : 'failed', mode: 'executed' })
    if (job) {
      if (vetLogged) commands.add('go vet ./...')
      if (/^`?(?:go env GOPATH`?\/bin\/gotip|go) test \.\/\.\./m.test(job.log)) commands.add('go test ./...')
    }
    if (vetPassed && packages.every((p) => tests.get(`go-test:${label}:${p}`)?.verdict !== 'failed')) obligations.add(`go-tests:${label}`)
  }

  // Lint.
  const lintJob = jobs.find(isLintJob)
  const lintPassed = !!lintJob && lintJob.conclusion !== 'failure' && /^0 issues\.$|golangci-lint found no issues/m.test(lintJob.log)
  record('lint:golangci-lint', { verdict: lintPassed ? 'passed' : 'failed', mode: 'executed' })
  if (lintPassed) {
    obligations.add('lint:golangci-lint')
    commands.add('golangci-lint run --config .golangci.yml')
  }

  // Docker image build, per target platform.
  const docker = dockerUnits(jobs.find(isDockerJob), commands)
  for (const [id, v] of docker) record(id, v)
  for (const platform of PLATFORMS) {
    if ([`go-binary:${platform}`, `image:${platform}`, `image-noroot:${platform}`].every((id) => tests.get(id)?.verdict === 'passed'))
      obligations.add(`docker-image:${platform}`)
  }

  const sorted = [...tests.values()].sort((a, b) => a.testId.localeCompare(b.testId))
  return {
    tests: sorted,
    coverage: {
      scope: sorted.filter((t) => t.verdict !== 'skipped').map((t) => t.testId),
      covered: sorted.filter((t) => t.verdict === 'passed').map((t) => t.testId),
    },
    obligations: [...obligations].sort(),
    commands: [...commands].sort(),
  }
}

export default extract
