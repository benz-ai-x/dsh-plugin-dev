#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dependencyGraph, discoverWorkspace, isObject } from './dependencies.mjs';
export class CompatibilityError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'CompatibilityError';
    }
}
export function fail(code, message) { throw new CompatibilityError(code, message); }
function sorted(value) {
    if (Array.isArray(value))
        return value.map(sorted);
    if (isObject(value))
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
    return value;
}
function differences(left, right, field) {
    if (JSON.stringify(sorted(left)) === JSON.stringify(sorted(right)))
        return [];
    if (isObject(left) && isObject(right))
        return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
            .flatMap(key => differences(left[key], right[key], [...field, key]));
    return [{ field, ...(left !== undefined ? { from: left } : {}), ...(right !== undefined ? { to: right } : {}) }];
}
export function compareRevisions(options) {
    const requestedRoot = resolve(options.repo);
    const git = (args, input, accept = [0]) => {
        const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', requestedRoot, ...args], {
            ...(input !== undefined ? { input } : {}), timeout: 30_000, maxBuffer: 64 * 1024 * 1024,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' },
        });
        if (result.error || result.status === null || !accept.includes(result.status)) {
            const reason = result.error?.message || String(result.stderr ?? '').trim() || `git exited ${result.status}`;
            fail('COMPAT_GIT_ERROR', reason.slice(0, 1800));
        }
        return result;
    };
    const gitText = (args) => git(args).stdout.toString('utf8');
    const resolveCommit = (ref) => gitText(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
    const repository = gitText(['rev-parse', '--show-toplevel']).trim();
    const base = resolveCommit(options.base);
    const targetRef = options.target ?? 'HEAD';
    const target = resolveCommit(targetRef);
    const currentHead = resolveCommit('HEAD');
    const issues = [];
    const tree = (commit) => {
        const entries = new Map();
        for (const record of gitText(['ls-tree', '-r', '-z', '--full-tree', commit]).split('\0').filter(Boolean)) {
            const split = record.indexOf('\t');
            const [mode, type, oid] = record.slice(0, split).split(' ');
            if (type === 'blob' && oid && mode && ['100644', '100755'].includes(mode))
                entries.set(record.slice(split + 1), oid);
        }
        return entries;
    };
    const beforeTree = tree(base);
    const afterTree = tree(target);
    const allPaths = [...new Set([...beforeTree.keys(), ...afterTree.keys()])].sort();
    const isManifest = (path) => path === 'package.json' || path.endsWith('/package.json');
    const manifestPaths = allPaths.filter(isManifest);
    const metadataPaths = [...manifestPaths, 'pnpm-workspace.yaml'];
    const objectIds = [...new Set(metadataPaths.flatMap(path => [beforeTree.get(path), afterTree.get(path)]).filter((id) => id !== undefined))];
    const objects = new Map();
    if (objectIds.length) {
        const buffer = git(['cat-file', '--batch'], `${objectIds.join('\n')}\n`).stdout;
        let offset = 0;
        for (const oid of objectIds) {
            const newline = buffer.indexOf(10, offset);
            const match = /^([a-f0-9]+) blob (\d+)$/.exec(buffer.subarray(offset, newline).toString('utf8'));
            if (!match || match[1] !== oid)
                fail('COMPAT_GIT_ERROR', `Unexpected blob response for ${oid}`);
            const start = newline + 1;
            const end = start + Number(match[2]);
            if (end >= buffer.length || buffer[end] !== 10)
                fail('COMPAT_GIT_ERROR', `Incomplete blob response for ${oid}`);
            objects.set(oid, buffer.subarray(start, end).toString('utf8'));
            offset = end + 1;
        }
    }
    const blob = (entries, path) => objects.get(entries.get(path) ?? '');
    const manifests = (entries, revision) => {
        const values = new Map();
        for (const path of manifestPaths.filter(path => entries.has(path))) {
            try {
                const value = JSON.parse(blob(entries, path).replace(/^\uFEFF/, ''));
                if (!isObject(value))
                    throw new Error('expected a JSON object');
                values.set(path, value);
            }
            catch {
                // Do not echo malformed JSON: it may contain accidentally committed secrets.
                issues.push({ kind: 'invalid-manifest', revision, path, reason: 'Expected a valid JSON object' });
            }
        }
        return values;
    };
    const before = manifests(beforeTree, base);
    const after = manifests(afterTree, target);
    const packageIdentity = (path, value) => ({ path, name: value.name ?? null, version: value.version ?? null, private: value.private === true });
    const added = [];
    const removed = [];
    const contractChanged = [];
    let versionOnlyCount = 0;
    let unchangedManifestCount = 0;
    for (const path of manifestPaths) {
        const left = before.get(path);
        const right = after.get(path);
        if ((beforeTree.has(path) && !left) || (afterTree.has(path) && !right))
            continue;
        if (!left && right) {
            added.push(packageIdentity(path, right));
            continue;
        }
        if (!right && left) {
            removed.push(packageIdentity(path, left));
            continue;
        }
        if (!left || !right)
            continue;
        // Compare new metadata keys too, without a per-release allowlist.
        const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(key => key !== 'version').sort();
        const changes = fields.flatMap(field => differences(left[field], right[field], [field]));
        if (changes.length)
            contractChanged.push({ path, name: right.name ?? left.name ?? null, fromVersion: left.version ?? null, toVersion: right.version ?? null, changes });
        else if (left.version !== right.version)
            versionOnlyCount += 1;
        else
            unchangedManifestCount += 1;
    }
    const skillPaths = allPaths.filter(path => path === 'SKILL.md' || path.endsWith('/SKILL.md'));
    const skillEntrypoints = { added: [], removed: [], changed: [], unchangedCount: 0 };
    const skillResources = [];
    for (const path of skillPaths) {
        const left = beforeTree.get(path);
        const right = afterTree.get(path);
        if (!left)
            skillEntrypoints.added.push(path);
        else if (!right)
            skillEntrypoints.removed.push(path);
        else if (left !== right)
            skillEntrypoints.changed.push(path);
        else
            skillEntrypoints.unchangedCount += 1;
        const prefix = path.slice(0, -'SKILL.md'.length);
        const changedPaths = allPaths.filter(candidate => candidate.startsWith(prefix) && beforeTree.get(candidate) !== afterTree.get(candidate));
        if (changedPaths.length)
            skillResources.push({ entrypoint: path, changedPaths });
    }
    const summary = { changedPaths: 0, insertions: 0, deletions: 0, binaryPaths: 0 };
    const groups = new Map();
    for (const record of gitText(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--numstat', '-z', base, target, '--']).split('\0').filter(Boolean)) {
        const firstTab = record.indexOf('\t');
        const secondTab = record.indexOf('\t', firstTab + 1);
        const added = record.slice(0, firstTab);
        const removed = record.slice(firstTab + 1, secondTab);
        const segments = record.slice(secondTab + 1).split('/');
        const group = segments.length > 1 ? segments.slice(0, Math.min(2, segments.length - 1)).join('/') : '(root)';
        groups.set(group, (groups.get(group) ?? 0) + 1);
        summary.changedPaths += 1;
        if (added === '-' || removed === '-')
            summary.binaryPaths += 1;
        else {
            summary.insertions += Number(added);
            summary.deletions += Number(removed);
        }
    }
    const revision = (requestedRef, commit, manifest) => ({
        requestedRef, commit, localTags: gitText(['tag', '--points-at', commit]).trim().split('\n').filter(Boolean),
        rootManifest: manifest ? Object.fromEntries(['name', 'version', 'engines', 'packageManager'].filter(key => manifest[key] !== undefined).map(key => [key, manifest[key]])) : null,
    });
    const beforeWorkspace = discoverWorkspace(before, blob(beforeTree, 'pnpm-workspace.yaml'));
    const afterWorkspace = discoverWorkspace(after, blob(afterTree, 'pnpm-workspace.yaml'));
    const roots = options.roots ?? [];
    const beforeGraph = dependencyGraph(before, beforeWorkspace.packagePaths, roots);
    const afterGraph = dependencyGraph(after, afterWorkspace.packagePaths, roots);
    for (const [revision, workspace, graph] of [[base, beforeWorkspace, beforeGraph], [target, afterWorkspace, afterGraph]]) {
        issues.push(...[...workspace.issues, ...graph.issues].map(issue => ({ ...issue, revision })));
    }
    if (!roots.length)
        issues.push({ kind: 'dependency-roots', reason: 'No delivery roots selected; dependency closure is not assessed.' });
    return {
        schemaVersion: 2, checkedAt: new Date().toISOString(), repository,
        base: revision(options.base, base, before.get('package.json')),
        target: revision(targetRef, target, after.get('package.json')),
        checkout: { commit: currentHead, dirty: gitText(['status', '--porcelain=v1', '--untracked-files=normal']).trim().length > 0 },
        shallow: gitText(['rev-parse', '--is-shallow-repository']).trim() === 'true',
        baseIsAncestor: git(['merge-base', '--is-ancestor', base, target], undefined, [0, 1]).status === 0,
        targetOnlyCommitCount: Number(gitText(['rev-list', '--count', `${base}..${target}`]).trim()),
        diff: { ...summary, renameDetection: false, groups: [...groups].map(([path, changedPaths]) => ({ path, changedPaths })).sort((a, b) => b.changedPaths - a.changedPaths || a.path.localeCompare(b.path)) },
        manifests: {
            scope: 'all tracked regular package.json files, including possible fixtures',
            trackedManifestCount: { before: [...beforeTree.keys()].filter(isManifest).length, after: [...afterTree.keys()].filter(isManifest).length },
            comparedFields: 'all manifest fields, including previously unknown metadata',
            added, removed, contractChanged, versionOnlyCount, unchangedManifestCount,
        },
        workspaces: { before: beforeWorkspace, after: afterWorkspace },
        dependencies: {
            before: beforeGraph, after: afterGraph,
            added: afterGraph.nodes.filter(node => !beforeGraph.nodes.some(old => old.name === node.name)).map(node => node.name),
            removed: beforeGraph.nodes.filter(node => !afterGraph.nodes.some(next => next.name === node.name)).map(node => node.name),
        },
        skillEntrypoints, skillResources, issues,
        assessment: 'evidence-only; compatibility has not been established',
        limitations: [
            'Committed objects only; uncommitted changes and ignored build artifacts are not compared.',
            'All-manifest moves appear as removal plus addition; use workspace membership and package names to interpret them.',
            'Manifest equality does not establish source, runtime, persistence, or distribution compatibility.',
            'Dependency graph is declarative, not a semver/install solver; Registry availability and external transitive dependencies are unverified.',
            'Local tags are labels, not independently verified release provenance.',
        ],
    };
}
export function reportError(error) {
    console.error(JSON.stringify({ error: error instanceof CompatibilityError ? error.code : 'COMPAT_SCAN_ERROR', message: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    try {
        const usage = 'Usage: node compare-revisions.mjs --repo PATH --base REF [--target REF] [--root-package NAME ...]';
        const args = process.argv.slice(2);
        if (args.includes('--help') || args.includes('-h'))
            console.log(usage);
        else {
            const values = {};
            const roots = [];
            for (let index = 0; index < args.length; index += 1) {
                const flag = args[index];
                const value = args[++index];
                if (!['--repo', '--base', '--target', '--root-package'].includes(flag) || !value || value.startsWith('--'))
                    fail('COMPAT_USAGE', usage);
                if (flag === '--root-package')
                    roots.push(value);
                else
                    values[flag.slice(2)] = value;
            }
            if (!values.repo || !values.base)
                fail('COMPAT_USAGE', usage);
            console.log(JSON.stringify(compareRevisions({ repo: values.repo, base: values.base, target: values.target ?? 'HEAD', roots }), null, 2));
        }
    }
    catch (error) {
        reportError(error);
    }
}
