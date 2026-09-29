import { describe, expect, it } from "vitest";
import { selectSystemPromptForRepository } from "../src/prompts/systemPromptSelection.js";

const debuggerRepository = {
	labelPrompts: {
		debugger: ["Bug"],
	},
};

describe("selectSystemPromptForRepository", () => {
	it("selects debugger using the issue label text", () => {
		expect(
			selectSystemPromptForRepository(debuggerRepository, ["Bug"]),
		).toEqual({
			type: "debugger",
			triggerLabel: "Bug",
		});
	});

	it("matches debugger labels case-insensitively and keeps issue casing", () => {
		expect(
			selectSystemPromptForRepository(debuggerRepository, ["bug"]),
		).toEqual({
			type: "debugger",
			triggerLabel: "bug",
		});
	});

	it("prefers graphite-orchestrator and reports the graphite issue label", () => {
		expect(
			selectSystemPromptForRepository(debuggerRepository, [
				"Bug",
				"graphite",
				"orchestrator",
			]),
		).toEqual({
			type: "graphite-orchestrator",
			triggerLabel: "graphite",
		});
	});

	it("selects the literal orchestrator label when that key is omitted", () => {
		expect(
			selectSystemPromptForRepository(debuggerRepository, ["Orchestrator"]),
		).toEqual({
			type: "orchestrator",
			triggerLabel: "Orchestrator",
		});
	});

	it("returns null when there are no labels, even if debugger is configured", () => {
		expect(selectSystemPromptForRepository(debuggerRepository, [])).toBeNull();
	});

	it("returns null when labelPrompts are absent and the issue is not orchestrator", () => {
		expect(selectSystemPromptForRepository(undefined, ["bug"])).toBeNull();
		expect(selectSystemPromptForRepository({}, ["bug"])).toBeNull();
	});

	it("selects orchestrator from the issue label when labelPrompts are absent", () => {
		expect(
			selectSystemPromptForRepository(undefined, ["Orchestrator"]),
		).toEqual({
			type: "orchestrator",
			triggerLabel: "Orchestrator",
		});
		expect(selectSystemPromptForRepository({}, ["Orchestrator"])).toEqual({
			type: "orchestrator",
			triggerLabel: "Orchestrator",
		});
	});

	it("does not treat graphite as a mode when labelPrompts are absent", () => {
		expect(
			selectSystemPromptForRepository(undefined, ["graphite", "Orchestrator"]),
		).toEqual({
			type: "orchestrator",
			triggerLabel: "Orchestrator",
		});
		expect(
			selectSystemPromptForRepository({}, ["graphite", "Orchestrator"]),
		).toEqual({
			type: "orchestrator",
			triggerLabel: "Orchestrator",
		});
	});
});
