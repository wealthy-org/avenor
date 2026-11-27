import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 sm:px-6">
      <div className="max-w-md w-full text-center space-y-6 rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-8 shadow-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xl font-bold">
          404
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-[#f8f9fa]">
            Page Not Found
          </h1>
          <p className="text-sm font-mono text-[#a3abb8] leading-relaxed">
            The requested vault, resource, or document is not available at this path.
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/app"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#52b896] hover:bg-[#43a182] text-[#0b1310] font-semibold text-xs font-mono transition-colors"
          >
            Go to Vaults
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-[#f8f9fa] font-medium text-xs font-mono transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
