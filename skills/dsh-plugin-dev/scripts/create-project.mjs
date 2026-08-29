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

async function loadBaselineLock() {
  try {
    return JSON.parse(await readFile(baselineLockPath, 'utf8'))
  } catch (error) {
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
  const lockedFallback = lock.localResolution?.fallbackRelativePath
  const candidates = explicitRoot
    ? [explicitRoot]
    : environmentRoot
      ? [environmentRoot]
      : [
          resolve(target, '..', 'deepseek-harness'),
          ...(lockedFallback ? [resolve(pluginRoot, lockedFallback)] : []),
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

function templateValues({ target, harnessRoot, lock, description, names }) {
  const packageLocations = {
    CORDIS_LINK: 'vendor/cordis',
    LOADER_LINK: 'vendor/loader',
    INCLUDE_LINK: 'vendor/include',
    DSH_LLM_LINK: 'packages/llm/llm',
    SYSTEM_PROMPT_LINK: 'packages/core/system-prompt',
    DSH_TOOLS_LINK: 'packages/core/tools',
  }
  const values = {
    PACKAGE_NAME: names.packageName,
    PLUGIN_NAME: names.pluginName,
    TOOL_NAME: names.toolName,
    ROW_ID: names.pluginName,
    DESCRIPTION: description,
    DESCRIPTION_LITERAL: JSON.stringify(description),
    HARNESS_REPOSITORY: lock.upstream.repository,
    HARNESS_VERSION: lock.upstream.version,
    HARNESS_COMMIT: lock.upstream.commit,
    HARNESS_DOCS_DIGEST: lock.upstream.docsDigest,
    HARNESS_VERIFIED_ON: lock.verifiedOn,
    HARNESS_FALLBACK: relativeProjectPath(target, harnessRoot),
  }
  for (const [key, path] of Object.entries(packageLocations)) {
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
  const lock = await loadBaselineLock()
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
