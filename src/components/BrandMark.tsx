// The app mark: a tear-off calendar page with a folded corner and a check.
// Same drawing as public/favicon.svg.

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="15" fill="#542A52" />
      <path d="M16 19.5a4.5 4.5 0 0 1 4.5-4.5h23a4.5 4.5 0 0 1 4.5 4.5V39L37 50H20.5a4.5 4.5 0 0 1-4.5-4.5z" fill="#FFF8F4" />
      <path d="M16 19.5a4.5 4.5 0 0 1 4.5-4.5h23a4.5 4.5 0 0 1 4.5 4.5V25H16z" fill="#FFB39A" />
      <path d="M48 39H41.5a4.5 4.5 0 0 0-4.5 4.5V50z" fill="#EBD0C6" />
      <circle cx="24" cy="15" r="2.2" fill="#3E1D3C" />
      <circle cx="40" cy="15" r="2.2" fill="#3E1D3C" />
      <path d="m24.5 37 4.8 4.8 9.7-10" fill="none" stroke="#542A52" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
