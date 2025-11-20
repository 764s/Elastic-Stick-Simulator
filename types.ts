
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface ElasticProperties {
  stiffness: number;   // How strongly it pulls back to the straight line (Young's modulus-ish)
  damping: number;     // Air resistance/Internal friction
  mass: number;        // Mass of the tip
  stretchFactor: number; // How easily it elongates (High = stiff length, Low = stretchy)
  gripRatio: number;   // 0.0 to 1.0 - Where the handle is along the stick length
  maxStretchRatio: number; // Hard limit on elongation (e.g., 1.2 = max 20% stretch)
  maxBendAngle: number;    // Hard limit on bending angle in degrees
  taper: number;           // 0.0 (Uniform) to 1.0 (Very thick base/Stiff near grip)
}

export interface StickConfig {
  length: number;
  segments: number; // For drawing resolution
  radiusBase: number;
  radiusTip: number;
}

export type SwingMode = 'manual' | 'idle' | 'slash_h' | 'slash_v' | 'chop' | 'whirlwind' | 'stab' | 'combo';
