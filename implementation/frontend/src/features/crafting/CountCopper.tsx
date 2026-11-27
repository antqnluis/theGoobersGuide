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

  if (!animate || value <= 0 || prefersReducedMotion()) return <>{formatCopper(value)}</>
  // One box that is the same before, during and after the count: the final amount holds the room
  // (and is what a screen reader reads) while the count is laid over it in the same grid cell.
  // Counting up from "0 gp" would otherwise wrap onto another line as it lands, and the card
  // would change shape.
  const eased = 1 - (1 - step / steps) ** 3 // the total slows as it lands
  return (
    <span className="count-copper">
      <span className="count-copper__final" data-counting={counting || undefined}>
        {formatCopper(value)}
      </span>
      {counting && (
        <span aria-hidden="true" className="count-copper__live">
          {formatCopper(Math.round(value * eased))}
        </span>
      )}
    </span>
  )
}
