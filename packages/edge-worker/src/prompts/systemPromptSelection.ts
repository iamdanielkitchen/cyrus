import type { RepositoryConfig } from "cyrus-core";

export type SystemPromptType =
	| "debugger"
	| "builder"
	| "scoper"
	| "orchestrator"
	| "graphite-orchestrator";

export interface SystemPromptSelection {
	type: SystemPromptType;
	triggerLabel: string;
}

type LabelPrompts = NonNullable<RepositoryConfig["labelPrompts"]>;
type LabelPromptConfig = NonNullable<
	LabelPrompts["debugger"] | LabelPrompts["graphite"]
>;

const ORDERED_PROMPT_TYPES = [
	"debugger",
	"builder",
	"scoper",
	"orchestrator",
] as const;

const ORCHESTRATOR_LABEL = "orchestrator";
/** Used only when `labelPrompts.graphite` is absent. An explicit `[]` does not default. */
const DEFAULT_GRAPHITE_LABELS = ["graphite"] as const;

/**
 * Choose the label-based system prompt for one repository.
 *
 * `labelPrompts["graphite-orchestrator"]` is not a label source. With no
 * labelPrompts, only a literal orchestrator label matches — graphite is not a mode.
 * `triggerLabel` is the issue label's original text, chosen by configured-list order.
 */
export function selectSystemPromptForRepository(
	repository: Pick<RepositoryConfig, "labelPrompts"> | undefined,
	labels: readonly string[],
): SystemPromptSelection | null {
	if (labels.length === 0) {
		return null;
	}

	const labelPrompts = repository?.labelPrompts;
	if (!labelPrompts) {
		const triggerLabel = literalOrchestratorLabel(labels);
		if (!triggerLabel) {
			return null;
		}
		return { type: "orchestrator", triggerLabel };
	}

	const graphiteTrigger = triggerFromConfiguredList(
		labels,
		graphiteLabels(labelPrompts),
	);
	if (graphiteTrigger && hasOrchestratorMatch(labels, labelPrompts)) {
		return { type: "graphite-orchestrator", triggerLabel: graphiteTrigger };
	}

	for (const promptType of ORDERED_PROMPT_TYPES) {
		if (promptType === "orchestrator") {
			const triggerLabel = orchestratorTriggerLabel(labels, labelPrompts);
			if (triggerLabel) {
				return { type: "orchestrator", triggerLabel };
			}
			continue;
		}

		const configured = configuredLabels(labelPrompts[promptType]);
		if (!configured) {
			continue;
		}
		const triggerLabel = triggerFromConfiguredList(labels, configured);
		if (triggerLabel) {
			return { type: promptType, triggerLabel };
		}
	}

	return null;
}

function literalOrchestratorLabel(
	labels: readonly string[],
): string | undefined {
	return labels.find((label) => label.toLowerCase() === ORCHESTRATOR_LABEL);
}

function configuredLabels(
	config: LabelPromptConfig | undefined,
): readonly string[] | undefined {
	if (!config) {
		return undefined;
	}
	if (Array.isArray(config)) {
		return config;
	}
	return config.labels;
}

function graphiteLabels(labelPrompts: LabelPrompts): readonly string[] {
	const config = labelPrompts.graphite;
	if (Array.isArray(config)) {
		return config;
	}
	return config?.labels ?? DEFAULT_GRAPHITE_LABELS;
}

/** Literal "orchestrator" still matches when custom orchestrator labels are configured. */
function hasOrchestratorMatch(
	labels: readonly string[],
	labelPrompts: LabelPrompts,
): boolean {
	if (literalOrchestratorLabel(labels)) {
		return true;
	}
	const configured = configuredLabels(labelPrompts.orchestrator);
	if (!configured) {
		return false;
	}
	return triggerFromConfiguredList(labels, configured) !== undefined;
}

function orchestratorTriggerLabel(
	labels: readonly string[],
	labelPrompts: LabelPrompts,
): string | undefined {
	const configured = configuredLabels(labelPrompts.orchestrator);
	if (configured) {
		const fromConfig = triggerFromConfiguredList(labels, configured);
		if (fromConfig) {
			return fromConfig;
		}
	}
	// Key omitted, or the configured names missed: the literal label still wins.
	return literalOrchestratorLabel(labels);
}

function triggerFromConfiguredList(
	issueLabels: readonly string[],
	configuredLabels: readonly string[],
): string | undefined {
	for (const configuredLabel of configuredLabels) {
		const configuredLower = configuredLabel.toLowerCase();
		const match = issueLabels.find(
			(issueLabel) => issueLabel.toLowerCase() === configuredLower,
		);
		if (match !== undefined) {
			return match;
		}
	}
	return undefined;
}
