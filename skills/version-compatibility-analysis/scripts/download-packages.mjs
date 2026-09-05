import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { CompatibilityError, fail } from './compare-revisions.mjs';
import { isObject } from './dependencies.mjs';
// Only exact ordinary Registry specs can cross into npm. No tags, aliases,
// ranges, Git URLs, local paths, or executable upstream package-manager code.
const namePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const number = '(?:0|[1-9][0-9]*)';
const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const versionPattern = new RegExp(`^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
const exact = (name, version) => name.length <= 214 && namePattern.test(name)
    && typeof version === 'string' && version.length <= 256 && versionPattern.test(version);
export function createDownloadPlan(graph) {
    const targets = new Map();
    const deferred = new Map();
    const add = (name, requirement, conditional, privatePackage = false) => {
        if (!privatePackage && exact(name, requirement)) {
            const key = `${name}@${requirement}`;
            const previous = targets.get(key);
            targets.set(key, { name, version: requirement, conditional: conditional && (previous?.conditional ?? true) });
        }
        else {
            const reason = privatePackage ? 'private-package' : 'exact-version-required';
            const key = `${name}\0${String(requirement)}\0${reason}`;
            deferred.set(key, { name, requirement, conditional: conditional && (deferred.get(key)?.conditional ?? true), reason });
        }
    };
    for (const node of graph.nodes)
        add(node.name, node.version, node.conditional, node.private);
    for (const edge of graph.edges)
        if (edge.resolution === 'external')
            add(edge.name, edge.range, edge.conditional);
    return {
        packages: [...targets.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)),
        deferred: [...deferred.values()], issues: [...graph.issues],
    };
}
function registryUrl(input) {
    try {
        const url = new URL(input);
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash)
            throw new Error();
        if (!url.pathname.endsWith('/'))
            url.pathname += '/';
        return url.href;
    }
    catch {
        return fail('COMPAT_DOWNLOAD_REGISTRY', 'Use an explicit credential-free HTTPS Registry URL (HTTP is allowed only on loopback).');
    }
}
function contains(parent, child) {
    const path = relative(parent, child);
    return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}
const marker = '.compatibility-downloads-v1';
const markerBody = 'dsh-plugin-dev compatibility tarball cache v1\n';
async function storageDirectory(options) {
    const requested = resolve(options.directory);
    // The parent must exist. Canonicalize it before checking protected roots so
    // a symlink cannot place the cache inside an audited project or checkout.
    let directory;
    try {
        directory = join(await realpath(dirname(requested)), basename(requested));
    }
    catch {
        return fail('COMPAT_DOWNLOAD_DIRECTORY', 'Download parent directory must already exist.');
    }
    for (const root of options.protectedRoots ?? []) {
        const protectedRoot = await realpath(root);
        if (contains(protectedRoot, directory) || contains(directory, protectedRoot)) {
            fail('COMPAT_DOWNLOAD_DIRECTORY', 'Choose an isolated download directory outside the project, Harness and distributed Skill.');
        }
    }
    try {
        const stats = await lstat(directory);
        if (!stats.isDirectory() || stats.isSymbolicLink())
            throw new Error();
        const markerStats = await lstat(join(directory, marker));
        if (!markerStats.isFile() || markerStats.isSymbolicLink() || await readFile(join(directory, marker), 'utf8') !== markerBody)
            throw new Error();
    }
    catch (error) {
        // Only a missing directory may be initialized, not an existing empty or
        // foreign directory whose marker happens to be absent.
        const present = await lstat(directory).then(() => true, error => {
            if (error.code === 'ENOENT')
                return false;
            throw error;
        });
        if (present)
            fail('COMPAT_DOWNLOAD_DIRECTORY', 'Existing download directory is not an owned tarball cache; nothing was overwritten.');
        await mkdir(directory, { mode: 0o700 });
        await writeFile(join(directory, marker), markerBody, { flag: 'wx', mode: 0o600 });
    }
    return directory;
}
const exec = promisify(execFile);
const npmQuery = async (args, cwd) => {
    const result = await exec('npm', args, { cwd, encoding: 'utf8', timeout: 45_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 });
    try {
        return JSON.parse(result.stdout);
    }
    catch {
        return fail('COMPAT_DOWNLOAD_METADATA', 'npm did not return valid JSON.');
    }
};
const knownCodes = new Set(['E404', 'ETARGET', 'E401', 'E403', 'ENEEDAUTH', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EINTEGRITY', 'ENOENT', 'EACCES', 'ENOSPC', 'EEXIST']);
function errorResult(error) {
    let code = error instanceof CompatibilityError ? error.code : 'COMPAT_DOWNLOAD_NPM';
    if (isObject(error)) {
        let raw = error.code;
        if (typeof error.stdout === 'string') {
            try {
                const parsed = JSON.parse(error.stdout);
                if (isObject(parsed) && isObject(parsed.error))
                    raw = parsed.error.code;
            }
            catch { /* Never echo raw npm logs or credentials. */ }
        }
        if (typeof raw === 'string' && knownCodes.has(raw))
            code = raw;
        if (error.killed === true)
            code = 'ETIMEDOUT';
    }
    const status = ['E404', 'ETARGET'].includes(code) ? 'not-found'
        : ['E401', 'E403', 'ENEEDAUTH'].includes(code) ? 'auth-error'
            : ['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code) ? 'network-error' : 'failed';
    return { status, code };
}
function integrityHash(value) {
    if (typeof value === 'string') {
        const tokens = value.split(/\s+/);
        // Prefer the strongest supported SRI hash; never accept a weaker match
        // when the Registry also supplied a stronger, mismatching hash.
        for (const algorithm of ['sha512', 'sha384', 'sha256']) {
            const size = createHash(algorithm).digest().length;
            const digests = tokens.filter(token => token.startsWith(`${algorithm}-`)).map(token => token.slice(algorithm.length + 1));
            if (digests.length) {
                if (!digests.every(digest => /^[A-Za-z0-9+/]+={0,2}$/.test(digest) && Buffer.from(digest, 'base64').length === size))
                    break;
                return { algorithm, digests, integrity: value };
            }
        }
    }
    return fail('COMPAT_DOWNLOAD_INTEGRITY', 'Registry must supply a supported SHA-256/384/512 dist.integrity; no unverified download accepted.');
}
async function verifyArchive(path, hash) {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 100 * 1024 * 1024) {
        fail('COMPAT_DOWNLOAD_ARCHIVE', 'Expected a regular tarball no larger than 100 MiB.');
    }
    const digest = createHash(hash.algorithm).update(await readFile(path)).digest('base64');
    if (!hash.digests.includes(digest))
        fail('COMPAT_DOWNLOAD_INTEGRITY', 'Tarball integrity mismatch; existing files were preserved.');
}
export async function downloadPackages(plan, options, npm = npmQuery) {
    const registry = registryUrl(options.registry);
    for (const target of plan.packages)
        if (!exact(target.name, target.version))
            fail('COMPAT_DOWNLOAD_SPEC', 'Downloads require ordinary npm names and exact SemVer versions.');
    const directory = await storageDirectory(options);
    const packages = [];
    // Bounded sequential requests avoid Registry bursts and make retries explicit.
    // Each npm command has zero fetch retries and a hard process deadline.
    for (const target of plan.packages) {
        const spec = `${target.name}@${target.version}`;
        const archive = join(directory, `${createHash('sha256').update(`${registry}\0${spec}`).digest('hex')}.tgz`);
        const job = await mkdtemp(join(directory, '.npm-run-'));
        try {
            const flags = ['--json', '--ignore-scripts=true', '--workspaces=false', '--global=false', '--dry-run=false',
                '--prefer-online=true', '--offline=false', '--fetch-retries=0', '--fetch-timeout=15000',
                '--update-notifier=false', '--progress=false', '--logs-max=0', `--registry=${registry}`, `--cache=${join(job, 'cache')}`, `--prefix=${job}`];
            // --registry alone does not override a user-level @scope:registry.
            if (target.name.startsWith('@'))
                flags.push(`--${target.name.split('/')[0]}:registry=${registry}`);
            const metadata = await npm(['view', spec, 'name', 'version', 'dist', ...flags], job);
            if (!isObject(metadata) || metadata.name !== target.name || metadata.version !== target.version || !isObject(metadata.dist)) {
                fail('COMPAT_DOWNLOAD_METADATA', 'Registry did not return the exact requested package identity.');
            }
            const hash = integrityHash(metadata.dist.integrity);
            const existing = await lstat(archive).then(() => true, error => {
                if (error.code === 'ENOENT')
                    return false;
                throw error;
            });
            if (existing) {
                await verifyArchive(archive, hash);
                packages.push({ ...target, status: 'cached', archive, integrity: hash.integrity });
                continue;
            }
            const output = await npm(['pack', spec, `--pack-destination=${job}`, ...flags], job);
            const packed = Array.isArray(output) && output.length === 1 ? output[0] : undefined;
            if (!isObject(packed) || packed.name !== target.name || packed.version !== target.version || typeof packed.filename !== 'string'
                || !/^[A-Za-z0-9@._+-]+\.tgz$/.test(packed.filename) || packed.filename.startsWith('.')) {
                fail('COMPAT_DOWNLOAD_METADATA', 'npm pack did not return one safe, exact-version archive.');
            }
            const temporary = join(job, packed.filename);
            await verifyArchive(temporary, hash);
            await copyFile(temporary, archive, constants.COPYFILE_EXCL);
            packages.push({ ...target, status: 'downloaded', archive, integrity: hash.integrity });
        }
        catch (error) {
            packages.push({ ...target, ...errorResult(error) });
        }
        finally {
            await rm(job, { recursive: true, force: true });
        }
    }
    return {
        schemaVersion: 1, checkedAt: new Date().toISOString(), registry, directory,
        status: packages.length > 0 && packages.every(item => ['downloaded', 'cached'].includes(item.status)) && !plan.deferred.length && !plan.issues.length ? 'complete' : 'partial',
        packages, deferred: plan.deferred, issues: plan.issues,
        scope: 'Exact public workspace candidates and exact declared external edges only; conditional packages are labeled, not platform-resolved. Ranges, private packages and external transitive resolution remain unverified. Downloads are not installation, runtime verification or publication readiness.',
    };
}
