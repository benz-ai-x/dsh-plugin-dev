#!/usr/bin/env node
type DeliveryMode = 'source' | 'registry';
type BaselineChannel = 'stable' | 'edge';
interface ProjectNames {
    packageName: string;
    pluginName: string;
    toolName: string;
}
export interface CreateProjectOptions {
    target?: string | undefined;
    kind?: string | undefined;
    name?: string | undefined;
    pluginName?: string | undefined;
    toolName?: string | undefined;
    description?: string | undefined;
    harnessRoot?: string | undefined;
    channel?: string | undefined;
    delivery?: string | undefined;
    json?: boolean | undefined;
    help?: boolean | undefined;
}
export interface CreateProjectResult extends ProjectNames {
    kind: 'tool';
    channel: BaselineChannel;
    delivery: DeliveryMode;
    target: string;
    harnessRoot: string | undefined;
    files: string[];
}
export declare class ScaffoldError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function nodeSatisfies(range: string, version?: string): boolean;
export declare function harnessWorktreeChanges(sourceRoot: string): string;
export declare function validateHarnessArtifacts(sourceRoot: string, linkedPackageLocations?: Readonly<Record<string, string>>): Promise<void>;
export declare function createProject(options?: CreateProjectOptions): Promise<CreateProjectResult>;
export declare function parseArgs(argv: readonly string[]): CreateProjectOptions;
export {};
