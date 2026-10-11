import { useLayoutEffect, useRef, useState } from 'react';
import { t } from '@i18n/zh-TW';
import { UI } from '../uiConstants';
import styles from './StateViewer.module.css';

export interface StateViewerProps {
  data: unknown;
  revision: number;
}

/** Explicit copy only: validate data descriptors instead of invoking getters or toJSON methods. */
function copyable(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('Not JSON data');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
    throw new Error('Not a JSON object');
  const next = new Set(ancestors).add(value);
  const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
  if (Array.isArray(value) && Array.isArray(result)) {
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (length === undefined || !('value' in length)) throw new Error('Unreadable array');
    Object.defineProperty(result, 'length', { value: length.value });
  }
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new Error('Accessor');
    Object.defineProperty(result, key, {
      value: copyable(descriptor.value, next),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function primitive(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'function') return '[function]';
  return String(value);
}

function TreeNode({
  value,
  label,
  path,
  revision,
  ancestors,
  accessor = false,
}: {
  value: unknown;
  label: string;
  path: readonly string[];
  revision: number;
  ancestors: ReadonlySet<object>;
  accessor?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState<number>(UI.stateViewerPageSize);
  const [message, setMessage] = useState<'idle' | 'copied' | 'failed'>('idle');
  const request = useRef(0),
    alive = useRef(true),
    summary = useRef<HTMLElement>(null);
  const moreFocused = useRef(false);
  const object = !accessor && value !== null && typeof value === 'object';
  const circular = object && ancestors.has(value);
  let keys: string[] = [],
    unreadable = false;
  if (open && object && !circular) {
    try {
      keys = Object.keys(value);
    } catch {
      unreadable = true;
    }
  }
  useLayoutEffect(() => {
    alive.current = true;
    request.current += 1;
    setMessage('idle');
    return () => {
      alive.current = false;
      request.current += 1;
    };
  }, [value, revision]);
  useLayoutEffect(() => {
    if (moreFocused.current && limit >= keys.length && document.activeElement === document.body) {
      summary.current?.focus();
      moreFocused.current = false;
    }
  }, [limit, keys.length]);
  async function copy() {
    const id = ++request.current;
    setMessage('idle');
    try {
      if (accessor) throw new Error('Accessor');
      const text = JSON.stringify(copyable(value), null, 2);
      if (text === undefined || navigator.clipboard?.writeText === undefined)
        throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (alive.current && request.current === id) setMessage('copied');
    } catch {
      if (alive.current && request.current === id) setMessage('failed');
    }
  }
  const display = accessor
    ? t('ui.debug.stateViewer.accessor')
    : circular
      ? t('ui.debug.stateViewer.circular')
      : object
        ? Array.isArray(value)
          ? '[…]'
          : '{…}'
        : primitive(value);
  const next = object ? new Set(ancestors).add(value) : ancestors;
  const content = (
    <>
      <span>{label}</span> <code>{display}</code>
    </>
  );
  return (
    <li className={styles.node} data-testid="state-viewer-node" data-path={JSON.stringify(path)}>
      {object && !circular ? (
        <details
          data-testid="state-viewer-details"
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary ref={summary}>{content}</summary>
          {open &&
            (unreadable ? (
              <p role="status">{t('ui.debug.stateViewer.unreadable')}</p>
            ) : (
              <>
                {keys.length === 0 && <p>{t('ui.debug.stateViewer.empty')}</p>}
                <ul>
                  {keys.slice(0, limit).map((key) => {
                    let descriptor: PropertyDescriptor | undefined;
                    try {
                      descriptor = Object.getOwnPropertyDescriptor(value, key);
                    } catch {
                      /* explicit expansion can fail */
                    }
                    return (
                      <TreeNode
                        key={key}
                        label={key}
                        path={[...path, key]}
                        revision={revision}
                        ancestors={next}
                        value={descriptor?.value as unknown}
                        accessor={descriptor === undefined || !('value' in descriptor)}
                      />
                    );
                  })}
                </ul>
                {keys.length > limit && (
                  <button
                    type="button"
                    data-testid="state-viewer-more"
                    onFocus={() => {
                      moreFocused.current = true;
                    }}
                    onBlur={() => {
                      moreFocused.current = false;
                    }}
                    onClick={() => setLimit((count) => count + UI.stateViewerPageSize)}
                  >
                    {t('ui.debug.stateViewer.showMore', {
                      count: Math.min(UI.stateViewerPageSize, keys.length - limit),
                    })}
                  </button>
                )}
              </>
            ))}
        </details>
      ) : (
        <span>{content}</span>
      )}
      <button
        type="button"
        data-testid="state-viewer-copy"
        aria-label={`${t('ui.debug.stateViewer.copy')}：GameState${path.map((part) => `[${JSON.stringify(part)}]`).join('')}`}
        onClick={() => {
          void copy();
        }}
      >
        {t('ui.debug.stateViewer.copy')}
      </button>
      {message !== 'idle' && (
        <span role="status">
          {t(`ui.debug.stateViewer.${message === 'copied' ? 'copied' : 'copyFailed'}`)}
        </span>
      )}
    </li>
  );
}

/** No store/queue access, timers or whole-state serialization during presentation. */
export function StateViewer({ data, revision }: StateViewerProps) {
  const [owner, setOwner] = useState({ data, generation: 0 });
  const root = useRef<HTMLElement>(null);
  const focused = useRef<{ element: HTMLElement; path: string[] } | null>(null);
  if (!Object.is(owner.data, data)) setOwner({ data, generation: owner.generation + 1 });
  useLayoutEffect(() => {
    const previous = focused.current;
    if (!previous || previous.element.isConnected || document.activeElement !== document.body)
      return;
    const nodes = [
      ...(root.current?.querySelectorAll<HTMLElement>('[data-testid="state-viewer-node"]') ?? []),
    ];
    for (let length = previous.path.length; length >= 0; length -= 1) {
      const path = JSON.stringify(previous.path.slice(0, length));
      const candidate = nodes.find((node) => node.dataset.path === path);
      const target = candidate?.querySelector<HTMLElement>(
        ':scope > details > summary, :scope > button',
      );
      if (target) {
        target.focus();
        return;
      }
    }
    root.current?.focus();
  }, [data, revision, owner.generation]);
  return (
    <section
      ref={root}
      tabIndex={-1}
      data-testid="state-viewer"
      aria-label={t('ui.debug.stateViewer.title')}
      className={styles.viewer}
      onFocusCapture={(event) => {
        if (!(event.target instanceof HTMLElement)) return;
        const encoded = event.target.closest<HTMLElement>('[data-testid="state-viewer-node"]')
          ?.dataset.path;
        const parsed: unknown = encoded === undefined ? [] : JSON.parse(encoded);
        const path =
          Array.isArray(parsed) && parsed.every((item: unknown) => typeof item === 'string')
            ? parsed
            : [];
        focused.current = { element: event.target, path };
      }}
      onBlurCapture={(event) => {
        if (
          event.relatedTarget === null &&
          event.target instanceof HTMLElement &&
          event.target.isConnected
        ) {
          focused.current = null;
          return;
        }
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          focused.current = null;
      }}
      onKeyDown={(event) => {
        if (event.code === 'Backquote' || event.key === '`') return;
        event.stopPropagation();
        if (!event.ctrlKey && !event.metaKey && !event.altKey && /^F(?:[1-7]|9)$/u.test(event.key))
          event.preventDefault();
      }}
    >
      <h3>{t('ui.debug.stateViewer.title')}</h3>
      <ul>
        <TreeNode
          key={owner.generation}
          value={data}
          label="GameState"
          path={[]}
          revision={revision}
          ancestors={new Set()}
        />
      </ul>
    </section>
  );
}
