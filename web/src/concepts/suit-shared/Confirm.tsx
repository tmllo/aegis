// Centred confirm with one large square button for gloved fingers (Dragon console pattern).
// Styled per concept through the .cf-* classes.
import { AnimatePresence, motion } from 'framer-motion';

export function Confirm({
  open,
  eyebrow,
  title,
  body,
  confirm,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  eyebrow: string;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cf-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onCancel}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="cf-box"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="cf-eyebrow">{eyebrow}</p>
            <h3 className="cf-title">{title}</h3>
            {body && <p className="cf-body">{body}</p>}
            <button type="button" className="cf-go" onClick={onConfirm} autoFocus>
              {confirm}
            </button>
            <button type="button" className="cf-cancel" onClick={onCancel}>
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
