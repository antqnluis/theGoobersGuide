import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, type Mesh, type ShaderMaterial } from 'three'
import { hearthRadius } from './orreryLayout'

const coronaRadius = 3.6

const coreVertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;

  void main() {
    vLocal = position;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`

// The star is the scene's light, so it is drawn at full brightness with only
// its limb deepening towards ember.
const coreFragment = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  uniform float uTime;

  void main() {
    vec3 outward = normalize(vLocal);
    float facing = max(dot(outward, normalize(cameraPosition - vWorld)), 0.0);
    float cells = sin(outward.x * 7.0 + uTime * 0.21)
      * sin(outward.y * 9.0 - uTime * 0.17)
      * sin(outward.z * 8.0 + uTime * 0.13);
    vec3 color = mix(vec3(1.0, 0.60, 0.28), vec3(1.0, 0.95, 0.83), pow(facing, 0.55));
    gl_FragColor = vec4(color + cells * 0.014, 1.0);
  }
`

const coronaVertex = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const coronaFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;

  const float core = ${(hearthRadius / coronaRadius).toFixed(4)};
  const vec3 starlight = vec3(1.0, 0.851, 0.627);

  void main() {
    float radius = length(vUv * 2.0 - 1.0);
    float breath = 0.5 + 0.5 * sin(uTime * 0.55);
    // A bright rim that hugs the disc, inside a wide veil that breathes.
    float rim = exp(-max(radius - core, 0.0) * mix(13.0, 11.0, breath));
    float veil = pow(max(1.0 - radius, 0.0), 2.4) * mix(0.26, 0.34, breath);
    float glow = (rim * 0.62 + veil) * (1.0 - smoothstep(0.72, 1.0, radius));

    // Add light only. Alpha stays 0 so the page behind the canvas still shows through.
    gl_FragColor = vec4(starlight * glow, 0.0);
  }
`

export function HearthStar({ animate }: { animate: boolean }) {
  const corona = useRef<Mesh>(null)
  const core = useRef<ShaderMaterial>(null)
  // The disc and its corona keep time together.
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const time = useRef(0)

  useFrame(({ camera }, delta) => {
    if (animate) time.current += Math.min(delta, 0.1)
    if (core.current) core.current.uniforms.uTime.value = time.current
    // The corona is a flat glow that always faces the viewer.
    corona.current?.quaternion.copy(camera.quaternion)
  })

  return (
    <>
      <mesh scale={hearthRadius}>
        <sphereGeometry args={[1, 40, 24]} />
        <shaderMaterial
          fragmentShader={coreFragment}
          ref={core}
          toneMapped={false}
          uniforms={uniforms}
          vertexShader={coreVertex}
        />
      </mesh>
      <mesh ref={corona} scale={coronaRadius * 2}>
        <planeGeometry />
        <shaderMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          fragmentShader={coronaFragment}
          premultipliedAlpha
          toneMapped={false}
          transparent
          uniforms={uniforms}
          vertexShader={coronaVertex}
        />
      </mesh>
    </>
  )
}
