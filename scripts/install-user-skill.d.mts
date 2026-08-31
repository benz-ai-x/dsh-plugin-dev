#!/usr/bin/env node
declare const agentTargetSegments: {
    readonly codex: readonly [".agents", "skills"];
    readonly claude: readonly [".claude", "skills"];
};
type Agent = keyof typeof agentTargetSegments;
type InstallStatus = 'would-install' | 'already-installed' | 'installed';
interface InstallPlan {
    status: InstallStatus;
    source: string;
    target: string;
    targetRoot: string;
    agent?: Agent | undefined;
}
interface InstallUserSkillOptions {
    source?: string | undefined;
    targetRoot?: string | undefined;
    dryRun?: boolean | undefined;
}
interface InstallUserSkillsOptions {
    source?: string | undefined;
    homeDirectory?: string | undefined;
    agents?: readonly string[] | undefined;
    dryRun?: boolean | undefined;
}
export declare class SkillInstallError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function installUserSkill({ source, targetRoot, dryRun, }?: InstallUserSkillOptions): Promise<InstallPlan>;
export declare function installUserSkills({ source, homeDirectory, agents, dryRun, }?: InstallUserSkillsOptions): Promise<InstallPlan[]>;
export {};
