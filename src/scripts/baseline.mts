#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { BinaryLike } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultLockPath = join(projectRoot, 'dsh-reference.lock.json')
const DEFAULT_REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness.git'
const PRODUCT_SKILL_PREFIX = 'packages/preset/agent-presets/presets/'
const TOOL_LINKED_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/cordis-plugin-include',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-tools',
 ] as const
const TOOL_PUBLICATION_ROOTS = [
  ...TOOL_LINKED_PACKAGES,
 ] as const
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
] as const
const BASELINE_CHANNELS = ['stable', 'edge'] as const
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/

type BaselineChannel = typeof BASELINE_CHANNELS[number]
type DependencySection = typeof DEPENDENCY_SECTIONS[number]
type ReleaseFamily = 'vendor' | 'dsh' | 'experimental' | 'native' | 'workspace'
type JsonObject = Record<string, unknown>
type DependencyMap = Record<string, string>

interface UpstreamContract {
  repository: string
  tag: string
  version: string
  node: string
  packageManager: string
  commit: string
  docsDigest: string
}

interface RootManifest extends JsonObject {
  name?: unknown
  version?: unknown
  packageManager?: unknown
  engines?: { node?: unknown }
  devDependencies?: unknown
}

type PackageContract = JsonObject & Record<DependencySection, DependencyMap>

interface CapabilityPackageEntry {
  name: string
  manifest: Record<DependencySection, DependencyMap>
}

export interface PackageEntry {
  name: string
  version: string
  path: string
  private: boolean
  releaseFamily: ReleaseFamily
  manifest: PackageContract
  manifestDigest: string
}

interface SkillFileEntry {
  path: string
  sha256: string
}

export interface SkillEntry {
  name: string
  path: string
  role: 'product' | 'maintainer' | 'fixture'
  fileCount: number
  digest: string
  entryDigest: string
  files: SkillFileEntry[]
}

interface ExternalRequirement {
  name: string
  ranges: string[]
}

interface CapabilityContract {
  linkedPackages: Record<string, string>
  publicationRoots: string[]
  publicationClosure: string[]
  externalRequirements: ExternalRequirement[]
}

export interface BaselineCatalog {
  schemaVersion: 1
  upstream: UpstreamContract
  toolchain: {
    packageManager: unknown
    dependencies: DependencyMap
  }
  summary: {
    packageCount: number
    releasePackageCount: number
    privatePackageCount: number
    experimentalPackageCount: number
    skillCount: number
    productSkillCount: number
    packageGraphDigest: string
    skillsDigest: string
  }
  capabilities: Record<string, CapabilityContract> & { tool: CapabilityContract }
  packages: PackageEntry[]
  skills: SkillEntry[]
}

interface ArtifactSummary {
  path: string
  sha256: string
  status?: string | undefined
  checkedAt?: string | null | undefined
  packageCount?: number | undefined
  skillCount?: number | undefined
  productSkillCount?: number | undefined
}

interface LocalResolution {
  environmentVariable: string
  fallbackRelativePath: string
}

interface BaselineRecord {
  upstream: UpstreamContract
  catalog?: ArtifactSummary | undefined
  registry?: ArtifactSummary | undefined
  verification?: ArtifactSummary | undefined
  localResolution?: LocalResolution | undefined
  verifiedOn?: string | undefined
}

interface BaselineLock extends JsonObject {
  schemaVersion: number
  upstream?: UpstreamContract | undefined
  localResolution?: LocalResolution | undefined
  verifiedOn?: string | undefined
  defaultChannel?: string | undefined
  channels?: Record<string, BaselineRecord> | undefined
}

export interface LoadedChannel {
  root: string
  lockPath: string
  lock: BaselineLock
  channel: BaselineChannel
  baseline: BaselineRecord
  catalog: BaselineCatalog | undefined
  catalogPath: string | undefined
  catalogText: string | undefined
}

interface ScanOptions {
  allowDirty?: boolean | undefined
  tag?: string | undefined
  repository?: string | undefined
}

interface RegistryResolution {
  available: boolean
  resolved?: unknown
  reason?: string | undefined
}

interface RegistryRequirement {
  kind: 'upstream' | 'external'
  name: string
  requirement: string
  version?: string | undefined
  range?: string | undefined
  private?: boolean | undefined
  releaseFamily?: ReleaseFamily | undefined
}

interface CheckedRegistryRequirement extends RegistryRequirement, RegistryResolution {}

export interface RegistryReport extends JsonObject {
  schemaVersion: 1
  channel: string
  capability: string
  catalogSha256: string
  registry: string | null
  checkedAt: string
  status: 'ready' | 'blocked'
  packages: CheckedRegistryRequirement[]
  externalRequirements: CheckedRegistryRequirement[]
}

interface EvidenceReport extends JsonObject {
  status: string
  catalogSha256: string
  checkedAt?: string | null | undefined
  verifiedAt?: string | null | undefined
  projectDigest?: string | undefined
  channel?: string | undefined
  registrySha256?: string | undefined
  registryStatus?: string | undefined
}

interface VerificationReport extends EvidenceReport {
  schemaVersion: 2
  channel: string
  catalogSha256: string
  upstream: {
    tag: string
    commit: string
  }
  verifiedAt: string
  status: 'passed'
  command: string
  projectDigest: string
  registrySha256: string
  registryStatus: string
}

interface ParsedArguments {
  command?: string | undefined
  channel?: string | undefined
  harnessRoot?: string | undefined
  tag?: string | undefined
  from?: string | undefined
  to?: string | undefined
  capability?: string | undefined
  registry?: string | undefined
  json?: boolean | undefined
}

interface CatalogDiff {
  upstream: Record<string, { from: unknown; to: unknown }>
  packages: Record<'added' | 'removed' | 'changed', string[]>
  skills: Record<'added' | 'removed' | 'changed', string[]>
  toolClosure: Record<'added' | 'removed', string[]>
}

interface DiffCatalogInput {
  upstream: Pick<UpstreamContract, 'tag' | 'version' | 'node' | 'packageManager' | 'commit' | 'docsDigest'>
  packages: Array<Pick<PackageEntry, 'name' | 'version' | 'path' | 'manifestDigest'>>
  skills: Array<Pick<SkillEntry, 'path' | 'digest'>>
  capabilities?: {
    tool?: {
      publicationClosure?: string[] | undefined
    } | undefined
  } | undefined
}

interface RegistryCatalogInput {
  packages: Array<Pick<PackageEntry, 'name' | 'version' | 'private' | 'releaseFamily'>>
  capabilities: Record<string, {
    publicationClosure: string[]
    externalRequirements: ExternalRequirement[]
  } | undefined>
}

export class BaselineError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'BaselineError'
    this.code = code
  }
}

function fail(code: string, message: string): never {
  throw new BaselineError(code, message)
}

function slash(path: string): string {
  return path.split(sep).join('/')
}

function assertChannel(channel: unknown): BaselineChannel {
  if (typeof channel !== 'string' || !BASELINE_CHANNELS.some(candidate => candidate === channel)) {
    fail('DSH_BASELINE_CHANNEL_UNKNOWN', `baseline channel must be stable or edge: ${channel}`)
  }
  return channel as BaselineChannel
}

function resolveProjectArtifact(path: unknown, label: string): string {
  if (typeof path !== 'string' || !path) fail('DSH_BASELINE_INVALID', `${label} path is missing`)
  const absolute = resolve(projectRoot, path)
  if (absolute === projectRoot || !absolute.startsWith(`${projectRoot}${sep}`)) {
    fail('DSH_BASELINE_INVALID', `${label} escapes the project root: ${path}`)
  }
  return absolute
}

function sortObject<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortObject) as T
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortObject(child)]),
  ) as T
}

export function jsonText(value: unknown): string {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`
}

export function sha256(value: BinaryLike): string {
  return createHash('sha256').update(value).digest('hex')
}

function readJson<T extends JsonObject = JsonObject>(
  path: string,
  code = 'DSH_BASELINE_INVALID',
): T {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail(code, `${path} must contain a JSON object`)
    }
    return value as T
  } catch (error) {
    if (error instanceof BaselineError) throw error
    fail(code, `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.dsh-baseline-${process.pid}.tmp`
  writeFileSync(temporary, jsonText(value), { encoding: 'utf8', flag: 'wx' })
  renameSync(temporary, path)
}

function listDirectories(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(path, entry.name))
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function listFiles(path: string): string[] {
  if (!existsSync(path)) return []
  const result: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) result.push(absolute)
    }
  }
  visit(path)
  return result.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function runGit(root: string, args: readonly string[], code = 'DSH_BASELINE_GIT'): string {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.status !== 0) {
    fail(code, result.stderr.trim() || `git ${args.join(' ')} failed in ${root}`)
  }
  return result.stdout.trim()
}

export function harnessWorktreeChanges(root: string): string {
  const commands: readonly (readonly string[])[] = [
    ['status', '--porcelain=v1', '--untracked-files=all'],
    ['status', '--porcelain=v1', '--ignored=matching', '--untracked-files=all', '--', '.env'],
  ]
  const changes = new Set()
  for (const args of commands) {
    for (const line of runGit(root, args).split(/\r?\n/)) {
      if (line) changes.add(line)
    }
  }
  return [...changes].sort().join('\n')
}

function digestDocs(root: string): string {
  const docsRoot = join(root, 'docs')
  if (!existsSync(docsRoot) || !statSync(docsRoot).isDirectory()) {
    fail('DSH_BASELINE_SOURCE_INVALID', `missing Harness docs directory: ${docsRoot}`)
  }
  const aggregate = createHash('sha256')
  for (const absolute of listFiles(docsRoot)) {
    const fileDigest = sha256(readFileSync(absolute))
    aggregate.update(`${fileDigest}  ${slash(relative(root, absolute))}\n`)
  }
  return aggregate.digest('hex')
}

export function projectContractDigest(root = projectRoot): string {
  const excluded = (path: string): boolean => (
    path === 'dsh-reference.lock.json'
    || /^baselines\/[^/]+\/(?:registry|verification)\.json$/.test(path)
  )
  const files = runGit(root, ['ls-files', '--cached', '--others', '--exclude-standard'])
    .split(/\r?\n/)
    .filter(path => path && !excluded(path) && existsSync(join(root, path)))
    .sort()
  const aggregate = createHash('sha256')
  for (const path of files) aggregate.update(`${sha256(readFileSync(join(root, path)))}  ${path}\n`)
  return aggregate.digest('hex')
}

function workspaceManifestPaths(root: string): string[] {
  const paths = new Set<string>()
  const addManifest = (directory: string): void => {
    const path = join(directory, 'package.json')
    if (existsSync(path)) paths.add(path)
  }

  for (const group of listDirectories(join(root, 'packages'))) {
    for (const packageRoot of listDirectories(group)) addManifest(packageRoot)
  }
  for (const packageRoot of listDirectories(join(root, 'vendor'))) addManifest(packageRoot)
  for (const appRoot of listDirectories(join(root, 'apps'))) addManifest(appRoot)
  addManifest(join(root, 'native', 'landlock-run'))
  for (const packageRoot of listDirectories(join(root, 'native', 'landlock-run', 'packages'))) {
    addManifest(packageRoot)
  }
  addManifest(join(root, 'website'))
  addManifest(join(root, 'python', 'sdk-runtime'))
  return [...paths].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function releaseFamily(path: string): ReleaseFamily {
  if (path.startsWith('vendor/')) return 'vendor'
  if (path.startsWith('apps/')) return 'dsh'
  if (path.startsWith('packages/experimental/')) return 'experimental'
  if (path.startsWith('packages/')) return 'dsh'
  if (path.startsWith('native/')) return 'native'
  return 'workspace'
}

function dependencyMap(value: unknown): DependencyMap {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, range]) => typeof range === 'string')
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function selectedManifest(manifest: JsonObject): PackageContract {
  const selected: JsonObject = {}
  for (const field of [
    'name',
    'version',
    'private',
    'type',
    'main',
    'types',
    'bin',
    'exports',
    'files',
    'engines',
    'publishConfig',
    'dsh',
  ]) {
    if (manifest[field] !== undefined) selected[field] = manifest[field]
  }
  for (const section of DEPENDENCY_SECTIONS) selected[section] = dependencyMap(manifest[section])
  return sortObject(selected) as PackageContract
}

function packageEntries(root: string): PackageEntry[] {
  const names = new Map<string, string>()
  const entries: PackageEntry[] = []
  for (const manifestPath of workspaceManifestPaths(root)) {
    const manifest = readJson<RootManifest>(manifestPath, 'DSH_BASELINE_SOURCE_INVALID')
    if (typeof manifest.name !== 'string' || !manifest.name || typeof manifest.version !== 'string') {
      fail('DSH_BASELINE_SOURCE_INVALID', `${manifestPath} must declare string name and version`)
    }
    const path = slash(relative(root, dirname(manifestPath)))
    if (names.has(manifest.name)) {
      fail(
        'DSH_BASELINE_SOURCE_INVALID',
        `duplicate workspace package ${manifest.name}: ${names.get(manifest.name)} and ${path}`,
      )
    }
    names.set(manifest.name, path)
    const contract = selectedManifest(manifest)
    entries.push({
      name: manifest.name,
      version: manifest.version,
      path,
      private: manifest.private === true,
      releaseFamily: releaseFamily(path),
      manifest: contract,
      manifestDigest: sha256(jsonText(contract)),
    })
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path))
}

function skillRole(path: string): SkillEntry['role'] {
  if (path.startsWith(PRODUCT_SKILL_PREFIX) && path.includes('/skills/')) return 'product'
  if (path.startsWith('.agents/skills/')) return 'maintainer'
  return 'fixture'
}

function skillEntries(root: string): SkillEntry[] {
  const tracked = runGit(root, ['ls-files']).split(/\r?\n/).filter(Boolean).sort()
  const skillPaths = tracked.filter(path => path === 'SKILL.md' || path.endsWith('/SKILL.md'))
  return skillPaths.map(path => {
    const directory = slash(dirname(path))
    const files = tracked
      .filter(candidate => candidate === path || candidate.startsWith(`${directory}/`))
      .map(candidate => ({
        path: slash(relative(directory, candidate)),
        sha256: sha256(readFileSync(join(root, candidate))),
      }))
    const aggregate = createHash('sha256')
    for (const file of files) aggregate.update(`${file.sha256}  ${file.path}\n`)
    const content = readFileSync(join(root, path), 'utf8')
    const frontmatterName = /^---\r?\n[\s\S]*?^name:\s*([^\r\n]+)$/m.exec(content)?.[1]?.trim()
    const name = frontmatterName || basename(directory)
    if (skillRole(path) === 'product' && !SKILL_NAME.test(name)) {
      fail('DSH_BASELINE_SOURCE_INVALID', `unsafe product Skill name ${name} in ${path}`)
    }
    return {
      name,
      path,
      role: skillRole(path),
      fileCount: files.length,
      digest: aggregate.digest('hex'),
      entryDigest: sha256(content),
      files,
    }
  }).sort((left, right) => left.path.localeCompare(right.path))
}

export function computeCapabilityClosure(
  packages: readonly CapabilityPackageEntry[],
  roots: readonly string[],
): string[] {
  const byName = new Map(packages.map(entry => [entry.name, entry]))
  const missingRoots = roots.filter(name => !byName.has(name))
  if (missingRoots.length > 0) {
    fail('DSH_BASELINE_SOURCE_INVALID', `capability roots are missing: ${missingRoots.join(', ')}`)
  }
  const reached = new Set<string>()
  const visit = (name: string): void => {
    if (reached.has(name)) return
    reached.add(name)
    const entry = byName.get(name)
    if (entry === undefined) fail('DSH_BASELINE_SOURCE_INVALID', `capability package is missing: ${name}`)
    for (const section of DEPENDENCY_SECTIONS) {
      for (const dependency of Object.keys(entry.manifest[section] ?? {})) {
        if (byName.has(dependency)) visit(dependency)
      }
    }
  }
  for (const root of roots) visit(root)
  return [...reached].sort()
}

function externalRequirements(
  packages: readonly PackageEntry[],
  closure: readonly string[],
): ExternalRequirement[] {
  const byName = new Map(packages.map(entry => [entry.name, entry]))
  const requirements = new Map<string, Set<string>>()
  for (const packageName of closure) {
    const entry = byName.get(packageName)
    if (entry === undefined) fail('DSH_BASELINE_SOURCE_INVALID', `closure package is missing: ${packageName}`)
    for (const section of DEPENDENCY_SECTIONS) {
      for (const [name, range] of Object.entries(entry.manifest[section] ?? {})) {
        if (byName.has(name)) continue
        let ranges = requirements.get(name)
        if (ranges === undefined) {
          ranges = new Set<string>()
          requirements.set(name, ranges)
        }
        ranges.add(range)
      }
    }
  }
  return [...requirements.entries()]
    .map(([name, ranges]) => ({ name, ranges: [...ranges].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function toolchain(rootManifest: RootManifest): BaselineCatalog['toolchain'] {
  const development = dependencyMap(rootManifest.devDependencies)
  return {
    packageManager: rootManifest.packageManager,
    dependencies: Object.fromEntries(
      ['@types/node', 'typescript', 'vitest']
        .filter(name => development[name] !== undefined)
        .map(name => [name, development[name]!]),
    ) as DependencyMap,
  }
}

export function scanHarness(root: string, options: ScanOptions = {}): BaselineCatalog {
  const harnessRoot = resolve(root)
  if (!existsSync(join(harnessRoot, 'package.json'))) {
    fail('DSH_BASELINE_SOURCE_INVALID', `Harness package.json not found under ${harnessRoot}`)
  }
  const dirty = harnessWorktreeChanges(harnessRoot)
  if (dirty && !options.allowDirty) {
    fail('DSH_BASELINE_SOURCE_DIRTY', `Harness worktree has attested source changes:\n${dirty}`)
  }

  const rootManifest = readJson<RootManifest>(join(harnessRoot, 'package.json'), 'DSH_BASELINE_SOURCE_INVALID')
  const commit = runGit(harnessRoot, ['rev-parse', 'HEAD'])
  if (typeof rootManifest.version !== 'string') {
    fail('DSH_BASELINE_SOURCE_INVALID', 'Harness root must declare a string version')
  }
  const tag = options.tag ?? `dsh-v${rootManifest.version}`
  const tagCommit = runGit(
    harnessRoot,
    ['rev-parse', `${tag}^{commit}`],
    'DSH_BASELINE_TAG_MISMATCH',
  )
  if (tagCommit !== commit) {
    fail('DSH_BASELINE_TAG_MISMATCH', `${tag} resolves to ${tagCommit}, but Harness HEAD is ${commit}`)
  }
  if (typeof rootManifest.engines?.node !== 'string' || typeof rootManifest.packageManager !== 'string') {
    fail('DSH_BASELINE_SOURCE_INVALID', 'Harness root must declare engines.node and packageManager')
  }

  const packages = packageEntries(harnessRoot)
  const skills = skillEntries(harnessRoot)
  const linkedPackages = Object.fromEntries(TOOL_LINKED_PACKAGES.map(name => {
    const entry = packages.find(candidate => candidate.name === name)
    if (!entry) fail('DSH_BASELINE_SOURCE_INVALID', `linked Tool package is missing: ${name}`)
    return [name, entry.path]
  }))
  const publicationClosure = computeCapabilityClosure(packages, TOOL_PUBLICATION_ROOTS)
  const packageGraphDigest = sha256(jsonText(packages.map(entry => ({
    name: entry.name,
    path: entry.path,
    version: entry.version,
    manifestDigest: entry.manifestDigest,
  }))))
  const skillsDigest = sha256(jsonText(skills.map(entry => ({ path: entry.path, digest: entry.digest }))))

  return sortObject({
    schemaVersion: 1,
    upstream: {
      repository: options.repository ?? DEFAULT_REPOSITORY,
      tag,
      version: rootManifest.version,
      node: rootManifest.engines.node,
      packageManager: rootManifest.packageManager,
      commit,
      docsDigest: digestDocs(harnessRoot),
    },
    toolchain: toolchain(rootManifest),
    summary: {
      packageCount: packages.length,
      releasePackageCount: packages.filter(entry => ['dsh', 'vendor'].includes(entry.releaseFamily)).length,
      privatePackageCount: packages.filter(entry => entry.private).length,
      experimentalPackageCount: packages.filter(entry => entry.releaseFamily === 'experimental').length,
      skillCount: skills.length,
      productSkillCount: skills.filter(entry => entry.role === 'product').length,
      packageGraphDigest,
      skillsDigest,
    },
    capabilities: {
      tool: {
        linkedPackages,
        publicationRoots: [...TOOL_PUBLICATION_ROOTS],
        publicationClosure,
        externalRequirements: externalRequirements(packages, publicationClosure),
      },
    },
    packages,
    skills,
  })
}

function compactBaselineFromV1(lock: BaselineLock): BaselineRecord {
  if (lock.upstream === undefined) {
    fail('DSH_BASELINE_INVALID', 'schema v1 lock is missing upstream')
  }
  return {
    upstream: lock.upstream,
    localResolution: lock.localResolution,
    verifiedOn: lock.verifiedOn,
  }
}

export function selectChannel(
  lock: BaselineLock,
  requestedChannel?: string,
): { channel: BaselineChannel; baseline: BaselineRecord } {
  if (lock.schemaVersion === 1) {
    if (requestedChannel && requestedChannel !== 'stable') {
      fail('DSH_BASELINE_CHANNEL_UNKNOWN', 'schema v1 supports only the implicit stable channel')
    }
    return { channel: 'stable', baseline: compactBaselineFromV1(lock) }
  }
  if (lock.schemaVersion !== 2 || lock.channels === null || typeof lock.channels !== 'object') {
    fail('DSH_BASELINE_LOCK_UNSUPPORTED', `unsupported baseline lock schema: ${lock.schemaVersion}`)
  }
  const channel = assertChannel(requestedChannel || process.env.DSH_BASELINE_CHANNEL || lock.defaultChannel)
  const baseline = lock.channels[channel]
  if (!baseline) {
    fail(
      'DSH_BASELINE_CHANNEL_UNKNOWN',
      `unknown baseline channel ${channel}; available: ${Object.keys(lock.channels).sort().join(', ')}`,
    )
  }
  return { channel, baseline }
}

export function loadLockedChannel(root = projectRoot, requestedChannel?: string): LoadedChannel {
  const lockPath = join(root, 'dsh-reference.lock.json')
  const lock = readJson<BaselineLock>(lockPath)
  const { channel, baseline } = selectChannel(lock, requestedChannel)
  let catalog: BaselineCatalog | undefined
  let catalogText: string | undefined
  let catalogPath: string | undefined
  if (lock.schemaVersion === 2) {
    const catalogSummary = baseline.catalog
    if (catalogSummary === undefined) {
      fail('DSH_BASELINE_CATALOG_MISSING', `${channel} lock has no catalog summary`)
    }
    catalogPath = resolveProjectArtifact(catalogSummary.path, `${channel} catalog`)
    if (!existsSync(catalogPath)) fail('DSH_BASELINE_CATALOG_MISSING', `missing catalog for ${channel}: ${catalogPath}`)
    catalogText = readFileSync(catalogPath, 'utf8')
    const digest = sha256(catalogText)
    if (digest !== catalogSummary.sha256) {
      fail(
        'DSH_BASELINE_CATALOG_MISMATCH',
        `${channel} catalog digest mismatch: expected ${catalogSummary.sha256}, received ${digest}`,
      )
    }
    catalog = JSON.parse(catalogText) as BaselineCatalog
    for (const field of ['tag', 'version', 'node', 'packageManager', 'commit', 'docsDigest'] as const) {
      if (catalog.upstream?.[field] !== baseline.upstream?.[field]) {
        fail('DSH_BASELINE_CATALOG_MISMATCH', `${channel} catalog upstream.${field} does not match its lock`)
      }
    }
  }
  return { root, lockPath, lock, channel, baseline, catalog, catalogPath, catalogText }
}

function reportSummary(path: string, report: EvidenceReport): ArtifactSummary {
  const text = jsonText(report)
  return {
    path,
    sha256: sha256(text),
    status: report.status,
    checkedAt: report.checkedAt ?? report.verifiedAt ?? null,
  }
}

function uncheckedRegistry(
  channel: string,
  catalogDigest: string,
  capability = 'tool',
): EvidenceReport {
  return {
    schemaVersion: 1,
    channel,
    capability,
    catalogSha256: catalogDigest,
    registry: null,
    checkedAt: null,
    status: 'unchecked',
    packages: [],
    externalRequirements: [],
  }
}

function unverifiedBaseline(channel: string, catalogDigest: string): EvidenceReport {
  return {
    schemaVersion: 1,
    channel,
    catalogSha256: catalogDigest,
    verifiedAt: null,
    status: 'unverified',
    command: null,
  }
}

function relativeProjectPath(path: string): string {
  let value = slash(relative(projectRoot, path))
  if (!value.startsWith('.')) value = `./${value}`
  return value
}

function artifactPaths(channel: unknown): {
  catalog: string
  registry: string
  verification: string
  skills: string
} {
  assertChannel(channel)
  const directory = `baselines/${channel}`
  return {
    catalog: `${directory}/catalog.json`,
    registry: `${directory}/registry.json`,
    verification: `${directory}/verification.json`,
    skills: `${directory}/skills`,
  }
}

function copyProductSkills(
  harnessRoot: string,
  catalog: BaselineCatalog,
  channel: BaselineChannel,
): void {
  const paths = artifactPaths(channel)
  for (const skill of catalog.skills.filter(entry => entry.role === 'product')) {
    if (!SKILL_NAME.test(skill.name)) {
      fail('DSH_BASELINE_SKILL_MISMATCH', `unsafe product Skill snapshot name: ${skill.name}`)
    }
    const destinationRoot = join(projectRoot, paths.skills, skill.name)
    for (const file of skill.files) {
      const source = join(harnessRoot, dirname(skill.path), file.path)
      const destination = join(destinationRoot, file.path)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(source, destination)
    }
  }
}

function channelRecord(
  catalog: BaselineCatalog,
  channel: BaselineChannel,
  harnessRoot: string,
  verifiedOn: string,
  registry: EvidenceReport,
  verification: EvidenceReport,
): BaselineRecord {
  const paths = artifactPaths(channel)
  const catalogContent = jsonText(catalog)
  return {
    upstream: catalog.upstream,
    catalog: {
      path: paths.catalog,
      sha256: sha256(catalogContent),
      packageCount: catalog.summary.packageCount,
      skillCount: catalog.summary.skillCount,
      productSkillCount: catalog.summary.productSkillCount,
    },
    registry: reportSummary(paths.registry, registry),
    verification: reportSummary(paths.verification, verification),
    localResolution: {
      environmentVariable: 'DSH_HARNESS_BASELINE_ROOT',
      fallbackRelativePath: relativeProjectPath(harnessRoot),
    },
    verifiedOn,
  }
}

function writeChannelArtifacts(
  harnessRoot: string,
  catalog: BaselineCatalog,
  channel: BaselineChannel,
  registry: EvidenceReport,
  verification: EvidenceReport,
): void {
  const paths = artifactPaths(channel)
  writeJsonAtomic(join(projectRoot, paths.catalog), catalog)
  writeJsonAtomic(join(projectRoot, paths.registry), registry)
  writeJsonAtomic(join(projectRoot, paths.verification), verification)
  copyProductSkills(harnessRoot, catalog, channel)
}

export function updateChannel({
  harnessRoot,
  channel: requestedChannel = 'edge',
  tag,
  verifiedOn = new Date().toISOString().slice(0, 10),
}: {
  harnessRoot: string
  channel?: string | undefined
  tag?: string | undefined
  verifiedOn?: string | undefined
}): { lock: BaselineLock; catalog: BaselineCatalog; channels: BaselineChannel[] } {
  const channel = assertChannel(requestedChannel)
  const root = resolve(harnessRoot)
  const existing = readJson<BaselineLock>(defaultLockPath)
  const defaultRepository = existing.defaultChannel === undefined
    ? undefined
    : existing.channels?.[existing.defaultChannel]?.upstream.repository
  const repository = existing.schemaVersion === 1
    ? existing.upstream?.repository
    : existing.channels?.[channel]?.upstream?.repository
      ?? defaultRepository
  const catalog = scanHarness(root, { repository: repository ?? DEFAULT_REPOSITORY, tag })
  const catalogDigest = sha256(jsonText(catalog))

  if (existing.schemaVersion === 1) {
    const channels: Record<string, BaselineRecord> = {}
    for (const initialChannel of BASELINE_CHANNELS) {
      const registry = uncheckedRegistry(initialChannel, catalogDigest)
      const verification = unverifiedBaseline(initialChannel, catalogDigest)
      writeChannelArtifacts(root, catalog, initialChannel, registry, verification)
      channels[initialChannel] = channelRecord(
        catalog,
        initialChannel,
        root,
        verifiedOn,
        registry,
        verification,
      )
    }
    const migrated = { schemaVersion: 2, defaultChannel: 'stable', channels }
    writeJsonAtomic(defaultLockPath, migrated)
    return { lock: migrated, catalog, channels: ['stable', 'edge'] }
  }

  if (existing.schemaVersion !== 2 || existing.channels === undefined) {
    fail('DSH_BASELINE_LOCK_UNSUPPORTED', `cannot update schema ${existing.schemaVersion}`)
  }
  if (channel !== 'edge') {
    fail('DSH_BASELINE_STABLE_WRITE_FORBIDDEN', 'update edge, verify it, then use promote to change stable')
  }
  const registry = uncheckedRegistry(channel, catalogDigest)
  const verification = unverifiedBaseline(channel, catalogDigest)
  writeChannelArtifacts(root, catalog, channel, registry, verification)
  const updated = structuredClone(existing)
  if (updated.channels === undefined) fail('DSH_BASELINE_LOCK_UNSUPPORTED', 'schema v2 channels are missing')
  updated.channels[channel] = channelRecord(catalog, channel, root, verifiedOn, registry, verification)
  writeJsonAtomic(defaultLockPath, updated)
  return { lock: updated, catalog, channels: [channel] }
}

export function diffCatalogs(
  fromCatalog: DiffCatalogInput,
  toCatalog: DiffCatalogInput,
): CatalogDiff {
  const fromPackages = new Map(fromCatalog.packages.map(entry => [entry.name, entry]))
  const toPackages = new Map(toCatalog.packages.map(entry => [entry.name, entry]))
  const fromSkills = new Map(fromCatalog.skills.map(entry => [entry.path, entry]))
  const toSkills = new Map(toCatalog.skills.map(entry => [entry.path, entry]))
  const addedPackages = [...toPackages.keys()].filter(name => !fromPackages.has(name)).sort()
  const removedPackages = [...fromPackages.keys()].filter(name => !toPackages.has(name)).sort()
  const changedPackages = [...toPackages.keys()].filter(name => {
    const previous = fromPackages.get(name)
    return previous && (
      previous.version !== toPackages.get(name)!.version
      || previous.path !== toPackages.get(name)!.path
      || previous.manifestDigest !== toPackages.get(name)!.manifestDigest
    )
  }).sort()
  const addedSkills = [...toSkills.keys()].filter(path => !fromSkills.has(path)).sort()
  const removedSkills = [...fromSkills.keys()].filter(path => !toSkills.has(path)).sort()
  const changedSkills = [...toSkills.keys()].filter(path => {
    const previous = fromSkills.get(path)
    return previous !== undefined && previous.digest !== toSkills.get(path)!.digest
  }).sort()
  const upstream: CatalogDiff['upstream'] = {}
  for (const field of ['tag', 'version', 'node', 'packageManager', 'commit', 'docsDigest'] as const) {
    if (fromCatalog.upstream[field] !== toCatalog.upstream[field]) {
      upstream[field] = { from: fromCatalog.upstream[field], to: toCatalog.upstream[field] }
    }
  }
  const fromClosure = fromCatalog.capabilities?.tool?.publicationClosure ?? []
  const toClosure = toCatalog.capabilities?.tool?.publicationClosure ?? []
  return {
    upstream,
    packages: { added: addedPackages, removed: removedPackages, changed: changedPackages },
    skills: { added: addedSkills, removed: removedSkills, changed: changedSkills },
    toolClosure: {
      added: toClosure.filter(name => !fromClosure.includes(name)),
      removed: fromClosure.filter(name => !toClosure.includes(name)),
    },
  }
}

function npmView(requirement: string, registry?: string): Promise<RegistryResolution> {
  return new Promise(resolveResult => {
    const args = ['view', requirement, 'version', '--json', '--silent']
    if (registry) args.push('--registry', registry)
    const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', error => resolveResult({ available: false, reason: error.message }))
    child.on('close', code => {
      if (code === 0) {
        let versions
        try {
          versions = JSON.parse(stdout || 'null')
        } catch {
          versions = stdout.trim()
        }
        resolveResult({ available: true, resolved: versions })
      } else {
        resolveResult({
          available: false,
          reason: (stderr.trim() || stdout.trim() || `npm view exited ${code}`).slice(0, 800),
        })
      }
    })
  })
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await operation(values[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

export async function buildRegistryReport({
  channel,
  catalog,
  catalogSha256,
  capability = 'tool',
  registry,
  resolver = npmView,
  checkedAt = new Date().toISOString(),
}: {
  channel: string
  catalog: RegistryCatalogInput
  catalogSha256: string
  capability?: string | undefined
  registry?: string | undefined
  resolver?: ((requirement: string, registry?: string) => Promise<RegistryResolution>) | undefined
  checkedAt?: string | undefined
}): Promise<RegistryReport> {
  const contract = catalog.capabilities?.[capability]
  if (!contract) fail('DSH_BASELINE_CAPABILITY_UNKNOWN', `catalog has no ${capability} capability`)
  const byName = new Map(catalog.packages.map(entry => [entry.name, entry]))
  const internal: RegistryRequirement[] = contract.publicationClosure.map(name => {
    const entry = byName.get(name)
    if (entry === undefined) fail('DSH_BASELINE_SOURCE_INVALID', `publication package is missing: ${name}`)
    return {
      kind: 'upstream' as const,
      name,
      requirement: `${name}@${entry.version}`,
      version: entry.version,
      private: entry.private,
      releaseFamily: entry.releaseFamily,
    }
  })
  const external: RegistryRequirement[] = contract.externalRequirements.flatMap(entry => entry.ranges.map(range => ({
    kind: 'external' as const,
    name: entry.name,
    requirement: `${entry.name}@${range}`,
    range,
  })))
  const requirements: RegistryRequirement[] = [...internal, ...external]
  const checked = await mapConcurrent(requirements, 6, async requirement => {
    if (requirement.private) return { ...requirement, available: false, reason: 'package is private' }
    if (requirement.releaseFamily === 'experimental') {
      return { ...requirement, available: false, reason: 'package belongs to the experimental family' }
    }
    if (requirement.requirement.includes('@workspace:')) {
      return { ...requirement, available: false, reason: 'workspace protocol is not registry-resolvable' }
    }
    return { ...requirement, ...await resolver(requirement.requirement, registry) }
  })
  const packages = checked.filter(entry => entry.kind === 'upstream')
  const externalRequirements = checked.filter(entry => entry.kind === 'external')
  return sortObject({
    schemaVersion: 1,
    channel,
    capability,
    catalogSha256,
    registry: registry ?? null,
    checkedAt,
    status: checked.every(entry => entry.available) ? 'ready' : 'blocked',
    packages,
    externalRequirements,
  } satisfies RegistryReport)
}

function updateReportInLock(
  loaded: LoadedChannel,
  kind: 'registry' | 'verification',
  report: EvidenceReport,
): BaselineLock {
  const path = loaded.baseline[kind]?.path ?? artifactPaths(loaded.channel)[kind]
  writeJsonAtomic(resolveProjectArtifact(path, `${loaded.channel} ${kind}`), report)
  const updated = structuredClone(loaded.lock)
  if (updated.channels === undefined || updated.channels[loaded.channel] === undefined) {
    fail('DSH_BASELINE_LOCK_UNSUPPORTED', 'reports require a schema v2 channel lock')
  }
  updated.channels[loaded.channel]![kind] = reportSummary(path, report)
  writeJsonAtomic(defaultLockPath, updated)
  return updated
}

function verifySnapshotSkills(loaded: LoadedChannel & { catalog: BaselineCatalog }): void {
  const productSkills = loaded.catalog.skills.filter(entry => entry.role === 'product')
  for (const skill of productSkills) {
    const snapshotRoot = join(projectRoot, artifactPaths(loaded.channel).skills, skill.name)
    for (const file of skill.files) {
      const snapshotPath = join(snapshotRoot, file.path)
      if (!existsSync(snapshotPath) || sha256(readFileSync(snapshotPath)) !== file.sha256) {
        fail(
          'DSH_BASELINE_SKILL_MISMATCH',
          `${loaded.channel} product Skill snapshot differs: ${skill.name}/${file.path}`,
        )
      }
    }
  }
}

export function resolveHarnessRoot(loaded: LoadedChannel, explicitRoot?: string): string {
  const environmentName = loaded.baseline.localResolution?.environmentVariable ?? 'DSH_HARNESS_ROOT'
  const selected = explicitRoot || process.env[environmentName]
  const fallback = loaded.baseline.localResolution?.fallbackRelativePath
  const root = resolve(selected || join(projectRoot, fallback || ''))
  if (!existsSync(root)) {
    fail('DSH_BASELINE_SOURCE_MISSING', `Harness source not found at ${root}; set ${environmentName}`)
  }
  return root
}

export function checkLockedChannel(channel?: string, explicitRoot?: string): {
  loaded: LoadedChannel & { catalog: BaselineCatalog }
  harnessRoot: string
  scanned: BaselineCatalog
} {
  const loaded = loadLockedChannel(projectRoot, channel)
  if (!loaded.catalog) fail('DSH_BASELINE_LOCK_UNSUPPORTED', 'upgrade schema v1 before checking a channel')
  const catalogSummary = loaded.baseline.catalog
  if (catalogSummary === undefined) fail('DSH_BASELINE_CATALOG_MISSING', `${loaded.channel} has no catalog summary`)
  const typedLoaded = loaded as LoadedChannel & { catalog: BaselineCatalog }
  const harnessRoot = resolveHarnessRoot(loaded, explicitRoot)
  const scanned = scanHarness(harnessRoot, {
    repository: loaded.baseline.upstream.repository,
    tag: loaded.baseline.upstream.tag,
  })
  const actual = sha256(jsonText(scanned))
  if (actual !== catalogSummary.sha256) {
    fail(
      'DSH_BASELINE_CATALOG_DRIFT',
      `${loaded.channel} source scans to ${actual}, expected ${catalogSummary.sha256}; run upstream:diff before updating edge`,
    )
  }
  verifySnapshotSkills(typedLoaded)
  return { loaded: typedLoaded, harnessRoot, scanned }
}

function validateReport(
  loaded: LoadedChannel,
  kind: 'registry' | 'verification',
  requiredStatus?: string,
): EvidenceReport {
  const summary = loaded.baseline[kind]
  if (summary === undefined) {
    fail('DSH_BASELINE_REPORT_MISSING', `${loaded.channel} ${kind} has no lock summary`)
  }
  const path = resolveProjectArtifact(summary?.path, `${loaded.channel} ${kind}`)
  if (!existsSync(path)) fail('DSH_BASELINE_REPORT_MISSING', `missing ${loaded.channel} ${kind} report`)
  const text = readFileSync(path, 'utf8')
  if (sha256(text) !== summary.sha256) {
    fail('DSH_BASELINE_REPORT_MISMATCH', `${loaded.channel} ${kind} report digest mismatch`)
  }
  const report = JSON.parse(text) as EvidenceReport
  if (report.catalogSha256 !== loaded.baseline.catalog?.sha256) {
    fail('DSH_BASELINE_REPORT_STALE', `${loaded.channel} ${kind} report targets another catalog`)
  }
  if (requiredStatus && report.status !== requiredStatus) {
    fail(
      'DSH_BASELINE_PREFLIGHT_BLOCKED',
      `${loaded.channel} ${kind} status is ${report.status}; required ${requiredStatus}`,
    )
  }
  if (kind === 'verification' && report.status === 'passed') {
    const currentDigest = projectContractDigest(projectRoot)
    if (report.projectDigest !== currentDigest) {
      fail(
        'DSH_BASELINE_REPORT_STALE',
        `${loaded.channel} verification targets project ${report.projectDigest}, current contract is ${currentDigest}`,
      )
    }
  }
  return report
}

/** A source-only pass cannot authorize publication after Registry availability changes. */
export function validateRegistryVerification(
  verification: { registryStatus?: unknown; registrySha256?: unknown },
  registry: { status?: string | undefined; sha256?: string | undefined },
): void {
  if (registry.status !== 'ready'
    || verification.registryStatus !== 'ready'
    || typeof registry.sha256 !== 'string'
    || verification.registrySha256 !== registry.sha256) {
    fail(
      'DSH_BASELINE_REGISTRY_UNVERIFIED',
      'verification must exercise the same ready Registry report; rerun baseline verification after registry:check',
    )
  }
}

export function preflightChannel(channel?: string): LoadedChannel {
  const loaded = loadLockedChannel(projectRoot, channel)
  validateReport(loaded, 'registry', 'ready')
  const verification = validateReport(loaded, 'verification', 'passed')
  validateRegistryVerification(verification, loaded.baseline.registry ?? {})
  return loaded
}

function copyChannelFiles(
  fromLoaded: LoadedChannel & { catalog: BaselineCatalog },
  toChannel: BaselineChannel,
  registry: EvidenceReport,
  verification: EvidenceReport,
): void {
  const paths = artifactPaths(toChannel)
  writeJsonAtomic(join(projectRoot, paths.catalog), fromLoaded.catalog)
  writeJsonAtomic(join(projectRoot, paths.registry), registry)
  writeJsonAtomic(join(projectRoot, paths.verification), verification)
  for (const skill of fromLoaded.catalog.skills.filter(entry => entry.role === 'product')) {
    for (const file of skill.files) {
      const source = join(projectRoot, artifactPaths(fromLoaded.channel).skills, skill.name, file.path)
      const destination = join(projectRoot, paths.skills, skill.name, file.path)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(source, destination)
    }
  }
}

export function promoteChannel(from = 'edge', to = 'stable'): BaselineLock {
  const fromChannel = assertChannel(from)
  const toChannel = assertChannel(to)
  if (from !== 'edge' || to !== 'stable') {
    fail('DSH_BASELINE_PROMOTION_INVALID', 'only edge-to-stable promotion is supported')
  }
  const source = preflightChannel(fromChannel)
  if (source.catalog === undefined) fail('DSH_BASELINE_CATALOG_MISSING', `${fromChannel} has no catalog`)
  const typedSource = source as LoadedChannel & { catalog: BaselineCatalog }
  const registry: EvidenceReport = { ...validateReport(source, 'registry', 'ready'), channel: toChannel }
  const verification: EvidenceReport = { ...validateReport(source, 'verification', 'passed'), channel: toChannel }
  // Relabeling the checked report changes its digest, not its dependency evidence.
  verification.registrySha256 = sha256(jsonText(registry))
  copyChannelFiles(typedSource, toChannel, registry, verification)
  verification.projectDigest = projectContractDigest(projectRoot)
  writeJsonAtomic(join(projectRoot, artifactPaths(toChannel).verification), verification)
  const updated = structuredClone(source.lock)
  if (updated.channels === undefined) fail('DSH_BASELINE_LOCK_UNSUPPORTED', 'promotion requires schema v2')
  updated.channels[toChannel] = channelRecord(
    typedSource.catalog,
    toChannel,
    resolveHarnessRoot(source),
    new Date().toISOString().slice(0, 10),
    registry,
    verification,
  )
  writeJsonAtomic(defaultLockPath, updated)
  return updated
}

function runInherited(
  command: string,
  args: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): void {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    fail('DSH_BASELINE_VERIFICATION_FAILED', `${command} ${args.join(' ')} exited ${result.status}`)
  }
}

export function verifyChannel(channel = 'edge', explicitRoot?: string): VerificationReport {
  const { loaded, harnessRoot } = checkLockedChannel(channel, explicitRoot)
  const catalogSummary = loaded.baseline.catalog
  if (catalogSummary === undefined) fail('DSH_BASELINE_CATALOG_MISSING', `${loaded.channel} has no catalog summary`)
  const packageManager = loaded.baseline.upstream.packageManager
  if (!/^pnpm@\d+\.\d+\.\d+(?:[-+].+)?$/.test(packageManager)) {
    fail('DSH_BASELINE_TOOLCHAIN_INVALID', `unsupported pinned package manager ${packageManager}`)
  }
  const registry = validateReport(loaded, 'registry')
  const registrySha256 = loaded.baseline.registry!.sha256
  const projectDigest = projectContractDigest(projectRoot)
  runInherited('npx', ['--yes', packageManager, 'verify'], {
    DSH_BASELINE_CHANNEL: loaded.channel,
    [loaded.baseline.localResolution?.environmentVariable ?? 'DSH_HARNESS_BASELINE_ROOT']: harnessRoot,
    DSH_HARNESS_ROOT: harnessRoot,
    CI: '1',
  })
  const current = loadLockedChannel(projectRoot, loaded.channel)
  if (projectContractDigest(projectRoot) !== projectDigest
    || current.baseline.catalog?.sha256 !== catalogSummary.sha256
    || current.baseline.registry?.sha256 !== registrySha256) {
    fail('DSH_BASELINE_REPORT_STALE', 'verification inputs changed during the run; rerun against unchanged inputs')
  }
  const report = sortObject({
    schemaVersion: 2,
    channel: loaded.channel,
    catalogSha256: catalogSummary.sha256,
    upstream: {
      tag: loaded.baseline.upstream.tag,
      commit: loaded.baseline.upstream.commit,
    },
    verifiedAt: new Date().toISOString(),
    status: 'passed',
    command: `npx --yes ${packageManager} verify`,
    projectDigest,
    registrySha256,
    registryStatus: registry.status,
  } satisfies VerificationReport)
  updateReportInLock(loaded, 'verification', report)
  return report
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const [command, ...rest] = argv
  const options: ParsedArguments = { command }
  const valueOptions = new Map<string, Exclude<keyof ParsedArguments, 'command' | 'json'>>([
    ['--channel', 'channel'],
    ['--harness-root', 'harnessRoot'],
    ['--tag', 'tag'],
    ['--from', 'from'],
    ['--to', 'to'],
    ['--capability', 'capability'],
    ['--registry', 'registry'],
  ])
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    if (argument === undefined) continue
    if (argument === '--json') {
      options.json = true
      continue
    }
    const key = valueOptions.get(argument)
    if (!key) fail('DSH_BASELINE_USAGE', `unknown argument: ${argument}`)
    const value = rest[index + 1]
    if (!value) fail('DSH_BASELINE_USAGE', `${argument} requires a value`)
    options[key] = value
    index += 1
  }
  return options
}

function diffText(diff: CatalogDiff, from: string, to: string): string {
  const lines = [`DSH baseline diff: ${from} -> ${to}`]
  for (const [field, value] of Object.entries(diff.upstream)) {
    lines.push(`upstream.${field}: ${value.from} -> ${value.to}`)
  }
  for (const section of ['packages', 'skills', 'toolClosure'] as const) {
    for (const kind of ['added', 'removed', 'changed'] as const) {
      const values = kind === 'changed' && section === 'toolClosure'
        ? undefined
        : diff[section][kind as keyof typeof diff[typeof section]]
      if (values?.length) lines.push(`${section}.${kind} (${values.length}): ${values.join(', ')}`)
    }
  }
  if (lines.length === 1) lines.push('no contract changes')
  return lines.join('\n')
}

function usage(): string {
  return [
    'Usage: baseline.mjs <command> [options]',
    '',
    'Commands:',
    '  scan             Scan a clean, tagged Harness worktree without writing',
    '  update           Write a candidate edge catalog (schema v1 migrates both channels)',
    '  diff             Compare two locked channel catalogs',
    '  check            Re-scan and verify a locked channel plus product Skill snapshots',
    '  registry-check   Check the exact publish/install closure through npm view',
    '  verify           Run the full repository verify command against one channel',
    '  preflight        Require ready Registry and passed verification reports',
    '  promote          Promote a verified, registry-ready channel',
    '',
    'Common options: --channel <name> --harness-root <path> --tag <tag> --json',
  ].join('\n')
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))
  if (!options.command || options.command === 'help') {
    console.log(usage())
    return
  }
  if (options.command === 'scan') {
    const root = options.harnessRoot || process.env.DSH_HARNESS_BASELINE_ROOT || process.env.DSH_HARNESS_ROOT
    if (!root) fail('DSH_BASELINE_USAGE', 'scan requires --harness-root or DSH_HARNESS_BASELINE_ROOT')
    const catalog = scanHarness(root, { tag: options.tag })
    console.log(options.json ? JSON.stringify(catalog, null, 2) : JSON.stringify(catalog.summary, null, 2))
    return
  }
  if (options.command === 'update') {
    const root = options.harnessRoot || process.env.DSH_HARNESS_BASELINE_ROOT || process.env.DSH_HARNESS_ROOT
    if (!root) fail('DSH_BASELINE_USAGE', 'update requires --harness-root or DSH_HARNESS_BASELINE_ROOT')
    const result = updateChannel({ harnessRoot: root, channel: options.channel ?? 'edge', tag: options.tag })
    console.log(`updated ${result.channels.join(' and ')} from ${result.catalog.upstream.tag}`)
    return
  }
  if (options.command === 'diff') {
    const from = loadLockedChannel(projectRoot, options.from ?? 'stable')
    const to = loadLockedChannel(projectRoot, options.to ?? 'edge')
    if (from.catalog === undefined || to.catalog === undefined) {
      fail('DSH_BASELINE_CATALOG_MISSING', 'diff requires schema v2 catalogs')
    }
    const diff = diffCatalogs(from.catalog, to.catalog)
    console.log(options.json ? JSON.stringify(diff, null, 2) : diffText(diff, from.channel, to.channel))
    return
  }
  if (options.command === 'check') {
    const result = checkLockedChannel(options.channel, options.harnessRoot)
    console.log(`checked ${result.loaded.channel} at ${result.scanned.upstream.tag}`)
    return
  }
  if (options.command === 'registry-check') {
    const loaded = loadLockedChannel(projectRoot, options.channel)
    if (loaded.catalog === undefined || loaded.baseline.catalog === undefined) {
      fail('DSH_BASELINE_CATALOG_MISSING', `${loaded.channel} has no catalog`)
    }
    const report = await buildRegistryReport({
      channel: loaded.channel,
      catalog: loaded.catalog,
      catalogSha256: loaded.baseline.catalog.sha256,
      capability: options.capability ?? 'tool',
      registry: options.registry,
    })
    updateReportInLock(loaded, 'registry', report)
    console.log(JSON.stringify({
      channel: loaded.channel,
      status: report.status,
      available: [...report.packages, ...report.externalRequirements].filter(entry => entry.available).length,
      blocked: [...report.packages, ...report.externalRequirements].filter(entry => !entry.available).length,
    }, null, 2))
    if (report.status !== 'ready') process.exitCode = 2
    return
  }
  if (options.command === 'verify') {
    const report = verifyChannel(options.channel ?? 'edge', options.harnessRoot)
    console.log(`verified ${report.channel} against ${report.upstream.tag}`)
    return
  }
  if (options.command === 'preflight') {
    const loaded = preflightChannel(options.channel ?? 'stable')
    console.log(`release preflight passed for ${loaded.channel}`)
    return
  }
  if (options.command === 'promote') {
    const from = options.from ?? 'edge'
    const to = options.to ?? 'stable'
    promoteChannel(from, to)
    console.log(`promoted ${from} to ${to}`)
    return
  }
  fail('DSH_BASELINE_USAGE', `unknown command: ${options.command}`)
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isMainModule()) {
  main().catch(error => {
    if (error instanceof BaselineError) {
      console.error(`[${error.code}] ${error.message}`)
      process.exitCode = 1
      return
    }
    throw error
  })
}
