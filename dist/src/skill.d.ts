export declare const SKILL_DESCRIPTION: string;
export declare const SKILL_AUTHOR = "Kun Chen (kunchenguid)";
export declare const HERMES_TAGS: string[];
export declare const HERMES_CATEGORY = "observability";
/**
 * Render the installable SKILL.md for the quota-axi skill. The body uses the
 * same shared CLI description and help text, then adds agent-facing workflow
 * guidance that prefers non-interactive `npx -y quota-axi ...` invocation so
 * the CLI comes along on demand.
 *
 * @returns full SKILL.md contents including YAML frontmatter
 */
export declare function createSkillMarkdown(): string;
