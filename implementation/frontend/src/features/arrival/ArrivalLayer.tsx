import { useEffect, useLayoutEffect, useRef } from 'react'
import { arrivalTiming } from './arrivalController'
import { useArrival } from './useArrival'
import './arrival.css'

const keysThatLeaveTheLayerAlone = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/** The wordmark is the one thing that stays on screen: it travels to its place in the galaxy header. */
function glideBrand(host: HTMLElement) {
  const brand = host.querySelector<HTMLElement>('.auth-brand')
  if (!brand || typeof brand.animate !== 'function') return () => {}

  let frame = 0
  let tries = 0
  let animation: Animation | undefined
  const start = () => {
    const target = document.querySelector('.galaxy-shell .workspace-header .auth-brand')
    if (!target) {
      // The galaxy header mounts with the route; give it a few frames.
      if (tries++ < 30) frame = requestAnimationFrame(start)
      return
    }
    const from = brand.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    if (!from.width) return
    animation = brand.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', color: getComputedStyle(brand).color },
        {
          transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`,
          color: getComputedStyle(target).color,
        },
      ],
      {
        // It arrives before the controls do and waits there; the header's own takes over.
        duration: arrivalTiming.departMs + arrivalTiming.landMs - 450,
        delay: 120,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      },
    )
  }
  start()
  return () => {
    cancelAnimationFrame(frame)
    animation?.cancel()
  }
}

function ArrivalScene() {
  const { stage, snapshot, skip } = useArrival()
  const host = useRef<HTMLDivElement>(null)
  const departing = useRef(stage === 'departing')

  useLayoutEffect(() => {
    if (host.current && snapshot) host.current.replaceChildren(snapshot.node)
  }, [snapshot])

  useEffect(() => {
    const element = host.current
    return departing.current && element ? glideBrand(element) : undefined
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!keysThatLeaveTheLayerAlone.has(event.key)) skip()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [skip])

  return (
    <div className="arrival-layer" data-stage={stage} onPointerDown={skip}>
      <div className="arrival-plate">
        {snapshot && (
          <div
            className="arrival-snapshot-host"
            ref={host}
            style={{
              width: snapshot.width,
              height: snapshot.height,
              translate: `0 ${-snapshot.scrollY}px`,
            }}
          />
        )}
      </div>
      <p className="visually-hidden" role="status">
        Entering your galaxy.
      </p>
      <button className="arrival-skip" onClick={skip} type="button">
        Skip
      </button>
    </div>
  )
}

export function ArrivalLayer() {
  const { stage } = useArrival()
  return stage === 'idle' ? null : <ArrivalScene />
}
