export default function Loading() {
  return (
    <div className="shell stack min-h-[60vh] animate-in fade-in duration-200">
      {/* Top glowing navigation progress shimmer bar */}
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-[#14221c] z-50 overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#6db89b] to-transparent animate-[shimmer_1.2s_infinite_linear]" />
      </div>

      {/* Skeleton header */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#101b16]/70 p-6 sm:p-8 backdrop-blur-md animate-pulse">
        <div className="h-4 w-32 bg-[#6db89b]/20 rounded mb-4" />
        <div className="h-8 w-72 bg-white/10 rounded mb-3" />
        <div className="h-4 w-96 max-w-full bg-white/5 rounded" />
      </div>

      {/* Skeleton grid cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-white/[0.06] bg-[#14221c]/50 p-6 backdrop-blur-sm animate-pulse space-y-3"
          >
            <div className="h-3 w-24 bg-white/10 rounded" />
            <div className="h-6 w-36 bg-white/15 rounded" />
            <div className="h-3 w-48 max-w-full bg-white/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
