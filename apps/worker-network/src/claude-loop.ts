/**
 * The autonomous pentest loop. Wraps the standard Anthropic Messages
 * API with tool-use: Claude reasons, calls a wrapped pentest tool, we
 * execute it, return the (truncated) output, and continue until Claude
 * issues end_turn or we hit the max-turns ceiling.
 *
 * Why not the Claude Agent SDK like apps/worker uses?
 *   - The Agent SDK assumes a working dir + git checkpointing + a code
 *     repo to read, none of which we need here.
 *   - Direct tool-use gives us byte-level audit control: every tool
 *     call lands in our scope-guard + audit log, and the LLM has zero
 *     ability to expand outside the wrapped tool surface.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import { findTool, toolsForIntensity } from './tools/index.js';
import type { RunContext, ToolDefinition } from './types.js';

const DEFAULT_MODEL = process.env.NAHAYAT_PENTEST_MODEL ?? 'claude-opus-4-7';
const MAX_TURNS = Number(process.env.NAHAYAT_MAX_TURNS ?? '60');
const MAX_TOKENS = Number(process.env.NAHAYAT_MAX_TOKENS ?? '16384');

export interface LoopResult {
  finalText: string;
  turns: number;
  toolCallCount: number;
  stopReason: string | null;
}

function toolToAnthropic(t: ToolDefinition): Anthropic.Tool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  };
}

/**
 * Run one Claude conversation to completion. `systemPrompt` is the
 * phase-specific persona (recon/enum/exploit/report); the user message
 * delivers scope, allowlist, and goals. The loop keeps appending tool
 * results until Claude either declares end_turn or we hit MAX_TURNS.
 */
export async function runPentestLoop(opts: {
  systemPrompt: string;
  userPrompt: string;
  ctx: RunContext;
  client: Anthropic;
  phaseLabel: string;
}): Promise<LoopResult> {
  const { systemPrompt, userPrompt, ctx, client, phaseLabel } = opts;
  const tools = toolsForIntensity(ctx.intensity).map(toolToAnthropic);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
  let toolCallCount = 0;
  let stopReason: string | null = null;
  let finalText = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools,
      messages,
    });
    stopReason = response.stop_reason;

    const assistantContent: Anthropic.ContentBlock[] = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    // Surface any text Claude produced, so the report phase has something to read.
    for (const block of assistantContent) {
      if (block.type === 'text') {
        finalText += `${block.text}\n`;
        // Each text-block prefixed with the phase label so the runner can
        // pattern-match status transitions (phase:enum / phase:exploit / etc).
        const lineCount = block.text.split('\n').length;
        process.stdout.write(`[phase:${phaseLabel}] (${lineCount} lines)\n`);
      }
    }

    if (response.stop_reason !== 'tool_use') {
      return { finalText, turns: turn + 1, toolCallCount, stopReason };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of assistantContent) {
      if (block.type !== 'tool_use') continue;
      toolCallCount++;
      const def = findTool(block.name);
      const startedAt = Date.now();
      let resultText: string;
      let isError = false;
      if (!def) {
        resultText = `ERROR: unknown tool '${block.name}'.`;
        isError = true;
      } else {
        try {
          process.stdout.write(`[phase:${phaseLabel}] -> ${block.name}\n`);
          resultText = await def.run(block.input, ctx);
        } catch (err) {
          isError = true;
          resultText = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      fs.appendFileSync(
        ctx.auditLogPath.replace(/\.jsonl$/, '.transcript.jsonl'),
        `${JSON.stringify({ ts: new Date().toISOString(), phase: phaseLabel, tool: block.name, input: block.input, ms: Date.now() - startedAt, isError, output: resultText.slice(0, 4096) })}\n`,
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultText,
        ...(isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { finalText, turns: MAX_TURNS, toolCallCount, stopReason: 'max_turns' };
}
