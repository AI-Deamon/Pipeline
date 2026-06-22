import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  content: string;
  position?: 'top' | 'bottom';
}

export function HelpTooltip({ content, position = 'top' }: HelpTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Help"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      {show && (
        <span
          className={`absolute z-50 w-56 px-3 py-2 text-xs text-white bg-slate-900 rounded-lg shadow-lg ${
            position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } left-1/2 -translate-x-1/2`}
          role="tooltip"
        >
          {content}
          <span
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 ${
              position === 'top' ? 'top-full -mt-1' : 'bottom-full -mb-1'
            }`}
          />
        </span>
      )}
    </span>
  );
}
