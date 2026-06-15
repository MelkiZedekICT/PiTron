<div align="center">


  <h1>⚡ PiTron  ⚡</h1>
  <h3> Synchrotron Digital Twin · Relative Physics · WebGL & Wasm Architecture</h3>

  <p>
    <img src="https://img.shields.io/badge/Status-Active_Research-success?style=for-the-badge" alt="Status" />
  
  </p>
</div>

---

## 🔬 Project Overview

PiTron is a browser-native 3D digital twin of a synchrotron particle accelerator. The goal of this research project is to determine if complex, high-energy physics integration loops—typically reserved for desktop frameworks like Geant4—can be accurately modeled and rendered at 60 FPS purely in the browser. 

Inspired by the lattice structure of the LHC, PiTron models the interaction between relativistic protons and magnetic containment fields. Dipoles bend, quadrupoles focus, and RF cavities accelerate. If the user drops the magnetic containment threshold via the UI, the system accurately calculates the resulting orbit decay and visualizes the beam loss in real-time.

## ⚙️ System Architecture & Domains

This project serves as a bridge between my work in embedded hardware, data science, and low-level software architecture.

### 📊 Telemetry Pipeline & DAQ
The frontend React interface acts as a live Data Acquisition (DAQ) system. The physics engine broadcasts state telemetry every 150 milliseconds, aggregating:
* **Average relativistic momentum** (proxy for beam energy).
* **Transverse orbit deviations** (metric for beam stability).

This streaming pipeline is architected to be headless. The ultimate goal is to pipe this live JSON stream directly into `pandas` and `scikit-learn` to build anomaly detection models that predict beam loss before the containment failure renders on screen.

### 🔌 Embedded Control Abstractions
Coming from a background in ATmega32 firmware and IoT, I structured the simulation's magnet controls as software abstractions of physical PLC/FPGA actuators. Adjusting the UI sliders directly mutates the state variables in the physics loop. The resulting feedback loop (User Input $\rightarrow$ Power Supply Abstraction $\rightarrow$ Physics Lattice $\rightarrow$ DAQ Telemetry) closely mirrors a real-world industrial SCADA environment.

### 🚀 Phase II: The C++ / WebAssembly Migration
JavaScript handles the Phase I integration loop, but JS garbage collection creates unavoidable bottlenecks at high particle counts. The architecture is currently being migrated to C++ compiled to WebAssembly (Wasm) via Emscripten.

This migration unlocks:
* **Zero-Copy Memory:** The JS frontend will read directly from a shared `ArrayBuffer` (`std::vector<BunchState>`) populated by the C++ backend, eliminating serialization overhead.
* **SIMD Acceleration:** Utilizing C++ vectors to parallelize the Lorentz force calculations for millions of particles.
* **Deterministic Memory Management:** Bypassing JS garbage collection for stable frame rates.

---

## 📐 Mathematical Implementation

The engine strictly decouples physics calculations from the WebGL rendering loop. 

### The Frenet–Serret Framework
The accelerator is modeled as an octagonal lattice comprising straight insertion sectors and curved bending arcs. Trajectories are unwrapped into a 1D coordinate path:
* $s$: Longitudinal position along the design orbit.
* $x, y$: Transverse deviations from the ideal path.

### Lorentz Force Integration
Particle states are updated via a discretized integration of the 3D Lorentz force equation:

$$\frac{d\vec{p}}{dt} = q(\vec{E} + \vec{v} \times \vec{B})$$

* **Dipoles:** Apply vertical magnetic fields to maintain curvature ($p = qBR$).
* **Quadrupoles:** Apply position-dependent focusing gradients ($F_x \propto -x$, $F_y \propto +y$), generating a FODO lattice structure.
* **RF Cavities:** Apply longitudinal momentum kicks via sinusoidal voltage phases.

---

## 🎨 Render Pipeline

PiTron leverages `Three.js` and `@react-three/fiber` to offload rendering to WebGL/WebGPU:
* **Post-Processing:** Uses `@react-three/postprocessing` Bloom passes to visualize relativistic energy thresholds.
* **Vector Alignment:** Instanced meshes dynamically calculate quaternions to orient themselves along their current 3D velocity vector.
* **Material Shaders:** The vacuum chamber utilizes additive blending and depth-write overrides to render the magnetic containment field without obscuring the particle instances.

---

## 💻 Local Execution

The engine is highly optimized and runs entirely on client-side compute. No dedicated GPU is required.

```bash
# 1. Clone the repository
git clone [https://github.com/bolliyaswanth/pitron.git](https://github.com/bolliyaswanth/pitron.git)

# 2. Navigate to the directory
cd pitron

# 3. Install Node dependencies
npm install

# 4. Spin up the Vite development server
npm run dev

# 5. Access the control deck at http://localhost:5173
