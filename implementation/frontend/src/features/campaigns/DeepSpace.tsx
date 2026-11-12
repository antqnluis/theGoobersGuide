import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import { AdditiveBlending, Color, type ShaderMaterial } from 'three'

import { cameraFov, overviewPose, type SpaceMotion } from './campaignTravel'

const starVertexShader = /* glsl */ `
  attribute float diameter;
  attribute float intensity;
  attribute float phase;
  attribute float parallax;
  attribute vec3 tint;
  uniform float pixelRatio;
  uniform float backgroundOffset;
  uniform float flightStreak;
  uniform float uTime;
  varying float vPhase;
  varying vec3 vTint;
  varying float vIntensity;
  varying float vCoreRatio;
  varying float vTrail;

  void main() {
    vec3 point = position;
    float depth = ${overviewPose.position[2].toFixed(1)} - point.z;
    // Wrap outside the frustum with extra room for the camera's flyby.
    float span = 2.0 / projectionMatrix[0][0] + 0.48;
    float drift = sin(uTime * 0.15) * 0.0024;
    float offset = (backgroundOffset + drift) * parallax;
    point.x = (fract(point.x + 0.5 - offset) - 0.5) * span * depth;

    vec4 view = modelViewMatrix * vec4(point, 1.0);
    gl_Position = projectionMatrix * view;
    float coreSize = max(1.0, diameter * pixelRatio * depth / -view.z);
    // Only foreground stars leave a long trail; the distant sky stays legible.
    vTrail = clamp(flightStreak, -1.0, 1.0) * smoothstep(0.45, 2.8, parallax);
    gl_PointSize = coreSize + abs(vTrail) * 35.0 * pixelRatio;
    vCoreRatio = coreSize / gl_PointSize;
    vTint = tint;
    vIntensity = intensity;
    vPhase = phase;
  }
`

const starFragmentShader = /* glsl */ `
  varying vec3 vTint;
  varying float vIntensity;
  varying float vCoreRatio;
  varying float vTrail;
  varying float vPhase;
  uniform float uTime;

  void main() {
    vec2 sprite = (gl_PointCoord - 0.5) * 2.0;
    vec2 point = abs(sprite) / vCoreRatio;
    float radius = length(point);
    float light = exp(-5.5 * radius * radius) * (1.0 - smoothstep(0.6, 1.0, radius));
    float brightStar = smoothstep(0.72, 0.94, vIntensity);
    float rays = exp(-48.0 * min(point.x, point.y)) * pow(max(0.0, 1.0 - radius), 2.4);
    float shimmer = mix(1.0, 0.91 + 0.09 * sin(uTime * 0.8 + vPhase * 6.28318), brightStar);
    float trail = 0.0;
    if (abs(vTrail) > 0.01) {
      float along = sprite.x * sign(vTrail);
      float across = (sprite.y - along * 0.12) / vCoreRatio;
      trail = exp(-7.0 * across * across) * smoothstep(-0.2, 0.08, along)
        * pow(max(0.0, 1.0 - along), 1.65) * abs(vTrail) * 0.85;
    }
    gl_FragColor = vec4(vTint, (light + trail + rays * brightStar * 0.55) * vIntensity * shimmer);
  }
`

const starBands = [
  { count: 2200, depth: 97, range: 49, parallax: 0.35, diameter: 1.3, intensity: 0.34 },
  { count: 1050, depth: 65, range: 31, parallax: 1.05, diameter: 2.2, intensity: 0.54 },
  { count: 320, depth: 46, range: 17, parallax: 2.8, diameter: 2.8, intensity: 0.64, bright: true },
]

function makeStars() {
  const count = starBands.reduce((sum, band) => sum + band.count, 0)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const diameters = new Float32Array(count)
  const intensities = new Float32Array(count)
  const phases = new Float32Array(count)
  const parallaxes = new Float32Array(count)
  const palette = ['#91a7e5', '#d5e4ff', '#fff4e3', '#f0b4a9'].map((hex) =>
    new Color(hex).convertLinearToSRGB(),
  )
  let seed = 9011
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }

  let index = 0
  for (const band of starBands) {
    for (let i = 0; i < band.count; i++, index++) {
      const depth = band.depth + random() * band.range
      positions[index * 3] = random() - 0.5
      positions[index * 3 + 1] = (random() - 0.5) * depth * 1.24
      positions[index * 3 + 2] = overviewPose.position[2] - depth
      const bright = band.bright && random() > 0.955
      diameters[index] = bright ? 6 + random() * 5 : band.diameter * (0.65 + random() * 0.65)
      intensities[index] = bright ? 0.94 : band.intensity * (0.36 + random() * 0.64)
      parallaxes[index] = band.parallax
      phases[index] = random()
      const color = palette[Math.floor(random() * palette.length)]
      colors.set([color.r, color.g, color.b], index * 3)
    }
  }

  return { positions, colors, diameters, intensities, phases, parallaxes }
}

function Starfield({
  animate,
  spaceMotion,
}: {
  animate: boolean
  spaceMotion: RefObject<SpaceMotion>
}) {
  const data = useMemo(() => makeStars(), [])
  const pixelRatio = useThree((state) => state.viewport.dpr)
  const uniforms = useMemo(
    () => ({
      pixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
      backgroundOffset: { value: 0 },
      flightStreak: { value: 0 },
    }),
    [pixelRatio],
  )
  const material = useRef<ShaderMaterial>(null)
  const time = useRef(0)

  useFrame((_, delta) => {
    if (animate) time.current += Math.min(delta, 0.1)
    if (material.current) {
      material.current.uniforms.uTime.value = time.current
      material.current.uniforms.backgroundOffset.value = spaceMotion.current.offset
      material.current.uniforms.flightStreak.value = spaceMotion.current.streak
    }
  })

  return (
    <points frustumCulled={false} renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-tint" args={[data.colors, 3]} />
        <bufferAttribute attach="attributes-diameter" args={[data.diameters, 1]} />
        <bufferAttribute attach="attributes-intensity" args={[data.intensities, 1]} />
        <bufferAttribute attach="attributes-phase" args={[data.phases, 1]} />
        <bufferAttribute attach="attributes-parallax" args={[data.parallaxes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        blending={AdditiveBlending}
        depthWrite={false}
        fragmentShader={starFragmentShader}
        toneMapped={false}
        transparent
        uniforms={uniforms}
        vertexShader={starVertexShader}
      />
    </points>
  )
}

const nebulaVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const nebulaFragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 shadowColor;
  uniform vec3 lightColor;
  uniform float seed;
  uniform float strength;

  float hash(vec2 point) {
    vec3 p = fract(vec3(point.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 part = fract(point);
    vec2 blend = part * part * (3.0 - 2.0 * part);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), blend.x),
      blend.y
    );
  }

  void main() {
    vec2 point = vUv * 2.0 - 1.0;
    float edge = 1.0 - smoothstep(0.3, 1.0, length(point));
    if (edge <= 0.0) discard;

    vec2 sampleAt = point * vec2(4.4, 2.8) + seed;
    vec2 drift = vec2(noise(sampleAt * 0.65), noise(sampleAt * 0.65 + 8.4));
    vec2 cloud = sampleAt + (drift - 0.5) * 1.8;
    float folds = noise(cloud) * 0.57 + noise(cloud * 2.2) * 0.28 + noise(cloud * 4.9) * 0.15;
    float dust = noise(cloud * 1.5 + vec2(2.3, 6.4));
    float filaments = noise(cloud * 8.6 + drift * 2.0);
    float ribbon = 1.0 - smoothstep(0.0, 0.74, abs(point.y + 0.26 * sin(point.x * 3.1)));
    float body = smoothstep(0.26, 0.8, folds) * (0.46 + 0.54 * ribbon);
    float rim = smoothstep(0.48, 0.78, folds - dust * 0.13 + filaments * 0.055);
    float opacity = edge * strength * (body * 0.53 + rim * 0.35);
    gl_FragColor = vec4(mix(shadowColor, lightColor, rim), opacity);
  }
`

const nebulae = [
  {
    depth: 110,
    x: 0.32,
    y: 0.26,
    width: 0.82,
    height: 0.51,
    tilt: -0.42,
    shadow: '#303262',
    light: '#7198ce',
    strength: 0.76,
    seed: 3.7,
  },
  {
    depth: 95,
    x: -0.32,
    y: -0.28,
    width: 0.72,
    height: 0.42,
    tilt: 0.36,
    shadow: '#422550',
    light: '#9c627e',
    strength: 0.66,
    seed: 18.3,
  },
]

const galaxyFragmentShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vec2 point = (vUv * 2.0 - 1.0) * vec2(1.0, 1.16);
    float radius = length(point);
    float angle = atan(point.y, point.x + 0.0001);
    float arms = pow(0.5 + 0.5 * cos(2.0 * angle - 8.4 * radius), 5.0);
    float disk = (0.13 + arms * 0.42) * exp(-3.6 * radius) * (1.0 - smoothstep(0.58, 1.0, radius));
    float core = exp(-31.0 * radius) * 0.55;
    vec3 tint = mix(vec3(0.59, 0.68, 0.9), vec3(1.0, 0.8, 0.65), exp(-8.0 * radius));
    gl_FragColor = vec4(tint, disk + core);
  }
`

function DistantNebulae() {
  const { width, height } = useThree((state) => state.size)
  const aspect = width / Math.max(1, height)
  const clouds = useMemo(
    () =>
      nebulae.map((cloud) => ({
        ...cloud,
        uniforms: {
          shadowColor: { value: new Color(cloud.shadow).convertLinearToSRGB() },
          lightColor: { value: new Color(cloud.light).convertLinearToSRGB() },
          seed: { value: cloud.seed },
          strength: { value: cloud.strength },
        },
      })),
    [],
  )

  const depth = 150
  const span = 2 * depth * Math.tan((cameraFov * Math.PI) / 360)
  const galaxyX = -0.19 + 0.11 * Math.min(1, Math.max(0, (aspect - 0.55) / 0.65))

  return (
    <>
      <mesh
        position={[span * aspect * galaxyX, span * 0.25, overviewPose.position[2] - depth]}
        rotation={[0, 0, 0.36]}
        scale={[span * 0.14, span * 0.059, 1]}
      >
        <planeGeometry />
        <shaderMaterial
          blending={AdditiveBlending}
          depthWrite={false}
          fragmentShader={galaxyFragmentShader}
          toneMapped={false}
          transparent
          vertexShader={nebulaVertexShader}
        />
      </mesh>
      {clouds.map((cloud) => {
        const span = 2 * cloud.depth * Math.tan((cameraFov * Math.PI) / 360)
        return (
          <mesh
            key={cloud.seed}
            position={[
              span * aspect * cloud.x,
              span * cloud.y,
              overviewPose.position[2] - cloud.depth,
            ]}
            rotation={[0, 0, cloud.tilt]}
            scale={[span * Math.max(aspect, 0.52) * cloud.width, span * cloud.height, 1]}
          >
            <planeGeometry />
            <shaderMaterial
              blending={AdditiveBlending}
              depthWrite={false}
              fragmentShader={nebulaFragmentShader}
              toneMapped={false}
              transparent
              uniforms={cloud.uniforms}
              vertexShader={nebulaVertexShader}
            />
          </mesh>
        )
      })}
    </>
  )
}

export function DeepSpace({
  animate,
  spaceMotion,
}: {
  animate: boolean
  spaceMotion: RefObject<SpaceMotion>
}) {
  return (
    <>
      <DistantNebulae />
      <Starfield animate={animate} spaceMotion={spaceMotion} />
    </>
  )
}
