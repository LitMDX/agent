/**
 * Types for the Skills subsystem.
 *
 * A Skill represents a named, on-demand set of instructions that the agent
 * can load lazily when it needs specialized expertise.  The pattern mirrors
 * Python's `AgentSkills` plugin (not yet available in the TypeScript SDK):
 *
 *   1. Discovery  — `<available_skills>` XML injected into the system prompt
 *                   lets the model know which skills exist.
 *   2. Activation — The agent calls the `skills` tool with `skill_name` to
 *                   retrieve the full instructions for that skill.
 *   3. Execution  — The agent follows the loaded instructions.
 */

/**
 * A single skill definition.
 *
 * @example
 * ```typescript
 * const skill: SkillDefinition = {
 *   name: "mdx-troubleshooting",
 *   description: "Diagnose and fix common MDX compilation errors.",
 *   instructions: "# MDX Troubleshooting\nYou are an expert in...",
 * };
 * ```
 */
export interface SkillDefinition {
  /**
   * Unique skill identifier.
   * Convention: lowercase alphanumeric and hyphens, 1–64 characters.
   * Must match the value the agent passes to the `skills` tool.
   */
  name: string;

  /**
   * One-line description shown in the discovery `<available_skills>` XML.
   * Keep it short and precise — the model reads this to decide which skill to load.
   */
  description: string;

  /**
   * Full markdown instructions returned when the skill is activated.
   * This is the "SKILL.md body" equivalent — rich, detailed instructions
   * the agent follows to perform the specialised task.
   */
  instructions: string;
}
