import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, type ShaderMaterial } from 'three'
import type { OrreryRing } from './orreryLayout'

/** Ring indexes to brighten: the focused world's orbit and the hovered one. -1 for none. */
export type RingHighlight = { focus: number; hover: number }

const arcSegments = 160
// Sixty marks a turn like a clock face, with every fifth one longer.
const ticks = 60
const tickLength = 0.05
const longTickLength = 0.11

const ringVertex = /* glsl */ `
  attribute float ring;
  attribute float weight;
  uniform float uFocus;
  uniform float uHover;
  varying float vLit;
  varying float vWeight;

  void main() {
    vLit = max(
      1.0 - step(0.5, abs(ring - uFocus)),
      0.5 * (1.0 - step(0.5, abs(ring - uHover)))
    );
    vWeight = weight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ringFragment = /* glsl */ `
  varying float vLit;
  varying float vWeight;

  const vec3 parchment = vec3(0.83, 0.79, 0.72);
  const vec3 brass = vec3(0.96, 0.80, 0.56);

  void main() {
    float ink = mix(0.2, 0.86, vLit) * vWeight;
    // Add light only. Alpha stays 0 so the page behind the canvas still shows through.
    gl_FragColor = vec4(mix(parchment, brass, vLit) * ink, 0.0);
  }
`

function engrave(rings: readonly OrreryRing[]) {
  const perRing = (arcSegments + ticks) * 2
  const positions = new Float32Array(rings.length * perRing * 3)
  const ringIndex = new Float32Array(rings.length * perRing)
  const weights = new Float32Array(rings.length * perRing)
  let vertex = 0

  function point(ring: number, radius: number, angle: number, weight: number) {
    positions[vertex * 3] = Math.cos(angle) * radius
    positions[vertex * 3 + 2] = Math.sin(angle) * radius
    ringIndex[vertex] = ring
    weights[vertex] = weight
    vertex++
  }

  rings.forEach(({ radius }, ring) => {
    for (let i = 0; i < arcSegments; i++) {
      point(ring, radius, (i / arcSegments) * Math.PI * 2, 1)
      point(ring, radius, ((i + 1) / arcSegments) * Math.PI * 2, 1)
    }
    for (let i = 0; i < ticks; i++) {
      const angle = (i / ticks) * Math.PI * 2
      const half = (i % 5 ? tickLength : longTickLength) / 2
      point(ring, radius - half, angle, 0.8)
      point(ring, radius + half, angle, 0.8)
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('ring', new BufferAttribute(ringIndex, 1))
  geometry.setAttribute('weight', new BufferAttribute(weights, 1))
  return geometry
}

/**
 * Every orbit and its tick marks, engraved as hairlines in a single draw. They
 * are drawn before the worlds and leave no depth, so a world always covers the
 * line it rides on.
 */
export function OrbitRings({
  rings,
  highlight: highlightRef,
}: {
  rings: readonly OrreryRing[]
  highlight: RefObject<RingHighlight>
}) {
  const geometry = useMemo(() => engrave(rings), [rings])
  const uniforms = useMemo(() => ({ uFocus: { value: -1 }, uHover: { value: -1 } }), [])
  const material = useRef<ShaderMaterial>(null)

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    if (!material.current) return
    material.current.uniforms.uFocus.value = highlightRef.current.focus
    material.current.uniforms.uHover.value = highlightRef.current.hover
  })

  return (
    <lineSegments geometry={geometry} renderOrder={-1}>
      <shaderMaterial
        blending={AdditiveBlending}
        depthTest={false}
        depthWrite={false}
        fragmentShader={ringFragment}
        premultipliedAlpha
        ref={material}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={ringVertex}
      />
    </lineSegments>
  )
}
