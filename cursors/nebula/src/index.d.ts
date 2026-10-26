export interface NebulaConfig {
  simResolution: number;
  offsetResolution: number;
  cloudResolution: number;
  pressureIterations: number;
  velocityDissipation: number;
  offsetDecay: number;
  splatForce: number;
}
export const CONFIG: NebulaConfig;
export function mount(
  container: HTMLElement,
  opts?: { tier?: number; debug?: boolean },
): { config: NebulaConfig; destroy(): void };
