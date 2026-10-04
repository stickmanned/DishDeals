#!/usr/bin/env node
// DishDeals agent workflow helper: status | sync | create TASK_ID | check TASK_ID
//
// IMPORTANT: `check` is a guardrail against accidental out-of-scope edits and
// committed secrets. It is NOT a security sandbox: it only inspects Git state,
// cannot stop an agent from writing files, and ignored files are not examined.
//
// This script never stashes, resets, rebases, force-pushes, pushes, deploys or
// reads secret values. The only network operation is `git fetch origin` in sync.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class WorkflowError extends Error {}

const MANIFEST_PATH = "docs/workflow/tasks.json";
const BRANCH_PATTERN = /^t-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = new Set(["ready", "prepared", "blocked"]);
const PROTECTED_PATTERNS = [
  [/(^|\/)\.env($|\.)(?!example$|sample$|template$)/i, "environment file"],
  [/(^|\/)\.convex(\/|$)/, "local Convex state"],
  [/\.(pem|key|p12|pfx)$/i, "key material"],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i, "SSH key"],
  [/(^|\/)(credentials|service-account[^/]*)\.json$/i, "credentials file"],
  [/(^|\/)\.(npmrc|netrc)$/i, "credentials file"],
];

function git(cwd, args, { allowFail = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (allowFail) return null;
    const detail = String(error.stderr || error.message).trim();
    throw new WorkflowError(`git ${args.join(" ")} failed: ${detail}`);
  }
}

const gitOk = (cwd, args) => git(cwd, args, { allowFail: true }) !== null;

function topLevel(cwd) {
  return realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]).trim());
}

function currentBranch(cwd) {
  const out = git(cwd, ["symbolic-ref", "--short", "-q", "HEAD"], { allowFail: true });
  return out ? out.trim() : null;
}

function worktreeList(cwd) {
  const entries = [];
  let cur = null;
  for (const line of git(cwd, ["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) {
      cur = { path: line.slice(9), branch: null, head: "" };
      entries.push(cur);
    } else if (cur && line.startsWith("HEAD ")) cur.head = line.slice(5);
    else if (cur && line.startsWith("branch ")) cur.branch = line.slice(7).replace("refs/heads/", "");
  }
  return entries;
}

// The first entry of `git worktree list` is the primary (human main) checkout.
function mainRoot(cwd) {
  return realpathSync(worktreeList(cwd)[0].path);
}

function isDirty(cwd) {
  return git(cwd, ["status", "--porcelain", "--untracked-files=all"]).trim().length > 0;
}

function validRepoPath(p) {
  if (typeof p !== "string" || p.length === 0) return false;
  if (p.includes("\\") || p.includes("\0") || path.posix.isAbsolute(p) || /^[a-zA-Z]:/.test(p)) return false;
  return !p.split("/").some((seg) => seg === ".." || seg === ".");
}

export function loadManifest(root) {
  const file = path.join(root, MANIFEST_PATH);
  if (!existsSync(file)) throw new WorkflowError(`Missing ${MANIFEST_PATH} in ${root}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new WorkflowError(`${MANIFEST_PATH} is not valid JSON: ${error.message}`);
  }
  for (const key of ["baseRef", "baselineCommit", "worktreeParent"]) {
    if (typeof manifest[key] !== "string" || !manifest[key]) throw new WorkflowError(`${MANIFEST_PATH}: missing "${key}"`);
  }
  if (!Array.isArray(manifest.tasks)) throw new WorkflowError(`${MANIFEST_PATH}: "tasks" must be an array`);
  return manifest;
}

function findTask(manifest, id) {
  const task = manifest.tasks.find((t) => t.id === id);
  if (!task) throw new WorkflowError(`Unknown task "${id}". Known: ${manifest.tasks.map((t) => t.id).join(", ") || "(none)"}`);
  return task;
}

// Validates a task entry and returns its resolved absolute worktree path.
export function validateTask(manifest, task, cwd) {
  const label = `task ${task.id}`;
  if (!BRANCH_PATTERN.test(task.branch || "")) throw new WorkflowError(`${label}: branch "${task.branch}" must match t-NN-short-name and cannot be main`);
  if (!STATUSES.has(task.status)) throw new WorkflowError(`${label}: status "${task.status}" must be ready, prepared or blocked`);
  if (!Array.isArray(task.allowedPaths) || task.allowedPaths.length === 0) throw new WorkflowError(`${label}: allowedPaths must be a non-empty array`);
  for (const p of task.allowedPaths) {
    if (!validRepoPath(p.replace(/\/$/, ""))) throw new WorkflowError(`${label}: unsafe allowedPaths entry "${p}" (no absolute paths, "..", or backslashes)`);
  }
  if (typeof task.worktree !== "string" || !task.worktree) throw new WorkflowError(`${label}: worktree is required`);
  const main = mainRoot(cwd);
  // Only a single-segment sibling of the primary checkout (e.g. ../DishDeals-worktrees) is allowed.
  if (!/^\.\.\/[^/\\.][^/\\]*\/?$/.test(manifest.worktreeParent)) {
    throw new WorkflowError(`${label}: worktreeParent "${manifest.worktreeParent}" must be a sibling of the primary checkout like ../DishDeals-worktrees`);
  }
  const parent = path.resolve(main, manifest.worktreeParent);
  // Accept either "name" or "<worktreeParent>/name"; resolve both inside the parent.
  const normalizedParent = path.posix.normalize(manifest.worktreeParent).replace(/\/$/, "");
  let rel = task.worktree.replace(/\\/g, "/");
  if (rel.startsWith(`${normalizedParent}/`)) rel = rel.slice(normalizedParent.length + 1);
  if (!validRepoPath(rel.replace(/\/$/, ""))) throw new WorkflowError(`${label}: unsafe worktree path "${task.worktree}"`);
  const resolved = path.resolve(parent, rel);
  const within = path.relative(parent, resolved);
  if (!within || within.startsWith("..") || path.isAbsolute(within)) throw new WorkflowError(`${label}: worktree escapes ${manifest.worktreeParent}`);
  // Resolve symlinks in the deepest existing ancestor so a linked parent cannot redirect the target.
  let existing = resolved;
  const rest = [];
  while (!existsSync(existing)) {
    rest.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  const real = path.join(realpathSync(existing), ...rest);
  const expectedParent = path.join(realpathSync(path.dirname(main)), path.basename(parent));
  const realWithin = path.relative(expectedParent, real);
  if (!realWithin || realWithin.startsWith("..") || path.isAbsolute(realWithin)) throw new WorkflowError(`${label}: worktree resolves outside ${expectedParent} (symlink escape?)`);
  return resolved;
}

function assertNotPrimary(cwd) {
  if (topLevel(cwd) === mainRoot(cwd)) throw new WorkflowError("Refusing to operate in the primary (human main) checkout regardless of branch; use a task worktree.");
}

export function pathAllowed(file, allowedPaths) {
  return allowedPaths.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));
}

export function protectedReason(file) {
  for (const [re, why] of PROTECTED_PATTERNS) if (re.test(file)) return why;
  return null;
}

function nulList(out) {
  return out.split("\0").filter(Boolean);
}

export function changedFiles(cwd, base) {
  const files = new Set();
  // Working tree vs merge-base covers committed + staged + unstaged tracked changes.
  for (const f of nulList(git(cwd, ["diff", "--name-only", "-z", "--no-renames", base]))) files.add(f);
  for (const f of nulList(git(cwd, ["diff", "--cached", "--name-only", "-z", "--no-renames", base]))) files.add(f);
  // Untracked, non-ignored paths. Ignored env/cache files are intentionally excluded.
  for (const f of nulList(git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]))) files.add(f);
  return [...files].sort();
}

// Protected paths touched by any task-only commit (merges included), even if later removed.
// Path-name matching only; file contents and secret values are never read or printed.
export function historyProtectedViolations(cwd, baseRef) {
  const out = [];
  for (const sha of git(cwd, ["rev-list", `${baseRef}..HEAD`]).split("\n").filter(Boolean)) {
    const names = nulList(git(cwd, ["diff-tree", "-m", "-r", "--no-renames", "--name-only", "--no-commit-id", "-z", "--root", sha]));
    for (const f of new Set(names)) {
      const why = protectedReason(f);
      if (why) out.push(`${f}: protected path (${why}) appears in task commit ${sha.slice(0, 7)} history; rewrite the branch before pushing`);
    }
  }
  return out;
}

function requireTaskCheckout(cwd, manifest, task) {
  const resolved = validateTask(manifest, task, cwd);
  assertNotPrimary(cwd);
  const branch = currentBranch(cwd);
  if (branch === "main" || branch === "master") throw new WorkflowError("Refusing to operate on main: the main checkout is read-only.");
  if (branch !== task.branch) throw new WorkflowError(`Wrong branch: on "${branch ?? "detached HEAD"}", task ${task.id} requires "${task.branch}".`);
  const top = topLevel(cwd);
  const expected = existsSync(resolved) ? realpathSync(resolved) : resolved;
  if (top !== expected) throw new WorkflowError(`Wrong checkout: ${top} is not task ${task.id}'s worktree ${expected}.`);
  return top;
}

export function check(cwd, id) {
  const root = topLevel(cwd);
  const manifest = loadManifest(root);
  const task = findTask(manifest, id);
  requireTaskCheckout(cwd, manifest, task);
  const baseRef = manifest.baseRef;
  if (!gitOk(cwd, ["rev-parse", "--verify", "-q", `${baseRef}^{commit}`])) throw new WorkflowError(`${baseRef} not found; run git fetch origin first.`);
  const base = git(cwd, ["merge-base", baseRef, "HEAD"]).trim();
  const files = changedFiles(cwd, base);
  const violations = [];
  for (const f of files) {
    const secret = protectedReason(f);
    if (secret) violations.push(`${f}: protected path (${secret})`);
    else if (!pathAllowed(f, task.allowedPaths)) violations.push(`${f}: outside allowedPaths for ${task.id}`);
  }
  for (const v of historyProtectedViolations(cwd, baseRef)) if (!violations.includes(v)) violations.push(v);
  const lines = [`check ${task.id} on ${task.branch} (merge-base ${base.slice(0, 7)} with ${baseRef}): ${files.length} changed path(s)`];
  for (const f of files) lines.push(`  ${f}`);
  if (violations.length) {
    lines.push("FAIL:", ...violations.map((v) => `  ${v}`));
  } else {
    lines.push("OK: all changes are inside allowedPaths and touch no protected paths.");
  }
  lines.push("Note: check is a guardrail, not a security sandbox or secret scanner; it matches path names only and never inspects file contents.");
  return { ok: violations.length === 0, lines, files, violations };
}

export function sync(cwd) {
  const root = topLevel(cwd);
  assertNotPrimary(cwd);
  const branch = currentBranch(cwd);
  if (!branch || branch === "main" || branch === "master") throw new WorkflowError("Refusing to sync: main is read-only and detached HEAD is unsupported. Run from a ticket branch.");
  if (!BRANCH_PATTERN.test(branch)) throw new WorkflowError(`Refusing to sync: "${branch}" is not a t-NN-short-name ticket branch.`);
  if (isDirty(cwd)) throw new WorkflowError("Refusing to sync: working tree is dirty. Commit or move your changes first (this tool never stashes or resets).");
  let baseRef = "origin/main";
  try {
    baseRef = loadManifest(root).baseRef;
  } catch {
    /* manifest optional for sync */
  }
  git(cwd, ["fetch", "--no-write-fetch-head", "origin"]);
  if (!gitOk(cwd, ["rev-parse", "--verify", "-q", `${baseRef}^{commit}`])) throw new WorkflowError(`${baseRef} not found after fetch.`);
  if (gitOk(cwd, ["merge-base", "--is-ancestor", baseRef, "HEAD"])) return [`${branch} already contains ${baseRef}; nothing to do.`];
  if (!gitOk(cwd, ["merge-base", "--is-ancestor", "HEAD", baseRef])) {
    throw new WorkflowError(`Refusing to sync: ${branch} has diverged from ${baseRef}. Resolve manually (no rebase/reset is performed here).`);
  }
  git(cwd, ["merge", "--ff-only", baseRef]);
  return [`Fast-forwarded ${branch} to ${baseRef} (${git(cwd, ["rev-parse", "--short", "HEAD"]).trim()}).`];
}

export function create(cwd, id) {
  const root = topLevel(cwd);
  const manifest = loadManifest(root);
  const task = findTask(manifest, id);
  const target = validateTask(manifest, task, cwd);
  if (task.status !== "ready") throw new WorkflowError(`Task ${id} is "${task.status}", not ready.`);
  const baseRef = manifest.baseRef;
  if (!gitOk(cwd, ["rev-parse", "--verify", "-q", `${baseRef}^{commit}`])) throw new WorkflowError(`${baseRef} not found; run git fetch origin first.`);
  if (!gitOk(cwd, ["merge-base", "--is-ancestor", `${manifest.baselineCommit}^{commit}`, baseRef])) {
    throw new WorkflowError(`Baseline ${manifest.baselineCommit} is not an ancestor of ${baseRef}; publish it to origin/main (human action) before creating worktrees.`);
  }
  if (gitOk(cwd, ["rev-parse", "--verify", "-q", `refs/heads/${task.branch}`]) || gitOk(cwd, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${task.branch}`])) {
    throw new WorkflowError(`Branch ${task.branch} already exists; create only makes new distinct branches.`);
  }
  const claimed = worktreeList(cwd).find((w) => path.resolve(w.path) === target);
  if (existsSync(target) || claimed) {
    throw new WorkflowError(`Worktree path ${target} already exists${claimed ? " (registered worktree)" : ""}; refusing to reuse a dirty or wrong checkout.`);
  }
  git(cwd, ["worktree", "add", "--no-track", "-b", task.branch, target, baseRef]);
  return [`Created ${target} on new branch ${task.branch} from ${baseRef}.`, `Update ${task.id} status to "prepared" in ${MANIFEST_PATH} (Northstar/root owns that file).`];
}

export function status(cwd) {
  const lines = [];
  const root = topLevel(cwd);
  const branch = currentBranch(cwd);
  const head = git(cwd, ["rev-parse", "--short", "HEAD"], { allowFail: true })?.trim() ?? "(none)";
  lines.push(`checkout: ${root}`, `branch: ${branch ?? "(detached)"} @ ${head}`);
  const porcelain = git(cwd, ["status", "--porcelain", "--untracked-files=all"]).split("\n").filter(Boolean);
  lines.push(porcelain.length ? `local changes: ${porcelain.length} path(s)` : "local changes: clean", ...porcelain.slice(0, 30).map((l) => `  ${l}`));
  let manifest = null;
  try {
    manifest = loadManifest(root);
  } catch (error) {
    lines.push(`manifest: ${error.message}`);
  }
  const baseRef = manifest?.baseRef ?? "origin/main";
  const counts = git(cwd, ["rev-list", "--left-right", "--count", `${baseRef}...HEAD`], { allowFail: true });
  if (counts) {
    const [behind, ahead] = counts.trim().split(/\s+/);
    lines.push(`vs ${baseRef}: ${ahead} ahead, ${behind} behind (using last fetched state; run git fetch origin first)`);
  } else lines.push(`vs ${baseRef}: ref not found (run git fetch origin)`);
  lines.push("worktrees:");
  for (const w of worktreeList(cwd)) {
    const task = manifest?.tasks.find((t) => t.branch === w.branch);
    lines.push(`  ${w.path}  ${w.branch ?? "(detached)"} @ ${w.head.slice(0, 7)}${task ? `  [${task.id} ${task.status}, owner ${task.owner}]` : ""}`);
  }
  if (manifest) {
    lines.push("tasks:", ...manifest.tasks.map((t) => `  ${t.id}  ${t.status}  ${t.branch}  owner=${t.owner}`));
  }
  lines.push("remote heads (last fetched):");
  const heads = git(cwd, ["for-each-ref", "--format=%(refname:short) %(objectname:short) %(committerdate:short)", "refs/remotes/origin"], { allowFail: true }) ?? "";
  lines.push(...heads.split("\n").filter((l) => l && !l.startsWith("origin/HEAD")).map((l) => `  ${l}`));
  return lines;
}

const USAGE = "Usage: npm run agents -- status | sync | create TASK_ID | check TASK_ID";

export function run(argv, cwd = process.cwd()) {
  const [cmd, id, ...rest] = argv;
  const needId = cmd === "create" || cmd === "check";
  if (!["status", "sync", "create", "check"].includes(cmd) || (needId && !id) || rest.length || (!needId && id)) throw new WorkflowError(USAGE);
  if (cmd === "status") return { ok: true, lines: status(cwd) };
  if (cmd === "sync") return { ok: true, lines: sync(cwd) };
  if (cmd === "create") return { ok: true, lines: create(cwd, id) };
  const result = check(cwd, id);
  return { ok: result.ok, lines: result.lines };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const result = run(process.argv.slice(2));
    console.log(result.lines.join("\n"));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    if (!(error instanceof WorkflowError)) throw error;
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}
