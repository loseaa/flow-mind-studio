import { execFileSync } from "node:child_process";

function isGitRepository() {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

if (!isGitRepository()) {
  console.log("Git hooks skipped: current directory is not a Git repository.");
  process.exit(0);
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "inherit",
});

console.log("Git hooks enabled with core.hooksPath=.githooks");
