<div align="center">
  <img src="https://raw.githubusercontent.com/bolliyaswanth/pitron/main/assets/pitron-banner.png" alt="PiTron Banner" width="100%" />

  <h1>⚡ PiTron</h1>
  <h3>Browser-Native Synchrotron Digital Twin · Relativistic Physics · WebGPU-Ready Architecture</h3>

  <p>
    <img src="https://img.shields.io/badge/Status-Active_Research-success?style=for-the-badge" alt="Status" />
    <img src="https://img.shields.io/badge/Three.js-r168-black?style=for-the-badge&logo=three.js" alt="Three.js" />
    <img src="https://img.shields.io/badge/React-18-020617?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Phase_I-JavaScript_Frenet_Engine-eab308?style=for-the-badge" alt="Phase I" />
    <img src="https://img.shields.io/badge/Phase_II-C%2B%2B_Wasm_Migration-2563eb?style=for-the-badge&logo=cplusplus" alt="Phase II" />
  </p>
</div>

---

## 🔭 Executive Vision

**PiTron is not a simulation. It is a provocation.**

It asks a single question: *What happens when a data scientist who thinks like an embedded systems engineer builds a particle accelerator in the browser?*

The result is a high-fidelity, real-time 3D digital twin of a synchrotron-class accelerator. Inspired by the Large Hadron Collider (LHC), PiTron runs at a locked 60 FPS natively in the browser. Dipole magnets bend. Quadrupoles focus. RF cavities accelerate. Relativistic protons spiral through a rigorous mathematical lattice, and if the magnetic containment field is dropped below critical thresholds, catastrophic beam loss occurs in real-time.

This is computational physics engineered as a production web application. It is a love letter to high-performance computing, written first as a JavaScript prototype, with a paved architectural runway to **C++ and WebAssembly**.

---

## 🧬 The Engineering Crossover

This project exists at the exact intersection of my core engineering disciplines. I build bridges between hardware realities, data acquisition, and low-level software architecture.

### 📊 Data Science & Machine Learning (The Telemetry Pipeline)
The Control Deck is not just a cosmetic UI; it is a live data acquisition (DAQ) system. Every 150 milliseconds, the telemetry pipeline aggregates:
* Average relativistic beam momentum (proxy for energy)
* Transverse orbit deviation (metric for beam stability)

This streaming pipeline is architected for future ingestion into `pandas` DataFrames and `scikit-learn` models. The ultimate goal of this telemetry is **Predictive Maintenance and Beam Loss ML Prediction**—creating a genuine high-energy physics dataset generator running locally on your machine.

### 🔌 Embedded Systems Abstraction (Hardware-in-the-Loop)
Coming from a background in ATmega32 hardware security and IoT, I designed the accelerator's magnet structures as **software abstractions of physical hardware actuators**. 
When you adjust the "Dipole Field Strength" slider, you are operating a simulated PLC/FPGA-based magnet power supply controller. The feedback loop—*User Input → Power Supply Abstraction → Physics Lattice → Telemetry Sensor → HUD*—perfectly mirrors an industrial SCADA environment.

### ⚙️ C++ & WebAssembly (The Phase II Migration)
JavaScript is the prototype. **C++ is the production engine.**
Phase I validates the Frenet-Serret coordinate system, the FODO lattice configuration, and the WebGL rendering pipeline. Phase II transitions the mathematical core to **C++ compiled to WebAssembly via Emscripten**.

The architecture is already pre-optimized for this transition:
* **Zero-Copy Memory:** The JS frontend and C++ backend will share a single contiguous `ArrayBuffer` (`std::vector<BunchState>`), eliminating serialization overhead.
* **Strict Pointer Management:** The interface contract is a single `getWorldPos()` function, designed to map exactly to a Wasm memory export.
* **Cache-Friendly Execution:** Designed for SIMD loops and explicit RK2 sub-step integrators to handle millions of relativistic particle vectors simultaneously.

---

## 📐 Core Physics Architecture

PiTron completely decouples the physics integration loop from the rendering engine. The simulation relies on rigorous mathematical models rather than basic collision boxes.

### The Frenet–Serret Coordinate System
The accelerator is an LHC-style octagon comprising 8 straight insertion sectors (for RF cavities) and 8 curved arcs (dipole bending sectors). Particle coordinates are mapped using an unwrapped 1D path:
* $s$: Longitudinal distance along the design orbit.
* $x, y$: Transverse horizontal and vertical deviations.

### 3D Relativistic Lorentz Force Equation
Every frame, each proton bunch calculates its trajectory based on the vector formulation of the Lorentz force:

$$\frac{d\vec{p}}{dt} = q(\vec{E} + \vec{v} \times \vec{B})$$

* **Dipole Magnets:** Apply a vertical magnetic field $B_y$ to enforce the design curvature ($p = qBR$).
* **Quadrupole Magnets:** Apply position-dependent transverse forces ($F_x \propto -x$, $F_y \propto +y$) creating an Alternating Gradient (FODO) focusing lattice.
* **RF Cavities:** Apply longitudinal energy kicks: $\Delta E = q V_{rf} \sin(\phi_s)$.

---

## 🎨 Visual Fidelity & WebGL

PiTron targets AAA-quality scientific visualization, heavily inspired by modern game engine rendering techniques:
* **Post-Processing Bloom:** Utilizes `@react-three/postprocessing` to ensure particle beams genuinely glow against the dark vacuum chamber.
* **Vector Alignment:** Instanced meshes elongate and orient dynamically along their 3D velocity vectors to represent relativistic beam streaks.
* **Additive Blending:** The vacuum tube utilizes a custom transparent, double-sided glass-morphism material to allow full visibility of the containment field.

---

## 🚀 Local Development Setup

No GPU required—runs efficiently on standard integrated graphics.

```bash
# Clone the repository
git clone [https://github.com/bolliyaswanth/pitron.git](https://github.com/bolliyaswanth/pitron.git)

# Navigate into the project
cd pitron

# Install dependencies
npm install

# Start the Vite development server
npm run dev

# Application will run on http://localhost:5173