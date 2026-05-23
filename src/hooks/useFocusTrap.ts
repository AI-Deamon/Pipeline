import { useEffect, useRef, useCallback } from 'react';

/**
 * useFocusTrap — WCAG 2.1 AA compliant focus trap for modals.
 *
 * Features:
 * - Tab/Shift+Tab cycles within the modal
 * - Escape key calls onClose callback
 * - Returns ref to attach to modal container element
 *
 * Usage:
 *   const { ref } = useFocusTrap({ onClose: () => setIsOpen(false) });
 *   <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title">
 */
interface UseFocusTrapOptions {
  onClose: () => void;
}

interface UseFocusTrapReturn {
  ref: React.RefObject<HTMLDivElement | null>;
}

export function useFocusTrap({ onClose }: UseFocusTrapOptions): UseFocusTrapReturn {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !containerRef.current) return;

      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Focus first focusable element on mount
    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return { ref: containerRef };
}
