import { useEffect, useId, useRef, useState } from 'react';
import type { InventoryItem } from './model';

export interface InventoryView {
  height: number;
  showAll: boolean;
}

function QuantityControl({
  item,
  disabled,
  onCommit,
}: {
  item: InventoryItem;
  disabled: boolean;
  onCommit: (id: string, raw: string) => boolean;
}) {
  const [input, setInput] = useState(String(item.quantity));
  const [error, setError] = useState<string | null>(null);
  const committed = useRef(item.quantity);
  const errorId = useId();
  const name = item.name || 'Unnamed item';

  useEffect(() => {
    committed.current = item.quantity;
    setInput(String(item.quantity));
  }, [item.quantity]);

  function commit(raw: string) {
    if (disabled) return;
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isSafeInteger(value) || value < 0) {
      setInput(String(committed.current));
      setError('Enter a nonnegative whole number for quantity.');
      return;
    }
    if (value === committed.current) {
      setInput(String(value));
      setError(null);
      return;
    }
    if (onCommit(item.id, raw)) {
      committed.current = value;
      setInput(String(value));
      setError(null);
    } else {
      setInput(String(committed.current));
      setError('Quantity could not be saved. Try again.');
    }
  }

  const parsed = Number(input);
  const stepValue =
    input.trim() !== '' && Number.isSafeInteger(parsed) && parsed >= 0
      ? parsed
      : committed.current;

  return (
    <div className="inventory-quantity">
      <div
        className="inventory-stepper"
        onBlur={(event) => {
          // Commit once on leaving the group; a step uses the typed value too.
          if (!event.currentTarget.contains(event.relatedTarget)) commit(input);
        }}
      >
        <button
          type="button"
          className="button button-quiet"
          aria-label={`Decrease ${name} quantity`}
          disabled={disabled || stepValue === 0}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => commit(String(stepValue - 1))}
        >
          −
        </button>
        <input
          className="field-input field-input-number"
          type="number"
          inputMode="numeric"
          min="0"
          max={Number.MAX_SAFE_INTEGER}
          step="1"
          aria-label={`${name} quantity`}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(input);
            }
            if (event.key === 'Escape') {
              setInput(String(committed.current));
              setError(null);
            }
          }}
        />
        <button
          type="button"
          className="button button-quiet"
          aria-label={`Increase ${name} quantity`}
          disabled={disabled || stepValue >= Number.MAX_SAFE_INTEGER}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => commit(String(stepValue + 1))}
        >
          +
        </button>
      </div>
      {error && (
        <p className="inventory-quantity-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function CharacterInventory({
  items,
  editing,
  readOnly,
  disabled,
  view,
  onViewChange,
  onChange,
  onQuantityCommit,
}: {
  items: InventoryItem[];
  editing: boolean;
  readOnly: boolean;
  disabled: boolean;
  view: InventoryView;
  onViewChange: (view: InventoryView) => void;
  onChange: (items: InventoryItem[]) => void;
  onQuantityCommit: (id: string, raw: string) => boolean;
}) {
  const listId = useId();
  const hintId = useId();
  const drag = useRef<{ pointerId: number; y: number; height: number } | null>(
    null,
  );
  const list = useRef<HTMLDivElement>(null);

  function resize(height: number) {
    onViewChange({
      showAll: false,
      height: Math.max(160, Math.min(960, height)),
    });
  }

  return (
    <div className="gear-inventory">
      <div
        className="inventory-scroll"
        id={listId}
        ref={list}
        role="region"
        aria-label="Inventory items"
        tabIndex={0}
        style={{ maxHeight: view.showAll ? undefined : view.height }}
      >
        <div className="ledger-list">
          {items.length === 0 && (
            <p className="inventory-empty">
              {editing
                ? 'No items yet. Add your first item below.'
                : readOnly
                  ? 'No inventory items yet.'
                  : 'No items yet. Choose Edit sheet to add your first item.'}
            </p>
          )}
          {items.map((item) => (
            <div className="ledger-row inventory-row" key={item.id}>
              <div className="inventory-item-details">
                {editing ? (
                  <>
                    <input
                      className="field-input"
                      aria-label="Item name"
                      value={item.name}
                      onChange={(event) =>
                        onChange(
                          items.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                    <input
                      className="field-input"
                      aria-label="Item description"
                      value={item.description ?? ''}
                      onChange={(event) =>
                        onChange(
                          items.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, description: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </>
                ) : (
                  <>
                    <strong>{item.name}</strong>
                    {item.description && <span>{item.description}</span>}
                  </>
                )}
              </div>
              {readOnly ? (
                <span className="row-value">× {item.quantity}</span>
              ) : (
                <QuantityControl
                  key={editing ? 'draft' : 'saved'}
                  item={item}
                  disabled={disabled}
                  onCommit={onQuantityCommit}
                />
              )}
              {editing && (
                <button
                  type="button"
                  className="button button-quiet inventory-remove"
                  aria-label={`Remove ${item.name || 'unnamed item'}`}
                  onClick={() =>
                    onChange(items.filter((i) => i.id !== item.id))
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="inventory-size-controls">
        <p id={hintId}>Drag to resize, or use arrow keys on the handle.</p>
        <button
          type="button"
          className="button button-quiet"
          aria-controls={listId}
          onClick={() => onViewChange({ ...view, showAll: !view.showAll })}
        >
          {view.showAll ? 'Resize list' : 'Show all'}
        </button>
      </div>
      <div
        className="inventory-resize-handle"
        role="separator"
        tabIndex={0}
        aria-label="Inventory list height"
        aria-describedby={hintId}
        aria-controls={listId}
        aria-orientation="horizontal"
        aria-valuemin={160}
        aria-valuemax={960}
        aria-valuenow={view.height}
        aria-valuetext={
          view.showAll ? 'All items shown' : `${view.height} pixels`
        }
        onKeyDown={(event) => {
          const height = view.showAll
            ? (list.current?.getBoundingClientRect().height ?? view.height)
            : view.height;
          if (event.key === 'ArrowUp') resize(height - 40);
          else if (event.key === 'ArrowDown') resize(height + 40);
          else if (event.key === 'Home') resize(160);
          else if (event.key === 'End') resize(960);
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            y: event.clientY,
            height: list.current?.getBoundingClientRect().height ?? view.height,
          };
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          resize(drag.current.height + event.clientY - drag.current.y);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => (drag.current = null)}
        onLostPointerCapture={() => (drag.current = null)}
      >
        <span aria-hidden="true" />
      </div>
      {editing && (
        <button
          type="button"
          className="button button-quiet gear-action"
          onClick={() =>
            onChange([
              ...items,
              { id: crypto.randomUUID(), name: '', quantity: 1 },
            ])
          }
        >
          Add item
        </button>
      )}
    </div>
  );
}
