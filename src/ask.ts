import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { describeError, formatOutput, tools } from "./tools.js";

/**
 * Natural-language path, for the open-ended questions you can't pre-bind to a
 * button or a fixed voice phrase ("what shields does a Carrack ship with?").
 *
 * Deliberately NOT routed through MCP: MCP is the adapter Claude Code needs to
 * spawn this project as a subprocess. In-process we can hand the same registry
 * straight to the SDK's tool runner and skip a hop.
 */

/**
 * Tool results dominate the token bill here — an unfiltered trade-routes
 * response is ~10k tokens. The MCP path can afford 40k characters because a
 * chat session has room; a spoken one-liner does not.
 */
const ASK_OUTPUT_BUDGET = 8000;

const DEFAULT_MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You answer Star Citizen questions for a pilot who is currently flying and listening, not reading.

Rules:
- Answer in one or two spoken sentences. No lists, no markdown, no JSON, no code.
- Lead with the number or name they asked for. Detail after, only if it changes what they'd do.
- Write out what should be said aloud. Say "S C U" rather than "SCU", and write numbers plainly.
- Prices and routes move constantly. Use the tools for anything current; never answer market questions from memory.
- If a tool returns nothing useful, say so in one short sentence rather than guessing.`;

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export function askAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const runnableTools = tools.map((tool) =>
  betaTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    run: async (input: unknown) => {
      try {
        const result = await tool.handler(input);
        return typeof result === "string"
          ? result.slice(0, ASK_OUTPUT_BUDGET)
          : formatOutput(result, ASK_OUTPUT_BUDGET);
      } catch (error) {
        // Hand the failure back to the model so it can recover or say so aloud,
        // rather than collapsing the whole request.
        return describeError(error);
      }
    },
  }),
);

export interface AskResult {
  text: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
  };
}

export async function ask(question: string): Promise<AskResult> {
  const model = process.env.SCMCP_ASK_MODEL || DEFAULT_MODEL;
  const effort = process.env.SCMCP_ASK_EFFORT || "low";

  const message = await getClient().beta.messages.toolRunner({
    model,
    max_tokens: 4096,
    // Low effort suits a single lookup answered in one sentence; raise it with
    // SCMCP_ASK_EFFORT for questions that need real reasoning.
    output_config: { effort: effort as "low" | "medium" | "high" | "xhigh" | "max" },
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        // Tools render before system, so this breakpoint caches both. The tool
        // schemas are the stable prefix; only the question varies per request.
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: runnableTools,
    messages: [{ role: "user", content: question }],
  });

  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();

  return {
    text: text || "No answer produced.",
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_read_input_tokens: message.usage.cache_read_input_tokens,
    },
  };
}
