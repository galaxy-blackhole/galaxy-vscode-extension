/**
 * A child run, assembled by the host that knows how to assemble one.
 *
 * The core owns what a child is and how the book is kept; only this side knows how to build a run — models, tools,
 * approvals, a workspace. So the wiring lives here, and the run builder arrives as an argument rather than an
 * import, which is also what makes it testable without booting anything.
 */
import type { ChildRunOutcome, ChildRunRequest } from "@galaxy-stack/ai-coder-core/runtime/subagent-in-process";
import type { GalaxyUiEvent } from "../ui-protocol";

/** What a host run looks like from here: enough to start it, watch it, and stop it. */
export interface ChildRunHandle {
  readonly cancel: () => void;
  readonly done: Promise<void>;
}

export interface ChildRunInput {
  /** The child's whole task, used as the goal of its own run. */
  readonly goal: string;
  /** Its own task id, so its records never overwrite the parent's. */
  readonly taskId: string;
  readonly onEvent: (event: GalaxyUiEvent) => void;
}

/**
 * Builds and starts one child run. Supplied by whoever holds the models and the workspace.
 */
export type ChildRunStarter = (input: ChildRunInput) => ChildRunHandle;

export interface ChildRunFactoryOptions {
  /** A fresh id per child; the caller decides the shape, the factory only asks for uniqueness. */
  readonly nextTaskId: () => string;
  readonly start: ChildRunStarter;
}

/**
 * Turns the seam's request into a run: the child's prompt becomes its goal, its messages are collected into the
 * answer the parent reads, and the abort signal stops the run rather than merely being observed.
 */
export function createChildRunFactory(options: ChildRunFactoryOptions) {
  return async (request: ChildRunRequest): Promise<ChildRunOutcome> => {
    const text: string[] = [];
    let failed = false;
    const run = options.start({
      goal: request.prompt,
      onEvent: (event) => {
        if (event.kind === "message/text-delta") text.push(event.text);
        if (event.kind === "run/status" && event.status === "failed") failed = true;
      },
      taskId: options.nextTaskId(),
    });
    const stop = (): void => { run.cancel(); };
    if (request.signal.aborted) stop();
    else request.signal.addEventListener("abort", stop, { once: true });
    try {
      await run.done;
    } finally {
      request.signal.removeEventListener("abort", stop);
    }
    return Object.freeze({
      ok: !failed && !request.signal.aborted,
      text: text.join(""),
    });
  };
}
