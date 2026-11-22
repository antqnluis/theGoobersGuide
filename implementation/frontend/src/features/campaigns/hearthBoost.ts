/** A multiplier on the hearth's light that the sky and the galaxy both drive. 1 is its resting glow. */
export type HearthBoost = { value: number }

export function setHearthBoost(boost: HearthBoost, value: number) {
  boost.value = value
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/**
 * The hearth takes to someone: a quick surge that settles back over a second or so.
 * `seconds` runs from the moment it begins.
 */
export function kindleBoost(seconds: number, strength = 1.8) {
  if (seconds <= 0) return 1
  const rise = 0.25
  const fall = 1.4
  const bump = seconds < rise ? smooth(seconds / rise) : 1 - smooth((seconds - rise) / fall)
  return 1 + strength * bump
}

/** The hush after a refusal: the light drops at once, then rekindles slowly. */
export function hushBoost(seconds: number, depth = 0.65) {
  if (seconds <= 0) return 1
  const drop = 0.2
  const rekindle = 2.2
  const lost = seconds < drop ? smooth(seconds / drop) : 1 - smooth((seconds - drop) / rekindle)
  return 1 - depth * lost
}

/** The traveller stands still through a hush and then sets off again. */
export function hushPace(seconds: number) {
  if (seconds <= 0) return 1
  return smooth((seconds - 0.7) / 1.4)
}
