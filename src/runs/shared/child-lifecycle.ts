/**
 * Child lifecycle projection: when the observed child session events mean
 * the run is settling and the observer may start (or must cancel) its final
 * drain window.
 */
export type ChildLifecycleAction = "start-drain" | "cancel-drain" | "none";

export interface ChildLifecycleState {
	compactionRetryActive: boolean;
	/**
	 * A self_compact tool call was observed for the current turn. The
	 * extension starts the compaction only after the agent settles, so
	 * compaction_start arrives AFTER agent_settled — the drain decision at
	 * agent_settled must already know a compaction is coming.
	 */
	selfCompactPending: boolean;
}

export function projectChildLifecycle(event: { type?: string; willRetry?: unknown }, terminalAssistantStop = false, state?: ChildLifecycleState): ChildLifecycleAction {
	if (event.type === "compaction_end") {
		if (state) state.compactionRetryActive = event.willRetry === true;
		return event.willRetry === true ? "cancel-drain" : "none";
	}
	// A compaction in flight (e.g. a self_compact handoff) must not be raced by the
	// final drain: hold the drain until it resolves. On success the delivered
	// handoff triggers a new turn (agent_start cancels the drain again); on
	// retry, compaction_end(willRetry) keeps holding.
	if (event.type === "compaction_start") {
		if (state) {
			state.compactionRetryActive = true;
			state.selfCompactPending = false;
		}
		return "cancel-drain";
	}
	if (event.type === "agent_start" || event.type === "auto_retry_start" || event.type === "turn_start") {
		if (state) {
			state.compactionRetryActive = false;
			state.selfCompactPending = false;
		}
		return "cancel-drain";
	}
	if (event.type === "agent_end") {
		if (event.willRetry !== true && state) {
			state.compactionRetryActive = false;
			state.selfCompactPending = false;
		}
		return "cancel-drain";
	}
	if (event.type === "agent_settled") {
		// The self_compact handoff settles the agent before the extension starts
		// the compaction: adopt the pending flag so this settlement cannot open
		// the final drain window under an in-flight summary call.
		if (state?.selfCompactPending) state.compactionRetryActive = true;
		return state?.compactionRetryActive ? "none" : "start-drain";
	}
	if (terminalAssistantStop) return "start-drain";
	return "none";
}
