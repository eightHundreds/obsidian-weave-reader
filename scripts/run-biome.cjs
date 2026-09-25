const { spawnSync } = require("child_process");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TARGETS = [
	"src/main.ts",
	"src/views",
	"src/services/epub",
	"src/services/navigation",
	"src/services/premium",
	"src/services/ai/ai-action-config.ts",
	"src/services/ai/ai-host.ts",
	"src/components/epub",
	"src/components/modals/EpubBookshelfImportModal.ts",
	"src/components/settings",
	"src/config",
	"src/stores/ai-config.store.ts",
	"src/stores/epub-active-document-store.ts",
	"src/types/license.ts",
	"src/types/utility-types.ts",
	"src/utils/i18n",
	"src/utils/license-state.ts",
	"src/utils/licenseManager.ts",
	"src/utils/epub-leaf-utils.ts",
	"src/utils/weave-reader-access.ts",
	"src/utils/plugin-access.ts",
	"src/events",
	"src/tests",
];

const COMMANDS = {
	format: ["format", "--write"],
	"format:check": ["check", "--linter-enabled=false", "--organize-imports-enabled=false"],
	lint: ["lint", "--apply-unsafe"],
	"lint:check": ["check", "--formatter-enabled=false", "--organize-imports-enabled=false"],
};

const commandName = process.argv[2];
const biomeArgs = COMMANDS[commandName];

if (!biomeArgs) {
	console.error(`Usage: node scripts/run-biome.cjs ${Object.keys(COMMANDS).join("|")}`);
	process.exit(1);
}

const biomeBin = path.join(
	PROJECT_ROOT,
	"node_modules",
	".bin",
	process.platform === "win32" ? "biome.cmd" : "biome"
);

const result = spawnSync(biomeBin, [...biomeArgs, ...TARGETS], {
	cwd: PROJECT_ROOT,
	stdio: "inherit",
});

process.exit(result.status ?? 1);
