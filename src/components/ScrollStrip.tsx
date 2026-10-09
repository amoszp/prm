import { useEffect, useRef, type HTMLAttributes } from 'react';

// A row of filters or chips. On narrow screens it scrolls sideways, edge to
// edge, and fades only the side that has more to see; on desktop it wraps.
// The selected option is kept in view, so a filter restored from the URL
// isn't hidden off-screen.

export function ScrollStrip({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.dataset.fadeStart = String(el.scrollLeft > 2);
      el.dataset.fadeEnd = String(max > 2 && el.scrollLeft < max - 2);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', sync);
      return () => {
        el.removeEventListener('scroll', sync);
        window.removeEventListener('resize', sync);
      };
    }
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, []);

  // After every render: if the selected option sits outside the visible part, centre it.
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const on = el.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"]');
    if (!on) return;
    const start = on.offsetLeft;
    const end = start + on.offsetWidth;
    if (start >= el.scrollLeft && end <= el.scrollLeft + el.clientWidth) return;
    el.scrollLeft = start - (el.clientWidth - on.offsetWidth) / 2;
  });

  return <div ref={ref} className={className ? `scroll-x ${className}` : 'scroll-x'} {...rest} />;
}
