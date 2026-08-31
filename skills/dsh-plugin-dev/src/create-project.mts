#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  access,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, basename, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginRoot = resolve(skillRoot, '..', '..')
const templateRoot = join(skillRoot, 'assets', 'tool-project')
const baselineLockPath = join(pluginRoot, 'dsh-reference.lock.json')

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const PLUGIN_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TOOL_NAME = /^[a-z][a-z0-9_]*$/
const ALLOWED_EMPTY_ENTRIES = new Set<string>(['.DS_Store', '.git'])
const RESERVED_TOOL_NAMES = new Set<string>(['run_code'])
const DELIVERY_MODES = new Set<string>(['source', 'registry'])
const LINKED_PACKAGE_NAMES = {
  CORDIS_LINK: '@deepseek-ai/cordis',
  LOADER_LINK: '@deepseek-ai/cordis-plugin-loader',
  INCLUDE_LINK: '@deepseek-ai/cordis-plugin-include',
  DSH_LLM_LINK: '@deepseek-ai/dsh-llm',
  SYSTEM_PROMPT_LINK: '@deepseek-ai/dsh-system-prompt',
  DSH_TOOLS_LINK: '@deepseek-ai/dsh-tools',
} as const
const DEFAULT_LINKED_PACKAGE_LOCATIONS: Readonly<Record<string, string>> = {
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/cordis-plugin-loader': 'vendor/loader',
  '@deepseek-ai/cordis-plugin-include': 'vendor/include',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-system-prompt': 'packages/core/system-prompt',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
}

type DeliveryMode = 'source' | 'registry'
type BaselineChannel = 'stable' | 'edge'
type VersionTuple = [number, number, number]

interface ProjectNames {
  packageName: string
  pluginName: string
  toolName: string
}

export interface CreateProjectOptions {
  target?: string | undefined
  kind?: string | undefined
  name?: string | undefined
  pluginName?: string | undefined
  toolName?: string | undefined
  description?: string | undefined
  harnessRoot?: string | undefined
  channel?: string | undefined
  delivery?: string | undefined
  json?: boolean | undefined
  help?: boolean | undefined
}

export interface CreateProjectResult extends ProjectNames {
  kind: 'tool'
  channel: BaselineChannel
  delivery: DeliveryMode
  target: string
  harnessRoot: string | undefined
  files: string[]
}

interface CatalogPackage {
  name: string
  version: string
}

interface GeneratorCatalog {
  capabilities: {
    tool: {
      linkedPackages: Record<string, string>
    }
  }
  toolchain: {
    dependencies: Record<string, string>
  }
  packages: CatalogPackage[]
}

interface UpstreamContract {
  repository: string
  tag: string
  version: string
  node: string
  packageManager: string
  commit: string
  docsDigest: string
}

interface EvidenceSummary {
  path: string
  sha256: string
  status?: string | undefined
  checkedAt?: string | null | undefined
}

interface BaselineRecord {
  upstream: UpstreamContract
  catalog: EvidenceSummary
  registry: EvidenceSummary
  localResolution?: {
    environmentVariable?: string | undefined
    fallbackRelativePath?: string | undefined
  } | undefined
  verifiedOn: string
}

interface RepositoryLock {
  schemaVersion: number
  defaultChannel: string
  channels: Record<string, BaselineRecord>
}

type LoadedBaseline = Omit<BaselineRecord, 'catalog'> & {
  channel: BaselineChannel
  catalog: GeneratorCatalog
  catalogDigest: string
}

interface RegistryReport {
  schemaVersion: number
  channel: string
  capability: string
  catalogSha256: string
  status: string
  checkedAt: string
  registry: string | null
  packages?: Array<{ available?: boolean }> | undefined
  externalRequirements?: Array<{ available?: boolean }> | undefined
}

interface RegistryEvidence {
  content: string
  digest: string
  report: RegistryReport
}

interface LinkedPackageManifest extends Record<string, unknown> {
  name?: unknown
  main?: unknown
  types?: unknown
}

type TemplateValues = Record<string, string>

export class ScaffoldError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ScaffoldError'
    this.code = code
  }
}

function fail(code: string, message: string): never {
  throw new ScaffoldError(code, message)
}

function normalizeSlug(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeDescription(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function validatePackageName(value: string): void {
  if (value.length > 214 || !PACKAGE_NAME.test(value)) {
    fail(
      'DSH_SCAFFOLD_INVALID_NAME',
      `package name must be a lowercase npm name: ${value}`,
    )
  }
}

function validatePluginName(value: string): void {
  if (value.length > 64 || !PLUGIN_NAME.test(value)) {
    fail(
      'DSH_SCAFFOLD_INVALID_NAME',
      `plugin name must be kebab-case and at most 64 characters: ${value}`,
    )
  }
}

function validateToolName(value: string): void {
  if (value.length > 64 || !TOOL_NAME.test(value)) {
    fail(
      'DSH_SCAFFOLD_INVALID_NAME',
      `tool name must be snake_case, start with a letter, and be at most 64 characters: ${value}`,
    )
  }
  if (RESERVED_TOOL_NAMES.has(value)) {
    fail(
      'DSH_SCAFFOLD_RESERVED_NAME',
      `tool name is reserved by the Harness runtime and cannot be registered: ${value}`,
    )
  }
}

function compareVersions(left: VersionTuple, right: VersionTuple): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!
    if (difference !== 0) return difference
  }
  return 0
}

function parseVersion(value: string): VersionTuple | undefined {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)/.exec(value)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

export function nodeSatisfies(range: string, version = process.version): boolean {
  const actual = parseVersion(version)
  if (!actual) return false
  return range.split('||').some(rawClause => {
    const clause = rawClause.trim()
    const minimum = parseVersion(clause.replace(/^(?:\^|>=)\s*/, ''))
    if (!minimum || compareVersions(actual, minimum) < 0) return false
    if (clause.startsWith('>=')) return true
    if (clause.startsWith('^')) {
      const ceiling: VersionTuple = minimum[0] > 0
        ? [minimum[0] + 1, 0, 0]
        : minimum[1] > 0
          ? [0, minimum[1] + 1, 0]
          : [0, 0, minimum[2] + 1]
      return compareVersions(actual, ceiling) < 0
    }
    return compareVersions(actual, minimum) === 0
  })
}

function deriveNames(target: string, options: CreateProjectOptions): ProjectNames {
  const targetSlug = normalizeSlug(basename(target))
  if (!targetSlug && !options.name) {
    fail('DSH_SCAFFOLD_INVALID_NAME', 'cannot derive a package name from the target directory')
  }

  const packageName = options.name ?? (targetSlug.startsWith('dsh-') ? targetSlug : `dsh-${targetSlug}`)
  validatePackageName(packageName)

  const packageLeaf = packageName.includes('/') ? packageName.split('/').at(-1)! : packageName
  const defaultPluginName = normalizeSlug(packageLeaf.replace(/^dsh-/, ''))
  const pluginName = options.pluginName ?? defaultPluginName
  validatePluginName(pluginName)

  const toolName = options.toolName ?? pluginName.replaceAll('-', '_')
  validateToolName(toolName)

  return { packageName, pluginName, toolName }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push(absolute)
    }
  }
  await visit(root)
  return files.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

async function digestDocs(sourceRoot: string): Promise<string> {
  const docsRoot = join(sourceRoot, 'docs')
  if (!await exists(docsRoot) || !(await stat(docsRoot)).isDirectory()) {
    fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `Harness docs directory is missing: ${docsRoot}`)
  }
  const aggregate = createHash('sha256')
  for (const absolute of await listFiles(docsRoot)) {
    const fileDigest = createHash('sha256').update(await readFile(absolute)).digest('hex')
    const sourceRelative = relative(sourceRoot, absolute).split(sep).join('/')
    aggregate.update(`${fileDigest}  ${sourceRelative}\n`)
  }
  return aggregate.digest('hex')
}

function gitHead(sourceRoot: string): string {
  const result = spawnSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    fail(
      'DSH_SCAFFOLD_HARNESS_MISMATCH',
      result.stderr.trim() || `cannot read Harness Git HEAD at ${sourceRoot}`,
    )
  }
  return result.stdout.trim()
}

export function harnessWorktreeChanges(sourceRoot: string): string {
  const statusCommands: readonly (readonly string[])[] = [
    ['status', '--porcelain=v1', '--untracked-files=all'],
    ['status', '--porcelain=v1', '--ignored=matching', '--untracked-files=all', '--', '.env'],
  ]
  const changes = new Set<string>()
  for (const args of statusCommands) {
    const result = spawnSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8' })
    if (result.status !== 0) {
      fail(
        'DSH_SCAFFOLD_HARNESS_MISMATCH',
        result.stderr.trim() || `cannot inspect Harness runtime worktree at ${sourceRoot}`,
      )
    }
    for (const line of result.stdout.split(/\r?\n/)) {
      if (line) changes.add(line)
    }
  }
  return [...changes].join('\n')
}

export async function validateHarnessArtifacts(
  sourceRoot: string,
  linkedPackageLocations: Readonly<Record<string, string>> = DEFAULT_LINKED_PACKAGE_LOCATIONS,
): Promise<void> {
  for (const packagePath of Object.values(linkedPackageLocations)) {
    const packageRoot = resolve(sourceRoot, packagePath)
    if (packageRoot === sourceRoot || !packageRoot.startsWith(`${sourceRoot}${sep}`)) {
      fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `linked package path escapes Harness root: ${packagePath}`)
    }
    let manifest: LinkedPackageManifest
    try {
      manifest = JSON.parse(
        await readFile(join(packageRoot, 'package.json'), 'utf8'),
      ) as LinkedPackageManifest
    } catch (error) {
      fail(
        'DSH_SCAFFOLD_HARNESS_ARTIFACT_MISSING',
        `cannot read linked Harness package ${packagePath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    const entryFields = ['main', 'types'] as const
    const entries = await Promise.all(entryFields.map(async field => {
      const value = manifest[field]
      if (typeof value !== 'string' || !await exists(join(packageRoot, value))) {
        fail(
          'DSH_SCAFFOLD_HARNESS_ARTIFACT_MISSING',
          `linked Harness package ${String(manifest.name ?? packagePath)} is missing its built ${field} entry; run pnpm install && pnpm run build in ${sourceRoot}`,
        )
      }
      return { field, value }
    }))

    const inputPaths = [join(packageRoot, 'package.json')]
    const sourceDirectory = join(packageRoot, 'src')
    if (await exists(sourceDirectory)) inputPaths.push(...await listFiles(sourceDirectory))
    const newestInput = Math.max(...await Promise.all(inputPaths.map(async path => (await stat(path)).mtimeMs)))
    for (const entry of entries) {
      const artifactPath = join(packageRoot, entry.value)
      if ((await stat(artifactPath)).mtimeMs < newestInput) {
        fail(
          'DSH_SCAFFOLD_HARNESS_ARTIFACT_STALE',
          `linked Harness package ${String(manifest.name ?? packagePath)} has a stale ${entry.field} entry; rebuild ${sourceRoot}`,
        )
      }
    }
  }
}

async function loadBaselineLock(requestedChannel?: string): Promise<LoadedBaseline> {
  try {
    const repositoryLock = JSON.parse(
      await readFile(baselineLockPath, 'utf8'),
    ) as RepositoryLock
    if (repositoryLock.schemaVersion !== 2) {
      fail(
        'DSH_SCAFFOLD_HARNESS_MISMATCH',
        `generator baseline schema ${repositoryLock.schemaVersion} is unsupported; run the baseline upgrade workflow`,
      )
    }
    const channel = requestedChannel
      ?? process.env.DSH_BASELINE_CHANNEL
      ?? repositoryLock.defaultChannel
    if (typeof channel !== 'string' || !['stable', 'edge'].includes(channel)) {
      fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `baseline channel must be stable or edge: ${channel}`)
    }
    const typedChannel = channel as BaselineChannel
    const baseline = repositoryLock.channels?.[typedChannel]
    if (!baseline) {
      fail(
        'DSH_SCAFFOLD_HARNESS_MISMATCH',
        `unknown baseline channel ${channel}; available: ${Object.keys(repositoryLock.channels ?? {}).sort().join(', ')}`,
      )
    }
    const catalogPath = resolve(pluginRoot, baseline.catalog?.path ?? '')
    if (catalogPath === pluginRoot || !catalogPath.startsWith(`${pluginRoot}${sep}`)) {
      fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `baseline catalog escapes the Plugin root: ${catalogPath}`)
    }
    const catalogContent = await readFile(catalogPath, 'utf8')
    const catalogDigest = createHash('sha256').update(catalogContent).digest('hex')
    if (catalogDigest !== baseline.catalog?.sha256) {
      fail(
        'DSH_SCAFFOLD_HARNESS_MISMATCH',
        `baseline channel ${channel} catalog digest does not match ${catalogPath}`,
      )
    }
    const catalog = JSON.parse(catalogContent)
    return {
      channel: typedChannel,
      ...baseline,
      catalog: catalog as GeneratorCatalog,
      catalogDigest,
    }
  } catch (error) {
    if (error instanceof ScaffoldError) throw error
    fail(
      'DSH_SCAFFOLD_HARNESS_MISMATCH',
      `cannot read generator baseline ${baselineLockPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function loadRegistryReport(lock: LoadedBaseline): Promise<RegistryEvidence> {
  const summary = lock.registry
  if (summary?.status !== 'ready') {
    fail(
      'DSH_SCAFFOLD_REGISTRY_UNREADY',
      `baseline channel ${lock.channel} Registry closure is ${summary?.status ?? 'missing'}; run the baseline Registry check before selecting registry delivery`,
    )
  }

  const reportPath = resolve(pluginRoot, summary.path ?? '')
  if (reportPath === pluginRoot || !reportPath.startsWith(`${pluginRoot}${sep}`)) {
    fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `baseline Registry report escapes the Plugin root: ${reportPath}`)
  }

  let content: string
  let report: RegistryReport
  try {
    content = await readFile(reportPath, 'utf8')
    report = JSON.parse(content) as RegistryReport
  } catch (error) {
    fail(
      'DSH_SCAFFOLD_HARNESS_MISMATCH',
      `cannot read baseline Registry report ${reportPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const digest = createHash('sha256').update(content).digest('hex')
  const invalid = (
    digest !== summary.sha256
    || report.schemaVersion !== 1
    || report.channel !== lock.channel
    || report.capability !== 'tool'
    || report.catalogSha256 !== lock.catalogDigest
    || report.status !== 'ready'
    || report.checkedAt !== summary.checkedAt
    || ![...(report.packages ?? []), ...(report.externalRequirements ?? [])]
      .every((entry: { available?: boolean }) => entry.available === true)
  )
  if (invalid) {
    fail(
      'DSH_SCAFFOLD_REGISTRY_UNREADY',
      `baseline channel ${lock.channel} Registry report is stale, incomplete, or inconsistent with its lock`,
    )
  }
  return { content, digest, report }
}

async function validateHarnessRoot(sourceRoot: string, lock: LoadedBaseline): Promise<string> {
  let manifest: {
    version?: unknown
    engines?: { node?: unknown }
    packageManager?: unknown
  }
  try {
    manifest = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8')) as typeof manifest
  } catch (error) {
    fail(
      'DSH_SCAFFOLD_HARNESS_MISMATCH',
      `cannot read Harness package.json at ${sourceRoot}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const actual = {
    version: manifest.version,
    node: manifest.engines?.node,
    packageManager: manifest.packageManager,
    commit: gitHead(sourceRoot),
    docsDigest: await digestDocs(sourceRoot),
  }
  const expected = lock.upstream
  const mismatches = (Object.keys(actual) as Array<keyof typeof actual>)
    .filter(key => actual[key] !== expected[key])
    .map(key => `${key}: expected ${expected[key]}, received ${actual[key]}`)
  if (mismatches.length > 0) {
    fail(
      'DSH_SCAFFOLD_HARNESS_MISMATCH',
      `Harness source at ${sourceRoot} does not match the audited baseline (${mismatches.join('; ')})`,
    )
  }

  if (!nodeSatisfies(expected.node)) {
    fail(
      'DSH_SCAFFOLD_NODE_UNSUPPORTED',
      `Node ${process.version} does not satisfy the pinned Harness engine ${expected.node}`,
    )
  }
  const dirty = harnessWorktreeChanges(sourceRoot)
  if (dirty) {
    fail(
      'DSH_SCAFFOLD_HARNESS_DIRTY',
      `Harness worktree has changes and is not the exact audited snapshot:\n${dirty}`,
    )
  }
  await validateHarnessArtifacts(sourceRoot, lock.catalog?.capabilities?.tool?.linkedPackages)

  return realpath(sourceRoot)
}

async function canonicalTarget(path: string): Promise<string> {
  if (await exists(path)) return realpath(path)
  try {
    return join(await realpath(dirname(path)), basename(path))
  } catch {
    return path
  }
}

async function resolveHarnessRoot({
  explicitRoot,
  target,
  lock,
}: {
  explicitRoot?: string | undefined
  target: string
  lock: LoadedBaseline
}): Promise<string> {
  const environmentName = lock.localResolution?.environmentVariable ?? 'DSH_HARNESS_ROOT'
  const environmentRoot = process.env[environmentName]
  const genericEnvironmentRoot = environmentName === 'DSH_HARNESS_ROOT'
    ? undefined
    : process.env.DSH_HARNESS_ROOT
  const lockedFallback = lock.localResolution?.fallbackRelativePath
  const candidates = explicitRoot
    ? [explicitRoot]
    : environmentRoot
      ? [environmentRoot]
      : [
          resolve(target, '..', 'deepseek-harness'),
          ...(lockedFallback ? [resolve(pluginRoot, lockedFallback)] : []),
          ...(genericEnvironmentRoot ? [genericEnvironmentRoot] : []),
        ]

  for (const candidate of [...new Set(candidates.map(value => resolve(value)))]) {
    if (await exists(candidate)) return validateHarnessRoot(candidate, lock)
  }

  fail(
    'DSH_SCAFFOLD_HARNESS_NOT_FOUND',
    `no audited Harness checkout found; pass --harness-root or set ${environmentName}`,
  )
}

function relativeProjectPath(projectRoot: string, target: string): string {
  let value = relative(projectRoot, target).split(sep).join('/')
  if (!value.startsWith('.')) value = `./${value}`
  return value
}

function jsonContent(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}

function requireCatalogPackage(catalog: GeneratorCatalog, name: string): CatalogPackage {
  const entry = catalog.packages?.find(candidate => candidate.name === name)
  if (!entry) {
    fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `baseline catalog is missing ${name}`)
  }
  return entry
}

function requireToolchainDependency(catalog: GeneratorCatalog, name: string): string {
  const version = catalog.toolchain?.dependencies?.[name]
  if (typeof version !== 'string' || version.length === 0) {
    fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `baseline catalog is missing Tool dependency ${name}`)
  }
  return version
}

function templateValues({
  target,
  harnessRoot,
  lock,
  registryEvidence,
  delivery,
  description,
  names,
}: {
  target: string
  harnessRoot: string | undefined
  lock: LoadedBaseline
  registryEvidence: RegistryEvidence | undefined
  delivery: DeliveryMode
  description: string
  names: ProjectNames
}): TemplateValues {
  if (delivery === 'source' && harnessRoot === undefined) {
    fail('DSH_SCAFFOLD_HARNESS_NOT_FOUND', 'source delivery requires an audited Harness root')
  }
  if (delivery === 'registry' && registryEvidence === undefined) {
    fail('DSH_SCAFFOLD_REGISTRY_UNREADY', 'registry delivery requires ready Registry evidence')
  }
  const linkedPackages = lock.catalog?.capabilities?.tool?.linkedPackages
  if (!linkedPackages) {
    fail('DSH_SCAFFOLD_HARNESS_MISMATCH', 'baseline catalog has no Tool linked-package contract')
  }
  const cordisVersion = requireCatalogPackage(lock.catalog, '@deepseek-ai/cordis').version
  const toolsVersion = requireCatalogPackage(lock.catalog, '@deepseek-ai/dsh-tools').version
  const schemasteryVersion = requireCatalogPackage(lock.catalog, '@deepseek-ai/schemastery').version
  const developmentDependencies: Record<string, string> = {}
  for (const packageName of Object.values(LINKED_PACKAGE_NAMES)) {
    const path = linkedPackages[packageName]
    if (!path) fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `Tool link contract is missing ${packageName}`)
    developmentDependencies[packageName] = delivery === 'source'
      ? `link:${relativeProjectPath(target, join(harnessRoot!, path))}`
      : requireCatalogPackage(lock.catalog, packageName).version
  }
  const deliveryLock = delivery === 'source'
    ? { mode: 'source' }
    : {
        mode: 'registry',
        status: registryEvidence!.report.status,
        checkedAt: registryEvidence!.report.checkedAt,
        reportPath: 'dsh-registry.lock.json',
        reportSha256: registryEvidence!.digest,
        registry: registryEvidence!.report.registry,
      }
  const localResolution = delivery === 'source'
    ? {
        environmentVariable: 'DSH_HARNESS_ROOT',
        fallbackRelativePath: relativeProjectPath(target, harnessRoot!),
      }
    : null
  const sourceDelivery = delivery === 'source'
  const values: TemplateValues = {
    PACKAGE_NAME: names.packageName,
    PLUGIN_NAME: names.pluginName,
    TOOL_NAME: names.toolName,
    ROW_ID: names.pluginName,
    DESCRIPTION: description,
    DESCRIPTION_LITERAL: JSON.stringify(description),
    DELIVERY_MODE: delivery,
    BASELINE_CHANNEL: lock.channel,
    HARNESS_REPOSITORY: lock.upstream.repository,
    HARNESS_TAG: lock.upstream.tag,
    HARNESS_VERSION: lock.upstream.version,
    NODE_ENGINE: lock.upstream.node,
    PACKAGE_MANAGER: lock.upstream.packageManager,
    HARNESS_COMMIT: lock.upstream.commit,
    HARNESS_DOCS_DIGEST: lock.upstream.docsDigest,
    HARNESS_CATALOG_DIGEST: lock.catalogDigest,
    HARNESS_VERIFIED_ON: lock.verifiedOn,
    CORDIS_PEER_VERSION: `^${cordisVersion}`,
    DSH_TOOLS_VERSION: toolsVersion,
    SCHEMASTERY_VERSION: schemasteryVersion,
    TYPES_NODE_VERSION: requireToolchainDependency(lock.catalog, '@types/node'),
    TYPESCRIPT_VERSION: requireToolchainDependency(lock.catalog, 'typescript'),
    VITEST_VERSION: requireToolchainDependency(lock.catalog, 'vitest'),
    EXPECTED_LINKS_JSON: JSON.stringify(linkedPackages, null, 2),
    EXPECTED_DEVELOPMENT_DEPENDENCIES_JSON: JSON.stringify(developmentDependencies, null, 2),
    DELIVERY_JSON: JSON.stringify(deliveryLock, null, 2),
    LOCAL_RESOLUTION_JSON: JSON.stringify(localResolution, null, 2),
    REGISTRY_REPORT_JSON: registryEvidence?.content.trimEnd() ?? '',
    PACKAGE_DELIVERY_FIELDS: delivery === 'source'
      ? '"private": true,'
      : '"private": false,\n  "publishConfig": {\n    "access": "public"\n  },',
    CONTEXT_STRICT_COMMAND: delivery === 'source'
      ? 'node scripts/verify-dsh-context.mjs --require-source'
      : 'node scripts/verify-dsh-context.mjs --require-registry',
    CONTEXT_SYNC_SCRIPT_ENTRY: delivery === 'source'
      ? '    "context:sync": "node scripts/verify-dsh-context.mjs --sync-links --require-source && pnpm install --no-frozen-lockfile",\n'
      : '',
    PROJECT_INTRO: sourceDelivery
      ? `This project is a source-linked DeepSeek Harness Tool plugin scaffold generated by \`dsh-plugin-dev\`. The baseline registers \`${names.toolName}\`, validates one string input, and returns a canonical \`{ value }\` result. Replace that normalization body and its tests with the requested business operation before treating the plugin as complete.`
      : `This project is a Registry-delivered DeepSeek Harness Tool plugin scaffold generated by \`dsh-plugin-dev\`. The baseline registers \`${names.toolName}\`, validates one string input, and returns a canonical \`{ value }\` result. Replace that normalization body and its tests with the requested business operation before treating the plugin as complete.`,
    DEVELOPMENT_CONTEXT: sourceDelivery
      ? `The project targets DeepSeek Harness \`${lock.upstream.version}\` at commit \`${lock.upstream.commit}\` and requires Node \`${lock.upstream.node}\`. Its tracked/non-ignored source inputs must be clean, its root must not contain a CLI-loaded \`.env\`, and it must be built (\`pnpm install && pnpm run build\`) because source-linked packages expose their generated \`lib/\` entries.`
      : `The project targets DeepSeek Harness \`${lock.upstream.version}\` at commit \`${lock.upstream.commit}\` and requires Node \`${lock.upstream.node}\`. Its exact ordinary dependency versions come from the audited \`${lock.channel}\` catalog, and \`dsh-registry.lock.json\` records the ready Registry closure checked at \`${registryEvidence!.report.checkedAt}\`. No local Harness checkout is required for installation or verification.`,
    CONTEXT_SYNC_SECTION: sourceDelivery
      ? `If the Harness checkout moves, point at the new location and synchronize the\nsix development links plus the package-manager lock:\n\n\`\`\`sh\nDSH_HARNESS_ROOT=/new/path/to/deepseek-harness pnpm context:sync\n\`\`\``
      : 'Registry delivery has no `context:sync` command. Upgrade dependency versions only through a reviewed DSH baseline migration with fresh Registry evidence.',
    VERIFY_CONTEXT_DESCRIPTION: sourceDelivery
      ? 'checks the pinned clean source and linked build entries'
      : 'checks the pinned Registry evidence and exact ordinary dependency specifications',
    DELIVERY_STATUS_TEXT: sourceDelivery
      ? 'This source-delivered project uses development links to the local pinned Harness checkout and remains `private: true`. Passing local tests proves compatibility with that source snapshot, not independent npm publication readiness. Regenerate with `--delivery registry` only against a baseline whose Registry closure is recorded as `ready`.'
      : `The audited Tool dependency closure was Registry-ready at \`${registryEvidence!.report.checkedAt}\`. This package uses ordinary exact development dependencies, contains no \`link:\` or \`workspace:\` specifier, and is configured with \`private: false\` plus public access. That evidence enables publication work; publish only after the real business behavior, clean packed-artifact install, and DSH profile add/dump/boot/remove smoke all pass.`,
    AGENT_CONTEXT_POLICY: sourceDelivery
      ? 'Before dependencies are installed, run `node scripts/verify-dsh-context.mjs` before planning and add `--require-source` before implementation. After `pnpm install`, use `pnpm context:check` and `pnpm context:check:strict` normally. Stop and report a lock mismatch instead of developing against another Harness contract.\n\nAfter moving the pinned Harness checkout or changing `DSH_HARNESS_ROOT`, run\n`pnpm context:sync`; it rewrites the links and refreshes the dependency lock.\nThe environment variable alone does not rewrite package-manager links.'
      : 'Before dependencies are installed, run `node scripts/verify-dsh-context.mjs --require-registry`. After `pnpm install`, use `pnpm context:check` and `pnpm context:check:strict` normally. Stop and report a lock or Registry-evidence mismatch instead of changing versions ad hoc. Registry delivery has no local Harness root and no `context:sync` command.',
    DELIVERY_BOUNDARY: sourceDelivery
      ? 'the source-linked publication boundary'
      : 'the audited Registry-delivery and publication boundary',
    CONTRACT_DELIVERY_BULLETS: sourceDelivery
      ? '- Development route: local source overlay against the audited Harness lock.\n- Publication status: blocked for this generated package while its dependencies remain source-linked.'
      : `- Development route: exact ordinary Registry dependencies backed by \`dsh-registry.lock.json\`.\n- Publication status: enabled for release preparation by Registry evidence checked at \`${registryEvidence!.report.checkedAt}\`; final publication still requires the project-specific release ladder.`,
    CONTRACT_CONTEXT_STEP: sourceDelivery
      ? '5. Run `node scripts/verify-dsh-context.mjs --require-source` before changing\n   runtime behavior; after `pnpm install`, the equivalent command is\n   `pnpm context:check:strict`.'
      : '5. Run `node scripts/verify-dsh-context.mjs --require-registry` before changing runtime behavior; after `pnpm install`, use `pnpm context:check:strict`.',
    CONTRACT_DELIVERY_INVARIANTS: sourceDelivery
      ? '- Do not replace source-linked dependencies with guessed Registry versions or claim publication readiness without a clean external closure.\n- When the Harness checkout moves, run `pnpm context:sync` to rewrite the\n  development links and dependency lock; changing `DSH_HARNESS_ROOT` alone\n  does neither.'
      : '- Keep ordinary dependency versions aligned with the audited catalog and `dsh-registry.lock.json`; do not introduce `link:` or `workspace:` specifications.\n- Refresh Registry evidence and repeat clean packed-artifact/profile verification before publishing after any DSH baseline change.',
    TODO_BASELINE_BINDING: sourceDelivery
      ? '- [x] Bind development dependencies to the audited local Harness source.'
      : '- [x] Bind ordinary development dependencies to the audited Registry-ready DSH closure.',
    TODO_DELIVERY_ITEMS: sourceDelivery
      ? '- [ ] Update this README with the exact Model Experience, configuration, authority, limits, and operational setup.\n- [ ] Recheck every DSH dependency for public availability.\n- [ ] Keep `private: true` until an ordinary clean-directory install and packed-artifact profile smoke pass without source links.'
      : '- [ ] Update this README with the exact Model Experience, configuration, authority, limits, and operational setup.\n- [ ] Run a clean-directory install of the final ordinary dependency graph.\n- [ ] Pack the final artifact and pass DSH profile add, effective dump, real boot, behavior, remove, and post-remove absence checks.\n- [ ] Publish the exact verified archive through the intended Registry/account workflow.',
    TODO_DEFINITION: sourceDelivery
      ? 'The generated baseline is not the finished business capability. Completion requires the real operation, all applicable tests, `pnpm verify`, an external-world assertion, honest source-linked delivery status, and an updated TODO.'
      : 'The generated baseline is not the finished business capability. Completion requires the real operation, all applicable tests, `pnpm verify`, an external-world assertion, clean packed-artifact/profile verification, an updated TODO, and publication of the exact verified archive when release is requested.',
  }
  for (const [key, packageName] of Object.entries(LINKED_PACKAGE_NAMES)) {
    values[key] = developmentDependencies[packageName]!
  }
  return values
}

function renderTemplate(
  content: string,
  values: Readonly<TemplateValues>,
  sourcePath: string,
): string {
  let rendered = content
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`__${key}__`, jsonContent(value))
    rendered = rendered.replaceAll(`__${key}_RAW__`, value)
  }
  const unresolved = rendered.match(/__[A-Z0-9_]+__/g)
  if (unresolved) {
    fail(
      'DSH_SCAFFOLD_USAGE',
      `template ${sourcePath} contains unresolved placeholders: ${[...new Set(unresolved)].join(', ')}`,
    )
  }
  return rendered
}

async function assertEmptyTarget(target: string): Promise<void> {
  if (!await exists(target)) return
  const targetState = await stat(target)
  if (!targetState.isDirectory()) {
    fail('DSH_SCAFFOLD_TARGET_NOT_EMPTY', `target is not a directory: ${target}`)
  }
  const material = (await readdir(target)).filter(entry => !ALLOWED_EMPTY_ENTRIES.has(entry))
  if (material.length > 0) {
    fail(
      'DSH_SCAFFOLD_TARGET_NOT_EMPTY',
      `target contains project material: ${material.sort().join(', ')}`,
    )
  }
}

export async function createProject(options: CreateProjectOptions = {}): Promise<CreateProjectResult> {
  const requestedTarget = resolve(options.target ?? process.cwd())
  const target = await canonicalTarget(requestedTarget)
  const kind = options.kind ?? 'tool'
  if (kind !== 'tool') {
    fail(
      'DSH_SCAFFOLD_UNSUPPORTED_KIND',
      `deterministic scaffolding is not available for kind ${kind}; supported kinds: tool`,
    )
  }

  const requestedDelivery = options.delivery ?? 'source'
  if (!DELIVERY_MODES.has(requestedDelivery)) {
    fail(
      'DSH_SCAFFOLD_UNSUPPORTED_DELIVERY',
      `delivery must be source or registry: ${requestedDelivery}`,
    )
  }
  const delivery = requestedDelivery as DeliveryMode
  if (delivery === 'registry' && options.harnessRoot) {
    fail(
      'DSH_SCAFFOLD_USAGE',
      '--harness-root is only valid with source delivery',
    )
  }

  const description = normalizeDescription(options.description ?? '')
  if (description.length === 0 || description.length > 300) {
    fail(
      'DSH_SCAFFOLD_INVALID_DESCRIPTION',
      'description must contain between 1 and 300 characters after whitespace normalization',
    )
  }

  const names = deriveNames(target, options)
  await assertEmptyTarget(target)
  const lock = await loadBaselineLock(options.channel)
  if (!nodeSatisfies(lock.upstream.node)) {
    fail(
      'DSH_SCAFFOLD_NODE_UNSUPPORTED',
      `Node ${process.version} does not satisfy the pinned Harness engine ${lock.upstream.node}`,
    )
  }
  const registryEvidence = delivery === 'registry' ? await loadRegistryReport(lock) : undefined
  const harnessRoot = delivery === 'source'
    ? await resolveHarnessRoot({
        explicitRoot: options.harnessRoot,
        target,
        lock,
      })
    : undefined
  const values = templateValues({
    target,
    harnessRoot,
    lock,
    registryEvidence,
    delivery,
    description,
    names,
  })

  const templates = await listFiles(templateRoot)
  const outputs: Array<{ outputPath: string; outputRelative: string; content: string }> = []
  for (const template of templates) {
    const templateRelative = relative(templateRoot, template).split(sep).join('/')
    if (!templateRelative.endsWith('.tmpl')) continue
    const outputRelative = templateRelative.slice(0, -'.tmpl'.length)
    if (outputRelative === 'dsh-registry.lock.json' && delivery !== 'registry') continue
    const outputPath = join(target, ...outputRelative.split('/'))
    if (await exists(outputPath)) {
      fail('DSH_SCAFFOLD_TARGET_COLLISION', `refusing to overwrite ${outputPath}`)
    }
    outputs.push({
      outputPath,
      outputRelative,
      content: renderTemplate(await readFile(template, 'utf8'), values, templateRelative),
    })
  }
  if (outputs.length === 0) {
    fail('DSH_SCAFFOLD_USAGE', `no templates found under ${templateRoot}`)
  }

  await mkdir(target, { recursive: true })
  for (const output of outputs) {
    await mkdir(dirname(output.outputPath), { recursive: true })
    try {
      await writeFile(output.outputPath, output.content, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        fail('DSH_SCAFFOLD_TARGET_COLLISION', `refusing to overwrite ${output.outputPath}`)
      }
      throw error
    }
  }

  return {
    kind,
    channel: lock.channel,
    delivery,
    target,
    harnessRoot,
    ...names,
    files: outputs.map(output => output.outputRelative).sort(),
  }
}

function usage(): string {
  return [
    'Usage: create-project.mjs --description <text> [options]',
    '',
    'Options:',
    '  --target <directory>      Project directory (default: current directory)',
    '  --kind tool               Deterministic DSH scaffold kind (default: tool)',
    '  --name <package-name>      Lowercase npm package name',
    '  --plugin-name <name>       Kebab-case Cordis plugin name',
    '  --tool-name <name>         Snake_case model-facing tool name',
    '  --description <text>       Model-visible product operation (required)',
    '  --harness-root <path>      Audited DeepSeek Harness checkout',
    '  --channel stable|edge      Audited baseline channel (default: stable)',
    '  --delivery source|registry Development source overlay or publishable Registry closure (default: source)',
    '  --json                     Print the result as JSON',
    '  --help                     Show this help',
  ].join('\n')
}

export function parseArgs(argv: readonly string[]): CreateProjectOptions {
  const options: CreateProjectOptions = {}
  const valueOptions = new Map<string, Exclude<keyof CreateProjectOptions, 'json' | 'help'>>([
    ['--target', 'target'],
    ['--kind', 'kind'],
    ['--name', 'name'],
    ['--plugin-name', 'pluginName'],
    ['--tool-name', 'toolName'],
    ['--description', 'description'],
    ['--harness-root', 'harnessRoot'],
    ['--channel', 'channel'],
    ['--delivery', 'delivery'],
  ])

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === undefined) continue
    if (argument === '--help') {
      options.help = true
      continue
    }
    if (argument === '--json') {
      options.json = true
      continue
    }
    const key = valueOptions.get(argument)
    if (!key) fail('DSH_SCAFFOLD_USAGE', `unknown argument: ${argument}`)
    const value = argv[index + 1]
    if (!value) fail('DSH_SCAFFOLD_USAGE', `${argument} requires a value`)
    options[key] = value
    index += 1
  }
  return options
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      console.log(usage())
      return
    }
    const result = await createProject(options)
    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
      return
    }
    console.log(`created ${result.kind} scaffold at ${result.target}`)
    console.log(`package: ${result.packageName}`)
    console.log(`plugin: ${result.pluginName}`)
    console.log(`tool: ${result.toolName}`)
    console.log(`delivery: ${result.delivery}`)
    if (result.harnessRoot) console.log(`Harness: ${result.harnessRoot}`)
    console.log(`channel: ${result.channel}`)
    console.log('next: pnpm install && pnpm verify')
  } catch (error) {
    if (error instanceof ScaffoldError) {
      console.error(`[${error.code}] ${error.message}`)
      process.exitCode = 1
      return
    }
    throw error
  }
}

async function isMainModule(): Promise<boolean> {
  if (!process.argv[1]) return false
  try {
    return await realpath(fileURLToPath(import.meta.url)) === await realpath(resolve(process.argv[1]))
  } catch {
    return import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  }
}

if (await isMainModule()) {
  await main()
}
