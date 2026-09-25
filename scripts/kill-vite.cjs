const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOCK_FILE = path.join(PROJECT_ROOT, ".dev-watch.lock.json");

function isProcessAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}

	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function readLock() {
	if (!fs.existsSync(LOCK_FILE)) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
	} catch {
		fs.rmSync(LOCK_FILE, { force: true });
		return null;
	}
}

function stopWatcher() {
	const lock = readLock();
	if (!lock) {
		return false;
	}

	const pid = Number(lock.pid);
	if (!isProcessAlive(pid)) {
		fs.rmSync(LOCK_FILE, { force: true });
		return false;
	}

	try {
		if (process.platform === "win32") {
			execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
				stdio: "ignore",
			});
		} else {
			process.kill(pid, "SIGTERM");
		}

		console.log(`Stopped desktop dev watcher process: ${pid}`);
		return true;
	} catch (error) {
		console.warn(`Unable to stop desktop dev watcher process ${pid}: ${error.message}`);
		return false;
	} finally {
		fs.rmSync(LOCK_FILE, { force: true });
	}
}

stopWatcher();
