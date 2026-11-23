/** Small square-capped icons in one 1.75 weight; they sit beside words and never replace them. */

type IconProps = { size?: number }

function Icon({ size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="dice-icon"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  )
}

/** A twenty-sided die seen from above. */
export function D20Icon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9Z" />
      <path d="M12 8 16 15.5H8Z" />
      <path d="M12 2.5V8M3.5 7.5 8 15.5M20.5 7.5 16 15.5M12 21.5v-6M3.5 16.5 8 15.5M20.5 16.5 16 15.5" />
    </Icon>
  )
}

/** A lock: a roll only its roller can see. */
export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 11h13v9.5h-13Z" />
      <path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
    </Icon>
  )
}

/** A device: a roll made here and never saved. */
export function DeviceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3.5h11v17h-11Z" />
      <path d="M10.5 17.5h3" />
    </Icon>
  )
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 2.6 6 6.4.6-4.9 4.2 1.5 6.2L12 16.8 6.4 20l1.5-6.2L3 9.6 9.4 9Z" />
    </Icon>
  )
}

export function WarnIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 10v5M12 17.5v.5" />
    </Icon>
  )
}

export function RepeatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 11.5v-2h12.5M14 6l3.5 3.5L14 13" />
      <path d="M19.5 12.5v2H7M10 18l-3.5-3.5L10 11" />
    </Icon>
  )
}

/** A pushpin: keeps the tray where it is and open. */
export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3.5h6l-1 6 3 3.5H7l3-3.5Z" />
      <path d="M12 13v7.5" />
    </Icon>
  )
}

/** Four arrows: drag to move. */
export function MoveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M3 12h18" />
      <path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </Icon>
  )
}

/** A corner with a diagonal: drag to resize. */
export function ResizeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10V4h6" />
      <path d="M4 4l7 7M4 8.5 8.5 4" />
    </Icon>
  )
}
