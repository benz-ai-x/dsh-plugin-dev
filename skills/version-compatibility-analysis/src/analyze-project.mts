#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compareRevisions, fail, reportError } from './compare-revisions.mjs'
import { isObject, stringList } from './dependencies.mjs'
import { createDownloadPlan, downloadPackages } from './download-packages.mjs'
import type { Issue, Manifest } from './dependencies.mjs'

export interface AnalyzeOptions {
  project?: string
  harnessRoot?: string
  base?: string
  target?: string
  channel?: string
  capability?: string
  roots?: readonly string[]
}

function readJson(path: string): Manifest {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isObject(value)) throw new Error('not an object')
    return value
  } catch { return fail('COMPAT_PROJECT_INPUT', `Expected a JSON object at ${path}`) }
}

function projectFile(project: string, path: unknown): string {
  if (typeof path !== 'string') return fail('COMPAT_PROJECT_INPUT', 'Catalog path must be a string')
  const absolute = resolve(project, path)
  const child = relative(project, absolute)
  if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) return fail('COMPAT_PROJECT_INPUT', 'Catalog path must remain inside the project')
  return absolute
}

export function analyzeProject(options: AnalyzeOptions = {}, environment: NodeJS.ProcessEnv = process.env) {
  const project = resolve(options.project ?? '.')
  const lockPath = resolve(project, 'dsh-reference.lock.json')
  const issues: Issue[] = []
  let channel: string | null = null
  let locked: Manifest | undefined
  let lockDigest: string | null = null
  if (existsSync(lockPath)) {
    const lock = readJson(lockPath)
    lockDigest = createHash('sha256').update(readFileSync(lockPath)).digest('hex')
    if (lock.schemaVersion === 2 && isObject(lock.channels)) {
      channel = options.channel ?? (typeof lock.defaultChannel === 'string' ? lock.defaultChannel : null)
      const entry = channel ? lock.channels[channel] : undefined
      if (!isObject(entry)) fail('COMPAT_LOCK_CHANNEL', 'Select an existing lock channel with --channel')
      locked = entry
    } else if (lock.schemaVersion === 1 && isObject(lock.upstream) && !options.channel) locked = lock
    else if (!options.base) fail('COMPAT_LOCK_SCHEMA', 'Unknown lock schema; inspect its baseline and pass --base plus --root-package explicitly. No code update is required for explicit analysis.')
    else issues.push({ kind: 'lock-schema', reason: 'Unknown lock schema bypassed by explicit --base; no audited lock interpretation claimed.' })
  } else if (options.channel) fail('COMPAT_LOCK_CHANNEL', '--channel requires a project reference lock')
  const upstream = isObject(locked?.upstream) ? locked.upstream : undefined
  const base = options.base ?? (typeof upstream?.commit === 'string' ? upstream.commit : undefined)
  if (!base) fail('COMPAT_BASE_REQUIRED', 'No baseline commit found. Pass --base REF; never infer the previous tag.')

  const local = isObject(locked?.localResolution) ? locked.localResolution : undefined
  const variable = typeof local?.environmentVariable === 'string' ? local.environmentVariable : undefined
  const lockedEnvironment = variable ? environment[variable] : undefined
  const fallback = typeof local?.fallbackRelativePath === 'string' ? resolve(project, local.fallbackRelativePath) : undefined
  const harnessRoot = options.harnessRoot || environment.DSH_HARNESS_ROOT || lockedEnvironment || fallback
  const pathSource = options.harnessRoot ? '--harness-root' : environment.DSH_HARNESS_ROOT ? 'DSH_HARNESS_ROOT'
    : lockedEnvironment ? variable! : 'lock fallback'
  if (!harnessRoot) fail('COMPAT_SOURCE_REQUIRED', 'Pass --harness-root PATH or set DSH_HARNESS_ROOT to the candidate Git repository')

  let roots = [...(options.roots ?? [])]
  let rootsSource = roots.length ? 'explicit --root-package' : 'not-selected'
  if (!roots.length && isObject(locked?.catalog)) {
    const path = projectFile(project, locked.catalog.path)
    const contents = readFileSync(path)
    const digest = createHash('sha256').update(contents).digest('hex')
    if (digest !== locked.catalog.sha256) fail('COMPAT_CATALOG_DIGEST', 'Locked catalog digest does not match; use explicit --root-package for an unaudited diagnostic scope')
    const catalog = readJson(path)
    const capabilities = isObject(catalog.capabilities) ? catalog.capabilities : {}
    const names = Object.keys(capabilities)
    const selected = options.capability ?? (names.length === 1 ? names[0] : undefined)
    const capability = selected ? capabilities[selected] : undefined
    if (!selected || !isObject(capability) || !stringList(capability.publicationRoots)) {
      fail('COMPAT_CAPABILITY_REQUIRED', 'Select a catalog capability with --capability or provide --root-package NAME')
    }
    roots = capability.publicationRoots
    rootsSource = `digest-checked catalog capability ${selected}`
  } else if (options.capability && !roots.length) fail('COMPAT_CAPABILITY_REQUIRED', '--capability requires a locked catalog; otherwise use --root-package')
  if (!roots.length && existsSync(resolve(project, 'package.json'))) {
    const manifest = readJson(resolve(project, 'package.json'))
    roots = [...new Set(['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap(key => isObject(manifest[key]) ? Object.keys(manifest[key]) : []))]
    rootsSource = 'project production declarations (review external and optional roots)'
  }
  const comparison = compareRevisions({ repo: harnessRoot, base, target: options.target ?? 'HEAD', roots })
  return {
    ...comparison,
    project: {
      root: project, channel, lockSha256: lockDigest, baselineSource: options.base ? '--base' : 'lock upstream.commit',
      lockedUpstream: upstream ? Object.fromEntries(['version', 'tag', 'commit', 'docsDigest'].filter(key => upstream[key] !== undefined).map(key => [key, upstream[key]])) : null,
      candidatePathSource: pathSource, dependencyRootsSource: rootsSource,
    },
    issues: [...issues, ...comparison.issues],
  }
}

const usage = `Usage: node analyze-project.mjs [--project PATH] [--harness-root PATH] [--target REF]
  [--channel NAME] [--capability NAME] [--base REF] [--root-package NAME ...]
  [--download-missing --download-dir NEW_OR_OWNED_DIRECTORY [--registry HTTPS_URL]]
Defaults: project=cwd; base=project lock commit; target=candidate HEAD.
Candidate: --harness-root > DSH_HARNESS_ROOT > lock environment variable > lock fallback.
Read-only JSON evidence by default. No fetch, checkout, install, Registry query or lock update.
Opt-in downloads: npm required; exact Registry tarballs only, no lifecycle scripts or installation.
Download directory must be outside the project, Harness and Skill; its parent must exist.
Default download Registry: https://registry.npmjs.org/ (no automatic private Registry fallback).
Exit 0 means evidence collected (and selected downloads complete), not compatible.
Exit 2 means partial downloads/deferred targets; inspect downloads, issues and assessment.`

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.includes('--help') || args.includes('-h')) console.log(usage)
    else {
      const values: Record<string, string> = {}
      const roots: string[] = []
      let download = false
      for (let index = 0; index < args.length; index += 1) {
        const flag = args[index]!
        if (flag === '--download-missing') { download = true; continue }
        const value = args[++index]
        if (!['--project', '--harness-root', '--target', '--channel', '--capability', '--base', '--root-package', '--download-dir', '--registry'].includes(flag) || !value || value.startsWith('--')) fail('COMPAT_USAGE', usage)
        if (flag === '--root-package') roots.push(value)
        else values[flag.slice(2)] = value
      }
      if ((download && !values['download-dir']) || (!download && (values['download-dir'] || values.registry))) fail('COMPAT_USAGE', usage)
      const analysis = analyzeProject({
        project: values.project ?? '.',
        ...(values['harness-root'] ? { harnessRoot: values['harness-root'] } : {}),
        ...(values.target ? { target: values.target } : {}),
        ...(values.channel ? { channel: values.channel } : {}),
        ...(values.capability ? { capability: values.capability } : {}),
        ...(values.base ? { base: values.base } : {}), roots,
      })
      if (download) {
        const downloads = await downloadPackages(createDownloadPlan(analysis.dependencies.after), {
          directory: values['download-dir']!, registry: values.registry ?? 'https://registry.npmjs.org/',
          protectedRoots: [analysis.project.root, analysis.repository, resolve(dirname(fileURLToPath(import.meta.url)), '..')],
        })
        console.log(JSON.stringify({ ...analysis, downloads }, null, 2))
        if (downloads.status !== 'complete') process.exitCode = 2
      } else console.log(JSON.stringify(analysis, null, 2))
    }
  } catch (error) { reportError(error) }
}
