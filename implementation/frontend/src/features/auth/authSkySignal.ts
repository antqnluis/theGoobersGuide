import { hushBoost, hushPace, kindleBoost } from '../campaigns/hearthBoost'

type Moment = { kind: 'hush' | 'kindle'; at: number }

/** What the account page tells the sky about the form in front of it. */
export class AuthSkySignal {
  pending = false
  private moment: Moment | null = null

  setPending(pending: boolean) {
    this.pending = pending
  }

  /** A refusal: the hearth dims and the traveller waits. */
  hush(now = performance.now()) {
    this.moment = { kind: 'hush', at: now }
  }

  /** An account made: the hearth takes to its new keeper. */
  kindle(now = performance.now()) {
    this.moment = { kind: 'kindle', at: now }
  }

  /** The hearth's glow right now, 1 at rest. */
  glow(now: number) {
    if (!this.moment) return 1
    const seconds = (now - this.moment.at) / 1000
    return this.moment.kind === 'hush' ? hushBoost(seconds) : kindleBoost(seconds)
  }

  /** How much of its pace the traveller keeps right now. */
  pace(now: number) {
    if (this.moment?.kind !== 'hush') return 1
    return hushPace((now - this.moment.at) / 1000)
  }
}
