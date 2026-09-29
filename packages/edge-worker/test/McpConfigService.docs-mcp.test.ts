import { omitCyrusDocsAllowedTool } from "cyrus-core";
import { describe, expect, it } from "vitest";
import { McpConfigService } from "../src/McpConfigService.js";

const DOCS_MCP = {
	type: "http",
	url: "https://atcyrus.com/docs/mcp",
};

const SAMPLE_TOOLS = [
	"Read",
	"mcp__linear",
	"mcp__cyrus-docs",
	"mcp__cyrus-docs__search_documentation",
];

const ENV_KEY = "CYRUS_DISABLE_DOCS_MCP";

function createService(linearToken: string | null): McpConfigService {
	return new McpConfigService({
		getLinearTokenForWorkspace: () => linearToken,
		getIssueTracker: () =>
			linearToken === null
				? undefined
				: ({
						getClient: () => ({}),
					} as never),
		getCyrusToolsMcpUrl: () => "http://127.0.0.1:9/cyrus-tools",
		createCyrusToolsOptions: () => ({}),
	});
}

function withDocsMcpFlag(value: string | undefined, run: () => void): void {
	const previous = process.env[ENV_KEY];
	try {
		if (value === undefined) {
			delete process.env[ENV_KEY];
		} else {
			process.env[ENV_KEY] = value;
		}
		run();
	} finally {
		if (previous === undefined) {
			delete process.env[ENV_KEY];
		} else {
			process.env[ENV_KEY] = previous;
		}
	}
}

function expectDocsRegistered(): void {
	const withoutToken = createService(null).buildMcpConfig("repo", "ws");
	expect(withoutToken["cyrus-docs"]).toEqual(DOCS_MCP);

	const withToken = createService("linear-test-token").buildMcpConfig(
		"repo",
		"ws",
	);
	expect(withToken["cyrus-docs"]).toEqual(DOCS_MCP);
	expect(Object.hasOwn(withToken, "linear")).toBe(true);
	expect(Object.hasOwn(withToken, "cyrus-tools")).toBe(true);
	expect(withToken.linear?.type).toBe("http");
	expect(withToken.linear?.url).toBe("https://mcp.linear.app/mcp");
	expect(withToken["cyrus-tools"]?.type).toBe("http");
	expect(withToken["cyrus-tools"]?.url).toBe("http://127.0.0.1:9/cyrus-tools");

	const tools = [...SAMPLE_TOOLS];
	expect(omitCyrusDocsAllowedTool(tools)).toEqual(SAMPLE_TOOLS);
	expect(tools).toEqual(SAMPLE_TOOLS);
}

describe("CYRUS_DISABLE_DOCS_MCP", () => {
	it("keeps cyrus-docs when the flag is unset", () => {
		withDocsMcpFlag(undefined, () => {
			expectDocsRegistered();
		});
	});

	it('omits cyrus-docs when the flag is "true"', () => {
		withDocsMcpFlag("true", () => {
			const withoutToken = createService(null).buildMcpConfig("repo", "ws");
			expect(Object.hasOwn(withoutToken, "cyrus-docs")).toBe(false);

			const withToken = createService("linear-test-token").buildMcpConfig(
				"repo",
				"ws",
			);
			expect(Object.hasOwn(withToken, "cyrus-docs")).toBe(false);
			expect(Object.hasOwn(withToken, "linear")).toBe(true);
			expect(Object.hasOwn(withToken, "cyrus-tools")).toBe(true);
			expect(withToken.linear?.type).toBe("http");
			expect(withToken.linear?.url).toBe("https://mcp.linear.app/mcp");
			expect(withToken["cyrus-tools"]?.type).toBe("http");
			expect(withToken["cyrus-tools"]?.url).toBe(
				"http://127.0.0.1:9/cyrus-tools",
			);

			const tools = [...SAMPLE_TOOLS];
			expect(omitCyrusDocsAllowedTool(tools)).toEqual(["Read", "mcp__linear"]);
			expect(tools).toEqual(SAMPLE_TOOLS);
		});
	});

	it('treats " YES " like true for the no-token config and the tool filter', () => {
		withDocsMcpFlag(" YES ", () => {
			const withoutToken = createService(null).buildMcpConfig("repo", "ws");
			expect(Object.hasOwn(withoutToken, "cyrus-docs")).toBe(false);

			const tools = [...SAMPLE_TOOLS];
			expect(omitCyrusDocsAllowedTool(tools)).toEqual(["Read", "mcp__linear"]);
			expect(tools).toEqual(SAMPLE_TOOLS);
		});
	});

	it('keeps cyrus-docs when the flag is "false"', () => {
		withDocsMcpFlag("false", () => {
			expectDocsRegistered();
		});
	});
});
