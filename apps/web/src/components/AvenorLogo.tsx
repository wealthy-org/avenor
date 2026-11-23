export function AvenorLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0 ${className}`}>
      <svg
        className="h-8 w-8 shrink-0 object-contain"
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M7 26L16 6L25 26"
          stroke="#6db89b"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.5 19H21.5"
          stroke="#6db89b"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle cx="16" cy="13.5" r="1.5" fill="#f8f9fa" />
      </svg>
      <span className="font-display text-[13px] font-semibold tracking-[0.28em] text-[#f8f9fa] uppercase">
        AVENOR
      </span>
    </span>
  );
}
