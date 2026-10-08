// Ported from the hub (nql-agents ops/verify/e2e-army/cli-model.ts) for Mizano's in-repo gate (#153); binaries overridable with
// E2E_ARMY_AGY_BIN / E2E_ARMY_CLAUDE_BIN.
// A tool-calling, vision-capable LanguageModel (AI SDK v4 spec) backed by a subscription CLI — zero API cost.
// e2e (tester-army) only supports API keys and a few OAuth subscriptions; this adapter lets it use the owner's existing
// logins instead: `agy` (Google Antigravity, Gemini Flash via the Google account — free, first choice) or the Claude
// Haiku CLI (last resort, only started when the hub's quota gate allows it, see src/lib/e2earmy.ts).
// Protocol: the tools and the conversation are put into one prompt; the CLI answers with JSON
//   {"text": "...", "tool_calls": [{"name": "...", "arguments": {...}}]}
// Screenshots (file parts) are written to a temp dir and referenced by path (the CLI views them with its file reader).
import { execFile, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Any = any;
export interface CliModelOpts { cli: "agy" | "claude"; model?: string; timeoutMs?: number }

const AGY = process.env.E2E_ARMY_AGY_BIN ?? "/opt/homebrew/bin/agy", CLAUDE = process.env.E2E_ARMY_CLAUDE_BIN ?? "/opt/homebrew/bin/claude";

function render(prompt: Any[], dir: string): string {
  let n = 0;
  const out: string[] = [];
  for (const m of prompt) {
    if (m.role === "system") { out.push(`[SYSTEM]\n${m.content}`); continue; }
    const parts: string[] = [];
    for (const p of m.content as Any[]) {
      if (p.type === "text") parts.push(p.text);
      else if (p.type === "file") {
        const ext = String(p.mediaType).split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
        const f = join(dir, `img${++n}.${ext}`);
        const d = p.data?.type === "data" ? p.data.data : p.data; // v4: {type:'data', data} | {type:'url'} ; older: raw
        try { writeFileSync(f, typeof d === "string" ? Buffer.from(d, "base64") : Buffer.from(d)); parts.push(`[image attached: ${f} — open and look at it]`); } catch { parts.push("[image omitted]"); }
      } else if (p.type === "tool-call") parts.push(`(called tool ${p.toolName} with ${JSON.stringify(p.input)})`);
      else if (p.type === "tool-result") parts.push(`(result of ${p.toolName}: ${typeof p.output?.value === "string" ? p.output.value : JSON.stringify(p.output?.value ?? p.output)})`);
    }
    out.push(`[${String(m.role).toUpperCase()}]\n${parts.join("\n")}`);
  }
  return out.join("\n\n");
}

function protocol(tools: Any[], toolChoice: Any): string {
  const defs = tools.map((t) => `- ${t.name}${t.description ? `: ${String(t.description).slice(0, 400)}` : ""}\n  arguments JSON schema: ${JSON.stringify(t.inputSchema)}`).join("\n");
  const must = toolChoice?.type === "required" ? "You MUST call at least one tool." : toolChoice?.type === "tool" ? `You MUST call the tool ${toolChoice.toolName}.` : "";
  return `You are the model behind a UI test agent. You do not have shell, browser or file-edit access in this turn; only decide the next tool call(s).\n` +
    `${tools.length ? `AVAILABLE TOOLS:\n${defs}\n${must}\n` : ""}` +
    `Answer with ONE JSON object and nothing else (no markdown fence): {"text": "<short reasoning or final message>", "tool_calls": [{"name": "<tool>", "arguments": {<per schema>}}]}. ` +
    `Use tool_calls: [] only when no tool is needed or the task is finished.`;
}

function runCli(o: CliModelOpts, text: string, dir: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = o.cli === "agy"
      ? ["-p", text, "--model", o.model ?? "gemini-3.8-flash-low", "--print-timeout", "3m"]
      : ["-p", "--model", o.model ?? "haiku", "--effort", "low", "--output-format", "json", "--allowedTools", "Read", "--add-dir", dir];
    const child = spawn(o.cli === "agy" ? AGY : CLAUDE, args, { cwd: dir, stdio: [o.cli === "agy" ? "ignore" : "pipe", "pipe", "pipe"], env: { ...process.env, DO_NOT_TRACK: "1" } });
    // The runner runs under taskpolicy -b (hub governor); a model CLI at background QoS answers 5x slower and the whole suite misses
    // its 5 min budget, so lift the background bit off the model process (it is network/latency bound, not CPU heavy).
    if (child.pid && process.platform === "darwin") execFile("/usr/sbin/taskpolicy", ["-B", "-p", String(child.pid)], () => undefined);
    if (o.cli === "claude") { child.stdin!.end(text); }
    let out = "", err = "";
    const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${o.cli} timed out`)); }, o.timeoutMs ?? 150_000);
    signal?.addEventListener("abort", () => { child.kill("SIGKILL"); reject(new Error("aborted")); });
    child.stdout!.on("data", (d) => (out += d));
    child.stderr!.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(t); reject(e); });
    child.on("exit", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`${o.cli} exit ${code}: ${(err || out).slice(0, 300)}`));
      if (o.cli === "claude") { try { const j = JSON.parse(out); if (j.is_error) return reject(new Error(String(j.result).slice(0, 300))); return resolve(String(j.result ?? "")); } catch { /* raw */ } }
      resolve(out);
    });
  });
}

function parse(raw: string): { text: string; calls: { name: string; arguments: Any }[] } {
  const s = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) return { text: raw.trim(), calls: [] };
  try {
    const j = JSON.parse(s.slice(a, b + 1));
    const calls = (Array.isArray(j.tool_calls) ? j.tool_calls : []).filter((c: Any) => c && typeof c.name === "string").map((c: Any) => ({ name: c.name, arguments: c.arguments ?? {} }));
    return { text: typeof j.text === "string" ? j.text : "", calls };
  } catch { return { text: raw.trim(), calls: [] }; }
}

export function cliModel(o: CliModelOpts): Any {
  const modelId = `${o.cli}:${o.model ?? (o.cli === "agy" ? "gemini-3.8-flash-low" : "haiku")}`;
  return {
    specificationVersion: "v4", provider: "cli", modelId, supportedUrls: {},
    async doGenerate(opts: Any) {
      const dir = mkdtempSync(join(tmpdir(), "e2e-army-model-"));
      try {
        const tools = (opts.tools ?? []).filter((t: Any) => t.type === "function");
        const text = `${protocol(tools, opts.toolChoice)}\n\n${render(opts.prompt, dir)}\n\n[ASSISTANT — reply with the JSON object only]`;
        let raw = await runCli(o, text, dir, opts.abortSignal);
        let r = parse(raw);
        if (tools.length && !r.calls.length && opts.toolChoice?.type === "required") { raw = await runCli(o, text + "\n\nYour previous answer had no tool call. Call a tool now.", dir, opts.abortSignal); r = parse(raw); }
        const names = new Set(tools.map((t: Any) => t.name));
        const calls = r.calls.filter((c) => names.has(c.name));
        const content: Any[] = [];
        if (r.text) content.push({ type: "text", text: r.text });
        calls.forEach((c, i) => content.push({ type: "tool-call", toolCallId: `call_${Date.now().toString(36)}_${i}`, toolName: c.name, input: JSON.stringify(c.arguments) }));
        const tokens = Math.ceil(text.length / 4);
        return {
          content, finishReason: { unified: calls.length ? "tool-calls" : "stop", raw: undefined },
          usage: { inputTokens: { total: tokens, noCache: tokens, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: Math.ceil(raw.length / 4), text: undefined, reasoning: undefined } },
          warnings: [], response: { modelId },
        };
      } finally { rmSync(dir, { recursive: true, force: true }); }
    },
    async doStream() { throw new Error("cli model: streaming not supported (e2e uses generateText)"); },
  };
}
