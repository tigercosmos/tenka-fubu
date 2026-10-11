import { useRef, type ReactNode } from 'react';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../Dialog/Dialog';
import styles from './ConfirmDialog.module.css';
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = t('ui.common.confirm'),
  cancelText = t('ui.common.cancel'),
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const footer = (
    <>
      <button ref={cancel} type="button" data-dialog-primary={danger} onClick={onCancel}>
        {cancelText}
      </button>
      <button
        className={danger ? styles.danger : styles.confirm}
        type="button"
        data-dialog-primary={!danger}
        onClick={onConfirm}
      >
        {confirmText}
      </button>
    </>
  );
  return (
    <Dialog
      open={open}
      title={title}
      size="sm"
      closeOnBackdrop={false}
      onClose={onCancel}
      initialFocusRef={cancel}
      footer={footer}
    >
      {message}
    </Dialog>
  );
}
