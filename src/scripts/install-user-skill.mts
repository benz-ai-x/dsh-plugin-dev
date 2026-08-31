#!/usr/bin/env node

import { homedir } from 'node:os'
import { lstat, mkdir, readlink, realpath, symlink } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultSource = join(repositoryRoot, 'skills', 'dsh-plugin-dev')
const agentTargetSegments = {
  codex: ['.agents', 'skills'],
  claude: ['.claude', 'skills'],
} as const

type Agent = keyof typeof agentTargetSegments
type InstallStatus = 'would-install' | 'already-installed' | 'installed'

interface InstallPlan {
  status: InstallStatus
  source: string
  target: string
  targetRoot: string
  agent?: Agent | undefined
}

interface InstallUserSkillOptions {
  source?: string | undefined
  targetRoot?: string | undefined
  dryRun?: boolean | undefined
}

interface InstallUserSkillsOptions {
  source?: string | undefined
  homeDirectory?: string | undefined
  agents?: readonly string[] | undefined
  dryRun?: boolean | undefined
}

interface CliOptions extends InstallUserSkillOptions, InstallUserSkillsOptions {
  help?: boolean | undefined
}

export class SkillInstallError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SkillInstallError'
    this.code = code
  }
}

async function pathState(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

async function resolvesTo(path: string, expected: string): Promise<boolean> {
  try {
    return await realpath(path) === await realpath(expected)
  } catch {
    return false
  }
}

async function planUserSkillInstall({
  source,
  targetRoot,
}: {
  source: string
  targetRoot: string
}): Promise<InstallPlan> {
  const resolvedSource = resolve(source)
  const resolvedTargetRoot = resolve(targetRoot)
  const target = join(resolvedTargetRoot, 'dsh-plugin-dev')

  const sourceState = await pathState(resolvedSource)
  if (!sourceState?.isDirectory()) {
    throw new SkillInstallError(
      'DSH_SKILL_SOURCE_MISSING',
      `canonical skill directory not found: ${resolvedSource}`,
    )
  }

  const targetState = await pathState(target)
  if (targetState !== undefined) {
    if (targetState.isSymbolicLink() && await resolvesTo(target, resolvedSource)) {
      return { status: 'already-installed', source: resolvedSource, target, targetRoot: resolvedTargetRoot }
    }
    const detail = targetState.isSymbolicLink()
      ? `symlink to ${await readlink(target)}`
      : 'an existing non-symlink path'
    throw new SkillInstallError(
      'DSH_SKILL_INSTALL_CONFLICT',
      `refusing to replace ${target}; it is ${detail}`,
    )
  }

  return { status: 'would-install', source: resolvedSource, target, targetRoot: resolvedTargetRoot }
}

async function materializePlan<T extends InstallPlan>(plan: T, dryRun: boolean): Promise<T> {
  if (plan.status === 'already-installed' || dryRun) return plan

  await mkdir(plan.targetRoot, { recursive: true })
  await symlink(plan.source, plan.target, process.platform === 'win32' ? 'junction' : 'dir')
  return { ...plan, status: 'installed' }
}

export async function installUserSkill({
  source = defaultSource,
  targetRoot = join(homedir(), '.agents', 'skills'),
  dryRun = false,
}: InstallUserSkillOptions = {}): Promise<InstallPlan> {
  const plan = await planUserSkillInstall({ source, targetRoot })
  return materializePlan(plan, dryRun)
}

export async function installUserSkills({
  source = defaultSource,
  homeDirectory = homedir(),
  agents = ['codex', 'claude'],
  dryRun = false,
}: InstallUserSkillsOptions = {}): Promise<InstallPlan[]> {
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new SkillInstallError('DSH_SKILL_INSTALL_USAGE', 'at least one target agent is required')
  }

  const selectedAgents = [...new Set(agents)]
  for (const agent of selectedAgents) {
    if (!(agent in agentTargetSegments)) {
      throw new SkillInstallError(
        'DSH_SKILL_INSTALL_USAGE',
        `unsupported target agent: ${agent}; expected codex or claude`,
      )
    }
  }

  // Inspect every destination before writing either one. A conflict therefore
  // cannot leave a misleading half-installed Codex/Claude setup.
  const plans: InstallPlan[] = []
  for (const selectedAgent of selectedAgents) {
    const agent = selectedAgent as Agent
    const targetRoot = join(resolve(homeDirectory), ...agentTargetSegments[agent])
    plans.push({
      agent,
      ...await planUserSkillInstall({ source, targetRoot }),
    })
  }

  const results: InstallPlan[] = []
  for (const plan of plans) results.push(await materializePlan(plan, dryRun))
  return results
}

function usage(): string {
  return `Usage: install-user-skill.mjs [--agent codex|claude|all] [--dry-run]\n       install-user-skill.mjs --target-root <path> [--dry-run]`
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (value === '--agent') {
      const agent = argv[index + 1]
      if (!agent || !['codex', 'claude', 'all'].includes(agent)) {
        throw new SkillInstallError('DSH_SKILL_INSTALL_USAGE', '--agent requires codex, claude, or all')
      }
      options.agents = agent === 'all' ? ['codex', 'claude'] : [agent]
      index += 1
      continue
    }
    if (value === '--target-root') {
      const targetRoot = argv[index + 1]
      if (!targetRoot) {
        throw new SkillInstallError('DSH_SKILL_INSTALL_USAGE', '--target-root requires a path')
      }
      options.targetRoot = targetRoot
      index += 1
      continue
    }
    if (value === '--help' || value === '-h') {
      options.help = true
      continue
    }
    throw new SkillInstallError('DSH_SKILL_INSTALL_USAGE', `unknown argument: ${value}`)
  }
  if (options.targetRoot && options.agents) {
    throw new SkillInstallError('DSH_SKILL_INSTALL_USAGE', '--target-root cannot be combined with --agent')
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
    const results = options.targetRoot
      ? [await installUserSkill(options)]
      : await installUserSkills(options)
    for (const result of results) {
      const prefix = result.agent ? `${result.agent}: ` : ''
      console.log(`${prefix}${result.status}: ${result.target} -> ${result.source}`)
    }
  } catch (error) {
    if (error instanceof SkillInstallError) {
      console.error(`[${error.code}] ${error.message}`)
      console.error(usage())
      process.exitCode = 1
      return
    }
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
