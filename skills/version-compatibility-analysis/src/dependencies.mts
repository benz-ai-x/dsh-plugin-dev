import { posix } from 'node:path'

export type Manifest = Record<string, unknown>
export type Manifests = ReadonlyMap<string, Manifest>
export interface Issue { kind: string; path?: string; revision?: string; reason: string }

export function isObject(value: unknown): value is Manifest {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

// Only the packages block is read; never execute the upstream package manager.
// Unsupported YAML is reported, not approximated by a guessed directory list.
function pnpmPatterns(text: string): string[] | undefined {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(line => /^packages\s*:/.test(line))
  if (start < 0) return undefined
  const head = lines[start]!.replace(/^packages\s*:\s*/, '').replace(/\s+#.*$/, '').trim()
  if (head && !head.startsWith('#')) {
    try { const values: unknown = JSON.parse(head); return stringList(values) ? values : undefined } catch { return undefined }
  }
  const values: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    if (/^[^\s-]/.test(line)) break
    const match = /^\s*-\s+(.+?)\s*$/.exec(line)
    if (!match) return undefined
    const scalar = match[1]!
    const single = /^'((?:[^']|'')*)'\s*(?:#.*)?$/.exec(scalar)
    const double = /^("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(scalar)
    if (single) values.push(single[1]!.replace(/''/g, "'"))
    else if (double) {
      try { values.push(JSON.parse(double[1]!) as string) } catch { return undefined }
    } else {
      const bare = scalar.replace(/\s+#.*$/, '').trim()
      if (!bare || /^[!&*\[\]{}>|'"%@`]/.test(bare) || /:\s/.test(bare)) return undefined
      values.push(bare)
    }
  }
  return values
}

export function discoverWorkspace(manifests: Manifests, pnpmText?: string) {
  const root = manifests.get('package.json')
  const workspaceValue = root?.workspaces
  const declared = isObject(workspaceValue) ? workspaceValue.packages : workspaceValue
  const patterns = pnpmText !== undefined ? pnpmPatterns(pnpmText)
    : stringList(declared) ? declared : declared === undefined ? [] : undefined
  const source = pnpmText !== undefined ? 'pnpm-workspace.yaml'
    : declared !== undefined ? 'package.json#workspaces' : 'single-package'
  if (patterns === undefined) return {
    source, status: 'unknown' as const, patterns: [], packagePaths: [],
    issues: [{ kind: 'workspace-definition', reason: `Cannot parse ${source}; inspect it with the agent before treating any manifest as a workspace package.` }],
  }
  const positive = patterns.filter(pattern => !pattern.startsWith('!')).map(pattern => pattern.replace(/^\.\//, '').replace(/\/$/, ''))
  const negative = patterns.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1).replace(/^\.\//, '').replace(/\/$/, ''))
  const packagePaths = [...manifests.keys()].filter(path => {
    if (path === 'package.json') return source === 'single-package'
    const directory = posix.dirname(path)
    return positive.some(pattern => posix.matchesGlob(directory, pattern))
      && !negative.some(pattern => posix.matchesGlob(directory, pattern))
  }).sort()
  return { source, status: 'discovered' as const, patterns, packagePaths, issues: [] as Issue[] }
}

export interface DependencyEdge {
  from: string
  name: string
  range: string
  kind: string
  conditional: boolean
  resolution: 'workspace-candidate' | 'external' | 'unresolved'
}

export function dependencyGraph(manifests: Manifests, paths: readonly string[], roots: readonly string[]) {
  const byName = new Map<string, Array<{ path: string; manifest: Manifest }>>()
  const issues: Issue[] = []
  for (const path of paths) {
    const manifest = manifests.get(path)!
    if (typeof manifest.name !== 'string') continue
    const entries = byName.get(manifest.name) ?? []
    entries.push({ path, manifest })
    byName.set(manifest.name, entries)
  }
  const queue = roots.map(name => ({ name, conditional: false }))
  const visited = new Map<string, boolean>()
  const nodes = new Map<string, { name: string; path: string; version: unknown; private: boolean; conditional: boolean }>()
  const edges = new Map<string, DependencyEdge>()
  const unresolvedRoots = roots.filter(name => (byName.get(name)?.length ?? 0) !== 1)
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const { name, conditional } = queue[cursor]!
    if (visited.has(name) && (visited.get(name) === false || conditional)) continue
    visited.set(name, conditional)
    const matches = byName.get(name) ?? []
    if (matches.length !== 1) {
      issues.push({ kind: 'dependency-resolution', reason: `${name}: ${matches.length ? 'ambiguous workspace name' : 'missing workspace package'}` })
      continue
    }
    const { path, manifest } = matches[0]!
    nodes.set(name, { name, path, version: manifest.version ?? null, private: manifest.private === true, conditional })
    const optional = isObject(manifest.optionalDependencies) ? manifest.optionalDependencies : {}
    for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const declarations = manifest[kind]
      if (declarations === undefined) continue
      if (!isObject(declarations)) { issues.push({ kind: 'dependency-declaration', path, reason: `${kind} is not an object` }); continue }
      for (const [dependency, range] of Object.entries(declarations).sort()) {
        if (kind === 'dependencies' && dependency in optional) continue
        if (typeof range !== 'string') { issues.push({ kind: 'dependency-declaration', path, reason: `${dependency} has a non-string range` }); continue }
        const meta = isObject(manifest.peerDependenciesMeta) ? manifest.peerDependenciesMeta[dependency] : undefined
        const edgeConditional = conditional || kind === 'optionalDependencies'
          || (kind === 'peerDependencies' && isObject(meta) && meta.optional === true)
        const local = byName.get(dependency)
        // Semver compatibility, aliases, catalogs and registry resolution belong to
        // later verification. Do not pretend name matching proves installability.
        const ordinary = !range.includes(':')
        const workspace = range.startsWith('workspace:') && !/[@/]/.test(range.slice(10))
        const resolution = local?.length === 1 && (ordinary || workspace) ? 'workspace-candidate'
          : local || range.includes(':') ? 'unresolved' : 'external'
        const edge: DependencyEdge = { from: name, name: dependency, range, kind, conditional: edgeConditional, resolution }
        const key = `${name}\0${kind}\0${dependency}`
        edges.set(key, edge)
        if (resolution === 'workspace-candidate') queue.push({ name: dependency, conditional: edgeConditional })
        else if (resolution === 'unresolved') issues.push({ kind: 'dependency-resolution', path, reason: `${dependency}@${range}: inspect alias, protocol, catalog or ambiguous/missing workspace target` })
      }
    }
  }
  return {
    roots: [...roots], unresolvedRoots,
    nodes: [...nodes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    edges: [...edges.values()], issues,
    registryStatus: 'not-queried' as const,
    scope: 'Declared workspace dependency/peer graph, including conditional optional edges; excludes dev dependencies and external transitive resolution. Not an install solver.',
  }
}
