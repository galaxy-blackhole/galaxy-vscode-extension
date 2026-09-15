export type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

export function vscodeApi(): VsCodeApi {
  if (!api) {
    try {
      api = typeof acquireVsCodeApi === "function"
        ? acquireVsCodeApi()
        : { postMessage: () => undefined, getState: () => undefined, setState: () => undefined };
    } catch {
      api = { postMessage: () => undefined, getState: () => undefined, setState: () => undefined };
    }
  }
  return api;
}

export function postToHost(message: unknown): void {
  vscodeApi().postMessage(message);
}
