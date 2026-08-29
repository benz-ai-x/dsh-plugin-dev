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

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireSource = process.argv.includes('--require-source')
const failures = []
const warnings = []
const passes = []

function pass(message) {
  passes.push(message)
}

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function check(condition, message) {
  if (condition) pass(message)
  else fail(message)
}

function projectPath(path) {
  return join(projectRoot, path)
}

function readProjectFile(path) {
  const absolute = projectPath(path)
  if (!existsSync(absolute)) {
    fail(`missing ${path}`)
    return ''
  }
  return readFileSync(absolute, 'utf8')
}

function parseJson(path) {
  try {
    return JSON.parse(readProjectFile(path))
  } catch (error) {
    fail(`${path} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function parseFrontmatter(path, content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!match) {
    fail(`${path} has no YAML frontmatter`)
    return new Map()
  }
  const fields = new Map()
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (field) fields.set(field[1], field[2].replace(/^['"]|['"]$/g, ''))
  }
  return fields
}

function listFiles(root) {
  if (!existsSync(root)) return []
  const result = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) result.push(absolute)
    }
  }
  visit(root)
  return result.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function digestDocs(sourceRoot) {
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

function gitHead(sourceRoot) {
  const result = spawnSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git rev-parse failed for ${sourceRoot}`)
  }
  return result.stdout.trim()
}

function harnessWorktreeChanges(sourceRoot) {
  const statusCommands = [
    ['status', '--porcelain=v1', '--untracked-files=all'],
    ['status', '--porcelain=v1', '--ignored=matching', '--untracked-files=all', '--', '.env'],
  ]
  const changes = new Set()
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

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index] - right[index]
    if (difference !== 0) return difference
  }
  return 0
}

function parseVersion(value) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)/.exec(value)
  return match ? match.slice(1).map(Number) : undefined
}

function nodeSatisfies(range, version = process.version) {
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

const linkedPackageLocations = Object.freeze({
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/cordis-plugin-include': 'vendor/include',
  '@deepseek-ai/cordis-plugin-loader': 'vendor/loader',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-system-prompt': 'packages/core/system-prompt',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
})

function validateLinkedArtifacts(sourceRoot) {
  for (const [packageName, sourcePath] of Object.entries(linkedPackageLocations)) {
    const packageRoot = join(sourceRoot, sourcePath)
    const packageManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
    const entries = [
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
  ...requiredTemplates.map(path => `skills/dsh-plugin-dev/assets/tool-project/${path}`),
]

for (const path of requiredFiles) {
  check(existsSync(projectPath(path)), `${path} exists`)
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
    const target = match[1].replace(/^<|>$/g, '').split('#', 1)[0]
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
for (const [path, content] of [['AGENTS.md', agents], ['CLAUDE.md', claude]]) {
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
]) {
  check(frontmatter.get('name') === 'dsh-plugin-dev', `${label} skill name is dsh-plugin-dev`)
  check(
    frontmatter.get('description') === canonicalFrontmatter.get('description'),
    `${label} skill description matches the canonical skill`,
  )
}

for (const [path, content] of [
  [codexAdapterPath, codexAdapter],
  [claudeAdapterPath, claudeAdapter],
]) {
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

const manifest = parseJson('package.json')
const pluginManifest = parseJson('.codex-plugin/plugin.json')
if (manifest) {
  check(manifest.name === 'dsh-plugin-dev', 'package name is dsh-plugin-dev')
  check(manifest.version === '0.1.0', 'package has the initial reusable-tooling version')
  check(manifest.private === true, 'repository package remains private while dependencies are source-linked')
  check(manifest.type === 'module', 'project uses ESM')
  check(manifest.engines?.node === '^22.19.0 || >=24.0.0', 'project Node engine matches the pinned Harness')
  check(manifest.scripts?.['context:check'] === 'node scripts/verify-context.mjs', 'context:check script is canonical')
  check(
    manifest.scripts?.['context:check:strict'] === 'node scripts/verify-context.mjs --require-source',
    'strict context script requires the source baseline',
  )
  check(manifest.scripts?.['install:skill'] === 'node scripts/install-user-skill.mjs', 'safe Skill installer is exposed')
  check(manifest.scripts?.['install:codex'] === 'node scripts/install-user-skill.mjs --agent codex', 'Codex-only Skill installer is exposed')
  check(manifest.scripts?.['install:claude'] === 'node scripts/install-user-skill.mjs --agent claude', 'Claude-only Skill installer is exposed')
  check(manifest.scripts?.test === 'node --test tests/*.unit.test.mjs', 'unit and e2e test entrypoints are separated')
  check(manifest.scripts?.['test:e2e'] === 'node --test tests/*.e2e.test.mjs', 'e2e test entrypoint is exposed')
  check(manifest.files?.includes('.codex-plugin/plugin.json'), 'package includes the Codex Plugin manifest')
  check(manifest.files?.includes('skills/dsh-plugin-dev/**'), 'package includes the canonical Skill')
  check(manifest.files?.includes('scripts/install-user-skill.mjs'), 'package includes the dual-agent installer')
}
if (pluginManifest) {
  check(pluginManifest.name === 'dsh-plugin-dev', 'Codex Plugin name is dsh-plugin-dev')
  check(pluginManifest.version === manifest?.version, 'Codex Plugin and package versions match')
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
check(generator.includes("RESERVED_TOOL_NAMES = new Set(['run_code'])"), 'generator rejects the reserved run_code Tool name')
check(generator.includes("flag: 'wx'"), 'generator creates files without overwrite permission')
check(generator.includes('DSH_SCAFFOLD_HARNESS_MISMATCH'), 'generator exposes a stable Harness mismatch error')
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

const lock = parseJson('dsh-reference.lock.json')
if (lock) {
  check(lock.schemaVersion === 1, 'reference lock schema is supported')
  check(/^[0-9a-f]{40}$/.test(lock.upstream?.commit ?? ''), 'reference lock has a full Git commit')
  check(/^[0-9a-f]{64}$/.test(lock.upstream?.docsDigest ?? ''), 'reference lock has a docs SHA-256')
  check(lock.upstream?.node === '^22.19.0 || >=24.0.0', 'reference lock records the pinned Node engine')
  check(nodeSatisfies(lock.upstream?.node), `Node ${process.version} satisfies ${lock.upstream?.node}`)

  const environmentVariable = lock.localResolution?.environmentVariable
  const configuredRoot = environmentVariable ? process.env[environmentVariable] : undefined
  const fallback = lock.localResolution?.fallbackRelativePath
  const sourceRoot = resolve(configuredRoot || join(projectRoot, fallback || ''))

  if (!existsSync(sourceRoot)) {
    const message = `pinned DSH source not found at ${sourceRoot}`
    if (requireSource) fail(message)
    else warn(`${message}; set ${environmentVariable || 'DSH_HARNESS_ROOT'} for strict validation`)
  } else {
    try {
      const sourceManifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'))
      check(sourceManifest.version === lock.upstream.version, `DSH version matches ${lock.upstream.version}`)
      check(sourceManifest.engines?.node === lock.upstream.node, `DSH Node engine matches ${lock.upstream.node}`)
      check(gitHead(sourceRoot) === lock.upstream.commit, `DSH commit matches ${lock.upstream.commit}`)
      check(digestDocs(sourceRoot) === lock.upstream.docsDigest, 'DSH docs digest matches the audited baseline')
      const dirty = harnessWorktreeChanges(sourceRoot)
      check(dirty.length === 0, dirty.length === 0
        ? 'DSH Harness attested source inputs are clean'
        : `DSH Harness attested source inputs have changes:\n${dirty}`)
      validateLinkedArtifacts(sourceRoot)
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
