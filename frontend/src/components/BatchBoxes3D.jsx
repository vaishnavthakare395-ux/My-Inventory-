import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { daysUntil } from '../lib/fefo'
import { EXPIRY_WINDOWS } from '../lib/constants'

// Colours a batch box by how close it is to expiry.
function colorFor(days) {
  if (days === null) return '#84cc16'
  if (days < 0) return '#f5564f'
  if (days <= EXPIRY_WINDOWS.WARN) return '#f5a524'
  if (days <= EXPIRY_WINDOWS.WATCH) return '#bef264'
  return '#84cc16'
}

function Box({ x, color, h }) {
  return (
    <mesh position={[x, h / 2, 0]}>
      <boxGeometry args={[0.7, h, 0.7]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
    </mesh>
  )
}

// Small 3D accent on the inventory page: one box per batch, coloured by expiry,
// height scaled by quantity. Caps the count to keep the framerate smooth.
export default function BatchBoxes3D({ batches = [] }) {
  const items = batches.slice(0, 24)
  const maxQty = Math.max(1, ...items.map((b) => b.qty || 0))

  return (
    <div className="box3d">
      <Canvas camera={{ position: [0, 6, 12], fov: 45 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 7]} intensity={0.8} />
        {items.map((b, i) => (
          <Box
            key={b.id || i}
            x={(i - items.length / 2) * 0.95}
            color={colorFor(daysUntil(b.expiryDate))}
            h={0.6 + ((b.qty || 0) / maxQty) * 3}
          />
        ))}
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  )
}
