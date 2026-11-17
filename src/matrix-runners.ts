import { isMap, isScalar, isSeq, type YAMLMap } from 'yaml'
import { escapeRegExp } from './inventory-helpers.ts'
import type { MatrixRunsOnPlan } from './types.ts'

// `matrix.os`, or a nested key such as `matrix.build.os` (each value of `build` is an object).
const MATRIX_RUNS_ON = /^\$\{\{\s*matrix\.([A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*)\s*\}\}$/
const COMPARES_VALUE = /==|!=|contains\(|startsWith\(|endsWith\(|fromJSON\(|format\(|\[/

/** The matrix key (dotted when nested) when `runs-on` is exactly `${{ matrix.<key> }}`, else undefined. */
export function matrixRunsOnKey(runsOn: unknown): string | undefined {
  return typeof runsOn === 'string' ? MATRIX_RUNS_ON.exec(runsOn.trim())?.[1] : undefined
}

/** The inventory field for a job: `{ matrixRunsOn }` when runs-on is a matrix expression, else nothing. */
export function matrixRunsOnField(runsOn: unknown, job: Record<string, unknown>): { matrixRunsOn?: MatrixRunsOnPlan } {
  const key = matrixRunsOnKey(runsOn)
  return key === undefined ? {} : { matrixRunsOn: planMatrixRunsOn(job, key) }
}

const isLiteral = (v: unknown): v is string => typeof v === 'string' && !v.includes('${{')

/** GitHub resolves context property names case-insensitively, so `matrix.build.os` reads an `OS` key. */
function getProperty(node: unknown, name: string): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined
  const lower = name.toLowerCase()
  const found = Object.keys(node).find((k) => k.toLowerCase() === lower)
  return found === undefined ? undefined : (node as Record<string, unknown>)[found]
}

const getPath = (node: unknown, path: string[]): unknown => path.reduce((n, name) => getProperty(n, name), node)

function getNode(map: unknown, name: string): unknown {
  if (!isMap(map)) return undefined
  const lower = name.toLowerCase()
  const pair = (map as YAMLMap).items.find((p) => isScalar(p.key) && String(p.key.value).toLowerCase() === lower)
  return pair?.value
}

function stringsOutside(node: unknown, skip: (path: string[]) => boolean, path: string[] = []): string[] {
  if (skip(path)) return []
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap((n) => stringsOutside(n, skip, path))
  if (node && typeof node === 'object')
    return Object.entries(node).flatMap(([k, v]) => stringsOutside(v, skip, [...path, k]))
  return []
}

/**
 * Which literal runner values a job's `${{ matrix.<key> }}` runs-on can take. Only a literal list under the key
 * (plus literal `include`/`exclude` entries that set it) can be mapped; expressions or a missing key give a problem.
 * A value the job compares elsewhere is reported as `compared`: it is mapped through runs-on, never renamed.
 */
export function planMatrixRunsOn(job: Record<string, unknown>, key: string): MatrixRunsOnPlan {
  const no = (why: string): MatrixRunsOnPlan => ({
    problem: `runs-on \${{ matrix.${key} }} cannot be rewritten automatically (${why}); add a runnerMapping.jobOverrides entry for this job`,
  })
  const strategy = job.strategy as { matrix?: unknown } | undefined
  const matrix = strategy?.matrix
  if (matrix === undefined) return no('the job has no strategy.matrix')
  if (typeof matrix !== 'object' || matrix === null || Array.isArray(matrix))
    return no('the whole matrix is an expression')
  const m = matrix as Record<string, unknown>
  const [head = key, ...rest] = key.split('.')
  const values: string[] = []
  const add = (v: unknown): boolean => {
    if (!isLiteral(v)) return false
    if (!values.includes(v)) values.push(v)
    return true
  }
  const axis = head === 'include' || head === 'exclude' ? undefined : getProperty(m, head)
  if (axis !== undefined) {
    if (!Array.isArray(axis)) return no(`matrix.${head} is not a literal list`)
    if (!axis.every((item) => add(getPath(item, rest))))
      return no(`matrix.${key} has values that are not literal strings`)
  }
  for (const section of ['include', 'exclude'] as const) {
    const entries = m[section]
    if (entries === undefined) continue
    if (!Array.isArray(entries)) return no(`matrix.${section} is an expression`)
    for (const entry of entries) {
      const value = getPath(entry, [head, ...rest])
      if (value === undefined) continue
      if (section === 'include' ? !add(value) : !isLiteral(value))
        return no(`matrix.${section} sets ${key} to a value that is not a literal string`)
    }
  }
  if (values.length === 0) return no(`the matrix defines no literal ${key} values`)
  const ref = new RegExp(
    `matrix\\.${escapeRegExp(key)}(?![\\w-])${rest.length === 0 ? `|matrix\\[['"]${escapeRegExp(key)}['"]\\]` : ''}`,
    'i',
  )
  const compared = stringsOutside(job, (p) => p[0] === 'runs-on' || p[0] === 'name' || p[0] === 'strategy').find(
    (s) => ref.test(s) && COMPARES_VALUE.test(s),
  )
  return compared === undefined ? { key, values } : { key, values, compared: compared.trim() }
}

/**
 * `runs-on` that maps each upstream matrix value to its target, for a job that compares the value elsewhere: the
 * matrix, job name and comparisons stay exactly as upstream wrote them.
 */
export function matrixRunsOnLookup(key: string, targets: Record<string, string>): string {
  const table = JSON.stringify(targets).replaceAll("'", "''")
  return `\${{ fromJSON('${table}')[matrix.${key}] }}`
}

/** A message when two different matrix values would be rewritten to the same label, else undefined. */
export function findMatrixCollision(targets: Record<string, string>): string | undefined {
  const seen = new Map<string, string>()
  for (const [value, target] of Object.entries(targets)) {
    const other = seen.get(target)
    if (other !== undefined)
      return `matrix values "${other}" and "${value}" would both become "${target}", which would duplicate matrix jobs and make check names ambiguous; add a runnerMapping.jobOverrides entry for this job`
    seen.set(target, value)
  }
  return undefined
}

/** Renames literal `key` values (a dotted path when nested) in the job's matrix list, include and exclude entries, in place. */
export function rewriteMatrixValues(jobMap: unknown, key: string, rename: (value: string) => string): void {
  const matrixMap = getNode(getNode(jobMap, 'strategy'), 'matrix')
  if (!isMap(matrixMap)) return
  const [head = key, ...rest] = key.split('.')
  const renameAt = (node: unknown, path: string[]) => {
    const leaf = path.reduce((n, name) => getNode(n, name), node)
    if (isScalar(leaf) && typeof leaf.value === 'string') leaf.value = rename(leaf.value)
  }
  const list = head === 'include' || head === 'exclude' ? undefined : getNode(matrixMap, head)
  if (isSeq(list)) for (const item of list.items) renameAt(item, rest)
  for (const section of ['include', 'exclude']) {
    const entries = getNode(matrixMap, section)
    if (!isSeq(entries)) continue
    for (const entry of entries.items) renameAt(entry, [head, ...rest])
  }
}

/**
 * Makes a job `name` that shows the matrix value keep showing the original value after the value is renamed, so
 * check names do not change. `renamed` maps new value -> original value.
 */
export function keepOriginalValueInName(name: string, key: string, renamed: Record<string, string>): string {
  if (Object.keys(renamed).length === 0) return name
  const table = JSON.stringify(renamed).replaceAll("'", "''")
  return name.replace(
    new RegExp(`matrix\\.${escapeRegExp(key)}(?![\\w-])`, 'gi'),
    (ref) => `fromJSON('${table}')[${ref}]`,
  )
}
