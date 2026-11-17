import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultProfiles, createDefaultRunnerMapping } from '../src/config.ts'
import { prepareReplayVariants } from '../src/generator.ts'
import { VARIANTS } from '../src/manifest.ts'
import type { BenchmarkConfig } from '../src/types.ts'

const LARGER = 'ubuntu-24.04-4core'

function makeConfig(): BenchmarkConfig {
  const runnerMapping = createDefaultRunnerMapping()
  runnerMapping.defaultMap['ubuntu-24.04'] = { github: LARGER, starsling: 'starsling-ubuntu-24.04' }
  runnerMapping.runnerSpecs[LARGER] = {
    label: LARGER,
    provider: 'github',
    os: 'linux',
    arch: 'x64',
    vcpu: 4,
    ramGiB: 16,
    billingPerMinuteUsd: 0.016,
  }
  const config: BenchmarkConfig = {
    schemaVersion: 1,
    upstream: { repository: 'org/repo', commitSha: 'a'.repeat(40), defaultBranch: 'main' },
    benchmarkRepository: { repository: 'bench/repo', controlBranch: 'bench/control', defaultBranch: 'main' },
    scenarios: {
      push: {
        name: 'push',
        description: 'push',
        event: 'push',
        main: { branch: 'main', beforeSha: '1'.repeat(40), afterSha: '2'.repeat(40), changedPaths: ['a.ts'] },
        referenceRuns: [],
      },
    },
    patches: [],
    runnerMapping,
    profiles: createDefaultProfiles(),
    adaptations: [],
    collectors: [],
    execution: {
      repetitions: 1,
      timeoutMinutes: 10,
      maxConcurrentExperiments: 1,
      pollIntervalSeconds: 5,
      publicRepoGitHubFree: false,
    },
  }
  delete config.profiles.warm
  return config
}

const CI = [
  'name: CI',
  'on: push',
  'jobs:',
  '  test:',
  '    runs-on: ubuntu-24.04',
  '    steps:',
  '      - run: echo hi',
  '',
].join('\n')

// transfer.sh's release.yml: `>=1.26.10` starts a folded block scalar, so the document is invalid YAML.
const invalidWorkflow = (trigger: string) =>
  [
    'name: Build and Release',
    `on: ${trigger}`,
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-24.04',
    '    steps:',
    '      - uses: actions/setup-go@v7',
    '        with:',
    '          go-version: >=1.26.10',
    '',
  ].join('\n')

describe('invalid upstream workflow YAML', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  function prepare(release: string) {
    const root = mkdtempSync(join(tmpdir(), 'bench-bad-yaml-'))
    dirs.push(root)
    mkdirSync(join(root, 'upstream/.github/workflows'), { recursive: true })
    writeFileSync(join(root, 'upstream/.github/workflows/ci.yml'), CI)
    writeFileSync(join(root, 'upstream/.github/workflows/release.yml'), release)
    return {
      root,
      run: () =>
        prepareReplayVariants({
          upstreamSourceDir: join(root, 'upstream'),
          workRootDir: join(root, 'work'),
          config: makeConfig(),
          patches: [],
        }),
    }
  }

  it('passes a workflow no scenario runs through byte-for-byte, and still rewrites the valid ones', () => {
    const release = invalidWorkflow('release')
    const { root, run } = prepare(release)
    run()
    for (const variant of VARIANTS) {
      expect(readFileSync(join(root, 'work/variants', variant, '.github/workflows/release.yml'), 'utf8')).toBe(release)
      expect(readFileSync(join(root, 'work/variants', variant, '.github/workflows/ci.yml'), 'utf8')).not.toBe(CI)
    }
  })

  it('fails with an error naming the file when a scenario runs the invalid workflow and it must be rewritten', () => {
    const { run } = prepare(invalidWorkflow('push'))
    expect(run).toThrow(/\.github\/workflows\/release\.yml.*invalid YAML/s)
  })
})
