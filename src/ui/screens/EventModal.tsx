import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClanId, EventId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { UI } from '../uiConstants';
import { Dialog, Tooltip } from '../components';
import { useReducedMotion } from '../motion/MotionContext';
import styles from './EventModal.module.css';

/** Presentation-only contract from 10 §6.1; callers supply already-interpolated text. */
export interface EventModalVM {
  eventId: EventId;
  title: string;
  body: string;
  monClanId: ClanId | null;
  choices: Array<{ label: string; enabled: boolean; hint: string }>;
  requiresChoice: boolean;
}
export interface EventModalProps {
  vm: EventModalVM;
  onChoice: (index: number) => void | Promise<void>;
  onContinue: () => void;
  error?: string | null;
  busy?: boolean;
  animateText?: boolean;
  renderMon?: (clanId: ClanId) => ReactNode;
}

export function EventModal({
  vm,
  onChoice,
  onContinue,
  error,
  busy = false,
  animateText = true,
  renderMon,
}: EventModalProps) {
  const reducedMotion = useReducedMotion();
  const typewriterEnabled = animateText && !reducedMotion;
  const [text, setText] = useState(typewriterEnabled ? '' : vm.body);
  const textState = useRef({ eventId: vm.eventId, body: vm.body, complete: !typewriterEnabled });
  const [pending, setPending] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const activeEvent = useRef(vm.eventId);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const textTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const working = busy || pending;
  useEffect(() => {
    activeEvent.current = vm.eventId;
    setOperationError(null);
    if (textState.current.eventId !== vm.eventId || textState.current.body !== vm.body)
      textState.current = { eventId: vm.eventId, body: vm.body, complete: false };
    if (!typewriterEnabled || textState.current.complete) {
      textState.current.complete = true;
      setText(vm.body);
      return;
    }
    setText('');
    const characters = Array.from(vm.body);
    if (characters.length === 0) return;
    let visible = 0;
    const timer = setInterval(() => {
      visible += 1;
      setText(characters.slice(0, visible).join(''));
      if (visible >= characters.length) {
        textState.current.complete = true;
        clearInterval(timer);
      }
    }, UI.uiEventTextSpeedMsPerChar);
    textTimer.current = timer;
    return () => clearInterval(timer);
  }, [vm.eventId, vm.body, typewriterEnabled]);
  const skipText = () => {
    textState.current.complete = true;
    if (textTimer.current !== null) clearInterval(textTimer.current);
    setText(vm.body);
  };
  async function choose(index: number): Promise<void> {
    if (!vm.requiresChoice || working || inFlight.current || !vm.choices[index]?.enabled) return;
    const eventId = vm.eventId;
    inFlight.current = true;
    setPending(true);
    setOperationError(null);
    try {
      await onChoice(index);
    } catch {
      if (activeEvent.current === eventId) setOperationError(t('cmd.reject.invalidTarget'));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  const firstEnabled = vm.requiresChoice ? vm.choices.findIndex((choice) => choice.enabled) : -1;
  return (
    <Dialog
      open
      title={vm.title}
      size="lg"
      focusScopeKey={vm.eventId}
      initialFocusRef={firstChoice}
      dismissible={!vm.requiresChoice && !working}
      closeOnBackdrop={!vm.requiresChoice && !working}
      onClose={() => {
        if (!vm.requiresChoice && !working) onContinue();
      }}
    >
      <article
        className={styles.scene}
        data-testid="event-modal"
        aria-busy={working}
        onClick={skipText}
      >
        {vm.monClanId !== null && renderMon && (
          <div className={styles.mon} aria-hidden="true">
            {renderMon(vm.monClanId)}
          </div>
        )}
        {vm.requiresChoice && <p className={styles.banner}>{t('ui.event.pendingBanner')}</p>}
        <p className={styles.body}>
          <span aria-hidden="true" data-testid="event-text">
            {typewriterEnabled ? text : vm.body}
          </span>
          <span className={styles.srOnly}>{vm.body}</span>
        </p>
        {(error ?? operationError) && <p role="alert">{error ?? operationError}</p>}
        <div className={styles.choices}>
          {(vm.requiresChoice ? vm.choices : []).map((choice, index) => {
            const reason = t('ui.event.choiceLocked', { reason: choice.hint });
            const button = (
              <button
                type="button"
                disabled={!choice.enabled || working}
                ref={index === firstEnabled ? firstChoice : undefined}
                onClick={() => {
                  void choose(index);
                }}
              >
                {choice.label}
              </button>
            );
            return choice.enabled ? (
              <span key={index}>{button}</span>
            ) : (
              <Tooltip key={index} content={reason}>
                <span
                  className={styles.locked}
                  tabIndex={0}
                  aria-label={`${choice.label} · ${reason}`}
                >
                  {button}
                </span>
              </Tooltip>
            );
          })}
          {!vm.requiresChoice && (
            <button
              type="button"
              data-dialog-primary="true"
              ref={firstChoice}
              disabled={working}
              onClick={onContinue}
            >
              {t('ui.event.continue')}
            </button>
          )}
        </div>
      </article>
    </Dialog>
  );
}
