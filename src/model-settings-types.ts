/**
 * Model-provider vocabulary shared by the extension host and the webview.
 *
 * Kept free of node imports so the webview project can type the same shapes
 * without pulling the host's filesystem module into its program.
 */

export type ProviderApi = "ollama" | "openai-completions";

export interface ProviderModel {
  readonly id: string;
  readonly name?: string;
}

export interface ProviderEntry {
  readonly api: ProviderApi;
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly displayName: string;
  readonly id: string;
  readonly models: readonly ProviderModel[];
}

export interface ModelSettings {
  readonly active: string;
  readonly providers: readonly ProviderEntry[];
}

/** What the webview is allowed to know: never a key, only whether one exists. */
export interface ProviderSummary {
  readonly active: boolean;
  readonly api: ProviderApi;
  readonly baseUrl: string;
  readonly displayName: string;
  readonly id: string;
  readonly keyConfigured: boolean;
  readonly models: readonly ProviderModel[];
}

export interface ModelSettingsSummary {
  readonly activeProviderId: string;
  readonly model: string;
  readonly providers: readonly ProviderSummary[];
}
