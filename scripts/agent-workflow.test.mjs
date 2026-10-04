import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { check, create, run, sync, WorkflowError } from "./agent-workflow.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "agent-workflow.mjs");
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
const write = (cwd, file, text = "x\n") => {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  writeFileSync(path.join(cwd, file), text);
};
const commitAll = (cwd, msg) => {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", msg);
  return git(cwd, "rev-parse", "HEAD");
};

function task(over = {}) {
  return {
    id: "T-03",
    owner: "worker",
    branch: "t-03-feature",
    worktree: "t-03-feature",
    allowedPaths: ["lib/feature.ts", "convex/feature/"],
    dependencies: [],
    status: "ready",
    packet: "docs/workflow/packets/t-03.md",
    ...over,
  };
}

// Builds origin (bare) + primary checkout "DishDeals" with a baseline commit.
function fixture(tasks = [task()], { publishBaseline = true } = {}) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "agent-wf-")));
  const origin = path.join(dir, "origin.git");
  const main = path.join(dir, "DishDeals");
  git(dir, "init", "-q", "--bare", "-b", "main", origin);
  git(dir, "clone", "-q", origin, main);
  git(main, "checkout", "-q", "-b", "main");
  write(main, ".gitignore", ".env.local\n.cache/\n");
  write(main, "README.md");
  commitAll(main, "init");
  git(main, "push", "-q", "origin", "main");
  write(main, "baseline.txt");
  const baseline = commitAll(main, "baseline");
  if (publishBaseline) git(main, "push", "-q", "origin", "main");
  const manifest = { baseRef: "origin/main", baselineCommit: baseline, worktreeParent: "../DishDeals-worktrees", tasks };
  write(main, "docs/workflow/tasks.json", JSON.stringify(manifest));
  commitAll(main, "manifest");
  if (publishBaseline) git(main, "push", "-q", "origin", "main");
  git(main, "fetch", "-q", "origin");
  return { dir, origin, main, parent: path.join(dir, "DishDeals-worktrees") };
}

describe("agent workflow", () => {
  const dirs = [];
  const make = (...args) => {
    const f = fixture(...args);
    dirs.push(f.dir);
    return f;
  };
  after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  describe("create", () => {
    test("is gated on the baseline being an ancestor of origin/main", () => {
      const f = make([task()], { publishBaseline: false });
      assert.throws(() => create(f.main, "T-03"), /not an ancestor of origin\/main/);
      assert.ok(!existsSync(path.join(f.parent, "t-03-feature")));
    });

    test("creates a new branch worktree when the baseline is published, then refuses to reuse it", () => {
      const f = make();
      const out = create(f.main, "T-03");
      const wt = path.join(f.parent, "t-03-feature");
      assert.match(out[0], /Created/);
      assert.equal(git(wt, "rev-parse", "--abbrev-ref", "HEAD"), "t-03-feature");
      assert.throws(() => create(f.main, "T-03"), /already exists/);
    });

    test("refuses non-ready tasks, main as a branch, and existing branches", () => {
      const f = make([task({ status: "blocked" }), task({ id: "T-04", branch: "main", worktree: "m" }), task({ id: "T-05", branch: "t-05-x", worktree: "t5" })]);
      assert.throws(() => create(f.main, "T-03"), /not ready/);
      assert.throws(() => create(f.main, "T-04"), /t-NN-short-name/);
      git(f.main, "branch", "t-05-x");
      assert.throws(() => create(f.main, "T-05"), /Branch t-05-x already exists/);
    });

    test("refuses an existing directory at the worktree path", () => {
      const f = make();
      mkdirSync(path.join(f.parent, "t-03-feature"), { recursive: true });
      assert.throws(() => create(f.main, "T-03"), /already exists/);
    });

    test("rejects arbitrary or non-sibling worktreeParent values", () => {
      for (const parent of ["/tmp/elsewhere", "../a/b", "..", "../../x", "wt", "../.."]) {
        const f = make();
        const file = path.join(f.main, "docs/workflow/tasks.json");
        const m = JSON.parse(readFileSync(file, "utf8"));
        m.worktreeParent = parent;
        writeFileSync(file, JSON.stringify(m));
        assert.throws(() => create(f.main, "T-03"), /worktreeParent/, parent);
      }
    });

    test("rejects a worktreeParent symlink that escapes the sibling location", () => {
      const f = make();
      const elsewhere = path.join(f.dir, "elsewhere");
      mkdirSync(elsewhere);
      symlinkSync(elsewhere, f.parent);
      assert.throws(() => create(f.main, "T-03"), /symlink escape/);
      assert.ok(!existsSync(path.join(elsewhere, "t-03-feature")));
    });

    test("rejects path traversal in worktree and allowedPaths", () => {
      const f = make([
        task({ id: "T-06", branch: "t-06-a", worktree: "../escape" }),
        task({ id: "T-07", branch: "t-07-b", worktree: "ok", allowedPaths: ["../outside.ts"] }),
        task({ id: "T-08", branch: "t-08-c", worktree: "/abs/path" }),
        task({ id: "T-09", branch: "t-09-d", worktree: "../DishDeals-worktrees/../../x" }),
        task({ id: "T-10", branch: "t-10-e", worktree: "ok2", allowedPaths: ["/etc/passwd"] }),
      ]);
      assert.throws(() => create(f.main, "T-06"), /unsafe worktree/);
      assert.throws(() => create(f.main, "T-07"), /unsafe allowedPaths/);
      assert.throws(() => create(f.main, "T-08"), /unsafe worktree/);
      assert.throws(() => create(f.main, "T-09"), /unsafe worktree/);
      assert.throws(() => create(f.main, "T-10"), /unsafe allowedPaths/);
    });
  });

  describe("sync", () => {
    let f, wt;
    beforeEach(() => {
      f = make();
      create(f.main, "T-03");
      wt = path.join(f.parent, "t-03-feature");
    });

    test("refuses a dirty working tree and leaves it untouched", () => {
      write(wt, "lib/feature.ts", "wip\n");
      assert.throws(() => sync(wt), /dirty/);
      assert.ok(existsSync(path.join(wt, "lib/feature.ts")));
    });

    test("refuses main", () => {
      assert.throws(() => sync(f.main), /primary/);
    });

    test("refuses the primary checkout even on a t-xx branch, leaving HEAD unchanged", () => {
      git(f.main, "checkout", "-q", "-b", "t-01-foundation");
      const other = path.join(f.dir, "other");
      git(f.dir, "clone", "-q", f.origin, other);
      write(other, "NEW.md");
      commitAll(other, "upstream");
      git(other, "push", "-q", "origin", "HEAD:main");
      const head = git(f.main, "rev-parse", "HEAD");
      assert.throws(() => sync(f.main), /primary/);
      assert.throws(() => check(f.main, "T-03"), /primary/);
      assert.equal(git(f.main, "rev-parse", "HEAD"), head);
      assert.ok(!existsSync(path.join(f.main, "NEW.md")));
    });

    test("fast-forwards a clean ticket branch to origin/main", () => {
      const other = path.join(f.dir, "other");
      git(f.dir, "clone", "-q", f.origin, other);
      write(other, "NEW.md");
      commitAll(other, "upstream");
      git(other, "push", "-q", "origin", "HEAD:main");
      const out = sync(wt);
      assert.match(out[0], /Fast-forwarded/);
      assert.ok(existsSync(path.join(wt, "NEW.md")));
    });

    test("refuses diverged branches", () => {
      write(wt, "lib/feature.ts");
      commitAll(wt, "local work");
      const other = path.join(f.dir, "other");
      git(f.dir, "clone", "-q", f.origin, other);
      write(other, "NEW.md");
      commitAll(other, "upstream");
      git(other, "push", "-q", "origin", "HEAD:main");
      const before = git(wt, "rev-parse", "HEAD");
      assert.throws(() => sync(wt), /diverged/);
      assert.equal(git(wt, "rev-parse", "HEAD"), before);
    });
  });

  describe("check", () => {
    let f, wt;
    beforeEach(() => {
      f = make();
      create(f.main, "T-03");
      wt = path.join(f.parent, "t-03-feature");
    });

    test("passes for committed, staged, and untracked changes inside allowedPaths", () => {
      write(wt, "lib/feature.ts");
      commitAll(wt, "committed");
      write(wt, "convex/feature/a.ts");
      git(wt, "add", "convex/feature/a.ts");
      write(wt, "convex/feature/b.ts");
      const result = check(wt, "T-03");
      assert.equal(result.ok, true, result.lines.join("\n"));
      assert.deepEqual(result.files, ["convex/feature/a.ts", "convex/feature/b.ts", "lib/feature.ts"]);
    });

    test("rejects files outside allowedPaths whether committed, staged, unstaged or untracked", () => {
      write(wt, "app/page.tsx");
      commitAll(wt, "committed outside");
      write(wt, "README.md", "changed\n");
      write(wt, "components/x.tsx");
      git(wt, "add", "components/x.tsx");
      write(wt, "docs/new.md");
      const result = check(wt, "T-03");
      assert.equal(result.ok, false);
      for (const f of ["app/page.tsx", "README.md", "components/x.tsx", "docs/new.md"]) {
        assert.ok(result.violations.some((v) => v.startsWith(`${f}:`)), `missing violation for ${f}`);
      }
    });

    test("directory entries do not match sibling prefixes", () => {
      write(wt, "convex/feature-other/a.ts");
      assert.equal(check(wt, "T-03").ok, false);
    });

    test("rejects protected secret paths even inside allowed dirs, but ignores ignored env/cache files", () => {
      write(wt, "convex/feature/.env.production", "SECRET=1\n");
      write(wt, "convex/feature/key.pem");
      write(wt, ".env.local", "SECRET=1\n"); // ignored by .gitignore
      write(wt, ".cache/blob");
      const result = check(wt, "T-03");
      assert.equal(result.ok, false);
      assert.equal(result.violations.length, 2, result.violations.join("\n"));
      assert.ok(result.violations.every((v) => /protected path/.test(v)));
      assert.ok(!result.files.includes(".env.local"));
      assert.ok(!result.lines.join("\n").includes("SECRET=1"));
    });

    test("rejects main and the wrong checkout or branch", () => {
      assert.throws(() => check(f.main, "T-03"), /primary/);
      git(wt, "checkout", "-q", "-b", "t-99-other");
      assert.throws(() => check(wt, "T-03"), /Wrong branch/);
    });

    test("rejects a different branch checked out in another directory", () => {
      const stray = path.join(f.dir, "stray");
      git(f.main, "worktree", "add", "-q", "-b", "t-11-stray", stray, "origin/main");
      assert.throws(() => check(stray, "T-03"), /Wrong branch/);
    });

    test("unknown task is rejected", () => {
      assert.throws(() => check(wt, "T-99"), /Unknown task/);
    });
  });

  describe("cli", () => {
    test("status prints roster and heads without error; usage errors exit 1", () => {
      const f = make();
      create(f.main, "T-03");
      const ok = spawnSync("node", [SCRIPT, "status"], { cwd: f.main, encoding: "utf8" });
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(ok.stdout, /worktrees:/);
      assert.match(ok.stdout, /t-03-feature/);
      assert.match(ok.stdout, /remote heads/);
      const bad = spawnSync("node", [SCRIPT, "bogus"], { cwd: f.main, encoding: "utf8" });
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /Usage/);
      assert.throws(() => run(["check"], f.main), WorkflowError);
    });

    test("check exits non-zero on a violation", () => {
      const f = make();
      create(f.main, "T-03");
      const wt = path.join(f.parent, "t-03-feature");
      write(wt, "app/x.ts");
      const r = spawnSync("node", [SCRIPT, "check", "T-03"], { cwd: wt, encoding: "utf8" });
      assert.equal(r.status, 1);
      assert.match(r.stdout, /outside allowedPaths/);
    });
  });
});
