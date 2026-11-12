import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Vector3, type Group, type PerspectiveCamera } from 'three'
import { orbitLabelClearance, type OrbitBounds, type OrbitSlot } from './campaignOrbit'
import {
  fitOrbitCenter,
  fitWorldRadius,
  focusPose,
  handoffSlots,
  mix,
  overviewDepth,
  overviewPose,
  planetPlane,
  projectedSphereExtent,
  travelDirection,
  travelProgress,
  type CameraPose,
} from './campaignTravel'
import type { planetAppearance } from './planetModel'

const labelGap = 6
const backgroundStep = 0.035

type Box = { left: number; top: number; right: number; bottom: number }
type Label = { element: HTMLElement; width: number; height: number }

function overlaps(a: Box, b: Box) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function sameSlots(a: OrbitSlot[], b: OrbitSlot[]) {
  return (
    a.length === b.length &&
    a.every((slot, i) => {
      const other = b[i]
      return (
        slot.id === other.id &&
        slot.x === other.x &&
        slot.y === other.y &&
        slot.radius === other.radius &&
        slot.offset === other.offset
      )
    })
  )
}

function interpolatePoint(
  from: CameraPose['position'],
  to: CameraPose['position'],
  t: number,
): CameraPose['position'] {
  return [mix(from[0], to[0], t), mix(from[1], to[1], t), mix(from[2], to[2], t)]
}

type Travel = {
  elapsed: number
  duration: number
  direction: number
  from: CameraPose
  to: CameraPose
  backgroundFrom: number
  backgroundTo: number
  tracks: ReturnType<typeof handoffSlots>
}

export function useGalaxyTravel({
  slots,
  bounds,
  order,
  selectedId,
  stepDirection,
  backgroundOffset: backgroundOffsetRef,
  interactive,
  visible,
  motionReduced,
  appearances,
  labels,
  onSettled,
}: {
  slots: OrbitSlot[]
  bounds: OrbitBounds | null
  order: string[]
  selectedId: string | null
  stepDirection?: -1 | 1
  backgroundOffset: RefObject<number>
  interactive: boolean
  visible: boolean
  motionReduced: boolean
  appearances: ReadonlyMap<string, ReturnType<typeof planetAppearance>>
  labels: RefObject<HTMLDivElement | null>
  onSettled: () => void
}) {
  const invalidate = useThree((state) => state.invalidate)
  const groups = useRef(new Map<string, Group>())
  function registerPlanet(id: string, group: Group | null) {
    if (group) groups.current.set(id, group)
    else groups.current.delete(id)
  }
  const layoutDirty = useRef(true)
  const settleImmediately = useRef(true)
  const createWasOpen = useRef(false)
  const labelCache = useRef(new Map<string, Label>())
  const vectors = useMemo(() => ({ point: new Vector3(), local: new Vector3() }), [])
  const live = useRef({
    pose: overviewPose,
    slots: new Map<string, OrbitSlot>(),
    targetSlots: [] as OrbitSlot[],
    selectedId: null as string | null,
    width: 0,
    height: 0,
    bounds: null as OrbitBounds | null,
    travel: null as Travel | null,
  })

  useLayoutEffect(() => {
    if (!interactive) createWasOpen.current = true
    if (!visible || motionReduced) settleImmediately.current = true
    layoutDirty.current = true
    invalidate()
  }, [interactive, visible, motionReduced, slots, bounds, selectedId, appearances, invalidate])

  useLayoutEffect(() => {
    const container = labels.current
    if (!container) return
    const cache = labelCache.current
    const resize = new ResizeObserver((entries) => {
      for (const { target, borderBoxSize } of entries) {
        const element = target as HTMLElement
        const id = element.dataset.campaignId!
        const label = cache.get(id)
        if (!label || label.element !== element) continue
        label.width = borderBoxSize[0]?.inlineSize ?? element.offsetWidth
        label.height = borderBoxSize[0]?.blockSize ?? element.offsetHeight
      }
      layoutDirty.current = true
      invalidate()
    })

    function syncLabels() {
      if (!container) return
      const children = new Set(Array.from(container.children))
      for (const [id, { element }] of cache) {
        if (children.has(element)) continue
        resize.unobserve(element)
        cache.delete(id)
      }
      for (const child of children) {
        const element = child as HTMLElement
        const id = element.dataset.campaignId!
        if (cache.has(id)) continue
        cache.set(id, { element, width: element.offsetWidth, height: element.offsetHeight })
        resize.observe(element)
      }
      layoutDirty.current = true
      invalidate()
    }

    const mutations = new MutationObserver(syncLabels)
    mutations.observe(container, { childList: true })
    syncLabels()
    return () => {
      resize.disconnect()
      mutations.disconnect()
      cache.clear()
    }
  }, [labels, invalidate])

  useFrame(({ camera: activeCamera, gl, size }, delta) => {
    const camera = activeCamera as PerspectiveCamera
    const frame = live.current
    if (!interactive || !visible) {
      frame.travel = null
      if (gl.domElement.dataset.galaxyTravel !== 'idle') gl.domElement.dataset.galaxyTravel = 'idle'
      return
    }

    const focal = slots[0]
    const selectionChanged = frame.selectedId !== selectedId
    const layoutChanged =
      frame.width !== size.width ||
      frame.height !== size.height ||
      frame.bounds !== bounds ||
      !sameSlots(frame.targetSlots, slots)
    const reset = settleImmediately.current || (createWasOpen.current && !selectionChanged)
    createWasOpen.current = false
    if (!frame.travel && !layoutChanged && !selectionChanged && !reset && !layoutDirty.current)
      return

    if (reset || selectionChanged || layoutChanged) {
      const destination = focusPose(selectedId, focal, size.width, size.height)
      const oldFocal = frame.targetSlots[0]?.id ?? null
      if (!reset && bounds && focal && frame.slots.size && (selectionChanged || frame.travel)) {
        const activeTravel = frame.travel
        const direction = selectionChanged
          ? (stepDirection ??
            (frame.slots.get(focal.id)?.offset || travelDirection(order, oldFocal, focal.id)))
          : activeTravel!.direction
        // Keep the intended destination on resize and advance it on each new selection.
        const previousBackgroundTarget = activeTravel?.backgroundTo ?? backgroundOffsetRef.current
        const backgroundTo = selectedId
          ? previousBackgroundTarget +
            (selectionChanged && oldFocal !== focal.id ? direction * backgroundStep : 0)
          : backgroundOffsetRef.current
        frame.travel = {
          elapsed: 0,
          duration: selectionChanged
            ? selectedId
              ? 0.6
              : 0.4
            : Math.max(0.12, activeTravel!.duration - activeTravel!.elapsed),
          direction,
          from: frame.pose,
          to: destination,
          backgroundFrom: backgroundOffsetRef.current,
          backgroundTo,
          tracks: handoffSlots(frame.slots, slots, [...appearances.keys()], bounds, direction),
        }
      } else {
        frame.travel = null
        frame.pose = destination
      }
      frame.targetSlots = slots
      frame.selectedId = selectedId
      frame.bounds = bounds
      frame.width = size.width
      frame.height = size.height
      settleImmediately.current = false
    }

    const wasTraveling = Boolean(frame.travel)
    const travel = frame.travel
    let progress = 1
    let arc = 0
    if (travel) {
      travel.elapsed += Math.min(delta, 0.1)
      progress = travelProgress(travel.elapsed, travel.duration)
      arc = Math.sin(progress * Math.PI) ** 2
      frame.pose = {
        position: interpolatePoint(travel.from.position, travel.to.position, progress),
        lookAt: interpolatePoint(travel.from.lookAt, travel.to.lookAt, progress),
      }
      if (progress >= 1) {
        backgroundOffsetRef.current = travel.backgroundTo
        frame.travel = null
      } else {
        backgroundOffsetRef.current = mix(travel.backgroundFrom, travel.backgroundTo, progress)
      }
    }

    const { position, lookAt } = frame.pose
    camera.position.set(...position)
    camera.lookAt(...lookAt)
    camera.updateMatrixWorld()
    gl.domElement.dataset.galaxyTravel = frame.travel ? 'moving' : 'idle'
    layoutDirty.current = false

    frame.slots.clear()
    const pixelsX = (size.width * camera.projectionMatrix.elements[0]) / 2
    const pixelsY = (size.height * camera.projectionMatrix.elements[5]) / 2
    const anchors: { id: string; element: HTMLElement; box: Box; globe: Box }[] = []
    for (const [id, group] of groups.current) {
      const track = travel?.tracks.get(id)
      let slot = slots.find((candidate) => candidate.id === id)
      if (track && progress < 1) {
        const { from, to } = track
        const bend = to.offset === 0 ? -1 : from.offset === 0 ? 1 : 0
        slot = {
          ...to,
          x: mix(from.x, to.x, progress),
          y: mix(from.y, to.y, progress) + bend * arc * Math.min(22, (focal?.radius ?? 0) * 0.4),
          radius: mix(from.radius, to.radius, progress),
        }
      }

      group.visible = false
      const appearance = appearances.get(id)
      const label = labelCache.current.get(id)
      if (label) label.element.style.visibility = 'hidden'
      if (!slot || !bounds || !appearance || pixelsX <= 0 || pixelsY <= 0) {
        if (label) delete label.element.dataset.planetExtent
        continue
      }

      const labelClearance = Math.max(orbitLabelClearance, (label?.height ?? 0) + labelGap + 1)
      const { x, y, extent } = fitOrbitCenter(slot, bounds, labelClearance)
      const slopeX = (x - size.width / 2) / pixelsX
      const slopeY = (size.height / 2 - y) / pixelsY
      const point = vectors.point.set(slopeX, slopeY, -1).transformDirection(camera.matrixWorld)
      const plane = planetPlane + (id === focal?.id ? arc * 0.6 : 0)
      point.multiplyScalar((plane - camera.position.z) / point.z).add(camera.position)
      const local = vectors.local.copy(point).applyMatrix4(camera.matrixWorldInverse)
      const depth = -local.z
      const envelope = appearance.ring || id === selectedId ? 1.82 : 1.08
      const nominalRadius = (slot.radius * appearance.size * overviewDepth) / pixelsY
      const radius = fitWorldRadius(
        local.x,
        local.y,
        depth,
        slopeX,
        slopeY,
        extent / pixelsX,
        extent / pixelsY,
        envelope,
        nominalRadius,
      )

      frame.slots.set(id, {
        ...slot,
        x,
        y,
        radius: Math.min(slot.radius, (radius * pixelsY) / (appearance.size * overviewDepth)),
      })
      if (radius <= 0) {
        if (label) delete label.element.dataset.planetExtent
        continue
      }
      group.position.copy(point)
      group.scale.setScalar(radius)
      group.visible = true
      group.updateMatrixWorld(true)

      if (!label) continue
      const projectedExtent = Math.max(
        projectedSphereExtent(local.x, depth, radius * envelope, pixelsX),
        projectedSphereExtent(local.y, depth, radius * envelope, pixelsY),
      )
      const { element, width, height } = label
      element.dataset.planetX = String(x)
      element.dataset.planetY = String(y)
      element.dataset.planetExtent = String(projectedExtent)
      const left = Math.max(
        bounds.left,
        Math.min(x - width / 2, bounds.left + bounds.width - width),
      )
      const top = y - projectedExtent - height - labelGap
      if (
        width > bounds.width ||
        top < bounds.top ||
        y + projectedExtent > bounds.top + bounds.height
      )
        continue
      anchors.push({
        id,
        element,
        box: { left, top, right: left + width, bottom: top + height },
        globe: {
          left: x - projectedExtent,
          right: x + projectedExtent,
          top: y - projectedExtent,
          bottom: y + projectedExtent,
        },
      })
    }

    anchors.sort((a, b) => Number(b.id === focal?.id) - Number(a.id === focal?.id))
    const occupied: Box[] = []
    for (const { id, element, box } of anchors) {
      if (
        id !== focal?.id &&
        (anchors.some((other) => other.id !== id && overlaps(box, other.globe)) ||
          occupied.some((other) => overlaps(box, other)))
      )
        continue
      element.style.transform = `translate(${box.left}px, ${box.top}px)`
      element.style.visibility = 'visible'
      occupied.push(box)
    }

    if (frame.travel) invalidate()
    else if (wasTraveling || reset || selectionChanged || layoutChanged) queueMicrotask(onSettled)
  }, -1)

  return registerPlanet
}
