import { useThree, type RootState } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import type { PerspectiveCamera } from 'three'
import {
  cameraView,
  chartPose,
  focusPose,
  heading,
  interpolatePose,
  starfieldPan,
  swingStreak,
  travelDurations,
  travelProgress,
  unwrapHeading,
  type CameraPose,
  type CameraView,
  type Point,
  type SceneBounds,
  type SpaceMotion,
} from './orreryCamera'

/** The world the camera approaches, where it is this frame. */
export type CameraFocus = {
  id: string
  position: Point
  radius: number
  envelope: number
  clearance: number
}

type Travel = { elapsed: number; duration: number; from: CameraPose; swing: boolean }

/**
 * The single camera rig. It returns a function to call once per frame, after
 * the worlds have moved and before anything is projected to the screen.
 *
 * Every journey starts from the last rendered pose and ends on a destination
 * that is recomputed each frame, so the camera keeps up with an orbiting world
 * and a new selection mid-flight carries on from where the camera is.
 */
export function useOrreryCamera({
  bounds,
  extent,
  visible,
  motionReduced,
  spaceMotion: spaceMotionRef,
}: {
  bounds: SceneBounds | null
  extent: number
  visible: boolean
  motionReduced: boolean
  spaceMotion: RefObject<SpaceMotion>
}) {
  const invalidate = useThree((state) => state.invalidate)
  const settleImmediately = useRef(true)
  const rig = useRef({
    pose: null as CameraPose | null,
    travel: null as Travel | null,
    focusId: null as string | null,
    width: 0,
    height: 0,
    bounds: null as SceneBounds | null,
    extent: 0,
    heading: null as number | null,
    offsetX: 0,
    offsetY: 0,
  })

  useLayoutEffect(() => {
    // Rendering stops while the tab is hidden; on return the camera is already there.
    if (!visible) settleImmediately.current = true
  }, [visible])

  return useCallback(
    (
      { camera, gl, size }: RootState,
      delta: number,
      focus: CameraFocus | null,
    ): { view: CameraView; scene: SceneBounds; moving: boolean } => {
      const state = rig.current
      const scene = bounds ?? { left: 0, top: 0, width: size.width, height: size.height }
      const destination = focus
        ? focusPose(
            focus.position,
            focus.radius,
            focus.envelope,
            scene,
            size.height,
            focus.clearance,
          )
        : chartPose(extent, scene, size.height)
      const focusId = focus?.id ?? null
      const selectionChanged = state.focusId !== focusId
      const layoutChanged =
        state.width !== size.width ||
        state.height !== size.height ||
        state.bounds !== bounds ||
        state.extent !== extent

      let started = false
      // Reduced motion cuts straight to every destination.
      if (settleImmediately.current || motionReduced || !state.pose) {
        state.travel = null
      } else if (selectionChanged) {
        const swing = Boolean(state.focusId && focusId)
        state.travel = {
          elapsed: 0,
          duration: swing
            ? travelDurations.swing
            : focusId
              ? travelDurations.approach
              : travelDurations.retreat,
          from: state.pose,
          swing,
        }
        started = true
      } else if (layoutChanged && state.travel) {
        // A resize mid-flight finishes the remainder from the live pose.
        state.travel = {
          elapsed: 0,
          duration: Math.max(0.12, state.travel.duration - state.travel.elapsed),
          from: state.pose,
          swing: false,
        }
        started = true
      }
      settleImmediately.current = false

      const space = spaceMotionRef.current
      const travel = state.travel
      let pose = destination
      let streak = 0
      if (travel) {
        const step = Math.min(delta, 0.1)
        if (!started) travel.elapsed += step
        const progress = travelProgress(travel.elapsed, travel.duration)
        pose = interpolatePose(travel.from, destination, progress)
        if (progress >= 1) state.travel = null
        else if (travel.swing) {
          // Ease towards the flight's streak so an interrupted swing does not pop.
          const target = swingStreak(travel.from, destination, progress)
          streak = space.streak + (target - space.streak) * Math.min(1, step * 14)
        }
      }

      state.pose = pose
      state.focusId = focusId
      state.width = size.width
      state.height = size.height
      state.bounds = bounds
      state.extent = extent

      const lens = camera as PerspectiveCamera
      lens.position.set(...pose.position)
      lens.up.set(0, 1, 0)
      lens.lookAt(...pose.target)
      lens.updateMatrixWorld()
      // Shift the optical axis so the target lands in the clear part of the scene.
      const offsetX = size.width / 2 - pose.principal[0]
      const offsetY = size.height / 2 - pose.principal[1]
      if (layoutChanged || state.offsetX !== offsetX || state.offsetY !== offsetY) {
        lens.setViewOffset(size.width, size.height, offsetX, offsetY, size.width, size.height)
        state.offsetX = offsetX
        state.offsetY = offsetY
      }

      state.heading = unwrapHeading(state.heading, heading(pose))
      space.offset = state.heading * starfieldPan
      space.streak = streak

      const status = state.travel ? 'moving' : 'idle'
      if (gl.domElement.dataset.galaxyTravel !== status) gl.domElement.dataset.galaxyTravel = status
      if (state.travel) invalidate()

      return { view: cameraView(pose, size.height), scene, moving: Boolean(state.travel) }
    },
    [bounds, extent, motionReduced, spaceMotionRef, invalidate],
  )
}
