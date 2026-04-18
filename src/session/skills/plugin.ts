/**
 * SkillsPlugin — TypeScript implementation of the AgentSkills pattern.
 *
 * The official Python SDK ships `AgentSkills` as a first-class plugin.
 * The TypeScript SDK (v1.0.0-rc.3) does not yet include it, so this module
 * hand-implements the same three-phase pattern using the `Plugin` interface:
 *
 *   Phase 1 — Discovery:
 *     `initAgent` hooks `BeforeInvocationEvent` to inject an
 *     `<available_skills>` XML block into the agent's system prompt before
 *     every invocation.  The model reads this to learn which skills exist.
 *
 *   Phase 2 — Activation:
 *     `getTools` returns the `skills` tool (auto-registered by the SDK's
 *     `PluginRegistry`).  When the model wants specialised expertise it calls
 *     `skills({ skill_name: "…" })` to receive the full instructions.
 *
 *   Phase 3 — Execution:
 *     The model follows the loaded instructions for the remainder of the turn.
 *
 * @example
 * ```typescript
 * import { SkillsPlugin } from "@litmdx/agent";
 *
 * const agent = new Agent({
 *   model,
 *   plugins: [
 *     new SkillsPlugin([
 *       {
 *         name: "mdx-troubleshooting",
 *         description: "Diagnose and fix MDX compilation errors.",
 *         instructions: "# MDX Troubleshooting\nYou are an expert…",
 *       },
 *     ]),
 *   ],
 * });
 * ```
 */

import { BeforeInvocationEvent, tool } from "@strands-agents/sdk";
import type { Plugin, LocalAgent, Tool } from "@strands-agents/sdk";
import { z } from "zod";
import type { SkillDefinition } from "./types.js";

export class SkillsPlugin implements Plugin {
  readonly name = "litmdx:skills";

  /** Internal index: skill name → definition. */
  private readonly index: Map<string, SkillDefinition>;

  constructor(skills: SkillDefinition[]) {
    this.index = new Map(skills.map((s) => [s.name, s]));
  }

  // ---------------------------------------------------------------------------
  // Phase 2 — Activation tool
  // ---------------------------------------------------------------------------

  /**
   * Returns the `skills` tool.
   * The SDK's `PluginRegistry` calls this method and registers the result in
   * the agent's tool registry automatically — no manual wiring required.
   *
   * Returns an empty array when no skills are configured, so the tool is not
   * registered unnecessarily.
   */
  getTools(): Tool[] {
    if (this.index.size === 0) return [];

    const index = this.index;
    return [
      tool({
        name: "skills",
        description:
          "Load the complete instructions for a specialised skill. " +
          "Call this when you need expertise listed in <available_skills>. " +
          "Pass the exact skill name as `skill_name`.",
        inputSchema: z.object({
          skill_name: z
            .string()
            .describe(
              "The name of the skill to activate (must match a <name> in <available_skills>)",
            ),
        }),
        callback: ({ skill_name }) => {
          const skill = index.get(skill_name);
          if (!skill) {
            const available = [...index.keys()].join(", ");
            return (
              `Skill '${skill_name}' not found. ` + `Available skills: ${available || "(none)"}`
            );
          }
          return skill.instructions;
        },
      }),
    ];
  }

  // ---------------------------------------------------------------------------
  // Phase 1 — Discovery injection
  // ---------------------------------------------------------------------------

  /**
   * Registers a `BeforeInvocationEvent` hook that prepends the
   * `<available_skills>` XML block to the agent's system prompt before each
   * invocation.
   *
   * The base prompt is captured at `initAgent` time; the XML is rebuilt from
   * that snapshot on every invocation so subsequent external modifications to
   * the system prompt are not accumulated.
   *
   * When no skills are configured this method is a no-op.
   */
  initAgent(agent: LocalAgent): void {
    if (this.index.size === 0) return;

    const xml = this.buildSkillsXml();

    // Capture the base system prompt once (set by the Agent constructor before
    // plugins are initialized).
    const basePrompt = typeof agent.systemPrompt === "string" ? agent.systemPrompt : "";

    // Apply immediately so the XML is present from the very first invocation.
    agent.systemPrompt = `${basePrompt}\n\n${xml}`;

    // Refresh before every subsequent invocation.
    agent.addHook(BeforeInvocationEvent, (event) => {
      event.agent.systemPrompt = `${basePrompt}\n\n${xml}`;
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Builds the `<available_skills>` XML discovery block. */
  private buildSkillsXml(): string {
    const items = [...this.index.values()]
      .map(
        (s) =>
          `  <skill>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n  </skill>`,
      )
      .join("\n");
    return `<available_skills>\n${items}\n</available_skills>`;
  }
}
