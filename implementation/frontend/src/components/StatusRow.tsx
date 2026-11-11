type StatusRowProps = {
  label: string
  value: string
  state: 'ready' | 'checking' | 'error' | 'setup'
  detail?: string
}

const stateStyles: Record<StatusRowProps['state'], string> = {
  ready: 'bg-emerald-400',
  checking: 'animate-pulse bg-amber-300',
  error: 'bg-rose-400',
  setup: 'bg-stone-500',
}

export function StatusRow({ label, value, state, detail }: StatusRowProps) {
  return (
    <div className="flex items-start gap-3 border-t border-stone-800 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className={`mt-2 size-2 shrink-0 rounded-full ${stateStyles[state]}`}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-100">{label}</p>
        <p className="mt-1 text-sm text-stone-400">{value}</p>
        {detail && <p className="mt-2 break-words font-mono text-xs text-stone-500">{detail}</p>}
      </div>
    </div>
  )
}
