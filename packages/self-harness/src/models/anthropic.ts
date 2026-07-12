import type { Model } from "../types.js";

/**
 * Minimal structural view of the parts of `@anthropic-ai/sdk` this adapter
 * uses, so the package builds and the offline demo runs without the SDK
 * installed. The SDK is loaded lazily on first use.
 */
interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
}
interface AnthropicClient {
  messages: { create(body: Record<string, unknown>): Promise<AnthropicMessage> };
}
type AnthropicCtor = new (opts?: { apiKey?: string }) => AnthropicClient;

export interface AnthropicModelOptions {
  /** Model id. Defaults to Anthropic's most capable Opus-tier model. */
  model?: string;
  /** Overrides `ANTHROPIC_API_KEY` / `ant auth login` credential resolution. */
  apiKey?: string;
  maxTokens?: number;
}

/**
 * The real {@link Model} adapter. Backs both the task-solving agent and the
 * self-editing proposer, so "the model proposes edits to its own harness" is
 * literal — the same model id runs both. Requires `@anthropic-ai/sdk` at
 * runtime; install it in the consuming project.
 */
export class AnthropicModel implements Model {
  readonly name: string;
  private client: AnthropicClient | null = null;

  constructor(private readonly options: AnthropicModelOptions = {}) {
    this.name = options.model ?? "claude-opus-4-8";
  }

  private async getClient(): Promise<AnthropicClient> {
    if (this.client) return this.client;
    // Non-literal specifier keeps the SDK an optional runtime dependency:
    // TypeScript does not resolve it at build time.
    const specifier = "@anthropic-ai/sdk";
    let mod: { default: AnthropicCtor };
    try {
      mod = (await import(specifier)) as { default: AnthropicCtor };
    } catch {
      throw new Error(
        "AnthropicModel requires '@anthropic-ai/sdk'. Install it: bun add @anthropic-ai/sdk",
      );
    }
    const Anthropic = mod.default;
    this.client = new Anthropic(this.options.apiKey ? { apiKey: this.options.apiKey } : undefined);
    return this.client;
  }

  async complete(input: { system?: string; user: string }): Promise<string> {
    const client = await this.getClient();
    const body: Record<string, unknown> = {
      model: this.name,
      max_tokens: this.options.maxTokens ?? 4096,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: input.user }],
    };
    if (input.system) body.system = input.system;
    const response = await client.messages.create(body);
    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
  }
}
