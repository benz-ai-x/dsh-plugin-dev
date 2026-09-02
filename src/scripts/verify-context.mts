#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BaselineError, loadLockedChannel, sha256 } from './baseline.mjs'
import type { LoadedChannel } from './baseline.mjs'

type VersionTuple = [number, number, number]

interface PackageJson {
  name?: unknown
  version?: unknown
  private?: unknown
  license?: unknown
  type?: unknown
  packageManager?: unknown
  engines?: { node?: unknown }
  scripts?: Record<string, string>
  files?: string[]
}

interface PluginManifest {
  name?: unknown
  version?: unknown
  license?: unknown
  skills?: string
  interface?: { capabilities?: string[] }
}

interface LockJson {
  schemaVersion?: unknown
  defaultChannel?: unknown
  channels?: Record<string, unknown>
}

interface LinkedPackageManifest {
  main?: unknown
  types?: unknown
}

interface ToolingArtifactRecord {
  source: string
  runtime: string
  declaration: string
  sourceSha256: string
  runtimeSha256: string
  declarationSha256: string
}

interface ToolingArtifactManifest {
  schemaVersion: number
  compiler: string
  artifacts: ToolingArtifactRecord[]
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireSource = process.argv.includes('--require-source')
const channelIndex = process.argv.indexOf('--channel')
const requestedChannel = channelIndex >= 0 ? process.argv[channelIndex + 1] : undefined
const failures: string[] = []
const warnings: string[] = []
const passes: string[] = []

function pass(message: string): void {
  passes.push(message)
}

function fail(message: string): void {
  failures.push(message)
}

function warn(message: string): void {
  warnings.push(message)
}

function check(condition: unknown, message: string): void {
  if (condition) pass(message)
  else fail(message)
}

function projectPath(path: string): string {
  return join(projectRoot, path)
}

function readProjectFile(path: string): string {
  const absolute = projectPath(path)
  if (!existsSync(absolute)) {
    fail(`missing ${path}`)
    return ''
  }
  return readFileSync(absolute, 'utf8')
}

function parseJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readProjectFile(path)) as T
  } catch (error) {
    fail(`${path} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function parseFrontmatter(path: string, content: string): Map<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!match) {
    fail(`${path} has no YAML frontmatter`)
    return new Map()
  }
  const fields = new Map<string, string>()
  for (const line of match[1]!.split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (field) fields.set(field[1]!, field[2]!.replace(/^['"]|['"]$/g, ''))
  }
  return fields
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return []
  const result: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) result.push(absolute)
    }
  }
  visit(root)
  return result.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function digestDocs(sourceRoot: string): string {
  const docsRoot = join(sourceRoot, 'docs')
  if (!existsSync(docsRoot) || !statSync(docsRoot).isDirectory()) {
    throw new Error(`missing docs directory under ${sourceRoot}`)
  }
  const aggregate = createHash('sha256')
  for (const absolute of listFiles(docsRoot)) {
    const fileDigest = createHash('sha256').update(readFileSync(absolute)).digest('hex')
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
    throw new Error(result.stderr.trim() || `git rev-parse failed for ${sourceRoot}`)
  }
  return result.stdout.trim()
}

function harnessWorktreeChanges(sourceRoot: string): string {
  const statusCommands: readonly (readonly string[])[] = [
    ['status', '--porcelain=v1', '--untracked-files=all'],
    ['status', '--porcelain=v1', '--ignored=matching', '--untracked-files=all', '--', '.env'],
  ]
  const changes = new Set<string>()
  for (const args of statusCommands) {
    const result = spawnSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `git status failed for ${sourceRoot}`)
    }
    for (const line of result.stdout.split(/\r?\n/)) {
      if (line) changes.add(line)
    }
  }
  return [...changes].join('\n')
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

function nodeSatisfies(range: unknown, version = process.version): boolean {
  const actual = parseVersion(version)
  if (!actual || typeof range !== 'string') return false
  return range.split('||').some(rawClause => {
    const clause = rawClause.trim()
    const minimum = parseVersion(clause.replace(/^(?:\^|>=)\s*/, ''))
    if (!minimum || compareVersions(actual, minimum) < 0) return false
    if (clause.startsWith('>=')) return true
    if (clause.startsWith('^')) return compareVersions(actual, [minimum[0] + 1, 0, 0]) < 0
    return compareVersions(actual, minimum) === 0
  })
}

const defaultLinkedPackageLocations: Readonly<Record<string, string>> = {
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/cordis-plugin-include': 'vendor/include',
  '@deepseek-ai/cordis-plugin-loader': 'vendor/loader',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-system-prompt': 'packages/core/system-prompt',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
}

function validateLinkedArtifacts(
  sourceRoot: string,
  linkedPackageLocations?: Readonly<Record<string, string>>,
): void {
  const locations = linkedPackageLocations ?? defaultLinkedPackageLocations
  for (const [packageName, sourcePath] of Object.entries(locations)) {
    const packageRoot = join(sourceRoot, sourcePath)
    const packageManifest = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    ) as LinkedPackageManifest
    const entries: Array<readonly [string, unknown]> = [
      ['main', packageManifest.main],
      ['types', packageManifest.types],
    ]
    const inputs = [join(packageRoot, 'package.json')]
    const sourceDirectory = join(packageRoot, 'src')
    if (existsSync(sourceDirectory)) inputs.push(...listFiles(sourceDirectory))
    const newestInput = Math.max(...inputs.map(path => statSync(path).mtimeMs))
    for (const [field, entry] of entries) {
      const artifact = typeof entry === 'string' ? join(packageRoot, entry) : undefined
      check(artifact !== undefined && existsSync(artifact), `${packageName} has a built ${field} entry`)
      if (artifact !== undefined && existsSync(artifact)) {
        check(statSync(artifact).mtimeMs >= newestInput, `${packageName} built ${field} entry is fresh`)
      }
    }
  }
}

const canonicalPath = 'skills/dsh-plugin-dev/SKILL.md'
const codexAdapterPath = '.agents/skills/dsh-plugin-dev/SKILL.md'
const claudeAdapterPath = '.claude/skills/dsh-plugin-dev/SKILL.md'
const requiredTemplates = [
  '.gitignore.tmpl',
  'AGENTS.md.tmpl',
  'CLAUDE.md.tmpl',
  'README.md.tmpl',
  'TODO.md.tmpl',
  'cordis.patch.yml.tmpl',
  'docs/agent/PROJECT_CONTRACT.md.tmpl',
  'dsh-registry.lock.json.tmpl',
  'dsh-reference.lock.json.tmpl',
  'package.json.tmpl',
  'pnpm-workspace.yaml.tmpl',
  'scripts/verify-dsh-context.mjs.tmpl',
  'scripts/verify-built.mjs.tmpl',
  'scripts/verify-pack.mjs.tmpl',
  'src/index.ts.tmpl',
  'tests/fixtures/cordis.yml.tmpl',
  'tests/loader.spec.ts.tmpl',
  'tests/plugin.spec.ts.tmpl',
  'tsconfig.json.tmpl',
  'vitest.config.ts.tmpl',
]
const requiredFiles = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'TODO.md',
  'package.json',
  'LICENSE',
  'dsh-reference.lock.json',
  '.codex-plugin/plugin.json',
  'docs/agent/PROJECT_CONTRACT.md',
  'docs/agent/ARCHITECTURE.md',
  'docs/agent/ACCEPTANCE.md',
  'docs/decisions/0001-cross-agent-context.md',
  'docs/decisions/0002-product-scope.md',
  'docs/decisions/0003-source-artifact-readiness.md',
  canonicalPath,
  codexAdapterPath,
  claudeAdapterPath,
  'skills/dsh-plugin-dev/agents/openai.yaml',
  'skills/dsh-plugin-dev/references/scaffolding.md',
  'skills/dsh-plugin-dev/scripts/create-project.mjs',
  'scripts/install-user-skill.mjs',
  'scripts/baseline.mjs',
  'docs/agent/BASELINE_UPGRADE.md',
  'docs/decisions/0004-baseline-channels.md',
  'docs/decisions/0005-registry-delivery.md',
  'docs/decisions/0006-typescript-first-tooling.md',
  'docs/decisions/0007-tooling-0.2.0-alpha.3.md',
  'docs/decisions/0008-tooling-0.3.0-alpha.4.md',
  'src/scripts/baseline.mts',
  'src/scripts/install-user-skill.mts',
  'src/scripts/verify-context.mts',
  'skills/dsh-plugin-dev/src/create-project.mts',
  'scripts/baseline.d.mts',
  'scripts/install-user-skill.d.mts',
  'scripts/verify-context.d.mts',
  'skills/dsh-plugin-dev/scripts/create-project.d.mts',
  'tooling/build.ts',
  'tooling-artifacts.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.json',
  'tsconfig.scripts.json',
  'skills/dsh-plugin-dev/tsconfig.json',
  'vitest.config.ts',
  ...requiredTemplates.map(path => `skills/dsh-plugin-dev/assets/tool-project/${path}`),
]

for (const path of requiredFiles) {
  check(existsSync(projectPath(path)), `${path} exists`)
}

const expectedToolingArtifacts: ReadonlyMap<string, readonly [string, string]> = new Map([
  ['src/scripts/baseline.mts', ['scripts/baseline.mjs', 'scripts/baseline.d.mts']],
  ['src/scripts/install-user-skill.mts', ['scripts/install-user-skill.mjs', 'scripts/install-user-skill.d.mts']],
  ['src/scripts/verify-context.mts', ['scripts/verify-context.mjs', 'scripts/verify-context.d.mts']],
  ['skills/dsh-plugin-dev/src/create-project.mts', [
    'skills/dsh-plugin-dev/scripts/create-project.mjs',
    'skills/dsh-plugin-dev/scripts/create-project.d.mts',
  ]],
] as const)
const toolingArtifacts = parseJson<ToolingArtifactManifest>('tooling-artifacts.json')
if (toolingArtifacts !== undefined) {
  check(toolingArtifacts.schemaVersion === 1, 'tooling artifact manifest schema is supported')
  check(/^typescript@\d+\.\d+\.\d+/.test(toolingArtifacts.compiler), 'tooling artifact manifest records the compiler')
  check(
    toolingArtifacts.artifacts.length === expectedToolingArtifacts.size,
    'tooling artifact manifest covers every TypeScript entry',
  )
  for (const artifact of toolingArtifacts.artifacts) {
    const expected = expectedToolingArtifacts.get(artifact.source)
    check(expected !== undefined, `tooling artifact source is expected: ${artifact.source}`)
    if (expected !== undefined) {
      check(artifact.runtime === expected[0], `${artifact.source} has the canonical runtime path`)
      check(artifact.declaration === expected[1], `${artifact.source} has the canonical declaration path`)
    }
    for (const [path, digest, label] of [
      [artifact.source, artifact.sourceSha256, 'source'],
      [artifact.runtime, artifact.runtimeSha256, 'runtime'],
      [artifact.declaration, artifact.declarationSha256, 'declaration'],
    ] as const) {
      const absolute = projectPath(path)
      check(existsSync(absolute), `${artifact.source} ${label} artifact exists`)
      if (existsSync(absolute)) {
        check(sha256(readFileSync(absolute)) === digest, `${artifact.source} ${label} digest matches`)
      }
    }
  }
}

const markdownFiles = [
  ...['README.md', 'AGENTS.md', 'CLAUDE.md', 'TODO.md'].map(projectPath),
  ...listFiles(projectPath('docs')).filter(path => path.endsWith('.md')),
  ...listFiles(projectPath('skills')).filter(path => path.endsWith('.md')),
  ...listFiles(projectPath('.agents')).filter(path => path.endsWith('.md')),
  ...listFiles(projectPath('.claude')).filter(path => path.endsWith('.md')),
]
for (const markdownFile of markdownFiles) {
  const content = readFileSync(markdownFile, 'utf8')
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1]?.replace(/^<|>$/g, '').split('#', 1)[0]
    if (target === undefined) continue
    if (target === '' || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    const resolved = resolve(dirname(markdownFile), target)
    check(
      existsSync(resolved),
      `${relative(projectRoot, markdownFile).split(sep).join('/')} link ${target} resolves`,
    )
  }
}

const agents = readProjectFile('AGENTS.md')
const claude = readProjectFile('CLAUDE.md')
const pnpmWorkspace = readProjectFile('pnpm-workspace.yaml')
check(/allowBuilds:\s*[\s\S]*?esbuild:\s*true/.test(pnpmWorkspace), 'pnpm explicitly allows the required esbuild binary')
for (const [path, content] of [
  ['AGENTS.md', agents],
  ['CLAUDE.md', claude],
] as const) {
  check(content.includes('docs/agent/PROJECT_CONTRACT.md'), `${path} points to the shared contract`)
  check(content.includes('TODO.md'), `${path} points to the live TODO`)
  check(content.includes('context:check'), `${path} requires context validation`)
  check(content.includes('skills/dsh-plugin-dev/'), `${path} points to the canonical skill`)
}

const canonical = readProjectFile(canonicalPath)
const codexAdapter = readProjectFile(codexAdapterPath)
const claudeAdapter = readProjectFile(claudeAdapterPath)
const canonicalFrontmatter = parseFrontmatter(canonicalPath, canonical)
const codexFrontmatter = parseFrontmatter(codexAdapterPath, codexAdapter)
const claudeFrontmatter = parseFrontmatter(claudeAdapterPath, claudeAdapter)

for (const [label, frontmatter] of [
  ['canonical', canonicalFrontmatter],
  ['Codex adapter', codexFrontmatter],
  ['Claude adapter', claudeFrontmatter],
] as const) {
  check(frontmatter.get('name') === 'dsh-plugin-dev', `${label} skill name is dsh-plugin-dev`)
  check(
    frontmatter.get('description') === canonicalFrontmatter.get('description'),
    `${label} skill description matches the canonical skill`,
  )
}

for (const [path, content] of [
  [codexAdapterPath, codexAdapter],
  [claudeAdapterPath, claudeAdapter],
] as const) {
  const target = '../../../skills/dsh-plugin-dev/SKILL.md'
  check(content.includes(target), `${path} delegates to the canonical skill`)
  check(
    existsSync(resolve(dirname(projectPath(path)), target)),
    `${path} target resolves to the canonical skill`,
  )
  check(content.length < 2_000, `${path} remains a thin compatibility entry`)
}

const referenceDirectory = projectPath('skills/dsh-plugin-dev/references')
const referenceFiles = listFiles(referenceDirectory)
  .filter(path => path.endsWith('.md'))
  .map(path => relative(dirname(projectPath(canonicalPath)), path).split(sep).join('/'))
check(referenceFiles.length >= 7, 'canonical skill has focused DSH references')
for (const reference of referenceFiles) {
  check(canonical.includes(`(${reference})`), `canonical skill routes to ${reference}`)
}

const linkedReferences = [...canonical.matchAll(/\]\((references\/[^)]+\.md)\)/g)]
  .map(match => match[1])
  .filter((reference): reference is string => reference !== undefined)
for (const reference of new Set(linkedReferences)) {
  check(existsSync(join(dirname(projectPath(canonicalPath)), reference)), `linked reference ${reference} exists`)
}
check(
  canonical.includes('scripts/create-project.mjs'),
  'canonical skill routes new Tool projects through the deterministic generator',
)

const skillUi = readProjectFile('skills/dsh-plugin-dev/agents/openai.yaml')
check(skillUi.includes('display_name: "DSH Plugin Dev"'), 'Skill UI has the expected display name')
check(skillUi.includes('$dsh-plugin-dev'), 'Skill UI default prompt explicitly invokes the skill')
check(skillUi.includes('allow_implicit_invocation: true'), 'Skill allows implicit invocation')

const manifest = parseJson<PackageJson>('package.json')
const pluginManifest = parseJson<PluginManifest>('.codex-plugin/plugin.json')
if (manifest) {
  check(manifest.name === 'dsh-plugin-dev', 'package name is dsh-plugin-dev')
  check(manifest.version === '0.3.0', 'package has the 0.3.0 audited-alpha.4 tooling version')
  check(manifest.private === true, 'development-tooling repository package remains private')
  check(manifest.license === 'MIT', 'package is MIT licensed')
  check(manifest.type === 'module', 'project uses ESM')
  check(manifest.engines?.node === '^22.19.0 || >=24.0.0', 'project Node engine matches the pinned Harness')
  check(manifest.packageManager === 'pnpm@11.7.0', 'project package manager matches the pinned Harness')
  check(manifest.scripts?.build === 'tsx tooling/build.ts', 'TypeScript tooling build is canonical')
  check(manifest.scripts?.['build:check'] === 'tsx tooling/build.ts --check', 'compiled tooling freshness gate is exposed')
  check(manifest.scripts?.typecheck === 'tsc -p tsconfig.json --noEmit', 'strict TypeScript check is exposed')
  check(manifest.scripts?.['context:check'] === 'node scripts/verify-context.mjs', 'context:check script is canonical')
  check(
    manifest.scripts?.['context:check:strict'] === 'node scripts/verify-context.mjs --require-source',
    'strict context script requires the source baseline',
  )
  check(manifest.scripts?.['install:skill'] === 'node scripts/install-user-skill.mjs', 'safe Skill installer is exposed')
  check(manifest.scripts?.['install:codex'] === 'node scripts/install-user-skill.mjs --agent codex', 'Codex-only Skill installer is exposed')
  check(manifest.scripts?.['install:claude'] === 'node scripts/install-user-skill.mjs --agent claude', 'Claude-only Skill installer is exposed')
  check(manifest.scripts?.test === 'vitest run tests/*.unit.test.ts', 'TypeScript unit test entrypoint is exposed')
  check(manifest.scripts?.['test:e2e'] === 'vitest run tests/*.e2e.test.ts', 'TypeScript e2e entrypoint is exposed')
  check(manifest.scripts?.['upstream:scan'] === 'node scripts/baseline.mjs scan', 'upstream scan command is exposed')
  check(manifest.scripts?.['upstream:update'] === 'node scripts/baseline.mjs update --channel edge', 'edge update command is exposed')
  check(manifest.scripts?.['upstream:diff'] === 'node scripts/baseline.mjs diff --from stable --to edge', 'baseline diff command is exposed')
  check(manifest.scripts?.['upstream:check'] === 'node scripts/baseline.mjs check', 'baseline source check command is exposed')
  check(manifest.scripts?.['registry:check'] === 'node scripts/baseline.mjs registry-check', 'Registry closure command is exposed')
  check(manifest.scripts?.['baseline:verify'] === 'node scripts/baseline.mjs verify --channel edge', 'edge verification command is exposed')
  check(manifest.scripts?.['baseline:promote'] === 'node scripts/baseline.mjs promote --from edge --to stable', 'baseline promotion command is exposed')
  check(manifest.scripts?.['release:preflight'] === 'node scripts/baseline.mjs preflight --channel stable', 'release preflight command is exposed')
  check(manifest.files?.includes('.codex-plugin/plugin.json'), 'package includes the Codex Plugin manifest')
  check(manifest.files?.includes('skills/dsh-plugin-dev/**'), 'package includes the canonical Skill')
  check(manifest.files?.includes('src/**'), 'package includes authoritative TypeScript sources')
  check(manifest.files?.includes('tooling-artifacts.json'), 'package includes source-to-runtime artifact evidence')
  check(manifest.files?.includes('pnpm-workspace.yaml'), 'package includes the pnpm build-supply-chain policy')
  check(manifest.files?.includes('scripts/install-user-skill.mjs'), 'package includes the dual-agent installer')
  check(manifest.files?.includes('scripts/baseline.mjs'), 'package includes baseline automation')
  check(manifest.files?.includes('baselines/**'), 'package includes pinned baseline catalogs and Skill snapshots')
  check(manifest.files?.includes('docs/decisions/0005-registry-delivery.md'), 'package includes the Registry delivery decision')
  check(manifest.files?.includes('docs/decisions/0006-typescript-first-tooling.md'), 'package includes the TypeScript-first decision')
}
if (pluginManifest) {
  check(pluginManifest.name === 'dsh-plugin-dev', 'Codex Plugin name is dsh-plugin-dev')
  check(pluginManifest.version === manifest?.version, 'Codex Plugin and package versions match')
  check(pluginManifest.license === manifest?.license, 'Codex Plugin and package licenses match')
  check(pluginManifest.skills === './skills/', 'Codex Plugin exposes the top-level skills directory')
  check(
    existsSync(resolve(projectRoot, pluginManifest.skills ?? '', 'dsh-plugin-dev', 'SKILL.md')),
    'Codex Plugin Skill target resolves',
  )
  check(pluginManifest.interface?.capabilities?.includes('Write'), 'Codex Plugin declares project-write capability')
}

const generator = readProjectFile('skills/dsh-plugin-dev/scripts/create-project.mjs')
const installer = readProjectFile('scripts/install-user-skill.mjs')
check(generator.includes("kind !== 'tool'"), 'generator rejects unsupported deterministic project kinds')
check(generator.includes("DELIVERY_MODES = new Set(['source', 'registry'])"), 'generator exposes explicit source and Registry delivery modes')
check(generator.includes("RESERVED_TOOL_NAMES = new Set(['run_code'])"), 'generator rejects the reserved run_code Tool name')
check(generator.includes("flag: 'wx'"), 'generator creates files without overwrite permission')
check(generator.includes('DSH_SCAFFOLD_HARNESS_MISMATCH'), 'generator exposes a stable Harness mismatch error')
check(generator.includes('DSH_SCAFFOLD_REGISTRY_UNREADY'), 'generator fails closed on unready Registry evidence')
check(installer.includes('DSH_SKILL_INSTALL_CONFLICT'), 'installer exposes a stable conflict error')
check(installer.includes("codex: ['.agents', 'skills']"), 'installer targets Codex personal Skills')
check(installer.includes("claude: ['.claude', 'skills']"), 'installer targets Claude Code personal Skills')
check(installer.includes("agents = ['codex', 'claude']"), 'installer defaults to both code agents')

const repositoryText = [
  ...markdownFiles,
  projectPath('package.json'),
  projectPath('.codex-plugin/plugin.json'),
].map(path => readFileSync(path, 'utf8')).join('\n')
check(!repositoryText.includes('dsh-agent-team-ultra'), 'obsolete Agent Team Ultra product name is absent')

const lock = parseJson<LockJson>('dsh-reference.lock.json')
let loadedBaseline: LoadedChannel | undefined
if (lock) {
  try {
    loadedBaseline = loadLockedChannel(projectRoot, requestedChannel)
  } catch (error) {
    fail(error instanceof BaselineError ? `[${error.code}] ${error.message}` : String(error))
  }
}
if (lock && loadedBaseline) {
  const baseline = loadedBaseline.baseline
  const catalog = loadedBaseline.catalog
  check(lock.schemaVersion === 2, 'reference lock schema v2 is supported')
  check(['stable', 'edge'].every(channel => lock.channels?.[channel]), 'reference lock defines stable and edge channels')
  check(lock.defaultChannel === 'stable', 'stable is the default baseline channel')
  check(/^[0-9a-f]{40}$/.test(baseline.upstream?.commit ?? ''), 'reference lock has a full Git commit')
  check(/^[0-9a-f]{64}$/.test(baseline.upstream?.docsDigest ?? ''), 'reference lock has a docs SHA-256')
  check(/^dsh-v/.test(baseline.upstream?.tag ?? ''), 'reference lock records an official DSH tag')
  check(baseline.upstream?.node === '^22.19.0 || >=24.0.0', 'reference lock records the pinned Node engine')
  check(baseline.upstream?.packageManager === 'pnpm@11.7.0', 'reference lock records the pinned package manager')
  check(nodeSatisfies(baseline.upstream?.node), `Node ${process.version} satisfies ${baseline.upstream?.node}`)
  check(catalog?.summary?.packageCount === baseline.catalog?.packageCount, 'catalog package count matches the lock')
  check(catalog?.summary?.skillCount === baseline.catalog?.skillCount, 'catalog Skill count matches the lock')
  check(catalog?.summary?.productSkillCount === 2, 'catalog identifies the two product Cordis Skills')
  const releasePackageCount = catalog?.packages?.filter(
    entry => ['dsh', 'vendor'].includes(entry.releaseFamily) && entry.private !== true,
  ).length
  check(
    catalog?.summary?.releasePackageCount === releasePackageCount,
    'catalog covers the complete public DSH and vendor release families',
  )

  for (const kind of ['registry', 'verification'] as const) {
    const report = baseline[kind]
    const reportPath = resolve(projectRoot, report?.path ?? '')
    check(existsSync(reportPath), `${loadedBaseline.channel} ${kind} report exists`)
    if (existsSync(reportPath)) {
      check(sha256(readFileSync(reportPath)) === report?.sha256, `${loadedBaseline.channel} ${kind} report digest matches`)
    }
  }
  for (const skill of catalog?.skills?.filter(entry => entry.role === 'product') ?? []) {
    for (const file of skill.files) {
      const snapshot = projectPath(`baselines/${loadedBaseline.channel}/skills/${skill.name}/${file.path}`)
      check(existsSync(snapshot), `${loadedBaseline.channel} product Skill snapshot ${skill.name}/${file.path} exists`)
      if (existsSync(snapshot)) {
        check(sha256(readFileSync(snapshot)) === file.sha256, `${loadedBaseline.channel} product Skill snapshot ${skill.name}/${file.path} matches`)
      }
    }
  }

  const environmentVariable = baseline.localResolution?.environmentVariable
  const configuredRoot = environmentVariable ? process.env[environmentVariable] : undefined
  const fallback = baseline.localResolution?.fallbackRelativePath
  const sourceRoot = resolve(configuredRoot || join(projectRoot, fallback || ''))

  if (!existsSync(sourceRoot)) {
    const message = `pinned DSH source not found at ${sourceRoot}`
    if (requireSource) fail(message)
    else warn(`${message}; set ${environmentVariable || 'DSH_HARNESS_ROOT'} for strict validation`)
  } else {
    try {
      const sourceManifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'))
      check(sourceManifest.version === baseline.upstream.version, `DSH version matches ${baseline.upstream.version}`)
      check(sourceManifest.engines?.node === baseline.upstream.node, `DSH Node engine matches ${baseline.upstream.node}`)
      check(sourceManifest.packageManager === baseline.upstream.packageManager, `DSH package manager matches ${baseline.upstream.packageManager}`)
      check(gitHead(sourceRoot) === baseline.upstream.commit, `DSH commit matches ${baseline.upstream.commit}`)
      check(digestDocs(sourceRoot) === baseline.upstream.docsDigest, 'DSH docs digest matches the audited baseline')
      const dirty = harnessWorktreeChanges(sourceRoot)
      check(dirty.length === 0, dirty.length === 0
        ? 'DSH Harness attested source inputs are clean'
        : `DSH Harness attested source inputs have changes:\n${dirty}`)
      validateLinkedArtifacts(sourceRoot, catalog?.capabilities?.tool?.linkedPackages)
      pass(`validated DSH source at ${sourceRoot}`)
    } catch (error) {
      fail(`cannot validate DSH source at ${sourceRoot}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

for (const message of passes) console.log(`PASS ${message}`)
for (const message of warnings) console.warn(`WARN ${message}`)
for (const message of failures) console.error(`FAIL ${message}`)

if (failures.length > 0) {
  console.error(`\ncontext check failed: ${failures.length} failure(s), ${warnings.length} warning(s)`)
  process.exitCode = 1
} else {
  console.log(`\ncontext check passed: ${passes.length} check(s), ${warnings.length} warning(s)`)
}
