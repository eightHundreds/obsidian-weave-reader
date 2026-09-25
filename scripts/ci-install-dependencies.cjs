const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function runPnpm(args) {
	const printable = `pnpm ${args.join(" ")}`;
	console.log(`[ci-install] > ${printable}`);
	execSync(printable, {
		cwd: PROJECT_ROOT,
		stdio: "inherit",
		env: process.env,
	});
}

function logEnvironment() {
	console.log(`[ci-install] node ${process.version}`);
	try {
		const pnpmVersion = execSync("pnpm --version", {
			cwd: PROJECT_ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		console.log(`[ci-install] pnpm ${pnpmVersion}`);
	} catch (error) {
		console.warn("[ci-install] unable to read pnpm version", error.message);
	}

	for (const fileName of ["package.json", "pnpm-lock.yaml", ".npmrc"]) {
		const filePath = path.join(PROJECT_ROOT, fileName);
		console.log(
			`[ci-install] ${fileName}: ${fs.existsSync(filePath) ? "present" : "missing"}`
		);
	}
}

function removeNodeModules() {
	const nodeModulesPath = path.join(PROJECT_ROOT, "node_modules");
	if (!fs.existsSync(nodeModulesPath)) {
		return;
	}
	fs.rmSync(nodeModulesPath, { recursive: true, force: true });
}

function installFrozen() {
	runPnpm(["install", "--frozen-lockfile"]);
}

function installUpdatingLockfile() {
	removeNodeModules();
	runPnpm(["install"]);
}

function main() {
	logEnvironment();

	try {
		installFrozen();
		console.log("[ci-install] pnpm install --frozen-lockfile succeeded");
		return;
	} catch {
		console.error("[ci-install] frozen install failed; retrying with pnpm install");
	}

	try {
		installUpdatingLockfile();
		console.log("[ci-install] pnpm install succeeded");
	} catch {
		console.error("[ci-install] dependency install failed after frozen install and pnpm install");
		process.exit(1);
	}
}

main();
