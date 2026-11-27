import { useEffect, useState } from 'react'
import { formatCopper } from './craftingCost'
import { prefersReducedMotion } from './visionReveal'

const steps = 14
const duration = 900

/**
 * An amount that counts up to its value in whole-coin steps, as a ledger being totted up. With
 * `animate` off, or under reduced motion, it is just the amount. Screen readers get the final
 * amount at once, not the count.
 */
export function CountCopper({ value, animate }: { value: number; animate: boolean }) {
  const [step, setStep] = useState(0)
  const counting = animate && value > 0 && !prefersReducedMotion() && step < steps

  useEffect(() => {
    if (!animate || value <= 0 || prefersReducedMotion()) return
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current + 1 >= steps) window.clearInterval(timer)
        return Math.min(steps, current + 1)
      })
    }, duration / steps)
    return () => window.clearInterval(timer)
  }, [animate, value])

  if (!counting) return <>{formatCopper(value)}</>
  // Ease out: the total slows as it lands.
  const eased = 1 - (1 - step / steps) ** 3
  return (
    <>
      <span aria-hidden="true">{formatCopper(Math.round(value * eased))}</span>
      <span className="crafting-sr">{formatCopper(value)}</span>
    </>
  )
}
