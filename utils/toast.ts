/**
 * toast.ts
 *
 * Lightweight DOM-injected toast notifications.
 * No external dependencies — works from any hook or utility.
 *
 * Usage:
 *   import { toast } from '../utils/toast';
 *   toast.error('Something went wrong.');
 *   toast.success('All changes saved.');
 *   toast.info('Position 3 in queue…');   // persists until toast.dismiss()
 *   toast.update('Now processing…');      // updates text in-place, no flicker
 *   toast.dismiss();                      // removes immediately
 */

const BG: Record<'error' | 'success' | 'info', string> = {
  error:   '#9e5460',
  success: '#4a7c6b',
  info:    '#4a6b8a',
};

function showToast(message: string, type: 'error' | 'success' | 'info', duration = 5000): void {
  const existing = document.getElementById('pv-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'pv-toast';

  el.style.cssText = [
    'position:fixed',
    'bottom:88px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:9999',
    `background:${BG[type]}`,
    'color:#fff',
    'font-family:Arial,Helvetica,sans-serif',
    'font-size:14px',
    'font-weight:600',
    'line-height:1.4',
    'padding:12px 20px',
    'border-radius:999px',
    'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
    'max-width:360px',
    'text-align:center',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity 0.2s ease',
  ].join(';');

  el.textContent = message;
  document.body.appendChild(el);

  // Trigger fade-in on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  });

  if (duration > 0) {
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s ease';
      setTimeout(() => el.remove(), 320);
    }, duration);
  }
}

/** Update the text of the current toast in-place (no flicker, no re-animation). */
function updateToast(message: string): void {
  const el = document.getElementById('pv-toast');
  if (el) {
    el.textContent = message;
  }
}

export const toast = {
  error:   (msg: string, duration?: number) => showToast(msg, 'error',   duration),
  success: (msg: string, duration?: number) => showToast(msg, 'success', duration),
  /** Informational (blue). Pass duration=0 to keep it until toast.dismiss() is called. */
  info:    (msg: string, duration = 0)      => showToast(msg, 'info',    duration),
  /** Update the current toast text in-place without re-animating. */
  update:  (msg: string)                    => updateToast(msg),
  /** Remove the current toast immediately. */
  dismiss: ()                               => { document.getElementById('pv-toast')?.remove(); },
};
