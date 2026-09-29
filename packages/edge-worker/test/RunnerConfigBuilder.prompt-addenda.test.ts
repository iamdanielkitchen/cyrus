import type { ILogger } from "cyrus-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BROWSER_USE_PROMPT_ADDENDUM } from "../src/prompts/browserUsePromptAddendum.js";
import { CLOUD_RUNTIME_PROMPT_ADDENDUM } from "../src/prompts/cloudRuntimePromptAddendum.js";
import { FAILURE_MODE_PROMPT_ADDENDUM } from "../src/prompts/failureModePromptAddendum.js";
import { GITHUB_CLI_MEDIA_PROMPT_ADDENDUM } from "../src/prompts/githubCliMediaPromptAddendum.js";
import {
	type IChatToolResolver,
	type IMcpConfigProvider,
	type IRunnerSelector,
	type IssueRunnerConfigInput,
	RunnerConfigBuilder,
} from "../src/RunnerConfigBuilder.js";

const silentLogger: ILogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
} as unknown as ILogger;

function makeBuilder(): RunnerConfigBuilder {
	const chatToolResolver: IChatToolResolver = {
		buildChatAllowedTools: () => ["Read(**)"],
	};
	const mcpConfigProvider: IMcpConfigProvider = {
		buildMcpConfig: () => ({}),
		buildMergedMcpConfigPath: () => undefined,
	};
	const runnerSelector: IRunnerSelector = {
		determineRunnerSelection: () => ({ runnerType: "claude" as const }),
		getDefaultRunner: () => "claude",
		getDefaultModelForRunner: () => "",
		getDefaultFallbackModelForRunner: () => "",
	};
	return new RunnerConfigBuilder(
		chatToolResolver,
		mcpConfigProvider,
		runnerSelector,
	);
}

function buildChatPrompt(
	builder: RunnerConfigBuilder,
	failureModeToolEnabled?: boolean,
): string | undefined {
	return builder.buildChatConfig({
		workspacePath: "/tmp/chat-workspace",
		workspaceName: "chat-thread",
		systemPrompt: "Base prompt.",
		sessionId: "chat-session",
		cyrusHome: "/tmp/cyrus",
		platformName: "slack",
		logger: silentLogger,
		onMessage: () => {},
		onError: () => {},
		...(failureModeToolEnabled !== undefined ? { failureModeToolEnabled } : {}),
	}).appendSystemPrompt;
}

function buildIssuePrompt(
	builder: RunnerConfigBuilder,
	overrides: Partial<
		Pick<IssueRunnerConfigInput, "failureModeToolEnabled" | "systemPrompt">
	> = {},
): string | undefined {
	return builder.buildIssueConfig({
		session: {
			issueId: "issue-1",
			workspace: { path: "/tmp/worktree" },
			issue: { identifier: "CYPACK-1490" },
		} as any,
		repository: { id: "repo-1", path: "/tmp/repo" } as any,
		sessionId: "issue-session",
		systemPrompt: "Base prompt.",
		allowedTools: ["Read(**)"],
		allowedDirectories: ["/tmp/worktree"],
		disallowedTools: [],
		labels: [],
		cyrusHome: "/tmp/cyrus",
		logger: silentLogger,
		onMessage: () => {},
		onError: () => {},
		requireLinearWorkspaceId: () => "workspace-1",
		...overrides,
	}).config.appendSystemPrompt;
}

describe("RunnerConfigBuilder prompt addenda", () => {
	const originalBrowserUse = process.env.CYRUS_BROWSER_USE_ENABLED;
	const originalCloudRuntime = process.env.CYRUS_CLOUD_RUNTIME;

	beforeEach(() => {
		delete process.env.CYRUS_BROWSER_USE_ENABLED;
		delete process.env.CYRUS_CLOUD_RUNTIME;
	});

	afterEach(() => {
		if (originalBrowserUse === undefined)
			delete process.env.CYRUS_BROWSER_USE_ENABLED;
		else process.env.CYRUS_BROWSER_USE_ENABLED = originalBrowserUse;
		if (originalCloudRuntime === undefined)
			delete process.env.CYRUS_CLOUD_RUNTIME;
		else process.env.CYRUS_CLOUD_RUNTIME = originalCloudRuntime;
	});

	it("omits failure-mode guidance when the flag is omitted, but still adds GitHub media guidance", () => {
		const expected = `Base prompt.\n\n${GITHUB_CLI_MEDIA_PROMPT_ADDENDUM}`;

		expect(buildChatPrompt(makeBuilder())).toBe(expected);
		expect(buildIssuePrompt(makeBuilder())).toBe(expected);
		expect(buildChatPrompt(makeBuilder())).not.toContain("log_failure_mode");
		expect(buildIssuePrompt(makeBuilder())).not.toContain("log_failure_mode");
	});

	it("omits failure-mode guidance when the flag is false, but still adds GitHub media guidance", () => {
		const expected = `Base prompt.\n\n${GITHUB_CLI_MEDIA_PROMPT_ADDENDUM}`;

		expect(buildChatPrompt(makeBuilder(), false)).toBe(expected);
		expect(
			buildIssuePrompt(makeBuilder(), { failureModeToolEnabled: false }),
		).toBe(expected);
		expect(buildChatPrompt(makeBuilder(), false)).not.toContain(
			"log_failure_mode",
		);
		expect(
			buildIssuePrompt(makeBuilder(), { failureModeToolEnabled: false }),
		).not.toContain("log_failure_mode");
	});

	it("still adds browser guidance when the failure-mode flag is omitted or false", () => {
		process.env.CYRUS_BROWSER_USE_ENABLED = "true";
		const expected = `Base prompt.\n\n${BROWSER_USE_PROMPT_ADDENDUM}\n\n${GITHUB_CLI_MEDIA_PROMPT_ADDENDUM}`;

		expect(buildChatPrompt(makeBuilder())).toBe(expected);
		expect(buildChatPrompt(makeBuilder(), false)).toBe(expected);
		expect(buildIssuePrompt(makeBuilder())).toBe(expected);
		expect(
			buildIssuePrompt(makeBuilder(), { failureModeToolEnabled: false }),
		).toBe(expected);
		expect(expected).not.toContain("log_failure_mode");
	});

	it("still adds cloud-runtime guidance when the failure-mode flag is omitted or false", () => {
		process.env.CYRUS_CLOUD_RUNTIME = "true";
		const expected = `Base prompt.\n\n${GITHUB_CLI_MEDIA_PROMPT_ADDENDUM}\n\n${CLOUD_RUNTIME_PROMPT_ADDENDUM}`;

		expect(buildChatPrompt(makeBuilder())).toBe(expected);
		expect(buildChatPrompt(makeBuilder(), false)).toBe(expected);
		expect(buildIssuePrompt(makeBuilder())).toBe(expected);
		expect(
			buildIssuePrompt(makeBuilder(), { failureModeToolEnabled: false }),
		).toBe(expected);
	});

	it("adds failure-mode guidance before the GitHub media addendum when the flag is true", () => {
		const expected = `Base prompt.\n\n${FAILURE_MODE_PROMPT_ADDENDUM}\n\n${GITHUB_CLI_MEDIA_PROMPT_ADDENDUM}`;

		expect(buildChatPrompt(makeBuilder(), true)).toBe(expected);
		expect(
			buildIssuePrompt(makeBuilder(), { failureModeToolEnabled: true }),
		).toBe(expected);
		expect(expected).toContain(FAILURE_MODE_PROMPT_ADDENDUM);
		expect(expected.indexOf(FAILURE_MODE_PROMPT_ADDENDUM)).toBeLessThan(
			expected.indexOf(GITHUB_CLI_MEDIA_PROMPT_ADDENDUM),
		);
	});

	it("adds failure-mode guidance before browser-use and GitHub media when the flag is true", () => {
		process.env.CYRUS_BROWSER_USE_ENABLED = "true";
		const expected = `Base prompt.\n\n${FAILURE_MODE_PROMPT_ADDENDUM}\n\n${BROWSER_USE_PROMPT_ADDENDUM}\n\n${GITHUB_CLI_MEDIA_PROMPT_ADDENDUM}`;

		expect(buildChatPrompt(makeBuilder(), true)).toBe(expected);
		expect(
			buildIssuePrompt(makeBuilder(), { failureModeToolEnabled: true }),
		).toBe(expected);
	});

	it("does not stringify an undefined issue system prompt when the failure-mode flag is omitted or false", () => {
		const expected = GITHUB_CLI_MEDIA_PROMPT_ADDENDUM;

		expect(buildIssuePrompt(makeBuilder(), { systemPrompt: undefined })).toBe(
			expected,
		);
		expect(
			buildIssuePrompt(makeBuilder(), {
				systemPrompt: undefined,
				failureModeToolEnabled: false,
			}),
		).toBe(expected);
		expect(expected).not.toContain("undefined");
		expect(expected).not.toContain("log_failure_mode");
	});

	it("prepends failure-mode guidance to an undefined issue system prompt when the flag is true", () => {
		expect(
			buildIssuePrompt(makeBuilder(), {
				systemPrompt: undefined,
				failureModeToolEnabled: true,
			}),
		).toBe(
			`${FAILURE_MODE_PROMPT_ADDENDUM}\n\n${GITHUB_CLI_MEDIA_PROMPT_ADDENDUM}`,
		);
	});
});
