import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeWorker } from "../src/EdgeWorker.js";
import type { EdgeWorkerConfig, RepositoryConfig } from "../src/types.js";

// Mock fs/promises
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
	rename: vi.fn(),
	readdir: vi.fn().mockResolvedValue([]),
}));

// Mock dependencies
vi.mock("cyrus-claude-runner");
vi.mock("cyrus-codex-runner");
vi.mock("cyrus-gemini-runner");
vi.mock("cyrus-linear-event-transport");
vi.mock("@linear/sdk");
vi.mock("../src/SharedApplicationServer.js", () => ({
	SharedApplicationServer: vi.fn().mockImplementation(function () {
		return {
			initializeFastify: vi.fn(),
			getFastifyInstance: vi.fn().mockReturnValue({
				get: vi.fn(),
				post: vi.fn(),
			}),
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
			getWebhookUrl: vi.fn().mockReturnValue("http://localhost:3456/webhook"),
		};
	}),
}));
vi.mock("../src/AgentSessionManager.js", () => ({
	AgentSessionManager: vi.fn().mockImplementation(function () {
		return {
			getAllAgentRunners: vi.fn().mockReturnValue([]),
			getAllSessions: vi.fn().mockReturnValue([]),
			createCyrusAgentSession: vi.fn(),
			getSession: vi.fn(),
			getActiveSessionsByIssueId: vi.fn().mockReturnValue([]),
			setActivitySink: vi.fn(),
			on: vi.fn(), // EventEmitter method
			emit: vi.fn(), // EventEmitter method
		};
	}),
}));
vi.mock("cyrus-core", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		isAgentSessionCreatedWebhook: vi.fn().mockReturnValue(false),
		isAgentSessionPromptedWebhook: vi.fn().mockReturnValue(false),
		isIssueAssignedWebhook: vi.fn().mockReturnValue(false),
		isIssueCommentMentionWebhook: vi.fn().mockReturnValue(false),
		isIssueNewCommentWebhook: vi.fn().mockReturnValue(false),
		isIssueUnassignedWebhook: vi.fn().mockReturnValue(false),
		PersistenceManager: vi.fn().mockImplementation(function () {
			return {
				loadEdgeWorkerState: vi.fn().mockResolvedValue(null),
				saveEdgeWorkerState: vi.fn().mockResolvedValue(undefined),
			};
		}),
	};
});
vi.mock("file-type");
vi.mock("chokidar", () => ({
	watch: vi.fn().mockReturnValue({
		on: vi.fn().mockReturnThis(),
		close: vi.fn().mockResolvedValue(undefined),
	}),
}));

const IGNORE_SUFFIX =
	"[INFO ] [EdgeWorker] Ignoring webhook action issueSubscribed";

describe("EdgeWorker - issueSubscribed webhook", () => {
	let edgeWorker: EdgeWorker;
	let mockConfig: EdgeWorkerConfig;
	let originalLogLevel: string | undefined;
	let originalWebhookDebug: string | undefined;

	const mockRepository: RepositoryConfig = {
		id: "test-repo",
		name: "Test Repo",
		repositoryPath: "/test/repo",
		workspaceBaseDir: "/test/workspaces",
		baseBranch: "main",
		linearWorkspaceId: "test-workspace",
		isActive: true,
	};

	function installHandlerStubs(worker: EdgeWorker) {
		const stubs = {
			handleAgentSessionCreatedWebhook: vi.fn(),
			handleUserPromptedAgentActivity: vi.fn(),
			handleIssueUnassignedWebhook: vi.fn(),
			handleIssueContentUpdate: vi.fn(),
			handleIssueStateChange: vi.fn(),
		};
		const instance = worker as any;
		instance.handleAgentSessionCreatedWebhook =
			stubs.handleAgentSessionCreatedWebhook;
		instance.handleUserPromptedAgentActivity =
			stubs.handleUserPromptedAgentActivity;
		instance.handleIssueUnassignedWebhook = stubs.handleIssueUnassignedWebhook;
		instance.handleIssueContentUpdate = stubs.handleIssueContentUpdate;
		instance.handleIssueStateChange = stubs.handleIssueStateChange;
		return stubs;
	}

	function expectHandlersNotCalled(
		stubs: ReturnType<typeof installHandlerStubs>,
	) {
		expect(stubs.handleAgentSessionCreatedWebhook).not.toHaveBeenCalled();
		expect(stubs.handleUserPromptedAgentActivity).not.toHaveBeenCalled();
		expect(stubs.handleIssueUnassignedWebhook).not.toHaveBeenCalled();
		expect(stubs.handleIssueContentUpdate).not.toHaveBeenCalled();
		expect(stubs.handleIssueStateChange).not.toHaveBeenCalled();
	}

	function logFirstArgs(): string[] {
		return vi
			.mocked(console.log)
			.mock.calls.map((args) => (typeof args[0] === "string" ? args[0] : ""));
	}

	beforeEach(() => {
		vi.clearAllMocks();
		originalLogLevel = process.env.CYRUS_LOG_LEVEL;
		originalWebhookDebug = process.env.CYRUS_WEBHOOK_DEBUG;

		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});

		delete process.env.CYRUS_WEBHOOK_DEBUG;

		mockConfig = {
			platform: "linear",
			cyrusHome: "/test/.cyrus",
			repositories: [mockRepository],
			linearWorkspaces: {
				"test-workspace": { linearToken: "test-token" },
			},
		};
	});

	afterEach(async () => {
		if (originalLogLevel === undefined) {
			delete process.env.CYRUS_LOG_LEVEL;
		} else {
			process.env.CYRUS_LOG_LEVEL = originalLogLevel;
		}
		if (originalWebhookDebug === undefined) {
			delete process.env.CYRUS_WEBHOOK_DEBUG;
		} else {
			process.env.CYRUS_WEBHOOK_DEBUG = originalWebhookDebug;
		}

		if (edgeWorker) {
			try {
				await edgeWorker.stop();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	it("ignores AppUserNotification issueSubscribed without calling other handlers", async () => {
		edgeWorker = new EdgeWorker(mockConfig);
		const stubs = installHandlerStubs(edgeWorker);

		await (edgeWorker as any).handleWebhook(
			{ type: "AppUserNotification", action: "issueSubscribed" },
			[mockRepository],
		);

		expect(logFirstArgs().some((line) => line.includes(IGNORE_SUFFIX))).toBe(
			true,
		);
		expect(
			vi
				.mocked(console.error)
				.mock.calls.some((args) =>
					args.some(
						(arg) =>
							typeof arg === "string" &&
							arg.includes("Failed to process webhook"),
					),
				),
		).toBe(false);
		expectHandlersNotCalled(stubs);
		expect((edgeWorker as any).activeWebhookCount).toBe(0);
	});

	it("does not ignore AppUserNotification issueAssignedToYou", async () => {
		edgeWorker = new EdgeWorker(mockConfig);
		const stubs = installHandlerStubs(edgeWorker);

		await (edgeWorker as any).handleWebhook(
			{ type: "AppUserNotification", action: "issueAssignedToYou" },
			[mockRepository],
		);

		expect(logFirstArgs().some((line) => line.includes(IGNORE_SUFFIX))).toBe(
			false,
		);
		expectHandlersNotCalled(stubs);
	});

	it("does not ignore issueUnsubscribed or log it as unhandled when debug is unset", async () => {
		edgeWorker = new EdgeWorker(mockConfig);
		const stubs = installHandlerStubs(edgeWorker);

		await (edgeWorker as any).handleWebhook(
			{ type: "AppUserNotification", action: "issueUnsubscribed" },
			[mockRepository],
		);

		expect(logFirstArgs().some((line) => line.includes(IGNORE_SUFFIX))).toBe(
			false,
		);
		expect(
			vi
				.mocked(console.log)
				.mock.calls.some((args) =>
					args.some(
						(arg) =>
							typeof arg === "string" &&
							arg.includes("Unhandled webhook type"),
					),
				),
		).toBe(false);
		expectHandlersNotCalled(stubs);
	});

	it("logs unhandled issueUnsubscribed only when webhook debug and DEBUG level are set before construction", async () => {
		process.env.CYRUS_LOG_LEVEL = "DEBUG";
		process.env.CYRUS_WEBHOOK_DEBUG = "true";
		edgeWorker = new EdgeWorker(mockConfig);
		const stubs = installHandlerStubs(edgeWorker);

		await (edgeWorker as any).handleWebhook(
			{ type: "AppUserNotification", action: "issueUnsubscribed" },
			[mockRepository],
		);

		expect(
			logFirstArgs().some((line) =>
				line.includes("Unhandled webhook type: issueUnsubscribed"),
			),
		).toBe(true);
		expect(logFirstArgs().some((line) => line.includes(IGNORE_SUFFIX))).toBe(
			false,
		);
		expectHandlersNotCalled(stubs);
	});
});
