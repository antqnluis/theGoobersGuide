import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { SheetTab } from './model';
import { moveSheetTab, sheetTabLabels } from './sheetTabOrder';

interface DragState {
  id: SheetTab;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  dragging: boolean;
  destination: number;
  handle: HTMLSpanElement;
}

export default function CharacterSheetTabs({
  order,
  activeTab,
  onSelect,
  editable,
  onReorder,
}: {
  order: SheetTab[];
  activeTab: SheetTab;
  onSelect: (id: SheetTab) => void;
  editable: boolean;
  onReorder: (order: SheetTab[]) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<SheetTab, HTMLButtonElement>());
  const drag = useRef<DragState | null>(null);
  const animation = useRef<number | null>(null);
  const suppressPointerClick = useRef(false);
  const pendingFocus = useRef<SheetTab | null>(null);
  const [drop, setDrop] = useState<{
    id: SheetTab;
    destination: number;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const activeIndex = order.indexOf(activeTab);

  function stopDrag() {
    const current = drag.current;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    drag.current = null;
    if (current?.dragging) suppressPointerClick.current = true;
    if (current?.handle.hasPointerCapture(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId);
    setDrop(null);
  }

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    const button = buttons.current.get(id);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [order]);

  useEffect(() => {
    stopDrag();
    setAnnouncement('');
    return () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      const current = drag.current;
      drag.current = null;
      if (current?.handle.hasPointerCapture(current.pointerId))
        current.handle.releasePointerCapture(current.pointerId);
    };
  }, [editable]);

  function reorder(id: SheetTab, destination: number) {
    if (!editable || destination < 0 || destination >= order.length) return;
    if (order.indexOf(id) === destination) return;
    pendingFocus.current =
      order.find(
        (tab) => buttons.current.get(tab) === document.activeElement,
      ) ?? null;
    onReorder(moveSheetTab(order, id, destination));
    setAnnouncement(
      `${sheetTabLabels[id]} moved to position ${destination + 1} of ${order.length}.`,
    );
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, id: SheetTab) {
    if (event.key === 'Escape' && drag.current) {
      event.preventDefault();
      stopDrag();
      setAnnouncement('Tab move canceled.');
      return;
    }
    const index = order.indexOf(id);
    if (
      event.altKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      if (!editable) return;
      event.preventDefault();
      reorder(id, index + (event.key === 'ArrowLeft' ? -1 : 1));
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % order.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + order.length) % order.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = order.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onSelect(order[nextIndex]);
    buttons.current.get(order[nextIndex])?.focus();
  }

  function dragDestination(current: DragState): number {
    const remaining = order.filter((id) => id !== current.id);
    const destination = remaining.findIndex((id) => {
      const rect = buttons.current.get(id)?.getBoundingClientRect();
      return rect ? current.x < rect.left + rect.width / 2 : false;
    });
    return destination === -1 ? remaining.length : destination;
  }

  function updateDrag() {
    const current = drag.current;
    const container = strip.current;
    if (!current?.dragging || !container) return;
    const bounds = container.getBoundingClientRect();
    const direction =
      current.x < bounds.left + 32 ? -1 : current.x > bounds.right - 32 ? 1 : 0;
    if (direction) container.scrollLeft += direction * 8;
    const destination = dragDestination(current);
    current.destination = destination;
    setDrop((previous) =>
      previous?.id === current.id && previous.destination === destination
        ? previous
        : { id: current.id, destination },
    );
    animation.current = requestAnimationFrame(updateDrag);
  }

  function startDrag(event: PointerEvent<HTMLSpanElement>, id: SheetTab) {
    if (!editable || event.button !== 0 || !event.isPrimary) return;
    stopDrag();
    event.stopPropagation();
    buttons.current.get(id)?.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      dragging: false,
      destination: order.indexOf(id),
      handle: event.currentTarget,
    };
  }

  function moveDrag(event: PointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX;
    if (
      !current.dragging &&
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) >= 6
    ) {
      current.dragging = true;
      updateDrag();
    }
  }

  function finishDrag(event: PointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.dragging) {
      current.x = event.clientX;
      reorder(current.id, dragDestination(current));
    }
    stopDrag();
  }

  const remaining = drop ? order.filter((id) => id !== drop.id) : [];
  const beforeId = drop ? remaining[drop.destination] : undefined;
  const afterId =
    drop && drop.destination === remaining.length
      ? remaining.at(-1)
      : undefined;

  return (
    <>
      <div
        className="sheet-tabs"
        role="tablist"
        aria-label="Character sheet sections"
        ref={strip}
        onPointerDownCapture={() => {
          suppressPointerClick.current = false;
        }}
      >
        {order.map((id) => (
          <button
            key={id}
            ref={(node) => {
              if (node) buttons.current.set(id, node);
              else buttons.current.delete(id);
            }}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls="sheet-panel"
            aria-describedby={editable ? 'sheet-tab-order-help' : undefined}
            aria-keyshortcuts={
              editable ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined
            }
            tabIndex={activeTab === id ? 0 : -1}
            data-dragging={drop?.id === id || undefined}
            data-drop-before={beforeId === id || undefined}
            data-drop-after={afterId === id || undefined}
            onClick={(event) => {
              if (event.detail > 0 && suppressPointerClick.current) {
                suppressPointerClick.current = false;
                return;
              }
              onSelect(id);
            }}
            onKeyDown={(event) => handleKey(event, id)}
          >
            {editable && (
              <span
                className="sheet-tab-drag-handle"
                aria-hidden="true"
                title={`Drag to reorder ${sheetTabLabels[id]}`}
                onPointerDown={(event) => startDrag(event, id)}
                onPointerMove={moveDrag}
                onPointerUp={finishDrag}
                onPointerCancel={stopDrag}
                onLostPointerCapture={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    drag.current?.pointerId === event.pointerId
                  )
                    stopDrag();
                }}
              >
                <span />
              </span>
            )}
            {sheetTabLabels[id]}
          </button>
        ))}
      </div>
      {editable && (
        <div
          className="sheet-tab-order-controls"
          role="group"
          aria-label="Reorder selected tab"
        >
          <p id="sheet-tab-order-help">
            Drag a handle to reorder tabs, or use Alt + Left / Right.
          </p>
          <div className="sheet-tab-order-actions">
            <span>
              {sheetTabLabels[activeTab]}: {activeIndex + 1} of {order.length}
            </span>
            <button
              type="button"
              className="button button-quiet"
              disabled={activeIndex === 0}
              aria-label={`Move ${sheetTabLabels[activeTab]} left`}
              onClick={() => reorder(activeTab, activeIndex - 1)}
            >
              Move left
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={activeIndex === order.length - 1}
              aria-label={`Move ${sheetTabLabels[activeTab]} right`}
              onClick={() => reorder(activeTab, activeIndex + 1)}
            >
              Move right
            </button>
          </div>
        </div>
      )}
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </>
  );
}
