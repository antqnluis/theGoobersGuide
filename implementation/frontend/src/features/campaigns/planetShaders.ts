// Work in object space for seamless textures and in world space for the star's light.
export const planetVertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vRadial;

  void main() {
    vLocal = position;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vRadial = mat3(modelMatrix) * position / length(modelMatrix[0].xyz);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`

// Every world is lit from one point, the star, so each has its own day side.
const sun = /* glsl */ `
  uniform vec3 uSunPosition;
  const vec3 sunTint = vec3(1.0, 0.91, 0.80);
  const vec3 duskTint = vec3(1.0, 0.52, 0.26);
  const vec3 nightTint = vec3(0.075, 0.092, 0.14);
`

// The atmosphere shell is drawn at this multiple of the planet's radius.
export const atmosphereScale = 1.18

export const planetSurface = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vRadial;
  uniform int uType;
  uniform vec3 uLow;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform vec3 uPale;
  uniform vec3 uAir;
  uniform float uHaze;
  uniform vec3 uSeed;
  uniform vec4 uImpacts[16];
  uniform float uClaimed;

  ${sun}

  vec4 hash(vec4 n) {
    n = fract(n * 0.1031);
    n *= n + 33.33;
    n *= n + n;
    return fract(n);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float index = dot(i, vec3(1.0, 57.0, 113.0));
    vec4 h = hash(index + vec4(0.0, 57.0, 113.0, 170.0));
    vec4 j = hash(index + vec4(1.0, 58.0, 114.0, 171.0));
    vec4 m = mix(h, j, f.x);
    return mix(mix(m.x, m.y, f.y), mix(m.z, m.w, f.y), f.z);
  }

  float field(vec3 p, float footprint) {
    // Fade each octave as its cells approach pixel size on smaller planets.
    float broad = noise(p);
    float medium = mix(noise(p * 2.03 + 7.1), 0.5, smoothstep(0.25, 0.85, footprint * 2.03));
    float fine = mix(noise(p * 4.11 + 3.4), 0.5, smoothstep(0.25, 0.85, footprint * 4.11));
    return broad * 0.56 + medium * 0.29 + fine * 0.15;
  }

  float groove(float value, float width) {
    return 1.0 - smoothstep(width * 0.35, width, abs(value));
  }

  void main() {
    vec3 sphere = normalize(vLocal);
    vec3 radial = normalize(vRadial);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float facing = max(dot(radial, viewDir), 0.0);
    float footprint = max(length(dFdx(sphere)), length(dFdy(sphere)));
    vec3 p = sphere + uSeed;
    float sweep = noise(sphere * 3.4 + uSeed);
    vec3 warped = sphere + vec3(sweep - 0.5, noise(p * 2.7) - 0.5, 0.0) * 0.35;
    float terrain = field(warped * 5.0 + uSeed, footprint * 5.0);
    float detail = mix(noise(sphere * 28.0 + uSeed), 0.5, smoothstep(0.3, 1.15, footprint * 28.0));
    vec3 base;
    vec3 emission = vec3(0.0);
    float relief = 0.0;
    float gloss = 0.0;
    float roughness = 0.8;

    if (uType == 0) {
      float elevation = field(warped * 2.7 + uSeed, footprint * 2.7) + (terrain - 0.5) * 0.27;
      float land = smoothstep(0.465, 0.495, elevation);
      float shallows = smoothstep(0.35, 0.488, elevation);
      vec3 sea = mix(uLow, uMid, shallows * shallows * 0.9);
      vec3 soil = mix(uHigh, uPale, smoothstep(0.51, 0.77, elevation + (detail - 0.5) * 0.14));
      soil *= 0.68 + terrain * 0.62;
      soil = mix(soil, vec3(0.72, 0.79, 0.80), smoothstep(0.77, 0.97, abs(sphere.y) + (terrain - 0.5) * 0.46));
      float cloudField = field(warped * vec3(4.8, 9.0, 4.8) - uSeed.yzx, footprint * 9.0);
      float cloud = smoothstep(0.48, 0.69, cloudField + (sweep - 0.5) * 0.12);
      base = mix(sea, soil, land) * (1.0 - cloud * 0.16);
      base = mix(base, vec3(0.82, 0.90, 0.94), cloud * 0.94);
      relief = (terrain - 0.5) * land * 0.032;
      gloss = (1.0 - land) * (1.0 - cloud) * 0.16;
      roughness = mix(0.29, 0.81, max(land, cloud));
    } else if (uType == 1) {
      float rock = smoothstep(0.50, 0.69, terrain);
      float dunes = 0.5 + 0.5 * sin(31.0 * (sphere.y + sphere.x * 0.45) + sweep * 14.0 + terrain * 9.0);
      dunes = mix(dunes, 0.5, smoothstep(0.45, 1.55, footprint * 31.0));
      float sand = clamp(0.28 + terrain * 0.55 + dunes * 0.23, 0.0, 1.0);
      base = mix(mix(uMid, uPale, sand), mix(uLow, uHigh, detail * 0.84), rock * 0.88);
      relief = terrain * 0.064 + dunes * (1.0 - rock) * 0.008;
    } else if (uType == 2) {
      float fracture = field(warped * 7.5 + uSeed.zxy, footprint * 7.5) - 0.50;
      float fissureWidth = 0.027;
      float aa = clamp(fwidth(fracture) * 0.75, 0.005, 0.065);
      float fissure = 1.0 - smoothstep(max(0.0, fissureWidth - aa), fissureWidth + aa, abs(fracture));
      fissure *= min(1.0, fissureWidth / aa);
      float heat = fissure * smoothstep(0.46, 0.71, sweep + terrain * 0.22);
      base = mix(uLow, uMid, terrain) + uHigh * detail * detail * 0.26;
      base *= 1.0 - fissure * 0.49;
      emission = mix(vec3(0.72, 0.035, 0.008), uPale, heat * heat) * heat * 0.71;
      relief = terrain * 0.068 - fissure * 0.009;
    } else if (uType == 3) {
      // A compact vortex drags cloud bands around its eye.
      float stormLongitude = (uSeed.x / 58.0 - 0.5) * 1.3;
      vec2 stormDelta = (sphere.xy - vec2(stormLongitude, -0.22)) * vec2(3.3, 6.6);
      float storm = length(stormDelta);
      float vortex = exp(-storm * storm * 1.55) * smoothstep(-0.1, 0.35, sphere.z);
      float latitude = sphere.y + (sweep - 0.5) * 0.11 + (terrain - 0.5) * 0.10;
      latitude += vortex * (0.22 + stormDelta.x * 0.09);
      float layers = sin(latitude * 18.0) * 0.27 + sin(latitude * 41.0 + 0.7) * 0.12;
      float wisps = sin(latitude * 77.0 + terrain * 8.0) * 0.07;
      wisps *= 1.0 - smoothstep(0.4, 1.8, footprint * 77.0);
      float jets = clamp(0.51 + layers + wisps + (terrain - 0.5) * 0.30, 0.0, 1.0);
      base = mix(mix(uLow, uMid, min(jets * 2.0, 1.0)), mix(uHigh, uPale, jets), smoothstep(0.37, 0.83, jets));
      float eyeWall = groove(storm - 0.55, 0.34) * smoothstep(-0.1, 0.35, sphere.z);
      base = mix(base, mix(uMid, uPale, detail), eyeWall * 0.62);
    } else if (uType == 4) {
      float shelf = smoothstep(0.37, 0.61, terrain + abs(sphere.y) * 0.11);
      float shear = field(warped * vec3(7.0, 13.0, 7.0) + uSeed.zxy, footprint * 13.0);
      float fault = groove(shear - 0.52, 0.034) * smoothstep(0.42, 0.7, sweep);
      base = mix(mix(uLow, uMid, terrain), mix(uHigh, uPale, detail), shelf);
      base = mix(base, uLow, fault * 0.67);
      relief = terrain * 0.052 - fault * 0.011;
      gloss = 0.16;
      roughness = 0.53;
    } else {
      float bowls = 0.0;
      float rims = 0.0;
      for (int i = 0; i < 16; i++) {
        vec4 impact = uImpacts[i];
        // Squared chord distance on the unit sphere, normalized by crater size.
        float crater = 2.0 * (1.0 - dot(sphere, impact.xyz)) / impact.w;
        float edge = clamp(footprint * inversesqrt(impact.w), 0.02, 0.48);
        float rim = groove(crater - 0.78 + (detail - 0.5) * 0.18, 0.23 + edge);
        bowls = max(bowls, 1.0 - smoothstep(0.07, 0.79 + edge, crater));
        rims = max(rims, rim);
      }
      base = mix(uLow, uHigh, terrain) * (0.78 + detail * 0.44);
      base = mix(base * (1.0 - bowls * 0.49), uPale, rims * 0.26);
      relief = terrain * 0.055 + rims * 0.011 - bowls * 0.037;
    }

    // Reconstruct a shallow relief normal without additional texture lookups.
    vec3 dx = dFdx(vRadial);
    vec3 dy = dFdy(vRadial);
    vec3 tangentX = cross(dy, radial);
    vec3 tangentY = cross(radial, dx);
    float area = dot(dx, tangentX);
    vec3 gradient = (dFdx(relief) * tangentX + dFdy(relief) * tangentY) / max(area, 0.000001);
    vec3 normal = normalize(radial - gradient * smoothstep(0.12, 0.46, facing));
    vec3 sunlight = normalize(uSunPosition - vWorld);
    float solarAngle = dot(radial, sunlight);
    // Air carries light past the terminator; a bare world cuts from day to night.
    float twilight = 0.04 + uHaze * 0.5;
    float day = smoothstep(-twilight, twilight + 0.28, solarAngle);
    float diffuse = day * (0.26 + 0.98 * max(dot(normal, sunlight), 0.0));
    vec3 halfVector = normalize(sunlight + viewDir);
    float specular = pow(max(dot(normal, halfVector), 0.0), mix(76.0, 12.0, roughness)) * gloss * day;
    // Low sun reddens through a thick atmosphere.
    float dusk = clamp(uHaze * 2.2, 0.0, 1.0) * (1.0 - smoothstep(-0.05, 0.42, solarAngle));
    vec3 sunColor = mix(sunTint, duskTint, dusk);
    float rim = pow(1.0 - facing, 3.4) * smoothstep(-0.30, 0.55, solarAngle);
    vec3 lit = base * (nightTint + diffuse * sunColor);
    lit += specular * sunColor + uAir * uHaze * rim * mix(sunTint, duskTint, dusk * 0.6) + emission;

    // A claimed world shows a few warm settlements on its night side. Gas giants have none.
    float night = 1.0 - smoothstep(-0.22, 0.02, solarAngle);
    float settled = smoothstep(0.64, 0.8, noise(sphere * 7.0 + uSeed))
      * step(0.8, noise(sphere * 38.0 + uSeed.zxy));
    lit += vec3(1.0, 0.72, 0.38) * settled * night * facing * uClaimed * (uType == 3 ? 0.0 : 0.6);

    gl_FragColor = vec4(lit, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// A thin glow of scattered light that hugs the limb on the star's side.
export const planetAtmosphere = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vRadial;
  uniform vec3 uAir;
  uniform float uHaze;

  ${sun}

  const float shell = ${atmosphereScale.toFixed(2)};

  void main() {
    vec3 outward = normalize(vRadial);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float along = dot(outward, viewDir);
    // How far this line of sight passes from the planet's center, in planet radii.
    float pass = shell * sqrt(max(1.0 - along * along, 0.0));
    vec3 sunlight = normalize(uSunPosition - vWorld);
    // Light reaching the point of the limb that this line of sight grazes.
    float solarAngle = dot(outward - viewDir * along, sunlight) * shell / max(pass, 0.001);
    float lit = smoothstep(-0.38, 0.42, solarAngle);
    // The glow brightens when the star is behind the world.
    float backlight = pow(max(dot(-viewDir, sunlight), 0.0), 3.0);
    float glow = smoothstep(0.93, 1.0, pass) * exp((1.0 - max(pass, 1.0)) / 0.05);
    glow *= 1.0 - smoothstep(shell - 0.06, shell, pass);
    float dusk = 1.0 - smoothstep(-0.10, 0.45, solarAngle);
    vec3 color = uAir * mix(sunTint, duskTint, dusk * 0.5) * uHaze * glow * lit;

    // Add light only. Alpha stays 0 so the page behind the canvas still shows through.
    gl_FragColor = vec4(color * (0.8 + 1.8 * backlight), 0.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const planetRing = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vRadial;
  uniform vec3 uDust;
  uniform vec3 uIce;
  uniform float uPhase;

  ${sun}

  void main() {
    float radius = length(vLocal.xy);
    float edge = max(fwidth(radius), 0.004);
    float t = (radius - 1.25) / 0.42;
    float envelope = smoothstep(0.0, 0.09 + edge, t) * (1.0 - smoothstep(0.89 - edge, 1.0, t));
    float gap = smoothstep(0.023, 0.052 + edge, abs(t - 0.59));
    float belts = 0.62 + 0.22 * sin(t * 27.0 + uPhase);
    belts += 0.12 * sin(t * 99.0 + uPhase) * (1.0 - smoothstep(0.008, 0.027, edge));
    vec3 sunlight = normalize(uSunPosition - vWorld);
    float alongRay = dot(vRadial, sunlight);
    float miss = length(vRadial - sunlight * alongRay);
    float shadow = alongRay < 0.0 ? smoothstep(0.91, 1.10, miss) : 1.0;
    vec3 dust = mix(uDust, uIce, clamp(belts, 0.0, 1.0));
    gl_FragColor = vec4(dust * (0.11 + 0.77 * shadow) * sunTint, envelope * gap * belts);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// Moons share one instanced mesh, so their vertex stage applies each instance's own transform.
export const moonVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vOutward;

  void main() {
    mat4 placed = modelMatrix * instanceMatrix;
    vWorld = (placed * vec4(position, 1.0)).xyz;
    vOutward = mat3(placed) * position;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`

// Bare rock lit by the star: a hard terminator and no air.
export const moonSurface = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vOutward;
  uniform vec3 uRock;

  ${sun}

  void main() {
    vec3 outward = normalize(vOutward);
    vec3 sunlight = normalize(uSunPosition - vWorld);
    float day = smoothstep(-0.04, 0.3, dot(outward, sunlight));
    vec3 lit = uRock * (nightTint + day * (0.3 + 0.9 * max(dot(outward, sunlight), 0.0)) * sunTint);

    gl_FragColor = vec4(lit, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
