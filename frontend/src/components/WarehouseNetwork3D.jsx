import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Float, Html, Sparkles, Line, Grid } from '@react-three/drei'
import * as THREE from 'three'

// A glowing warehouse node. Pulses, and turns amber when it has an alert.
function Node({ position, name, units, alert, maxUnits }) {
  const ref = useRef()
  const glow = useRef()
  const color = alert ? '#f5a524' : '#a3e635'
  const r = 0.45 + Math.min(1.1, (units || 0) / (maxUnits || 1) * 1.1)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const s = 1 + Math.sin(t * 2 + position[0]) * (alert ? 0.12 : 0.05)
    if (ref.current) ref.current.scale.setScalar(s)
    if (glow.current) glow.current.material.opacity = 0.18 + Math.sin(t * 2 + position[0]) * 0.08
  })

  return (
    <group position={position}>
      <Float speed={2} rotationIntensity={0} floatIntensity={0.5}>
        <mesh ref={ref}>
          <icosahedronGeometry args={[r, 2]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh ref={glow} scale={1.7}>
          <sphereGeometry args={[r, 24, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.2} />
        </mesh>
        <Html position={[0, -r - 0.7, 0]} center distanceFactor={10} occlude>
          <div style={labelStyle(alert)}>
            <div style={{ fontWeight: 700 }}>{name}</div>
            <div style={{ opacity: 0.7, fontSize: 11 }}>{units != null ? `${units.toLocaleString()} units` : ''}</div>
          </div>
        </Html>
      </Float>
    </group>
  )
}

// A particle that travels along a link to suggest live stock movement.
function Flow({ from, to, speed = 0.4, offset = 0 }) {
  const ref = useRef()
  const a = useMemo(() => new THREE.Vector3(...from), [from])
  const b = useMemo(() => new THREE.Vector3(...to), [to])
  useFrame((state) => {
    if (!ref.current) return
    const t = ((state.clock.elapsedTime * speed + offset) % 1)
    ref.current.position.lerpVectors(a, b, t)
    const lift = Math.sin(t * Math.PI) * 1.2
    ref.current.position.y += lift
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.09, 8, 8]} />
      <meshBasicMaterial color="#d9f99d" />
    </mesh>
  )
}

function Scene({ nodes }) {
  // Build a ring of links between consecutive nodes (the network mesh).
  const links = useMemo(() => {
    const out = []
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i].position
      const b = nodes[(i + 1) % nodes.length].position
      if (nodes.length > 1) out.push({ a, b, offset: i / Math.max(1, nodes.length) })
    }
    return out
  }, [nodes])
  const maxUnits = Math.max(1, ...nodes.map((n) => n.units || 0))

  return (
    <>
      <color attach="background" args={['#070707']} />
      <fog attach="fog" args={['#070707', 10, 26]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 9, 5]} intensity={1.3} color="#a3e635" />
      <pointLight position={[-8, 4, -6]} intensity={0.5} color="#84cc16" />

      <Grid args={[30, 30]} cellSize={1} cellColor="#1b2a10" sectionColor="#2c4416" sectionSize={5} fadeDistance={28} infiniteGrid position={[0, -1.6, 0]} />
      <Sparkles count={60} scale={14} size={2} speed={0.3} color="#bef264" opacity={0.5} />

      {links.map((l, i) => (
        <group key={i}>
          <Line points={[l.a, l.b]} color="#3a5a18" lineWidth={1} transparent opacity={0.5} />
          <Flow from={l.a} to={l.b} offset={l.offset} speed={0.35} />
        </group>
      ))}

      {nodes.map((nd) => (
        <Node key={nd.id} position={nd.position} name={nd.name} units={nd.units} alert={nd.alert} maxUnits={maxUnits} />
      ))}

      <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.55} maxPolarAngle={Math.PI / 2.05} minPolarAngle={Math.PI / 3.2} />
    </>
  )
}

export default function WarehouseNetwork3D({ locations = [], stockByLocation = {}, alerts = {} }) {
  const nodes = useMemo(() => {
    const n = Math.max(1, locations.length)
    return locations.map((l, i) => {
      const a = (i / n) * Math.PI * 2
      const radius = n === 1 ? 0 : 4.6
      return {
        id: l.id,
        name: l.name || l.id,
        units: stockByLocation[l.id] ?? 0,
        alert: !!alerts[l.id],
        position: [Math.cos(a) * radius, 0, Math.sin(a) * radius],
      }
    })
  }, [locations, stockByLocation, alerts])

  return (
    <div className="net3d">
      <Canvas camera={{ position: [0, 6.5, 12], fov: 48 }} dpr={[1, 1.5]}>
        <Scene nodes={nodes} />
      </Canvas>
    </div>
  )
}

function labelStyle(alert) {
  return {
    padding: '4px 9px',
    borderRadius: 9,
    background: 'rgba(8,8,8,0.78)',
    border: `1px solid ${alert ? 'rgba(245,165,36,0.5)' : 'rgba(132,204,22,0.4)'}`,
    color: '#e9ffd2',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    pointerEvents: 'none',
    transform: 'translateY(0)',
  }
}
