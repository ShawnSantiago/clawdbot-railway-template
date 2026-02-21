#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_GEMINI_TIMEOUT_SECONDS = 60;
const DEFAULT_MAX_TURNS = 10;
const DEFAULT_OUTPUT_MODE = "stream-json";
const OUTPUT_MODES = new Set(["json", "stream-json"]);

const CLAUDE_AGENTS = JSON.stringify({
  "plan-reviewer": {
    description:
      "Validates and critiques development plans based on AGENTS.md policies.",
    prompt:
      "You are a meticulous reviewer. Examine plan structure, risk coverage, confidence scoring, Memory Bank references, and consistency with validation requirements. Identify omissions, policy violations, and propose concrete fixes.",
    tools: ["Read"],
  },
});

const FALLBACK_DECISION_MATRIX = {
  claude_timeout: "fallback_to_gemini",
  claude_timeout_no_output: "fallback_to_gemini",
  claude_timeout_partial_output: "fallback_to_gemini",
  claude_empty_output_nonzero: "fallback_to_gemini",
  claude_generic_nonzero: "fallback_to_gemini",
  claude_max_turns_reached: "fallback_to_gemini",
  claude_terminal_subtype_error: "fallback_to_gemini",
  claude_unclassified_output: "fallback_to_gemini",
  claude_auth_failure: "escalate_human_review_needed",
  claude_credit_or_quota_failure: "escalate_human_review_needed",
  gemini_auth_required: "escalate_human_review_needed",
  both_failed: "escalate_human_review_needed",
};

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function dateStampUTC() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function usageAndExit(code = 1) {
  console.error(
    [
      "Usage:",
      "  node scripts/run-plan-review.mjs --plan-file <path> [options]",
      "",
      "Required:",
      "  --plan-file <path>                  Path to plan JSON",
      "",
      "Optional:",
      "  --plan-id <id>                      Plan ID (defaults to filename stem)",
      "  --home <path>                       HOME for CLI commands (defaults to cwd)",
      "  --timeout-seconds <n>               Claude timeout (default: 600)",
      "  --gemini-timeout-seconds <n>        Gemini timeout (default: 60)",
      "  --max-turns <n>                     Claude max turns (default: 10)",
      "  --output-mode <json|stream-json>    Claude output mode (default: stream-json)",
      "  --output-dir <path>                 Artifact directory (default: audit/plan_review_outputs)",
      "  --audit-log <path>                  Audit log path (default: audit/plan_reviews.log)",
      "  --preflight-log <path>              Preflight log path",
      "  --no-fallback                       Disable Gemini fallback",
      "  --skip-preflight                    Skip staged preflight probes",
      "  --iteration <n>                     Force iteration number",
      "  --dry-run                           Print planned invocations without executing",
    ].join("\n"),
  );
  process.exit(code);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function readFileIfExists(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function detectNextIteration(auditLogPath, planId) {
  const raw = await readFileIfExists(auditLogPath);
  let maxIteration = 0;
  for (const line of raw.split("\n")) {
    if (!line.includes(`plan_id:${planId}`)) continue;
    const match = line.match(/\biteration:(\d+)/);
    if (!match) continue;
    maxIteration = Math.max(maxIteration, Number(match[1]));
  }
  return maxIteration + 1;
}

function sanitizeOneLine(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

async function appendLine(filePath, line) {
  await ensureDir(path.dirname(filePath));
  await fsp.appendFile(filePath, `${line}\n`, "utf8");
}

function collectTextPreview(text, maxLength = 24000) {
  if (text.length <= maxLength) return text;
  return text.slice(text.length - maxLength);
}

async function runCommand({
  command,
  args,
  env,
  cwd,
  timeoutSeconds,
  outputFile,
}) {
  const start = Date.now();
  await ensureDir(path.dirname(outputFile));
  const out = fs.createWriteStream(outputFile, { flags: "w" });
  let timedOut = false;
  let outputBytes = 0;
  let preview = "";

  const child = spawn(command, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2000).unref();
  }, timeoutSeconds * 1000);

  const onChunk = (chunk) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    outputBytes += buf.length;
    out.write(buf);
    preview += buf.toString("utf8");
    preview = collectTextPreview(preview);
  };

  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);

  const exit = await new Promise((resolve) => {
    child.on("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });

  clearTimeout(timer);
  await new Promise((resolve) => out.end(resolve));
  const elapsedSeconds = Math.round((Date.now() - start) / 1000);

  return {
    command,
    args,
    exitCode: exit.exitCode ?? -1,
    signal: exit.signal ?? "",
    timedOut,
    elapsedSeconds,
    outputBytes,
    preview,
  };
}

function parseFirstJsonObject(text) {
  const line = text
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.startsWith("{") && s.endsWith("}"));
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function classifyApprovalText(text) {
  const normalized = String(text || "").toLowerCase();
  if (
    normalized.includes("approved with mandatory revisions") ||
    normalized.includes("approved with minor revisions") ||
    normalized.includes("approved with revisions") ||
    normalized.includes("approve with revisions") ||
    normalized.includes("approved_with_revisions")
  ) {
    return "approved_with_revisions";
  }
  if (normalized.includes("approved")) return "approved";
  return "claude_unclassified_output";
}

function detectClaudeFailure(text) {
  const normalized = String(text || "").toLowerCase();
  if (
    normalized.includes("credit balance is too low") ||
    normalized.includes("insufficient credit") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("exceeded your current quota")
  ) {
    return "claude_credit_or_quota_failure";
  }
  if (
    normalized.includes("invalid api key") ||
    normalized.includes("please run /login") ||
    normalized.includes("authentication_error") ||
    normalized.includes("unauthorized")
  ) {
    return "claude_auth_failure";
  }
  return null;
}

async function readTerminalResultEvent(outputFile) {
  const raw = await readFileIfExists(outputFile);
  let terminalEvent = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.type === "result") terminalEvent = parsed;
    } catch {
      // Ignore non-JSON lines in mixed stdout/stderr output.
    }
  }
  return terminalEvent;
}

async function classifyClaudeResult(result, outputFile) {
  const normalized = result.preview.toLowerCase();
  const parsed = parseFirstJsonObject(result.preview);

  if (result.timedOut) {
    if (result.outputBytes > 0) return "claude_timeout_partial_output";
    return "claude_timeout_no_output";
  }

  const terminalEvent = await readTerminalResultEvent(outputFile);
  if (terminalEvent) {
    const terminalSubtype = String(terminalEvent.subtype || "").toLowerCase();
    const terminalText =
      typeof terminalEvent.result === "string"
        ? terminalEvent.result
        : JSON.stringify(terminalEvent.result ?? "");
    const failureClass = detectClaudeFailure(terminalText);

    if (terminalSubtype === "error_max_turns") {
      return "claude_max_turns_reached";
    }

    if (terminalEvent.is_error === true) {
      if (failureClass) return failureClass;
      return result.outputBytes === 0 ? "claude_empty_output_nonzero" : "claude_generic_nonzero";
    }
    if (terminalSubtype && terminalSubtype !== "success") {
      if (failureClass) return failureClass;
      return "claude_terminal_subtype_error";
    }
    if (terminalEvent.is_error === false || terminalSubtype === "success") {
      return classifyApprovalText(terminalText);
    }
    if (failureClass) return failureClass;
  }

  const parsedResultText =
    parsed && typeof parsed.result === "string" ? parsed.result.toLowerCase() : "";
  const parsedIsError = Boolean(parsed && parsed.is_error === true);

  const detectedFailure = detectClaudeFailure(`${normalized}\n${parsedResultText}`);
  if (detectedFailure) return detectedFailure;

  if (result.exitCode !== 0 || parsedIsError) {
    if (result.outputBytes === 0) return "claude_empty_output_nonzero";
    return "claude_generic_nonzero";
  }

  if (result.outputBytes === 0) return "claude_empty_output_nonzero";

  return classifyApprovalText(`${parsedResultText}\n${normalized}`);
}

function classifyGeminiResult(result) {
  const normalized = result.preview.toLowerCase();

  if (normalized.includes("code assist login required")) return "gemini_auth_required";
  if (normalized.includes("waiting for authentication")) return "gemini_auth_required";
  if (normalized.includes("authentication timed out")) return "gemini_auth_required";

  if (result.timedOut) return "fallback_failed";
  if (result.exitCode !== 0) return "fallback_failed";
  if (result.outputBytes === 0) return "fallback_failed";

  if (
    normalized.includes("approved with mandatory revisions") ||
    normalized.includes("approve with revisions") ||
    normalized.includes("approved_with_revisions")
  ) {
    return "approved_with_revisions";
  }

  if (normalized.includes("approved")) return "approved";
  return "approved_with_revisions";
}

function buildAuditLine({
  timestamp,
  planId,
  reviewer,
  iteration,
  command,
  result,
  summary,
  errors,
  exitCode,
  timeoutSeconds,
  elapsedSeconds,
  outputFile,
}) {
  return [
    `${timestamp} | plan_id:${planId}`,
    `reviewer:${reviewer}`,
    `iteration:${iteration}`,
    `command:${sanitizeOneLine(command)}`,
    `result:${result}`,
    `summary:${sanitizeOneLine(summary)}`,
    `errors:${sanitizeOneLine(errors)}`,
    `exit_code:${exitCode}`,
    `timeout_seconds:${timeoutSeconds}`,
    `elapsed_seconds:${elapsedSeconds}`,
    `output_file:${outputFile}`,
  ].join(" | ");
}

function buildSystemLine({ timestamp, planId, iteration, summary, errors }) {
  return [
    `${timestamp} | plan_id:${planId}`,
    "reviewer:system",
    `iteration:${iteration}`,
    "command:none",
    "result:human_review_needed",
    `summary:${sanitizeOneLine(summary)}`,
    `errors:${sanitizeOneLine(errors)}`,
  ].join(" | ");
}

async function runPreflight({
  homeDir,
  cwd,
  preflightLogPath,
  timeoutSeconds,
  geminiTimeoutSeconds,
  dryRun,
}) {
  const stages = [];
  const env = { ...process.env, HOME: homeDir };
  const stagesToRun = [
    {
      id: "preflight_stage_1_claude_cli",
      command: "claude",
      args: ["--version"],
      timeout: 15,
      classify: (r) => (r.exitCode === 0 ? "pass" : "fail"),
    },
    {
      id: "preflight_stage_2_gemini_cli",
      command: "gemini",
      args: ["--version"],
      timeout: 15,
      classify: (r) => (r.exitCode === 0 ? "pass" : "fail"),
    },
    {
      id: "preflight_stage_3_claude_noninteractive_probe",
      command: "claude",
      args: ["-p", "--output-format", "json", "--max-turns", "1", "Reply with exactly OK"],
      timeout: Math.min(timeoutSeconds, 30),
      classify: (r) => {
        const t = r.preview.toLowerCase();
        if (t.includes("credit balance is too low")) return "credit_blocked";
        if (t.includes("invalid api key") || t.includes("please run /login")) return "auth_required";
        if (r.exitCode === 0) return "pass";
        return "fail";
      },
    },
    {
      id: "preflight_stage_4_gemini_noninteractive_probe",
      command: "gemini",
      args: ["-p", "Reply with exactly OK"],
      timeout: Math.min(geminiTimeoutSeconds, 30),
      classify: (r) => {
        const t = r.preview.toLowerCase();
        if (
          t.includes("code assist login required") ||
          t.includes("waiting for authentication") ||
          t.includes("authentication timed out")
        ) {
          return "auth_required";
        }
        if (r.exitCode === 0) return "pass";
        return "fail";
      },
    },
  ];

  if (dryRun) {
    for (const stage of stagesToRun) {
      stages.push({
        id: stage.id,
        status: "dry_run",
        exitCode: 0,
        elapsedSeconds: 0,
        detail: `${stage.command} ${stage.args.join(" ")}`,
      });
    }
  } else {
    for (const stage of stagesToRun) {
      const stageOutput = path.join(
        path.dirname(preflightLogPath),
        `${path.basename(preflightLogPath, ".log")}_${stage.id}.txt`,
      );
      const run = await runCommand({
        command: stage.command,
        args: stage.args,
        env,
        cwd,
        timeoutSeconds: stage.timeout,
        outputFile: stageOutput,
      });
      stages.push({
        id: stage.id,
        status: stage.classify(run),
        exitCode: run.exitCode,
        elapsedSeconds: run.elapsedSeconds,
        detail: `${stage.command} ${stage.args.join(" ")}`,
        outputFile: stageOutput,
      });
    }
  }

  await ensureDir(path.dirname(preflightLogPath));
  const lines = [
    `# Preflight Validation`,
    `timestamp_utc: ${nowIso()}`,
    `timeout_seconds: ${timeoutSeconds}`,
    `gemini_timeout_seconds: ${geminiTimeoutSeconds}`,
    "",
  ];
  for (const stage of stages) {
    lines.push(
      [
        `${stage.id}`,
        `status=${stage.status}`,
        `exit_code=${stage.exitCode}`,
        `elapsed_seconds=${stage.elapsedSeconds}`,
        `detail="${stage.detail}"`,
        stage.outputFile ? `output_file=${stage.outputFile}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }
  lines.push("");
  await fsp.writeFile(preflightLogPath, lines.join("\n"), "utf8");
  return stages;
}

function hasPreflightBlockers(stages) {
  return stages.some((s) =>
    ["fail", "auth_required", "credit_blocked"].includes(String(s.status)),
  );
}

function commandString(command, args) {
  return `${command} ${args.join(" ")}`.trim();
}

function claudeAuditCommand({ outputMode, maxTurns }) {
  return `claude -p --output-format ${outputMode} --permission-mode plan --max-turns ${maxTurns} --agents <json> "Review this plan: <PLAN_JSON>"`;
}

function geminiAuditCommand() {
  return 'gemini -p "You are the fallback plan reviewer... Review this plan: <PLAN_JSON>"';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) usageAndExit(0);
  if (!args["plan-file"]) usageAndExit(1);

  const cwd = process.cwd();
  const planFile = path.resolve(cwd, String(args["plan-file"]));
  const planId =
    args["plan-id"] || path.basename(planFile, path.extname(planFile)).replace(/\s+/g, "_");
  const homeDir = path.resolve(cwd, String(args.home || cwd));
  const timeoutSeconds = Number(args["timeout-seconds"] || DEFAULT_TIMEOUT_SECONDS);
  const geminiTimeoutSeconds = Number(
    args["gemini-timeout-seconds"] || DEFAULT_GEMINI_TIMEOUT_SECONDS,
  );
  const maxTurns = Number(args["max-turns"] || DEFAULT_MAX_TURNS);
  const outputMode = String(args["output-mode"] || DEFAULT_OUTPUT_MODE);
  const outputDir = path.resolve(cwd, String(args["output-dir"] || "audit/plan_review_outputs"));
  const auditLog = path.resolve(cwd, String(args["audit-log"] || "audit/plan_reviews.log"));
  const preflightLog =
    args["preflight-log"] ||
    path.join(outputDir, `preflight_validation_${dateStampUTC()}.log`);
  const disableFallback = Boolean(args["no-fallback"]);
  const skipPreflight = Boolean(args["skip-preflight"]);
  const dryRun = Boolean(args["dry-run"]);

  if (!OUTPUT_MODES.has(outputMode)) {
    console.error(`Unsupported --output-mode: ${outputMode}`);
    process.exit(2);
  }
  if (!(await fsp.stat(planFile).then(() => true).catch(() => false))) {
    console.error(`Plan file not found: ${planFile}`);
    process.exit(2);
  }

  const planJson = await fsp.readFile(planFile, "utf8");
  const iteration = args.iteration
    ? Number(args.iteration)
    : await detectNextIteration(auditLog, planId);
  const prompt = `Review this plan: ${planJson}`;
  const env = { ...process.env, HOME: homeDir };

  const claudeArgs = [
    "-p",
    "--output-format",
    outputMode,
    "--permission-mode",
    "plan",
    "--max-turns",
    String(maxTurns),
    "--agents",
    CLAUDE_AGENTS,
  ];
  if (outputMode === "stream-json") {
    claudeArgs.push("--verbose", "--include-partial-messages");
  }
  claudeArgs.push(prompt);

  const claudeOutput = path.join(outputDir, `${planId}_round${iteration}_claude.json`);
  const geminiOutput = path.join(outputDir, `${planId}_round${iteration + 1}_gemini.txt`);

  if (!skipPreflight) {
    const stages = await runPreflight({
      homeDir,
      cwd,
      preflightLogPath: preflightLog,
      timeoutSeconds,
      geminiTimeoutSeconds,
      dryRun,
    });
    if (hasPreflightBlockers(stages) && dryRun === false) {
      console.warn(
        `Preflight reported blockers. See ${preflightLog}. Proceeding for audit completeness.`,
      );
    }
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dry_run: true,
          plan_id: planId,
          iteration,
          home: homeDir,
          claude_command: claudeAuditCommand({ outputMode, maxTurns }),
          fallback_enabled: !disableFallback,
          output_mode: outputMode,
          timeout_seconds: timeoutSeconds,
          preflight_log: preflightLog,
          matrix: FALLBACK_DECISION_MATRIX,
        },
        null,
        2,
      ),
    );
    return;
  }

  const claudeRun = await runCommand({
    command: "claude",
    args: claudeArgs,
    env,
    cwd,
    timeoutSeconds,
    outputFile: claudeOutput,
  });
  const claudeClass = await classifyClaudeResult(claudeRun, claudeOutput);
  const action = FALLBACK_DECISION_MATRIX[claudeClass] || "fallback_to_gemini";

  const claudeResultLabel =
    claudeClass === "approved" || claudeClass === "approved_with_revisions"
      ? claudeClass
      : "claude_failed";

  await appendLine(
    auditLog,
    buildAuditLine({
      timestamp: nowIso(),
      planId,
      reviewer: "claude-plan-reviewer",
      iteration,
      command: claudeAuditCommand({ outputMode, maxTurns }),
      result: claudeResultLabel,
      summary:
        claudeResultLabel === "claude_failed"
          ? `Primary reviewer failed with classification ${claudeClass}.`
          : `Primary reviewer completed with classification ${claudeClass}.`,
      errors: claudeResultLabel === "claude_failed" ? claudeClass : "none",
      exitCode: claudeRun.exitCode,
      timeoutSeconds,
      elapsedSeconds: claudeRun.elapsedSeconds,
      outputFile: path.relative(cwd, claudeOutput),
    }),
  );

  if (claudeResultLabel === "approved" || claudeResultLabel === "approved_with_revisions") {
    console.log(
      JSON.stringify(
        {
          plan_id: planId,
          iteration,
          result: claudeResultLabel,
          classification: claudeClass,
          output_file: path.relative(cwd, claudeOutput),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (disableFallback || action === "escalate_human_review_needed") {
    await appendLine(
      auditLog,
      buildSystemLine({
        timestamp: nowIso(),
        planId,
        iteration,
        summary:
          "Fallback skipped by matrix/flag; explicit human approval required before execution.",
        errors: claudeClass,
      }),
    );
    console.log(
      JSON.stringify(
        {
          plan_id: planId,
          iteration,
          result: "human_review_needed",
          reason: claudeClass,
          output_file: path.relative(cwd, claudeOutput),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const geminiPrompt =
    "You are the fallback plan reviewer for AGENTS.md policies. Apply the same standards as the Claude path. Identify policy gaps, missing mitigations, or confidence issues. Review this plan: " +
    planJson;
  const geminiArgs = ["-p", geminiPrompt];
  const geminiRun = await runCommand({
    command: "gemini",
    args: geminiArgs,
    env,
    cwd,
    timeoutSeconds: geminiTimeoutSeconds,
    outputFile: geminiOutput,
  });
  const geminiClass = classifyGeminiResult(geminiRun);
  const geminiResultLabel =
    geminiClass === "approved" || geminiClass === "approved_with_revisions"
      ? geminiClass
      : "fallback_failed";

  await appendLine(
    auditLog,
    buildAuditLine({
      timestamp: nowIso(),
      planId,
      reviewer: "gemini-plan-reviewer",
      iteration: iteration + 1,
      command: geminiAuditCommand(),
      result: geminiResultLabel,
      summary:
        geminiResultLabel === "fallback_failed"
          ? `Fallback reviewer failed with classification ${geminiClass}.`
          : `Fallback reviewer completed with classification ${geminiClass}.`,
      errors: geminiResultLabel === "fallback_failed" ? geminiClass : "none",
      exitCode: geminiRun.exitCode,
      timeoutSeconds: geminiTimeoutSeconds,
      elapsedSeconds: geminiRun.elapsedSeconds,
      outputFile: path.relative(cwd, geminiOutput),
    }),
  );

  if (geminiResultLabel === "approved" || geminiResultLabel === "approved_with_revisions") {
    console.log(
      JSON.stringify(
        {
          plan_id: planId,
          iteration: iteration + 1,
          result: geminiResultLabel,
          classification: geminiClass,
          output_file: path.relative(cwd, geminiOutput),
        },
        null,
        2,
      ),
    );
    return;
  }

  await appendLine(
    auditLog,
    buildSystemLine({
      timestamp: nowIso(),
      planId,
      iteration: iteration + 1,
      summary: "Both automated plan reviewers failed; explicit human approval required.",
      errors: `${claudeClass}+${geminiClass}`,
    }),
  );
  console.log(
    JSON.stringify(
      {
        plan_id: planId,
        result: "human_review_needed",
        reasons: [claudeClass, geminiClass],
        claude_output_file: path.relative(cwd, claudeOutput),
        gemini_output_file: path.relative(cwd, geminiOutput),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
