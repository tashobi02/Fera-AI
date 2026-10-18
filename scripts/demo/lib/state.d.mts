export interface DemoState {
  schemaVersion: string; pid: number; port: number; appPort: number;
  container: string; volume: string; owner: string; database: string;
  startedAt: string; cache: Record<string, unknown>; appUrl: string | null;
}
export interface StateOptions { statePath?: string; worktreeRoot?: string; }
export function createState(input: { pid: number; port: number; container: string; volume: string; database: string; cache: Record<string, unknown>; appUrl?: string }): DemoState;
export function saveState(state: DemoState, options?: StateOptions): string;
export function loadState(options?: StateOptions): DemoState | null;
export function removeState(options?: StateOptions): string;
export function writeProvenance(state: DemoState, options?: { dir?: string; worktreeRoot?: string }): string;
