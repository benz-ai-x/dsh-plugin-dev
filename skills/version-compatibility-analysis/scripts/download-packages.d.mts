import type { dependencyGraph, Issue } from './dependencies.mjs';
export interface DownloadTarget {
    name: string;
    version: string;
    conditional: boolean;
}
export interface DownloadPlan {
    packages: DownloadTarget[];
    deferred: Array<{
        name: string;
        requirement: unknown;
        conditional: boolean;
        reason: string;
    }>;
    issues: Issue[];
}
export interface DownloadOptions {
    directory: string;
    registry: string;
    protectedRoots?: readonly string[];
}
export type NpmQuery = (args: string[], cwd: string) => Promise<unknown>;
export interface DownloadResult extends DownloadTarget {
    status: 'downloaded' | 'cached' | 'not-found' | 'auth-error' | 'network-error' | 'failed';
    archive?: string;
    integrity?: string;
    code?: string;
}
export declare function createDownloadPlan(graph: ReturnType<typeof dependencyGraph>): DownloadPlan;
export declare function downloadPackages(plan: DownloadPlan, options: DownloadOptions, npm?: NpmQuery): Promise<{
    schemaVersion: number;
    checkedAt: string;
    registry: string;
    directory: string;
    status: string;
    packages: DownloadResult[];
    deferred: {
        name: string;
        requirement: unknown;
        conditional: boolean;
        reason: string;
    }[];
    issues: Issue[];
    scope: string;
}>;
