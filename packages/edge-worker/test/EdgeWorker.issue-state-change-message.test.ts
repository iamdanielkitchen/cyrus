import type {
	EdgeWorkerConfig,
	IAgentRunner,
	IssueStateChangeMessage,
	IssueStateChangeTrigger,
	RepositoryConfig,
} from "cyrus-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeWorker } from "../src/EdgeWorker";
import { TEST_CYRUS_HOME } from "./test-dirs.js";

const ORGANIZATION_ID = "org-1";
const ISSUE_ID = "issue-1";
const IDENTIFIER = "DEF-1";
const SESSION_ID = "session-1";
const STOPPED_SENTENCE = `Session stopped — ${IDENTIFIER} was marked as Done or Canceled.`;

describe("EdgeWorker.handleIssueStateChangeMessage", () => {
	let edgeWorker: EdgeWorker;
	let previousLogLevel: string | undefined;
	let deleteWorktree: ReturnType<typeof vi.fn>;
	let stop: ReturnType<typeof vi.fn>;
	let fetchFullIssueDetails: ReturnType<typeof vi.spyOn>;

	function worker(): any {
		return edgeWorker as any;
	}

	function loggedText(): string {
		return vi
			.mocked(console.log)
			.mock.calls.map((args) => args.map((part) => String(part)).join(" "))
			.join("\n");
	}

	function stateChangeMessage(
		trigger: IssueStateChangeTrigger,
	): IssueStateChangeMessage {
		return {
			id: "msg-1",
			source: "linear",
			action: "issue_state_change",
			receivedAt: "2026-01-01T00:00:00.000Z",
			organizationId: ORGANIZATION_ID,
			sessionKey: ISSUE_ID,
			workItemId: ISSUE_ID,
			workItemIdentifier: IDENTIFIER,
			isTerminal: true,
			trigger,
			platformData: {
				issue: {
					id: ISSUE_ID,
					identifier: IDENTIFIER,
					title: "Test issue",
					url: "https://linear.app/test/DEF-1",
				},
			},
		};
	}

	async function handle(trigger: IssueStateChangeTrigger): Promise<void> {
		await worker().handleIssueStateChangeMessage(stateChangeMessage(trigger));
	}

	function expectNoCleanup(): void {
		const asm = worker().agentSessionManager;
		expect(asm.requestSessionStop).not.toHaveBeenCalled();
		expect(stop).not.toHaveBeenCalled();
		expect(asm.createResponseActivity).not.toHaveBeenCalled();
		expect(asm.removeSession).not.toHaveBeenCalled();
		expect(deleteWorktree).not.toHaveBeenCalled();
		expect(fetchFullIssueDetails).not.toHaveBeenCalled();
		expect(loggedText()).not.toContain("Issue reached terminal state");
	}

	function expectCleanup(repositories: RepositoryConfig[]): void {
		const asm = worker().agentSessionManager;
		expect(asm.requestSessionStop).toHaveBeenCalledWith(SESSION_ID);
		expect(stop).toHaveBeenCalled();
		expect(asm.createResponseActivity).toHaveBeenCalledWith(
			SESSION_ID,
			STOPPED_SENTENCE,
		);
		expect(asm.removeSession).toHaveBeenCalledWith(SESSION_ID);
		expect(deleteWorktree).toHaveBeenCalledWith(IDENTIFIER, { repositories });
		expect(fetchFullIssueDetails).not.toHaveBeenCalled();
		expect(loggedText()).toContain(
			`[MessageBus] Issue reached terminal state: ${IDENTIFIER}`,
		);
	}

	beforeEach(() => {
		previousLogLevel = process.env.CYRUS_LOG_LEVEL;
		process.env.CYRUS_LOG_LEVEL = "INFO";

		const mockConfig: EdgeWorkerConfig = {
			proxyUrl: "http://localhost:3000",
			cyrusHome: TEST_CYRUS_HOME,
			repositories: [],
		};
		edgeWorker = new EdgeWorker(mockConfig);

		deleteWorktree = vi.fn().mockResolvedValue(undefined);
		worker().gitService.deleteWorktree = deleteWorktree;
		stop = vi.fn();

		const session = worker().agentSessionManager.createCyrusAgentSession(
			SESSION_ID,
			ISSUE_ID,
			{
				id: ISSUE_ID,
				identifier: IDENTIFIER,
				title: "Test issue",
				url: "https://linear.app/test/DEF-1",
			},
			{ path: "/tmp/cyrus-state-change-test", isGitWorktree: false },
		);
		session.agentRunner = { stop } as IAgentRunner;

		vi.spyOn(worker().agentSessionManager, "requestSessionStop");
		vi.spyOn(worker().agentSessionManager, "createResponseActivity");
		vi.spyOn(worker().agentSessionManager, "removeSession");
		fetchFullIssueDetails = vi.spyOn(edgeWorker, "fetchFullIssueDetails");
		vi.mocked(console.log).mockClear();
	});

	afterEach(() => {
		if (previousLogLevel === undefined) {
			delete process.env.CYRUS_LOG_LEVEL;
		} else {
			process.env.CYRUS_LOG_LEVEL = previousLogLevel;
		}
		vi.restoreAllMocks();
	});

	it.each([
		"started",
		"duplicate",
		"unstarted",
		"backlog",
		"triage",
	] as const)("leaves the worktree in place for status_notification state type %s", async (type) => {
		const fetchIssue = vi.fn().mockResolvedValue({
			id: ISSUE_ID,
			// Name looks terminal; cleanup must key off type only.
			state: Promise.resolve({ type, name: "Done" }),
		});
		worker().issueTrackers.set(ORGANIZATION_ID, { fetchIssue });

		await handle("status_notification");

		expect(fetchIssue).toHaveBeenCalledWith(ISSUE_ID);
		expect(loggedText()).toContain(
			`[MessageBus] Leaving worktree in place for ${IDENTIFIER}: state type ${type}`,
		);
		expectNoCleanup();
	});

	it("leaves the worktree in place when the issue state is missing", async () => {
		const fetchIssue = vi.fn().mockResolvedValue({
			id: ISSUE_ID,
			state: undefined,
		});
		worker().issueTrackers.set(ORGANIZATION_ID, { fetchIssue });

		await handle("status_notification");

		expect(fetchIssue).toHaveBeenCalledWith(ISSUE_ID);
		expect(loggedText()).toContain(
			`[MessageBus] Leaving worktree in place for ${IDENTIFIER}: state type missing`,
		);
		expectNoCleanup();
	});

	it("leaves the worktree in place when fetchIssue rejects", async () => {
		const fetchIssue = vi.fn().mockRejectedValue(new Error("linear down"));
		worker().issueTrackers.set(ORGANIZATION_ID, { fetchIssue });

		await handle("status_notification");

		expect(fetchIssue).toHaveBeenCalledWith(ISSUE_ID);
		expect(loggedText()).toContain(
			`[MessageBus] Leaving worktree in place for ${IDENTIFIER}: failed to read issue state: linear down`,
		);
		expectNoCleanup();
	});

	it("leaves the worktree in place when the workspace has no issue tracker", async () => {
		await handle("status_notification");

		expect(loggedText()).toContain(
			`[MessageBus] Leaving worktree in place for ${IDENTIFIER}: no issue tracker for workspace ${ORGANIZATION_ID}`,
		);
		expectNoCleanup();
	});

	it("cleans up a completed status notification and passes the session repository", async () => {
		const fetchIssue = vi.fn().mockResolvedValue({
			id: ISSUE_ID,
			state: Promise.resolve({ type: "completed", name: "In Progress" }),
		});
		worker().issueTrackers.set(ORGANIZATION_ID, { fetchIssue });
		const repo: RepositoryConfig = {
			id: "repo-1",
			name: "Repo One",
			repositoryPath: "/repos/one",
			workspaceBaseDir: "/worktrees",
			baseBranch: "main",
		};
		worker().repositories.set(repo.id, repo);
		worker().sessionRepositories.set(SESSION_ID, repo.id);

		await handle("status_notification");

		expect(fetchIssue).toHaveBeenCalledWith(ISSUE_ID);
		expectCleanup([repo]);
	});

	it("cleans up a canceled status notification", async () => {
		const fetchIssue = vi.fn().mockResolvedValue({
			id: ISSUE_ID,
			state: Promise.resolve({ type: "canceled", name: "Todo" }),
		});
		worker().issueTrackers.set(ORGANIZATION_ID, { fetchIssue });

		await handle("status_notification");

		expect(fetchIssue).toHaveBeenCalledWith(ISSUE_ID);
		expectCleanup([]);
	});

	it("cleans up a deletion without reading the issue", async () => {
		const fetchIssue = vi.fn().mockRejectedValue(new Error("issue gone"));
		worker().issueTrackers.set(ORGANIZATION_ID, { fetchIssue });

		await handle("deletion");

		expect(fetchIssue).not.toHaveBeenCalled();
		expectCleanup([]);
		expect(loggedText()).not.toContain("failed to read issue state");
	});
});
