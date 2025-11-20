
import { ElasticProperties, Vector3 } from '../types';
import { Vec3 } from '../utils/vector';

export class Stick {
  private length: number;
  private props: ElasticProperties;

  // State
  private handlePos: Vector3;     // P(grip)
  private handleDir: Vector3;     // The direction the handle is pointing
  
  private tipPos: Vector3;        // Current Tip Position
  private oldTipPos: Vector3;     // Previous Tip Position (for Verlet Integration)

  constructor(length: number, props: ElasticProperties) {
    this.length = length;
    this.props = props;
    
    this.handlePos = Vec3.create(0, 0, 0);
    this.handleDir = Vec3.create(0, 1, 0); // Pointing UP by default
    
    this.tipPos = Vec3.create(0, length, 0);
    this.oldTipPos = Vec3.create(0, length, 0);

    // Initialize tip at rest position
    this.reset();
  }

  public updateProperties(length: number, props: ElasticProperties) {
    this.length = length;
    this.props = props;
  }

  /**
   * Resets the stick to a rigid straight line state and clears momentum
   */
  public reset() {
    // Calculate effective length based on grip
    const activeLength = this.length * (1 - (this.props.gripRatio || 0));
    
    // Reset positions
    this.tipPos = Vec3.add(this.handlePos, Vec3.scale(this.handleDir, activeLength));
    
    // Reset momentum by setting oldPos = currentPos
    this.oldTipPos = { ...this.tipPos };
  }

  /**
   * Determines the state of the stick for the current frame.
   * Uses Verlet Integration + Constraint Solving to eliminate jitter.
   */
  public swing(handlePos: Vector3, handleDir: Vector3, dt: number) {
    this.handlePos = handlePos;
    this.handleDir = Vec3.normalize(handleDir);

    const gripRatio = this.props.gripRatio || 0;
    const activeLength = this.length * (1 - gripRatio);

    if (activeLength < 0.1) {
        this.tipPos = handlePos;
        this.oldTipPos = handlePos;
        return;
    }

    // Sub-stepping is still useful for high precision
    const subSteps = 8;
    const subDt = dt / subSteps;

    for (let i = 0; i < subSteps; i++) {
        this.performPhysicsStep(activeLength, subDt);
    }
  }

  private performPhysicsStep(activeLength: number, dt: number) {
    // 1. Verlet Integration
    // Velocity is implicit: (current - old)
    const velocity = Vec3.sub(this.tipPos, this.oldTipPos);
    
    // Damping: We scale the implicit velocity
    // Map UI damping (0.1 - 20) to a drag factor (0.999 - 0.9)
    const drag = Math.max(0, 1.0 - (this.props.damping * dt));
    const dampedVelocity = Vec3.scale(velocity, drag);

    // 2. Calculate Forces (Only Bending Spring here)
    // The Ideal Position is where the stick WOULD be if it were perfectly rigid
    const idealTipPos = Vec3.add(this.handlePos, Vec3.scale(this.handleDir, activeLength));
    
    // Force pulls tip towards ideal position
    // Stiffness F = k * x
    const displacement = Vec3.sub(idealTipPos, this.tipPos);
    
    // Taper Physics Effect: 
    // A highly tapered stick (value 1.0) is physically stiffer because it has more material at the base.
    // We lightly boost the effective stiffness based on the taper value.
    const taperMultiplier = 1.0 + (this.props.taper || 0) * 0.5; 
    const effectiveStiffness = this.props.stiffness * taperMultiplier;
    
    const springForce = Vec3.scale(displacement, effectiveStiffness);

    // F = ma -> a = F/m
    const mass = Math.max(0.1, this.props.mass);
    const accel = Vec3.scale(springForce, 1 / mass);

    // Verlet Step: pos = pos + vel + acc * dt * dt
    const delta = Vec3.add(dampedVelocity, Vec3.scale(accel, dt * dt));
    
    const tempPos = { ...this.tipPos };
    let nextPos = Vec3.add(this.tipPos, delta);

    // 3. Length Constraint (Soft PBD)
    const toHandle = Vec3.sub(nextPos, this.handlePos);
    const currentLen = Vec3.length(toHandle);
    
    if (currentLen > 0.0001) {
        // The "Stretch Factor" determines how rigid this length constraint is.
        const stiffnessFactor = this.props.stretchFactor * 0.05 * dt;
        const alpha = Math.min(1.0, Math.max(0.0, stiffnessFactor));

        // PBD Correction
        const targetLen = activeLength;
        const correctionLen = currentLen + (targetLen - currentLen) * alpha;
        
        // Soft Correction
        nextPos = Vec3.add(this.handlePos, Vec3.scale(Vec3.normalize(toHandle), correctionLen));
    }

    // 4. Hard Constraint: Max Bend Angle (Cone Constraint)
    // We ensure the tip vector does not deviate more than maxBendAngle from handleDir
    const vecToTip = Vec3.sub(nextPos, this.handlePos);
    let tipDist = Vec3.length(vecToTip);
    
    if (tipDist > 0.0001) {
        let tipDir = Vec3.scale(vecToTip, 1 / tipDist);
        const cosAngle = Vec3.dot(tipDir, this.handleDir);
        const maxAngleDeg = this.props.maxBendAngle === undefined ? 180 : this.props.maxBendAngle;
        // Optimization: If 180, no check needed.
        if (maxAngleDeg < 179.9) {
            const maxAngleRad = maxAngleDeg * (Math.PI / 180);
            const minCos = Math.cos(maxAngleRad);

            if (cosAngle < minCos) {
                // We are outside the cone. Project back to cone boundary.
                // We perform a Spherical Linear Interpolation (Slerp) logic manually
                // We want to rotate handleDir towards tipDir by maxAngleRad.
                
                const currentAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
                
                // Avoid div by zero near 0 angle (shouldn't happen since cosAngle < minCos)
                if (currentAngle > 0.001) {
                    // Slerp factor to land exactly on maxAngle boundary
                    const tSlerp = maxAngleRad / currentAngle;
                    
                    const sinAngle = Math.sin(currentAngle);
                    const w1 = Math.sin((1 - tSlerp) * currentAngle) / sinAngle;
                    const w2 = Math.sin(tSlerp * currentAngle) / sinAngle;
                    
                    const newDir = Vec3.add(
                        Vec3.scale(this.handleDir, w1),
                        Vec3.scale(tipDir, w2)
                    );
                    
                    tipDir = Vec3.normalize(newDir);
                    nextPos = Vec3.add(this.handlePos, Vec3.scale(tipDir, tipDist));
                }
            }
        }
    }

    // 5. Hard Constraint: Max Stretch Length
    const maxRatio = this.props.maxStretchRatio || 1.5;
    const maxAllowedLen = activeLength * maxRatio;
    
    // Recalculate distance as it might have changed by bend constraint
    const finalVec = Vec3.sub(nextPos, this.handlePos);
    const finalDist = Vec3.length(finalVec);
    
    if (finalDist > maxAllowedLen) {
        nextPos = Vec3.add(this.handlePos, Vec3.scale(Vec3.normalize(finalVec), maxAllowedLen));
    }

    // Update State
    this.oldTipPos = tempPos;
    this.tipPos = nextPos;
  }

  /**
   * Queries the normalized position on the stick curve.
   * @param t Percentage from 0.0 (Bottom of pommel) to 1.0 (Tip)
   */
  public queryPNormalize(t: number): Vector3 {
    const gripRatio = this.props.gripRatio || 0;
    const taper = this.props.taper || 0; // 0 to 1

    // Case 1: Behind the grip (The Pommel) - rigid extension backwards
    if (t < gripRatio) {
        if (gripRatio === 0) return this.handlePos;
        const distBack = (gripRatio - t) * this.length;
        return Vec3.sub(this.handlePos, Vec3.scale(this.handleDir, distBack));
    }

    // Case 2: The Active Blade
    const activeLength = this.length * (1 - gripRatio);
    if (activeLength <= 0.1) return this.handlePos;

    const segmentT = (t - gripRatio) / (1 - gripRatio);

    // Cubic Bezier Interpolation
    // P0: Start (Grip)
    // P3: End (Tip)
    const p0 = this.handlePos;
    const p3 = this.tipPos;

    // Control Point Calculation using Taper
    // Standard uniform stick: Control points act at ~1/3 and ~2/3 of length.
    // High Taper (Stiff Base): P1 pushes further out (keeps base straight), P2 pulls in slightly.
    
    // Base weight 0.33. Max Taper adds up to 0.4 extra weight (total 0.73)
    const handleWeight = 0.33 + (taper * 0.4); 
    // Tip weight reduces slightly with taper to make the tip 'floppier' relative to base
    const tipWeight = 0.33 - (taper * 0.1); 

    // Control Point 1: Extend tangent from handle
    const p1 = Vec3.add(p0, Vec3.scale(this.handleDir, activeLength * handleWeight));

    // Control Point 2: Project back from tip
    const vecToTip = Vec3.sub(p3, p0);
    const dirToHandle = Vec3.normalize(Vec3.scale(vecToTip, -1));
    // Mix Handle Dir and Chord Dir for smoother curve
    const p2Dir = Vec3.normalize(Vec3.add(dirToHandle, Vec3.scale(this.handleDir, 0.5)));
    
    const p2 = Vec3.add(p3, Vec3.scale(p2Dir, activeLength * tipWeight));

    // Bezier Math
    const u = 1 - segmentT;
    const tt = segmentT * segmentT;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * segmentT;

    const term0 = Vec3.scale(p0, uuu);
    const term1 = Vec3.scale(p1, 3 * uu * segmentT);
    const term2 = Vec3.scale(p2, 3 * u * tt);
    const term3 = Vec3.scale(p3, ttt);

    return Vec3.add(Vec3.add(term0, term1), Vec3.add(term2, term3));
  }
}
