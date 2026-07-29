import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const reportRoot = join(process.cwd(), "generated", "security");
mkdirSync(reportRoot, { recursive: true });

const checks = [
  {
    name: "OSV Scanner",
    command: "osv-scanner",
    args: ["scan", "source", "--recursive", "--format", "json", "."],
    report: "osv.json",
  },
  {
    name: "Semgrep",
    command: "semgrep",
    args: [
      "scan",
      "--oss-only",
      "--config",
      "schemas/security/semgrep.yml",
      "--exclude",
      "node_modules",
      "--exclude",
      ".git",
      "--exclude",
      "generated",
      "--json",
      "--error",
      "apps",
      "packages",
      "infra",
    ],
    report: "semgrep.json",
  },
  {
    name: "Gitleaks",
    command: "gitleaks",
    args: [
      "git",
      "--redact",
      "--report-format",
      "json",
      "--report-path",
      join(reportRoot, "gitleaks.json"),
      ".",
    ],
  },
  {
    name: "Trivy filesystem",
    command: "trivy",
    args: [
      "fs",
      "--exit-code",
      "1",
      "--severity",
      "CRITICAL,HIGH",
      "--scanners",
      "vuln,secret,misconfig",
      "--format",
      "json",
      "--output",
      join(reportRoot, "trivy-fs.json"),
      ".",
    ],
  },
  {
    name: "CycloneDX SBOM",
    command: "syft",
    args: ["dir:.", "-o", `cyclonedx-json=${join(reportRoot, "factory-sbom.cdx.json")}`],
  },
  {
    name: "Dependency licenses",
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: ["licenses", "list", "--json"],
    report: "licenses.json",
  },
];

let failed = false;
for (const check of checks) {
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (check.report && result.stdout) {
    writeFileSync(join(reportRoot, check.report), result.stdout, "utf8");
  }
  if (result.error?.code === "ENOENT") {
    process.stderr.write(`[MISSING] ${check.name}: ${check.command} is not installed\n`);
    failed = true;
    continue;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "scan failed").slice(-4000);
    process.stderr.write(`[FAILED] ${check.name} (exit ${result.status})\n${detail}\n`);
    failed = true;
  } else {
    process.stdout.write(`[PASSED] ${check.name}\n`);
  }
}

if (failed) {
  process.stderr.write(
    "Full security toolchain did not pass. Release artifacts must not be approved.\n",
  );
  process.exitCode = 1;
}
