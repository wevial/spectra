export interface NebulaConfig {
  simResolution: number;
  offsetResolution: number;
  cloudResolution: number;
  pressureIterations: number;
  velocityDissipation: number;
  offsetDecay: number;
  splatForce: number;
  /** Drift speed of the cloud. */
  speed: number;
  /** Ambient wanderers stirring the gas; 0 = none. */
  currents: number;
  /** 'space': stars and glowing gas. 'paint': pigment on a flat ground. */
  look: 'space' | 'paint';
  /** The paint look's ground color, hex. */
  ground: string;
}
export const CONFIG: NebulaConfig;
export function mount(
  container: HTMLElement,
  opts?: {
    tier?: number;
    debug?: boolean;
    /** false: a background; the pointer is ignored. Default true. */
    cursor?: boolean;
    /** Ambient currents; default 0 with the cursor, 1 without. */
    currents?: number;
    speed?: number;
    look?: 'space' | 'paint';
    ground?: string;
  },
): { config: NebulaConfig; destroy(): void };
