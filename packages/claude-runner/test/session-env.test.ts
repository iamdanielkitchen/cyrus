import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBaseSessionEnv } from "../src/session-env.js";

const DENYLIST_ENV_KEYS = [
	"LINEAR_WEBHOOK_SECRET",
	"LINEAR_CLIENT_SECRET",
	"LINEAR_CLIENT_ID",
	"CYRUS_API_KEY",
	"CYRUS_TEAM_ID",
	"CLOUDFLARE_TOKEN",
] as const;

const WRITTEN_ENV_KEYS = [
	...DENYLIST_ENV_KEYS,
	"CLAUDE_CODE_OAUTH_TOKEN",
	"GIT_AUTHOR_NAME",
] as const;

describe("buildBaseSessionEnv", () => {
	const originalEnv = new Map<string, string | undefined>();

	beforeEach(() => {
		originalEnv.clear();
		for (const key of WRITTEN_ENV_KEYS) {
			originalEnv.set(key, process.env[key]);
		}
	});

	afterEach(() => {
		for (const key of WRITTEN_ENV_KEYS) {
			const original = originalEnv.get(key);
			if (original === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = original;
			}
		}
	});

	it("omits denylisted secrets and does not mutate process.env", () => {
		for (const key of DENYLIST_ENV_KEYS) {
			process.env[key] = "example";
		}
		process.env.CLAUDE_CODE_OAUTH_TOKEN = "example";
		process.env.GIT_AUTHOR_NAME = "example";

		const env = buildBaseSessionEnv();

		for (const key of DENYLIST_ENV_KEYS) {
			expect(env).not.toHaveProperty(key);
		}
		expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("example");
		expect(env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBeUndefined();
		expect(env.GIT_AUTHOR_NAME).toBe("example");
		expect(process.env.LINEAR_WEBHOOK_SECRET).toBe("example");

		const withExtra = buildBaseSessionEnv({
			LINEAR_WEBHOOK_SECRET: "example",
		});
		expect(withExtra).not.toHaveProperty("LINEAR_WEBHOOK_SECRET");
	});
});
