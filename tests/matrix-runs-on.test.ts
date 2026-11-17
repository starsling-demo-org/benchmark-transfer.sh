import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { createDefaultProfiles, createDefaultRunnerMapping, validateBenchmarkConfig } from '../src/config.ts'
import { prepareReplayVariants } from '../src/generator.ts'
import { inspectRepository } from '../src/inventory.ts'
import type { BenchmarkConfig, RunnerSpec, VariantId } from '../src/types.ts'

const LARGER = 'ubuntu-24.04-4core'
const LARGER_22 = 'ubuntu-22.04-4core'
const spec = (label: string): RunnerSpec => ({
  label,
  provider: 'github',
  os: 'linux',
  arch: 'x64',
  vcpu: 4,
  ramGiB: 16,
  billingPerMinuteUsd: 0.016,
})

function makeConfig(mutate: (config: BenchmarkConfig) => void = () => {}): BenchmarkConfig {
  const runnerMapping = createDefaultRunnerMapping()
  runnerMapping.defaultMap['ubuntu-24.04'] = { github: LARGER, starsling: 'starsling-ubuntu-24.04' }
  runnerMapping.defaultMap['ubuntu-22.04'] = { github: LARGER_22, starsling: 'starsling-ubuntu-22.04' }
  runnerMapping.runnerSpecs[LARGER] = spec(LARGER)
  runnerMapping.runnerSpecs[LARGER_22] = spec(LARGER_22)
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
  mutate(config)
  return config
}

// biome-ignore lint/suspicious/noTemplateCurlyInString: a literal GitHub expression used as a runs-on label
const MATRIX_OS = '${{ matrix.os }}'

const job = (lines: string[]) =>
  [
    'name: CI',
    'on: push',
    'jobs:',
    '  build:',
    ...lines.map((l) => `    ${l}`),
    '    steps:',
    '      - run: echo hi',
    '',
  ].join('\n')

describe('matrix runs-on', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  function prepare(workflowText: string, config: BenchmarkConfig = makeConfig()) {
    const root = mkdtempSync(join(tmpdir(), 'bench-matrix-runner-'))
    dirs.push(root)
    mkdirSync(join(root, 'upstream/.github/workflows'), { recursive: true })
    writeFileSync(join(root, 'upstream/.github/workflows/ci.yml'), workflowText)
    return {
      root,
      run: () =>
        prepareReplayVariants({
          upstreamSourceDir: join(root, 'upstream'),
          workRootDir: join(root, 'work'),
          config,
          patches: [],
        }),
    }
  }
  const generated = (root: string, variant: VariantId) =>
    parse(readFileSync(join(root, 'work/variants', variant, '.github/workflows/ci.yml'), 'utf8')) as {
      jobs: { build: { name?: string; 'runs-on': string; strategy: { matrix: Record<string, unknown> } } }
    }

  it('rewrites each value of a literal matrix list per configuration and keeps the matrix shape', () => {
    const { root, run } = prepare(
      job([`runs-on: ${MATRIX_OS}`, 'strategy:', '  matrix:', '    os: [ubuntu-24.04, macos-14, ubuntu-22.04]']),
    )
    const bundle = run()
    for (const v of ['github-baseline', 'github-patched'] as const) {
      const b = generated(root, v).jobs.build
      expect(b['runs-on']).toBe(MATRIX_OS)
      expect(b.strategy.matrix.os).toEqual([LARGER, 'macos-14', LARGER_22])
    }
    for (const v of ['starsling-baseline', 'starsling-patched'] as const) {
      const b = generated(root, v).jobs.build
      expect(b['runs-on']).toBe(MATRIX_OS)
      expect(b.strategy.matrix.os).toEqual(['starsling-ubuntu-24.04', 'macos-14', 'starsling-ubuntu-22.04'])
    }
    expect(bundle.variants['starsling-baseline'].lock.movedJobs).toEqual(['.github/workflows/ci.yml#build'])
  })

  it('rewrites the include form and matching exclude entries, leaving other keys alone', () => {
    const { root, run } = prepare(
      job([
        `runs-on: ${MATRIX_OS}`,
        'strategy:',
        '  matrix:',
        '    shard: [1, 2]',
        '    include:',
        '      - { os: ubuntu-24.04, extra: a }',
        '      - { os: macos-14, extra: b }',
        '    exclude:',
        '      - { os: ubuntu-24.04, shard: 2 }',
      ]),
    )
    run()
    const gh = generated(root, 'github-baseline').jobs.build.strategy.matrix
    expect(gh.shard).toEqual([1, 2])
    expect(gh.include).toEqual([
      { os: LARGER, extra: 'a' },
      { os: 'macos-14', extra: 'b' },
    ])
    expect(gh.exclude).toEqual([{ os: LARGER, shard: 2 }])
    expect(generated(root, 'starsling-baseline').jobs.build.strategy.matrix.include).toEqual([
      { os: 'starsling-ubuntu-24.04', extra: 'a' },
      { os: 'macos-14', extra: 'b' },
    ])
  })

  it('keeps the original value in a job name that uses the matrix value, so check names do not change', () => {
    const { root, run } = prepare(
      job([
        `name: test (${MATRIX_OS})`,
        `runs-on: ${MATRIX_OS}`,
        'strategy:',
        '  matrix:',
        '    os: [ubuntu-24.04, macos-14]',
      ]),
    )
    run()
    const name = generated(root, 'github-baseline').jobs.build.name ?? ''
    expect(name).toContain(`fromJSON('{"${LARGER}":"ubuntu-24.04"}')[matrix.os]`)
    expect(name).not.toContain('macos-14')
  })

  it.each([
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
    ['fromJSON', ['strategy:', '  matrix:', '    os: ${{ fromJSON(needs.plan.outputs.os) }}']],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
    ['a variable inside the list', ['strategy:', '  matrix:', '    os: [ubuntu-24.04, "${{ vars.EXTRA_OS }}"]']],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
    ['a whole-matrix expression', ['strategy:', '  matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}']],
    ['a matrix without the key', ['strategy:', '  matrix:', '    node: [20, 22]']],
    ['no matrix at all', []],
  ])('refuses a matrix it cannot rewrite safely: %s', (_name, strategy) => {
    expect(() => prepare(job([`runs-on: ${MATRIX_OS}`, ...strategy])).run()).toThrow(/ci\.yml#build.*jobOverrides/s)
  })

  it('never renames a matrix value the job compares elsewhere: the comparison keeps its meaning', () => {
    const text = [
      'name: CI',
      'on: push',
      'jobs:',
      '  build:',
      `    runs-on: ${MATRIX_OS}`,
      '    strategy:',
      '      matrix:',
      '        os: [ubuntu-24.04, macos-14]',
      '    steps:',
      "      - if: matrix.os == 'ubuntu-24.04'",
      '        run: echo linux',
      '',
    ].join('\n')
    const { root, run } = prepare(text)
    run()
    const b = parse(readFileSync(join(root, 'work/variants/github-baseline/.github/workflows/ci.yml'), 'utf8')).jobs
      .build
    expect(b.strategy.matrix.os).toEqual(['ubuntu-24.04', 'macos-14'])
    expect(b.steps[0].if).toBe("matrix.os == 'ubuntu-24.04'")
    expect(b['runs-on']).toContain(`[matrix.os]`)
  })

  it('still refuses a -latest value on the GitHub side, naming the job and the value', () => {
    const text = job([`runs-on: ${MATRIX_OS}`, 'strategy:', '  matrix:', '    os: [ubuntu-24.04, windows-latest]'])
    expect(() => prepare(text).run()).toThrow(/ci\.yml#build.*windows-latest/s)
  })

  it('refuses two values that would collapse onto the same target', () => {
    const config = makeConfig((c) => {
      c.runnerMapping.defaultMap['ubuntu-22.04'] = { github: LARGER, starsling: 'starsling-ubuntu-24.04' }
    })
    const text = job([`runs-on: ${MATRIX_OS}`, 'strategy:', '  matrix:', '    os: [ubuntu-24.04, ubuntu-22.04]'])
    const attempt = () => prepare(text, config).run()
    expect(attempt).toThrow(/ci\.yml#build.*ubuntu-22\.04/s)
    expect(attempt).toThrow(/ubuntu-24\.04.*would both become/s)
  })

  it('a job override still replaces runs-on outright', () => {
    const config = makeConfig((c) => {
      c.runnerMapping.jobOverrides = {
        '.github/workflows/ci.yml#build': { github: LARGER, starsling: 'starsling-ubuntu-24.04' },
      }
    })
    const { root, run } = prepare(job([`runs-on: ${MATRIX_OS}`, 'strategy:', '  matrix:', '    os: [a, b]']), config)
    run()
    expect(generated(root, 'github-baseline').jobs.build['runs-on']).toBe(LARGER)
  })

  it('bench inspect reports non-literal matrix runs-on as a blocker and accepts a literal one', () => {
    const bad = prepare(job([`runs-on: ${MATRIX_OS}`, 'strategy:', '  matrix:', '    node: [20]']))
    expect(
      inspectRepository(join(bad.root, 'upstream'), makeConfig())
        .blockers.map((b) => b.evidence)
        .join('\n'),
    ).toMatch(/ci\.yml#build/)
    const good = prepare(job([`runs-on: ${MATRIX_OS}`, 'strategy:', '  matrix:', '    os: [ubuntu-24.04, macos-14]']))
    expect(
      inspectRepository(join(good.root, 'upstream'), makeConfig())
        .blockers.map((b) => b.evidence)
        .join('\n'),
    ).not.toMatch(/ci\.yml#build/)
  })

  describe('macOS, Windows and Arm values (per matrix value)', () => {
    const MAC = 'macos-26'
    const WIN = 'windows-2025-4core'
    const ARM = 'ubuntu-24.04-arm-4core'
    // Values with no StarSling runner map to the same pinned GitHub label on both sides.
    const withOsMap = (mutate: (config: BenchmarkConfig) => void = () => {}) =>
      makeConfig((c) => {
        c.runnerMapping.defaultMap['macos-latest'] = { github: MAC, starsling: MAC }
        c.runnerMapping.defaultMap['windows-latest'] = { github: WIN, starsling: WIN }
        c.runnerMapping.defaultMap['ubuntu-24.04-arm'] = { github: ARM, starsling: ARM }
        mutate(c)
      })
    const blockersFor = (root: string, config: BenchmarkConfig) =>
      inspectRepository(join(root, 'upstream'), config)
        .blockers.map((b) => b.evidence)
        .join('\n')

    it('maps each value of a flat list through defaultMap, keeping unsupported values on one pinned label', () => {
      const config = withOsMap()
      const { root, run } = prepare(
        job([
          `runs-on: ${MATRIX_OS}`,
          'strategy:',
          '  matrix:',
          '    os: [ubuntu-24.04, macos-latest, windows-latest, ubuntu-24.04-arm]',
        ]),
        config,
      )
      expect(blockersFor(root, config)).not.toMatch(/ci\.yml#build/)
      const bundle = run()
      for (const v of ['github-baseline', 'github-patched'] as const)
        expect(generated(root, v).jobs.build.strategy.matrix.os).toEqual([LARGER, MAC, WIN, ARM])
      for (const v of ['starsling-baseline', 'starsling-patched'] as const)
        expect(generated(root, v).jobs.build.strategy.matrix.os).toEqual(['starsling-ubuntu-24.04', MAC, WIN, ARM])
      expect(bundle.variants['starsling-baseline'].lock.movedJobs).toEqual(['.github/workflows/ci.yml#build'])
    })

    it('maps include and exclude entries per value', () => {
      const config = withOsMap()
      const { root, run } = prepare(
        job([
          `runs-on: ${MATRIX_OS}`,
          'strategy:',
          '  matrix:',
          '    include:',
          '      - { os: ubuntu-24.04, t: linux }',
          '      - { os: macos-latest, t: mac }',
          '      - { os: windows-latest, t: win }',
          '      - { os: ubuntu-24.04-arm, t: arm }',
          '    exclude:',
          '      - { os: windows-latest, t: linux }',
        ]),
        config,
      )
      expect(blockersFor(root, config)).not.toMatch(/ci\.yml#build/)
      run()
      const gh = generated(root, 'github-baseline').jobs.build.strategy.matrix
      expect(gh.include).toEqual([
        { os: LARGER, t: 'linux' },
        { os: MAC, t: 'mac' },
        { os: WIN, t: 'win' },
        { os: ARM, t: 'arm' },
      ])
      expect(gh.exclude).toEqual([{ os: WIN, t: 'linux' }])
      expect(generated(root, 'starsling-baseline').jobs.build.strategy.matrix.include).toEqual([
        { os: 'starsling-ubuntu-24.04', t: 'linux' },
        { os: MAC, t: 'mac' },
        { os: WIN, t: 'win' },
        { os: ARM, t: 'arm' },
      ])
    })

    it('maps a nested key (matrix.build.os), matching the key case-insensitively as GitHub does', () => {
      const config = withOsMap()
      const text = job([
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
        'name: Build ${{ matrix.build.NAME }}',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
        'runs-on: ${{ matrix.build.os }}',
        'strategy:',
        '  matrix:',
        '    build:',
        '      - { NAME: linux, OS: ubuntu-24.04 }',
        '      - { NAME: mac, OS: macos-latest }',
        '      - { NAME: win, OS: windows-latest }',
        '    include:',
        '      - build: { NAME: arm, OS: ubuntu-24.04-arm }',
      ])
      const { root, run } = prepare(text, config)
      expect(blockersFor(root, config)).not.toMatch(/ci\.yml#build/)
      run()
      const nested = (v: VariantId) => {
        const m = generated(root, v).jobs.build.strategy.matrix as {
          build: { OS: string }[]
          include: { build: { OS: string } }[]
        }
        return [...m.build.map((b) => b.OS), ...m.include.map((i) => i.build.OS)]
      }
      expect(nested('github-baseline')).toEqual([LARGER, MAC, WIN, ARM])
      expect(nested('starsling-baseline')).toEqual(['starsling-ubuntu-24.04', MAC, WIN, ARM])
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
      expect(generated(root, 'github-baseline').jobs.build['runs-on']).toBe('${{ matrix.build.os }}')
    })

    it('a per-job, per-value override wins over defaultMap for that job only', () => {
      const config = withOsMap((c) => {
        c.runnerMapping.matrixOverrides = {
          '.github/workflows/ci.yml#build': { 'macos-latest': { github: 'macos-15', starsling: 'macos-15' } },
        }
      })
      const { root, run } = prepare(
        job([`runs-on: ${MATRIX_OS}`, 'strategy:', '  matrix:', '    os: [ubuntu-24.04, macos-latest]']),
        config,
      )
      run()
      expect(generated(root, 'github-baseline').jobs.build.strategy.matrix.os).toEqual([LARGER, 'macos-15'])
      expect(generated(root, 'starsling-baseline').jobs.build.strategy.matrix.os).toEqual([
        'starsling-ubuntu-24.04',
        'macos-15',
      ])
    })

    it('refuses a -latest per-value override target in config validation', () => {
      const config = withOsMap((c) => {
        c.runnerMapping.matrixOverrides = {
          '.github/workflows/ci.yml#build': { 'macos-latest': { github: 'macos-latest', starsling: 'macos-latest' } },
        }
      })
      expect(
        validateBenchmarkConfig(config)
          .map((b) => b.evidence)
          .join('\n'),
      ).toMatch(/matrixOverrides.*macos-latest/)
    })

    it('still refuses an unmapped -latest value, naming the job and value', () => {
      const text = job([`runs-on: ${MATRIX_OS}`, 'strategy:', '  matrix:', '    os: [ubuntu-24.04, macos-latest]'])
      expect(() => prepare(text).run()).toThrow(/ci\.yml#build.*macos-latest/s)
    })

    it.each([
      [
        'a flat key',
        'os',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
        'if [ "${{ matrix.os }}" = "windows-latest" ]; then echo win; fi',
        ['    os: [ubuntu-24.04, macos-latest, windows-latest]'],
      ],
      [
        'a nested key',
        'build.os',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub expression
        'if [ "${{ matrix.build.OS }}" = "windows-latest" ]; then echo win; fi',
        [
          '    build:',
          '      - { OS: ubuntu-24.04 }',
          '      - { OS: macos-latest }',
          '      - { OS: windows-latest }',
        ],
      ],
    ])(
      'when the job compares %s, keeps the matrix and comparisons and maps runs-on through a lookup',
      (_name, key, script, axis) => {
        const config = withOsMap()
        const text = [
          'name: CI',
          'on: push',
          'jobs:',
          '  build:',
          `    runs-on: \${{ matrix.${key} }}`,
          '    strategy:',
          '      matrix:',
          ...axis.map((l) => `    ${l}`),
          '    steps:',
          `      - run: '${script}'`,
          '',
        ].join('\n')
        const { root, run } = prepare(text, config)
        expect(blockersFor(root, config)).not.toMatch(/ci\.yml#build/)
        run()
        const lookup = (targets: string[]) =>
          `\${{ fromJSON('${JSON.stringify(Object.fromEntries(['ubuntu-24.04', 'macos-latest', 'windows-latest'].map((v, i) => [v, targets[i]])))}')[matrix.${key}] }}`
        const gh = generated(root, 'github-baseline').jobs.build
        expect(gh['runs-on']).toBe(lookup([LARGER, MAC, WIN]))
        expect(generated(root, 'starsling-baseline').jobs.build['runs-on']).toBe(
          lookup(['starsling-ubuntu-24.04', MAC, WIN]),
        )
        // The matrix values the job compares stay as upstream wrote them.
        expect(JSON.stringify(gh.strategy.matrix)).toContain('windows-latest')
        expect(JSON.stringify(gh.strategy.matrix)).not.toContain(WIN)
      },
    )

    it('a plain macos-latest job mapped in defaultMap runs on the same pinned label on both sides', () => {
      const config = withOsMap()
      const { root, run } = prepare(job(['runs-on: macos-latest']), config)
      expect(blockersFor(root, config)).not.toMatch(/ci\.yml#build/)
      const bundle = run()
      expect(generated(root, 'github-baseline').jobs.build['runs-on']).toBe(MAC)
      expect(generated(root, 'starsling-baseline').jobs.build['runs-on']).toBe(MAC)
      expect(bundle.variants['starsling-baseline'].lock.retainedJobs).toEqual(['.github/workflows/ci.yml#build'])
    })
  })
})
