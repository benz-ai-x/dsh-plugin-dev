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
const ALLOWED_EMPTY_ENTRIES = new Set(['.DS_Store', '.git'])
const RESERVED_TOOL_NAMES = new Set(['run_code'])
const LINKED_PACKAGE_NAMES = Object.freeze({
  CORDIS_LINK: '@deepseek-ai/cordis',
  LOADER_LINK: '@deepseek-ai/cordis-plugin-loader',
  INCLUDE_LINK: '@deepseek-ai/cordis-plugin-include',
  DSH_LLM_LINK: '@deepseek-ai/dsh-llm',
  SYSTEM_PROMPT_LINK: '@deepseek-ai/dsh-system-prompt',
  DSH_TOOLS_LINK: '@deepseek-ai/dsh-tools',
})
const DEFAULT_LINKED_PACKAGE_LOCATIONS = Object.freeze({
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/cordis-plugin-loader': 'vendor/loader',
  '@deepseek-ai/cordis-plugin-include': 'vendor/include',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-system-prompt': 'packages/core/system-prompt',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
})

export class ScaffoldError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ScaffoldError'
    this.code = code
  }
}

function fail(code, message) {
  throw new ScaffoldError(code, message)
}

function normalizeSlug(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeDescription(value) {
  return value.trim().replace(/\s+/g, ' ')
}

function validatePackageName(value) {
  if (value.length > 214 || !PACKAGE_NAME.test(value)) {
    fail(
      'DSH_SCAFFOLD_INVALID_NAME',
      `package name must be a lowercase npm name: ${value}`,
    )
  }
}

function validatePluginName(value) {
  if (value.length > 64 || !PLUGIN_NAME.test(value)) {
    fail(
      'DSH_SCAFFOLD_INVALID_NAME',
      `plugin name must be kebab-case and at most 64 characters: ${value}`,
    )
  }
}

function validateToolName(value) {
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

export function nodeSatisfies(range, version = process.version) {
  const actual = parseVersion(version)
  if (!actual) return false
  return range.split('||').some(rawClause => {
    const clause = rawClause.trim()
    const minimum = parseVersion(clause.replace(/^(?:\^|>=)\s*/, ''))
    if (!minimum || compareVersions(actual, minimum) < 0) return false
    if (clause.startsWith('>=')) return true
    if (clause.startsWith('^')) {
      const ceiling = minimum[0] > 0
        ? [minimum[0] + 1, 0, 0]
        : minimum[1] > 0
          ? [0, minimum[1] + 1, 0]
          : [0, 0, minimum[2] + 1]
      return compareVersions(actual, ceiling) < 0
    }
    return compareVersions(actual, minimum) === 0
  })
}

function deriveNames(target, options) {
  const targetSlug = normalizeSlug(basename(target))
  if (!targetSlug && !options.name) {
    fail('DSH_SCAFFOLD_INVALID_NAME', 'cannot derive a package name from the target directory')
  }

  const packageName = options.name ?? (targetSlug.startsWith('dsh-') ? targetSlug : `dsh-${targetSlug}`)
  validatePackageName(packageName)

  const packageLeaf = packageName.includes('/') ? packageName.split('/').at(-1) : packageName
  const defaultPluginName = normalizeSlug(packageLeaf.replace(/^dsh-/, ''))
  const pluginName = options.pluginName ?? defaultPluginName
  validatePluginName(pluginName)

  const toolName = options.toolName ?? pluginName.replaceAll('-', '_')
  validateToolName(toolName)

  return { packageName, pluginName, toolName }
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function listFiles(root) {
  const files = []
  const visit = async directory => {
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

async function digestDocs(sourceRoot) {
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

function gitHead(sourceRoot) {
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

export function harnessWorktreeChanges(sourceRoot) {
  const statusCommands = [
    ['status', '--porcelain=v1', '--untracked-files=all'],
    ['status', '--porcelain=v1', '--ignored=matching', '--untracked-files=all', '--', '.env'],
  ]
  const changes = new Set()
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

export async function validateHarnessArtifacts(sourceRoot, linkedPackageLocations = DEFAULT_LINKED_PACKAGE_LOCATIONS) {
  for (const packagePath of Object.values(linkedPackageLocations)) {
    const packageRoot = resolve(sourceRoot, packagePath)
    if (packageRoot === sourceRoot || !packageRoot.startsWith(`${sourceRoot}${sep}`)) {
      fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `linked package path escapes Harness root: ${packagePath}`)
    }
    let manifest
    try {
      manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    } catch (error) {
      fail(
        'DSH_SCAFFOLD_HARNESS_ARTIFACT_MISSING',
        `cannot read linked Harness package ${packagePath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    const entryFields = ['main', 'types']
    const entries = entryFields.map(field => ({ field, value: manifest[field] }))
    for (const entry of entries) {
      if (typeof entry.value !== 'string' || !await exists(join(packageRoot, entry.value))) {
        fail(
          'DSH_SCAFFOLD_HARNESS_ARTIFACT_MISSING',
          `linked Harness package ${manifest.name ?? packagePath} is missing its built ${entry.field} entry; run pnpm install && pnpm run build in ${sourceRoot}`,
        )
      }
    }

    const inputPaths = [join(packageRoot, 'package.json')]
    const sourceDirectory = join(packageRoot, 'src')
    if (await exists(sourceDirectory)) inputPaths.push(...await listFiles(sourceDirectory))
    const newestInput = Math.max(...await Promise.all(inputPaths.map(async path => (await stat(path)).mtimeMs)))
    for (const entry of entries) {
      const artifactPath = join(packageRoot, entry.value)
      if ((await stat(artifactPath)).mtimeMs < newestInput) {
        fail(
          'DSH_SCAFFOLD_HARNESS_ARTIFACT_STALE',
          `linked Harness package ${manifest.name ?? packagePath} has a stale ${entry.field} entry; rebuild ${sourceRoot}`,
        )
      }
    }
  }
}

async function loadBaselineLock(requestedChannel) {
  try {
    const repositoryLock = JSON.parse(await readFile(baselineLockPath, 'utf8'))
    if (repositoryLock.schemaVersion !== 2) {
      fail(
        'DSH_SCAFFOLD_HARNESS_MISMATCH',
        `generator baseline schema ${repositoryLock.schemaVersion} is unsupported; run the baseline upgrade workflow`,
      )
    }
    const channel = requestedChannel
      ?? process.env.DSH_BASELINE_CHANNEL
      ?? repositoryLock.defaultChannel
    if (!['stable', 'edge'].includes(channel)) {
      fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `baseline channel must be stable or edge: ${channel}`)
    }
    const baseline = repositoryLock.channels?.[channel]
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
    return { channel, ...baseline, catalog, catalogDigest }
  } catch (error) {
    if (error instanceof ScaffoldError) throw error
    fail(
      'DSH_SCAFFOLD_HARNESS_MISMATCH',
      `cannot read generator baseline ${baselineLockPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function validateHarnessRoot(sourceRoot, lock) {
  let manifest
  try {
    manifest = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8'))
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
  const mismatches = Object.keys(actual)
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

async function canonicalTarget(path) {
  if (await exists(path)) return realpath(path)
  try {
    return join(await realpath(dirname(path)), basename(path))
  } catch {
    return path
  }
}

async function resolveHarnessRoot({ explicitRoot, target, lock }) {
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

function relativeProjectPath(projectRoot, target) {
  let value = relative(projectRoot, target).split(sep).join('/')
  if (!value.startsWith('.')) value = `./${value}`
  return value
}

function jsonContent(value) {
  return JSON.stringify(value).slice(1, -1)
}

function requireCatalogPackage(catalog, name) {
  const entry = catalog.packages?.find(candidate => candidate.name === name)
  if (!entry) {
    fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `baseline catalog is missing ${name}`)
  }
  return entry
}

function templateValues({ target, harnessRoot, lock, description, names }) {
  const linkedPackages = lock.catalog?.capabilities?.tool?.linkedPackages
  if (!linkedPackages) {
    fail('DSH_SCAFFOLD_HARNESS_MISMATCH', 'baseline catalog has no Tool linked-package contract')
  }
  const toolchain = lock.catalog.toolchain?.dependencies ?? {}
  const cordisVersion = requireCatalogPackage(lock.catalog, '@deepseek-ai/cordis').version
  const toolsVersion = requireCatalogPackage(lock.catalog, '@deepseek-ai/dsh-tools').version
  const schemasteryVersion = requireCatalogPackage(lock.catalog, '@deepseek-ai/schemastery').version
  const values = {
    PACKAGE_NAME: names.packageName,
    PLUGIN_NAME: names.pluginName,
    TOOL_NAME: names.toolName,
    ROW_ID: names.pluginName,
    DESCRIPTION: description,
    DESCRIPTION_LITERAL: JSON.stringify(description),
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
    HARNESS_FALLBACK: relativeProjectPath(target, harnessRoot),
    CORDIS_PEER_VERSION: `^${cordisVersion}`,
    DSH_TOOLS_VERSION: toolsVersion,
    SCHEMASTERY_VERSION: schemasteryVersion,
    TYPES_NODE_VERSION: toolchain['@types/node'],
    TYPESCRIPT_VERSION: toolchain.typescript,
    VITEST_VERSION: toolchain.vitest,
    EXPECTED_LINKS_JSON: JSON.stringify(linkedPackages, null, 2),
  }
  for (const [key, packageName] of Object.entries(LINKED_PACKAGE_NAMES)) {
    const path = linkedPackages[packageName]
    if (!path) fail('DSH_SCAFFOLD_HARNESS_MISMATCH', `Tool link contract is missing ${packageName}`)
    values[key] = `link:${relativeProjectPath(target, join(harnessRoot, path))}`
  }
  return values
}

function renderTemplate(content, values, sourcePath) {
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

async function assertEmptyTarget(target) {
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

export async function createProject(options = {}) {
  const requestedTarget = resolve(options.target ?? process.cwd())
  const target = await canonicalTarget(requestedTarget)
  const kind = options.kind ?? 'tool'
  if (kind !== 'tool') {
    fail(
      'DSH_SCAFFOLD_UNSUPPORTED_KIND',
      `deterministic scaffolding is not available for kind ${kind}; supported kinds: tool`,
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
  const harnessRoot = await resolveHarnessRoot({
    explicitRoot: options.harnessRoot,
    target,
    lock,
  })
  const values = templateValues({ target, harnessRoot, lock, description, names })

  const templates = await listFiles(templateRoot)
  const outputs = []
  for (const template of templates) {
    const templateRelative = relative(templateRoot, template).split(sep).join('/')
    if (!templateRelative.endsWith('.tmpl')) continue
    const outputRelative = templateRelative.slice(0, -'.tmpl'.length)
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
      if (error?.code === 'EEXIST') {
        fail('DSH_SCAFFOLD_TARGET_COLLISION', `refusing to overwrite ${output.outputPath}`)
      }
      throw error
    }
  }

  return {
    kind,
    channel: lock.channel,
    target,
    harnessRoot,
    ...names,
    files: outputs.map(output => output.outputRelative).sort(),
  }
}

function usage() {
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
    '  --json                     Print the result as JSON',
    '  --help                     Show this help',
  ].join('\n')
}

export function parseArgs(argv) {
  const options = {}
  const valueOptions = new Map([
    ['--target', 'target'],
    ['--kind', 'kind'],
    ['--name', 'name'],
    ['--plugin-name', 'pluginName'],
    ['--tool-name', 'toolName'],
    ['--description', 'description'],
    ['--harness-root', 'harnessRoot'],
    ['--channel', 'channel'],
  ])

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
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

async function main() {
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
    console.log(`Harness: ${result.harnessRoot}`)
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

async function isMainModule() {
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
