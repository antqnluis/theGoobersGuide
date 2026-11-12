import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { PerspectiveCamera, Vector3, type Group } from 'three'
import { orbitLabelClearance, type OrbitBounds, type OrbitSlot } from './campaignOrbit'
import {
  fitOrbitCenter,
  fitWorldRadius,
  flybyDuration,
  flybyPlane,
  flybySlotProgress,
  flybyStreak,
  focusPose,
  glidePose,
  glideStrength,
  handoffSlots,
  interpolatePose,
  mix,
  orbitPlane,
  overviewDepth,
  overviewPose,
  projectedSphereExtent,
  travelArc,
  travelDirection,
  travelProgress,
  type CameraPose,
  type SpaceMotion,
} from './campaignTravel'
import type { planetAppearance } from './planetModel'

const labelGap = 6
const backgroundStep = 0.012

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

function placeCamera(camera: PerspectiveCamera, pose: CameraPose) {
  camera.position.set(...pose.position)
  camera.lookAt(...pose.lookAt)
  camera.updateMatrixWorld()
}

function pointOnPlane(
  point: Vector3,
  camera: PerspectiveCamera,
  slopeX: number,
  slopeY: number,
  plane: number,
) {
  point.set(slopeX, slopeY, -1).transformDirection(camera.matrixWorld)
  return point.multiplyScalar((plane - camera.position.z) / point.z).add(camera.position)
}

type Travel = {
  elapsed: number
  duration: number
  direction: number
  glideDirection: number
  outgoingId: string | null
  strength: number
  from: CameraPose
  to: CameraPose
  backgroundFrom: number
  backgroundTo: number
  streakFrom: number
  flyby: { elapsed: number; direction: number; strength: number; from: number } | null
  tracks: ReturnType<typeof handoffSlots>
}

export function useGalaxyTravel({
  slots,
  bounds,
  order,
  selectedId,
  stepDirection,
  spaceMotion: spaceMotionRef,
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
  spaceMotion: RefObject<SpaceMotion>
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
  const referenceCamera = useMemo(() => new PerspectiveCamera(), [])
  const live = useRef({
    pose: overviewPose,
    slots: new Map<string, OrbitSlot & { plane: number }>(),
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
    const space = spaceMotionRef.current
    if (!interactive || !visible) {
      frame.travel = null
      spaceMotionRef.current.streak = 0
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

    let startedTravel = false
    if (reset || selectionChanged || layoutChanged) {
      const destination = focusPose(selectedId, focal, size.width, size.height)
      const oldFocal = frame.targetSlots[0]?.id ?? null
      if (!reset && bounds && focal && frame.slots.size && (selectionChanged || frame.travel)) {
        const activeTravel = frame.travel
        const direction = selectionChanged
          ? (stepDirection ??
            (frame.slots.get(focal.id)?.offset || travelDirection(order, oldFocal, focal.id)))
          : activeTravel!.direction
        const strength = glideStrength(bounds)
        const flybyDirection = selectionChanged && frame.selectedId && selectedId ? direction : 0
        // Keep the intended destination on resize and advance it on each new selection.
        const previousBackgroundTarget = activeTravel?.backgroundTo ?? space.offset
        const backgroundTo = selectedId
          ? previousBackgroundTarget +
            (selectionChanged && oldFocal !== focal.id ? direction * backgroundStep : 0)
          : space.offset
        frame.travel = {
          elapsed: 0,
          duration: selectionChanged
            ? frame.selectedId && selectedId
              ? flybyDuration
              : selectedId
                ? 0.64
                : 0.48
            : Math.max(0.12, activeTravel!.duration - activeTravel!.elapsed),
          direction,
          // A resize rebases the remainder from the live pose without replaying the flyby.
          glideDirection: flybyDirection,
          outgoingId: selectionChanged ? oldFocal : null,
          strength,
          from: frame.pose,
          to: destination,
          backgroundFrom: space.offset,
          backgroundTo,
          streakFrom: space.streak,
          // The stars keep their original flight clock when the orbit is resized.
          flyby: selectionChanged
            ? flybyDirection
              ? { elapsed: 0, direction: flybyDirection, strength, from: space.streak }
              : null
            : activeTravel!.flyby,
          tracks: handoffSlots(frame.slots, slots, [...appearances.keys()], bounds, direction),
        }
        startedTravel = true
      } else {
        frame.travel = null
        frame.pose = destination
        spaceMotionRef.current.streak = 0
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
    let slotCamera = camera
    if (travel) {
      if (!startedTravel) {
        const step = Math.min(delta, 0.1)
        travel.elapsed += step
        if (travel.flyby) travel.flyby.elapsed += step
      }
      progress = travelProgress(travel.elapsed, travel.duration)
      arc = travel.glideDirection ? travelArc(progress) * travel.strength : 0
      const referencePose = interpolatePose(travel.from, travel.to, progress)
      frame.pose = glidePose(referencePose, progress, travel.glideDirection, travel.strength)
      if (frame.pose !== referencePose) {
        // Lay out the arc against the reference pose so the curved camera can see real parallax.
        placeCamera(referenceCamera, referencePose)
        slotCamera = referenceCamera
      }
      const { flyby } = travel
      spaceMotionRef.current.offset = mix(travel.backgroundFrom, travel.backgroundTo, progress)
      spaceMotionRef.current.streak =
        progress >= 1
          ? 0
          : flyby
            ? flybyStreak(flyby.elapsed, flyby.from, flyby.direction, flyby.strength)
            : travel.streakFrom * (1 - travelProgress(travel.elapsed, 0.18))
      if (progress >= 1) frame.travel = null
    }

    placeCamera(camera, frame.pose)
    gl.domElement.dataset.galaxyTravel = frame.travel ? 'moving' : 'idle'
    layoutDirty.current = false

    frame.slots.clear()
    const pixelsX = (size.width * camera.projectionMatrix.elements[0]) / 2
    const pixelsY = (size.height * camera.projectionMatrix.elements[5]) / 2
    const anchors: { id: string; element: HTMLElement; box: Box; globe: Box }[] = []
    for (const [id, group] of groups.current) {
      const track = travel?.tracks.get(id)
      let slot = slots.find((candidate) => candidate.id === id)
      let plane = slot ? orbitPlane(slot) : 0
      if (track && progress < 1) {
        const { from, to } = track
        const role = travel?.glideDirection
          ? Number(id === travel.outgoingId) - Number(id === focal?.id)
          : 0
        const slotProgress = flybySlotProgress(progress, role)
        plane = flybyPlane(from, to, slotProgress, arc, role)
        slot = {
          ...to,
          x: mix(from.x, to.x, slotProgress),
          y:
            mix(from.y, to.y, slotProgress) + role * arc * Math.min(32, (focal?.radius ?? 0) * 0.4),
          radius: mix(from.radius, to.radius, slotProgress),
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

      const { point, local } = vectors
      const centerX = size.width / 2
      const centerY = size.height / 2
      pointOnPlane(
        point,
        slotCamera,
        (slot.x - centerX) / pixelsX,
        (centerY - slot.y) / pixelsY,
        plane,
      )
      local.copy(point).applyMatrix4(camera.matrixWorldInverse)
      const projected = {
        ...slot,
        x: centerX + (pixelsX * local.x) / -local.z,
        y: centerY - (pixelsY * local.y) / -local.z,
      }
      const labelClearance = Math.max(orbitLabelClearance, (label?.height ?? 0) + labelGap + 1)
      const { x, y, extent } = fitOrbitCenter(projected, bounds, labelClearance)
      const slopeX = (x - size.width / 2) / pixelsX
      const slopeY = (size.height / 2 - y) / pixelsY
      if (x !== projected.x || y !== projected.y) {
        pointOnPlane(point, camera, slopeX, slopeY, plane)
        local.copy(point).applyMatrix4(camera.matrixWorldInverse)
      }
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
        plane,
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
