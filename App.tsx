
import React, { useState, useMemo, useRef } from 'react';
import { Stick } from './classes/Stick';
import { StickVisualizer } from './components/StickVisualizer';
import { ElasticProperties, SwingMode } from './types';

const App: React.FC = () => {
  // Core Physics State
  const [length, setLength] = useState<number>(100);
  
  // Using specific keys for the elastic properties to ensure easy binding
  const [stiffness, setStiffness] = useState<number>(8);
  const [damping, setDamping] = useState<number>(2.5);
  const [mass, setMass] = useState<number>(2);
  const [stretchFactor, setStretchFactor] = useState<number>(20);
  const [gripRatio, setGripRatio] = useState<number>(0.0);
  
  // Shape Constraints
  const [maxStretchRatio, setMaxStretchRatio] = useState<number>(1.5);
  const [maxBendAngle, setMaxBendAngle] = useState<number>(180);
  const [taper, setTaper] = useState<number>(0.0); // 0 = Uniform, 1 = Stiff Base

  // Simulation Control
  const [timeScale, setTimeScale] = useState<number>(1.0);

  const [swingMode, setSwingMode] = useState<SwingMode>('manual');
  
  // Manual control state (-1 to 1)
  const [manualPos, setManualPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const elasticProps: ElasticProperties = {
    stiffness,
    damping,
    mass,
    stretchFactor,
    gripRatio,
    maxStretchRatio,
    maxBendAngle,
    taper
  };

  // Memoize the stick instance so it persists across renders
  const stick = useMemo(() => {
    return new Stick(length, elasticProps);
  }, []); 

  const handleStopMotion = () => {
    stick.reset();
  };

  const handleSetToRigid = () => {
    // Set parameters to simulate a TRULY rigid body
    setStiffness(300);
    setDamping(15);
    setStretchFactor(400);
    setMass(0.5);
    setTaper(1.0); // Rigid bodies usually feel thick/tapered physically
    
    // Enforce rigid constraints
    setMaxStretchRatio(1.01); // Almost no stretch allowed
    setMaxBendAngle(180);     // Angle doesn't matter if stiffness is high, but keep loose
    
    stick.reset();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (swingMode !== 'manual' || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0 to 1
    const y = (e.clientY - rect.top) / rect.height; // 0 to 1

    // Convert to -1 to 1 coordinate space, invert Y for intuitive Up
    setManualPos({
      x: (x - 0.5) * 2,
      y: -(y - 0.5) * 2 
    });
  };

  const modes: { id: SwingMode; label: string; desc: string }[] = [
    { id: 'manual', label: '🖱️ Manual', desc: 'Mouse Control' },
    { id: 'idle', label: '💤 Idle', desc: 'Breathing' },
    { id: 'combo', label: '🥋 Combo', desc: 'Slash-Chop-Spin' },
    { id: 'chop', label: '🔨 Chop', desc: 'Power Strike' },
    { id: 'slash_h', label: '⚔️ Slash H', desc: 'Horizontal' },
    { id: 'whirlwind', label: '🌪️ Whirl', desc: 'Spinning' },
  ];

  // --- PRESETS ---
  const applyPreset = (p: Partial<ElasticProperties>) => {
    if (p.stiffness !== undefined) setStiffness(p.stiffness);
    if (p.damping !== undefined) setDamping(p.damping);
    if (p.mass !== undefined) setMass(p.mass);
    if (p.stretchFactor !== undefined) setStretchFactor(p.stretchFactor);
    if (p.gripRatio !== undefined) setGripRatio(p.gripRatio);
    if (p.maxStretchRatio !== undefined) setMaxStretchRatio(p.maxStretchRatio);
    if (p.maxBendAngle !== undefined) setMaxBendAngle(p.maxBendAngle);
    if (p.taper !== undefined) setTaper(p.taper);
    stick.reset();
  };

  const presets = [
    {
        name: "🎋 Wax Wood (Real Stick)",
        desc: "Stiff, snappy, high damping.",
        params: {
            /* --- PHYSICS ANALYSIS FOR REALISM ---
             * 1. High Stiffness (300) + High Damping (20):
             *    Real wood releases energy instantly. It snaps back but 
             *    doesn't oscillate like a spring. Damping absorbs the vibration.
             * 2. Low Mass (0.1):
             *    Crucial! Heavy mass creates inertia overshoot (rubber feel).
             *    Light mass ensures the tip tracks the handle tightly.
             * 3. Taper (0.3):
             *    Thicker root makes the base rigid; bending is forced to the end.
             * 4. Constraints:
             *    Wood doesn't stretch (Max Stretch ~1.0) and breaks if bent too far.
             */
            gripRatio: 0,
            taper: 0.3,
            stiffness: 300,
            damping: 20,
            mass: 0.1,
            stretchFactor: 396,
            maxStretchRatio: 1.01,
            maxBendAngle: 45
        }
    },
    {
        name: "🗡️ Carbon Fiber / Tactical",
        desc: "Extreme taper, highly rigid.",
        params: {
            /* --- PHYSICS ANALYSIS FOR REALISM ---
             * 1. Max Taper (100%):
             *    By concentrating mass and stiffness at the grip (Root), the stick 
             *    behaves like an engineered tool or sword tang. It eliminates 
             *    bending at the handle, transferring all flex to the tip.
             * 2. Tight Bend Limit (35°):
             *    This is the key to the "Solid Object" feel. Real rigid materials 
             *    (carbon fiber, steel) do not bend 90 degrees during a swing.
             *    Clamping this forces the physics to maintain a straight line 
             *    under high velocity, creating a sharp, cutting visual.
             * 3. High Axial Stiffness (396):
             *    Prevents any visible stretching, maintaining the weapon's reach.
             */
            gripRatio: 0,
            taper: 1.0,
            stiffness: 300,
            damping: 12.8,
            mass: 0.1,
            stretchFactor: 396,
            maxStretchRatio: 3.0, // 200% stretch allowed (though stiffness prevents it)
            maxBendAngle: 35
        }
    },
    {
        name: "🎣 Fishing Rod",
        desc: "High taper, whippy tip.",
        params: {
            gripRatio: 0,
            taper: 0.8,
            stiffness: 60,
            damping: 1.0, // Low damping lets it wobble
            mass: 0.5,
            stretchFactor: 300,
            maxStretchRatio: 1.05,
            maxBendAngle: 160
        }
    },
    {
        name: "🔧 Steel Bar",
        desc: "Heavy, completely rigid.",
        params: {
            gripRatio: 0,
            taper: 0.0,
            stiffness: 300,
            damping: 20,
            mass: 4.0, // Heavy feel
            stretchFactor: 400,
            maxStretchRatio: 1.0,
            maxBendAngle: 180
        }
    },
    {
        name: "🐍 Rubber Hose",
        desc: "Floppy, stretchy.",
        params: {
            gripRatio: 0,
            taper: 0.0,
            stiffness: 10,
            damping: 3.0,
            mass: 1.5,
            stretchFactor: 20, // Easy to stretch
            maxStretchRatio: 1.3, // Can stretch 30%
            maxBendAngle: 180
        }
    }
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Elastic Stick Simulator
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Physics-based procedural animation
            </p>
          </div>
          <div className="flex gap-4 text-xs font-medium">
             <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <span>Pommel (Start)</span>
             </div>
             <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span>Grip (Pivot)</span>
             </div>
             <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span>Tip (End)</span>
             </div>
          </div>
        </div>
      </header>

      <main className="flex-grow p-4 sm:p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Visualizer Panel */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div 
            ref={containerRef}
            className="relative w-full aspect-[4/3] bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 group"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => swingMode === 'manual' && setManualPos({x: 0, y: 0})}
          >
            <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-blue-600 border border-blue-100 shadow-sm">
              MODE: {modes.find(m => m.id === swingMode)?.label}
            </div>
            
            <StickVisualizer 
              stick={stick} 
              swingMode={swingMode}
              manualPos={manualPos}
              elasticProps={elasticProps}
              length={length}
              timeScale={timeScale}
            />

            {swingMode === 'manual' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-0 transition-opacity duration-500 bg-black/5">
                <span className="bg-white/90 px-4 py-2 rounded-md shadow-sm text-sm font-medium text-slate-500">
                  Move Mouse Here
                </span>
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-slate-200 text-sm text-slate-600 leading-relaxed flex justify-between items-center gap-4">
            <div className="flex-grow">
                <h3 className="font-semibold text-slate-800 mb-1">Controls</h3>
                <p className="text-xs text-slate-500">
                   Use the "View Controls" on the canvas to Rotate/Zoom.
                </p>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={handleStopMotion}
                    className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                >
                    Stop Motion
                </button>
                <button 
                    onClick={handleSetToRigid}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg shadow-sm transition-colors whitespace-nowrap"
                >
                    Reset to Default Rigid
                </button>
            </div>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 h-fit sticky top-6 flex flex-col gap-6">
          
          {/* Mode Selection */}
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Swing Pattern</h2>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setSwingMode(mode.id)}
                  className={`px-2 py-2 rounded-lg text-left transition-all duration-200 border ${
                    swingMode === mode.id
                      ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`text-sm font-semibold ${swingMode === mode.id ? 'text-blue-700' : 'text-slate-700'}`}>
                    {mode.label}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {mode.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-slate-100"></div>

          {/* Material Presets (New Section) */}
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Material Presets</h2>
            <div className="grid grid-cols-2 gap-2">
                {presets.map((p, idx) => (
                    <button
                        key={idx}
                        onClick={() => applyPreset(p.params)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 hover:bg-white hover:border-indigo-300 hover:shadow-md rounded-lg text-left transition-all group"
                    >
                        <div className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">{p.name}</div>
                        <div className="text-[10px] text-slate-400">{p.desc}</div>
                    </button>
                ))}
            </div>
          </div>

          <div className="h-px bg-slate-100"></div>
          
          {/* Sim Speed */}
          <div>
             <div className="flex justify-between mb-2">
                <label className="text-sm font-bold text-slate-800 uppercase tracking-wider">Time Scale</label>
                <span className="text-sm text-slate-500 font-mono">{timeScale.toFixed(1)}x</span>
             </div>
             <input
                type="range"
                min="0.1"
                max="2.0"
                step="0.1"
                value={timeScale}
                onChange={(e) => setTimeScale(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Slow Motion</span>
                  <span>Normal</span>
                  <span>Fast</span>
              </div>
          </div>

          <div className="h-px bg-slate-100"></div>

          {/* Physics Parameters */}
          <div className="space-y-6">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Structure & Material</h2>
            
            {/* Length */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-sm font-medium text-slate-700">Total Length</label>
                <span className="text-sm text-slate-500 font-mono">{length}px</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                step="1"
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Grip Point */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-sm font-medium text-slate-700">Grip Offset</label>
                <span className="text-sm text-slate-500 font-mono">{(gripRatio * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                value={gripRatio}
                onChange={(e) => setGripRatio(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>

            {/* Taper / Stiffness Distribution */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <label className="text-sm font-medium text-slate-700">Taper (Stiff Base)</label>
                <span className="text-sm text-slate-500 font-mono">{(taper * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.1"
                value={taper}
                onChange={(e) => setTaper(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Uniform</span>
                  <span>Stiff Grip</span>
              </div>
            </div>

            {/* Elasticity Group */}
            <div className="space-y-5 pt-2 border-t border-slate-100">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-slate-700">Stiffness (k)</label>
                  <span className="text-sm text-slate-500 font-mono">{stiffness}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="300"
                  step="1"
                  value={stiffness}
                  onChange={(e) => setStiffness(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-slate-700">Damping (Drag)</label>
                  <span className="text-sm text-slate-500 font-mono">{damping}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="20"
                  step="0.1"
                  value={damping}
                  onChange={(e) => setDamping(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-slate-700">Tip Mass</label>
                  <span className="text-sm text-slate-500 font-mono">{mass}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={mass}
                  onChange={(e) => setMass(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

               <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-slate-700">Axial Stiffness</label>
                  <span className="text-sm text-slate-500 font-mono">{stretchFactor}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="400"
                  step="5"
                  value={stretchFactor}
                  onChange={(e) => setStretchFactor(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                />
              </div>
            </div>

            {/* Limits Group */}
            <div className="space-y-5 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Constraints</h3>
                
                <div className="space-y-2">
                    <div className="flex justify-between">
                    <label className="text-sm font-medium text-slate-700">Max Stretch</label>
                    <span className="text-sm text-slate-500 font-mono">{(maxStretchRatio * 100 - 100).toFixed(0)}%</span>
                    </div>
                    <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={maxStretchRatio}
                    onChange={(e) => setMaxStretchRatio(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between">
                    <label className="text-sm font-medium text-slate-700">Max Bend Angle</label>
                    <span className="text-sm text-slate-500 font-mono">{maxBendAngle}°</span>
                    </div>
                    <input
                    type="range"
                    min="10"
                    max="180"
                    step="5"
                    value={maxBendAngle}
                    onChange={(e) => setMaxBendAngle(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-600"
                    />
                </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
