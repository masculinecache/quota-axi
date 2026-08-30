import { type ChildProcess } from "node:child_process";
export declare function execFileText(command: string, args: string[], timeoutMs: number): Promise<string>;
export declare function commandExists(command: string): Promise<boolean>;
export declare function findCommandPath(command: string): Promise<string | undefined>;
export declare function terminateChild(child: ChildProcess): void;
