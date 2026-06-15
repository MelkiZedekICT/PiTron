import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Tube, Instances, Instance } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

// ====================== PHYSICS ENGINE ======================
class LHCGeometry {
  constructor(straightLength = 5, arcRadius = 10) {
    this.L = straightLength;
    this.R = arcRadius;
    this.totalLength = 0;
    this.segments = [];
    this.fieldSegments = [];
    this.rfStations = [];
    this._build();
  }

  _build() {
    const L = this.L, R = this.R, arcAngle = Math.PI / 4, arcLen = R * arcAngle;
    let pos = new THREE.Vector3(0, 0, -10);
    let dir = new THREE.Vector3(1, 0, 0);
    const B = new THREE.Vector3(0, 1, 0);
    let sAcc = 0;

    for (let i = 0; i < 8; i++) {
      const start = pos.clone();
      const end = pos.clone().addScaledVector(dir, L);
      this.segments.push({ type: 'straight', start, end, length: L });

      const quadLen = 0.5;
      const F_s = sAcc + L * 0.25;
      const D_s = sAcc + L * 0.75;

      this.fieldSegments.push(
        { start: sAcc, end: F_s - quadLen/2, type: 'drift', strength: 0 },
        { start: F_s - quadLen/2, end: F_s + quadLen/2, type: 'quadF', strength: 0.8 },
        { start: F_s + quadLen/2, end: D_s - quadLen/2, type: 'drift', strength: 0 },
        { start: D_s - quadLen/2, end: D_s + quadLen/2, type: 'quadD', strength: -0.8 },
        { start: D_s + quadLen/2, end: sAcc + L, type: 'drift', strength: 0 }
      );

      const rfT = dir.clone();
      this.rfStations.push({ s: sAcc + L/2, T: [rfT.x, rfT.y, rfT.z] });
      sAcc += L;
      pos.copy(end);

      const right = new THREE.Vector3().crossVectors(B, dir).normalize();
      const center = pos.clone().addScaledVector(right, R);
      const startAngle = Math.atan2(pos.z - center.z, pos.x - center.x);
      const endAngle = startAngle - arcAngle;
      
      this.segments.push({ type: 'arc', center, R, startAngle, endAngle, length: arcLen });
      this.fieldSegments.push({ start: sAcc, end: sAcc + arcLen, type: 'dipole', strength: 2.5 });
      sAcc += arcLen;

      pos.set(center.x + R * Math.cos(endAngle), 0, center.z + R * Math.sin(endAngle));
      dir.set(Math.sin(endAngle), 0, -Math.cos(endAngle));
    }
    this.totalLength = sAcc;
  }

  getFrenetFrame(s) {
    let remaining = s % this.totalLength;
    if (remaining < 0) remaining += this.totalLength;

    for (const seg of this.segments) {
      if (remaining <= seg.length) {
        if (seg.type === 'straight') {
          const t = remaining / seg.length;
          const pos = new THREE.Vector3().lerpVectors(seg.start, seg.end, t);
          const dir = new THREE.Vector3().subVectors(seg.end, seg.start).normalize();
          const B = new THREE.Vector3(0, 1, 0);
          const N = new THREE.Vector3().crossVectors(dir, B).normalize();
          return { pos, T: dir, N, B, curvature: 0 };
        } else {
          const t = remaining / seg.length;
          const angle = seg.startAngle + (seg.endAngle - seg.startAngle) * t;
          const pos = new THREE.Vector3(
            seg.center.x + seg.R * Math.cos(angle), 0,
            seg.center.z + seg.R * Math.sin(angle)
          );
          const T = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
          const B = new THREE.Vector3(0, 1, 0);
          const N = new THREE.Vector3().crossVectors(T, B);
          return { pos, T, N, B, curvature: 1 / seg.R };
        }
      }
      remaining -= seg.length;
    }
    return this.getFrenetFrame(0);
  }

  getFieldLocal(s, x, y, beamSign, dipoleMultiplier = 1) {
    const sMod = s % this.totalLength;
    for (const fs of this.fieldSegments) {
      if (sMod >= fs.start && sMod < fs.end) {
        switch (fs.type) {
          case 'dipole': return { BN: 0, BB: fs.strength * beamSign * dipoleMultiplier };
          case 'quadF': return { BN: fs.strength * y, BB: fs.strength * x };
          case 'quadD': return { BN: fs.strength * y, BB: fs.strength * x };
          default: return { BN: 0, BB: 0 };
        }
      }
    }
    return { BN: 0, BB: 0 };
  }

  buildCurvePath() {
    const curvePath = new THREE.CurvePath();
    for (const seg of this.segments) {
      if (seg.type === 'straight') {
        curvePath.add(new THREE.LineCurve3(seg.start, seg.end));
      } else {
        class ArcCurve3 extends THREE.Curve {
          constructor(c, R, a0, a1) { super(); this.c = c; this.R = R; this.a0 = a0; this.a1 = a1; }
          getPoint(t) {
            const a = this.a0 + (this.a1 - this.a0) * t;
            return new THREE.Vector3(this.c.x + this.R * Math.cos(a), 0, this.c.z + this.R * Math.sin(a));
          }
        }
        curvePath.add(new ArcCurve3(seg.center, seg.R, seg.startAngle, seg.endAngle));
      }
    }
    return curvePath;
  }
}

class Accelerator {
  constructor(geometry) {
    this.geom = geometry;
    this.c = 1;
    this.q = 1;
    this.Vrf_nominal = 0.5;
    this.phiS = 0.1;
    this.beams = [[], []]; 
    this.dipoleMultiplier = 1;
    this.rfVoltageMultiplier = 1;

    // Inject initial active beams so the scene isn't empty
    for(let i=0; i<30; i++) this.injectBunch(0);
    for(let i=0; i<30; i++) this.injectBunch(1);
  }

  injectBunch(beamIndex) {
    const beamSign = beamIndex === 0 ? 1 : -1;
    const s0 = Math.random() * this.geom.totalLength;
    const frame = this.geom.getFrenetFrame(s0);
    
    // Auto-calculate perfect momentum for stable orbit: p = qBR
    const stableP = this.q * (2.5 * this.dipoleMultiplier) * this.geom.R;
    
    this.beams[beamIndex].push({
      unwrappedS: s0,
      x: (Math.random() - 0.5) * 0.05,
      y: (Math.random() - 0.5) * 0.05,
      p: [frame.T.x * stableP, frame.T.y * stableP, frame.T.z * stableP],
      beamSign,
      lastUnwrappedS: s0,
    });
  }

  dumpBeams() {
    this.beams[0] = [];
    this.beams[1] = [];
  }

  triggerCollision() {
    const sIP = this.geom.rfStations[0]?.s || 0;
    const collisionCount = Math.min(10, this.beams[0].length, this.beams[1].length);
    
    for (let i = 0; i < collisionCount; i++) {
      const b0 = this.beams[0][i];
      const b1 = this.beams[1][i];
      
      b0.unwrappedS = sIP; b1.unwrappedS = sIP;
      b0.x = 0; b0.y = 0; b1.x = 0; b1.y = 0;

      // Scramble momentum to create an explosion effect
      const scatter = 30 * this.dipoleMultiplier; 
      b0.p[0] += (Math.random() - 0.5) * scatter;
      b0.p[1] += (Math.random() - 0.5) * scatter;
      b0.p[2] += (Math.random() - 0.5) * scatter;

      b1.p[0] += (Math.random() - 0.5) * scatter;
      b1.p[1] += (Math.random() - 0.5) * scatter;
      b1.p[2] += (Math.random() - 0.5) * scatter;
    }
  }

  update(dt) {
    const subSteps = 4;
    const subDt = dt / subSteps;
    for (let i = 0; i < subSteps; i++) {
      this._integrate(subDt);
    }
  }

  _integrate(dt) {
    const geom = this.geom, c = this.c, q = this.q;
    const Vrf = this.Vrf_nominal * this.rfVoltageMultiplier;
    const dipoleMul = this.dipoleMultiplier;

    for (const beam of this.beams) {
      for (let i = 0; i < beam.length; i++) {
        const bunch = beam[i];
        const sMod = bunch.unwrappedS % geom.totalLength;
        const frame = geom.getFrenetFrame(sMod);
        const { T, N, B, curvature } = frame;

        const pMag = Math.sqrt(bunch.p[0]**2 + bunch.p[1]**2 + bunch.p[2]**2);
        if (pMag < 0.01) continue;
        const vDir = [bunch.p[0]/pMag, bunch.p[1]/pMag, bunch.p[2]/pMag];
        const v = [c*vDir[0], c*vDir[1], c*vDir[2]];

        const { BN, BB } = geom.getFieldLocal(sMod, bunch.x, bunch.y, bunch.beamSign, dipoleMul);
        const Bx = BN * N.x + BB * B.x;
        const By = BN * N.y + BB * B.y;
        const Bz = BN * N.z + BB * B.z;

        const fx = q * (v[1]*Bz - v[2]*By);
        const fy = q * (v[2]*Bx - v[0]*Bz);
        const fz = q * (v[0]*By - v[1]*Bx);

        bunch.p[0] += fx * dt;
        bunch.p[1] += fy * dt;
        bunch.p[2] += fz * dt;

        const vT = v[0]*T.x + v[1]*T.y + v[2]*T.z;
        const vN = v[0]*N.x + v[1]*N.y + v[2]*N.z;
        const vB = v[0]*B.x + v[1]*B.y + v[2]*B.z;

        const ds = vT / (1 - bunch.x * curvature) * dt;
        bunch.unwrappedS += ds;
        bunch.x += vN * dt;
        bunch.y += vB * dt;

        const L = geom.totalLength;
        const last = bunch.lastUnwrappedS;
        const now = bunch.unwrappedS;
        for (const rf of geom.rfStations) {
          let k = Math.floor(last / L);
          while (true) {
            const sStation = rf.s + k * L;
            if (sStation > now) break;
            if (sStation > last && sStation <= now) {
              const dE = q * Vrf * Math.sin(this.phiS);
              const dp = dE / c;
              bunch.p[0] += dp * rf.T[0];
              bunch.p[1] += dp * rf.T[1];
              bunch.p[2] += dp * rf.T[2];
            }
            k++;
          }
        }
        bunch.lastUnwrappedS = now;
      }
    }
  }

  getWorldPos(bunch) {
    let sMod = bunch.unwrappedS % this.geom.totalLength;
    if (sMod < 0) sMod += this.geom.totalLength;
    const frame = this.geom.getFrenetFrame(sMod);
    return [
      frame.pos.x + bunch.x * frame.N.x + bunch.y * frame.B.x,
      frame.pos.y + bunch.x * frame.N.y + bunch.y * frame.B.y,
      frame.pos.z + bunch.x * frame.N.z + bunch.y * frame.B.z,
    ];
  }

  getBeamTelemetry() {
    let totalEnergy = 0, count = 0, totalDev = 0;
    const allBunches = [...this.beams[0], ...this.beams[1]];
    for (const b of allBunches) {
      const pMag = Math.sqrt(b.p[0]**2 + b.p[1]**2 + b.p[2]**2);
      totalEnergy += pMag; 
      totalDev += Math.sqrt(b.x**2 + b.y**2);
      count++;
    }
    return {
      avgEnergyGeV: count ? (totalEnergy / count).toFixed(2) : '0.00',
      avgDeviation: count ? (totalDev / count).toFixed(3) : '0.000'
    };
  }
}

// ====================== 3D COMPONENTS ======================
function MagnetStructures({ geom }) {
  const dipoleMatrices = useMemo(() => {
    const matrices = [];
    for (const fs of geom.fieldSegments) {
      if (fs.type === 'dipole') {
        const midS = (fs.start + fs.end) / 2;
        const frame = geom.getFrenetFrame(midS);
        const m = new THREE.Matrix4();
        m.makeBasis(frame.N, frame.B, frame.T); 
        m.setPosition(frame.pos);
        matrices.push(m);
      }
    }
    return matrices;
  }, [geom]);

  return (
    <Instances range={dipoleMatrices.length} material={new THREE.MeshStandardMaterial({ color: '#1e3a8a', emissive: '#1d4ed8', roughness: 0.5, metalness: 0.8 })}>
      <boxGeometry args={[0.6, 0.8, 1.6]} />
      {dipoleMatrices.map((mat, i) => <Instance key={`dip-${i}`} matrix={mat} />)}
    </Instances>
  );
}

function ProtonBunches({ accelerator }) {
  const meshRef0 = useRef();
  const meshRef1 = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    if (!meshRef0.current || !meshRef1.current) return;

    // Render Clockwise Beam (Cyan)
    let count0 = 0;
    for (const bunch of accelerator.beams[0]) {
      const [x, y, z] = accelerator.getWorldPos(bunch);
      dummy.position.set(x, y, z);
      const dir = new THREE.Vector3(bunch.p[0], bunch.p[1], bunch.p[2]).normalize();
      quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      dummy.quaternion.copy(quat);
      dummy.scale.set(1, 1, 2.0); // Elongated light streak
      dummy.updateMatrix();
      meshRef0.current.setMatrixAt(count0++, dummy.matrix);
    }
    meshRef0.current.instanceMatrix.needsUpdate = true;
    meshRef0.current.count = count0;

    // Render Counter-Clockwise Beam (Orange)
    let count1 = 0;
    for (const bunch of accelerator.beams[1]) {
      const [x, y, z] = accelerator.getWorldPos(bunch);
      dummy.position.set(x, y, z);
      const dir = new THREE.Vector3(bunch.p[0], bunch.p[1], bunch.p[2]).normalize();
      quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      dummy.quaternion.copy(quat);
      dummy.scale.set(1, 1, 2.0);
      dummy.updateMatrix();
      meshRef1.current.setMatrixAt(count1++, dummy.matrix);
    }
    meshRef1.current.instanceMatrix.needsUpdate = true;
    meshRef1.current.count = count1;
  });

  return (
    <>
      <instancedMesh ref={meshRef0} args={[null, null, 1000]}>
        <coneGeometry args={[0.1, 0.8, 8, 1]} /> 
        <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={6} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={meshRef1} args={[null, null, 1000]}>
        <coneGeometry args={[0.1, 0.8, 8, 1]} /> 
        <meshStandardMaterial color="#fb923c" emissive="#ea580c" emissiveIntensity={6} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

function PiTronScene({ acceleratorRef, paramsRef }) {
  const geom = useMemo(() => new LHCGeometry(), []);
  const curve = useMemo(() => geom.buildCurvePath(), [geom]);
  const accelerator = useMemo(() => {
    const acc = new Accelerator(geom);
    acceleratorRef.current = acc;
    return acc;
  }, [geom, acceleratorRef]);

  useFrame((_, delta) => {
    if (paramsRef.current) {
      accelerator.dipoleMultiplier = paramsRef.current.dipole;
      accelerator.rfVoltageMultiplier = paramsRef.current.rf;
    }
    accelerator.update(Math.min(delta, 0.05));
  });

  return (
    <>
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} intensity={2.5} radius={0.8} />
      </EffectComposer>

      {/* Transparent Energy Containment Tube */}
      <Tube args={[curve, 300, 0.45, 12, true]}>
        <meshPhysicalMaterial 
          color="#38bdf8" 
          transparent={true} 
          opacity={0.08} 
          depthWrite={false} 
          roughness={0} 
          metalness={0.1} 
          side={THREE.DoubleSide} 
          blending={THREE.AdditiveBlending} 
        />
      </Tube>

      <MagnetStructures geom={geom} />
      <ProtonBunches accelerator={accelerator} />

      <OrbitControls enableDamping dampingFactor={0.1} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[10, 20, 10]} intensity={0.5} />
    </>
  );
}

// ====================== HUD OVERLAY ======================
const styles = {
  panel: {
    position: 'absolute',
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(12px)',
    borderRadius: '16px',
    border: '1px solid rgba(56, 189, 248, 0.2)',
    padding: '24px',
    color: 'white',
    fontFamily: 'monospace',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  sliderContainer: { margin: '16px 0' },
  label: { display: 'block', fontSize: '13px', marginBottom: '8px', opacity: 0.9, color: '#bae6fd' },
  slider: { width: '100%', cursor: 'pointer' },
  button: {
    background: 'rgba(56, 189, 248, 0.1)',
    border: '1px solid rgba(56, 189, 248, 0.4)',
    borderRadius: '8px',
    color: '#bae6fd',
    padding: '12px 16px',
    margin: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    transition: '0.2s',
    flex: '1 1 45%',
  },
  telemetry: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(10px)',
    borderRadius: '12px',
    padding: '20px',
    color: '#a5f3fc',
    border: '1px solid rgba(56,189,248,0.4)',
    fontSize: '15px',
    fontFamily: 'monospace',
    zIndex: 10,
    lineHeight: '1.6'
  }
};

export default function App() {
  const acceleratorRef = useRef(null);
  const paramsRef = useRef({ dipole: 1, rf: 1 });
  const [dipole, setDipole] = useState(1);
  const [rf, setRf] = useState(1);
  const [telemetry, setTelemetry] = useState({ avgEnergyGeV: '0.00', avgDeviation: '0.000' });

  const handleDipole = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setDipole(val);
    paramsRef.current.dipole = val;
  }, []);

  const handleRf = useCallback((e) => {
    const val = parseFloat(e.target.value);
    setRf(val);
    paramsRef.current.rf = val;
  }, []);

  const handleInject = () => {
    if (acceleratorRef.current) {
      for(let i=0; i<15; i++) acceleratorRef.current.injectBunch(0);
      for(let i=0; i<15; i++) acceleratorRef.current.injectBunch(1);
    }
  };

  const handleDump = () => {
    if (acceleratorRef.current) acceleratorRef.current.dumpBeams();
  };

  const handleCollision = () => {
    if (acceleratorRef.current) acceleratorRef.current.triggerCollision();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (acceleratorRef.current) {
        setTelemetry(acceleratorRef.current.getBeamTelemetry());
      }
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020617', overflow: 'hidden', position: 'relative' }}>
      <Canvas camera={{ position: [0, 15, 20], fov: 50 }} style={{ position: 'absolute', top: 0, left: 0 }}>
        <PiTronScene acceleratorRef={acceleratorRef} paramsRef={paramsRef} />
      </Canvas>

      <div style={{ ...styles.panel, top: 24, right: 24, width: 320 }}>
        <h2 style={{ margin: '0 0 20px', fontSize: '20px', letterSpacing: '3px', color: '#38bdf8', borderBottom: '1px solid rgba(56,189,248,0.3)', paddingBottom: '10px' }}>
          PiTRON COMMAND
        </h2>

        <div style={styles.sliderContainer}>
          <label style={styles.label}>MAGNETIC FIELD (B) [{dipole.toFixed(2)} T]</label>
          <input type="range" min="0.5" max="2.0" step="0.01" value={dipole} onChange={handleDipole} style={styles.slider} />
        </div>

        <div style={styles.sliderContainer}>
          <label style={styles.label}>RF CAVITY VOLTAGE [{rf.toFixed(2)} MV]</label>
          <input type="range" min="0" max="2.0" step="0.01" value={rf} onChange={handleRf} style={styles.slider} />
        </div>

        <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button style={styles.button} onClick={handleInject}>INJECT BUNCH</button>
          <button style={{...styles.button, borderColor: '#ef4444', color: '#fca5a5'}} onClick={handleDump}>DUMP BEAM</button>
          <button style={{ ...styles.button, flex: '1 1 100%', background: 'rgba(234, 179, 8, 0.1)', borderColor: '#eab308', color: '#fef08a' }} onClick={handleCollision}>
            FORCE COLLISION EVENT
          </button>
        </div>
      </div>

      <div style={styles.telemetry}>
        <div style={{ color: '#38bdf8' }}>⚡ BEAM ENERGY: <span style={{ color: 'white' }}>{telemetry.avgEnergyGeV} GeV</span></div>
        <div style={{ color: '#fb923c', marginTop: '8px' }}>📐 ORBIT DEVIATION: <span style={{ color: 'white' }}>{telemetry.avgDeviation} mm</span></div>
      </div>
    </div>
  );
}