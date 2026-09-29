import { describe, expect, it } from "vitest";
import { isIssueSubscribedWebhook } from "../src/issue-tracker/types.js";

describe("isIssueSubscribedWebhook", () => {
	it("returns true only for AppUserNotification issueSubscribed", () => {
		expect(
			isIssueSubscribedWebhook({
				type: "AppUserNotification",
				action: "issueSubscribed",
			} as never),
		).toBe(true);
	});

	it.each([
		{ type: "AppUserNotification", action: "issueAssignedToYou" },
		{ type: "AppUserNotification", action: "issueUnsubscribed" },
		{ type: "AppUserNotification", action: "issueNewComment" },
		{ type: "AppUserNotification", action: "issueCommentMention" },
		{ type: "AppUserNotification", action: "issueUnassignedFromYou" },
		{ type: "AppUserNotification", action: "issueStatusChanged" },
		{ type: "AppUserNotification", action: "IssueSubscribed" },
		{ type: "Issue", action: "issueSubscribed" },
		{ type: "AgentSessionEvent", action: "created" },
		{ type: "AgentSessionEvent", action: "prompted" },
		{ type: "Issue", action: "update" },
		{ type: "Issue", action: "remove" },
		{ action: "issueSubscribed" },
	])("returns false for %j", (webhook) => {
		expect(isIssueSubscribedWebhook(webhook as never)).toBe(false);
	});
});
