// Transparency is a list of what can be verified, not a trust badge. Every item here is either a
// file in this repository or a constant that appears in it; nothing is fetched, so nothing can be
// stale without the build failing.

import Link from "next/link";

const ITEMS = [
  {
    label: "Chain",
    value: "Robinhood Chain 4663",
    note: "vault dan adapter hanya untuk chain ini",
  },
  {
    label: "Aset",
    value: "USDG, 6 desimal",
    note: "semua nominal di app adalah bigint 6 desimal, bukan float",
  },
  {
    label: "Share",
    value: "18 desimal",
    note: "share bukan uang; tidak pernah dijumlahkan dengan saldo USDG",
  },
  {
    label: "Artefak VaultV3",
    value: "runtimeKeccak256 0x6909c58e…",
    note: "bukti lengkap di docs/BASELINE.md dan scripts/verify-bytecode.py",
  },
  {
    label: "Status audit",
    value: "tidak diklaim",
    note: "audit upstream 2023 disebut dengan cakupan dan tanggal; pin 2026 tidak diaudit",
  },
  {
    label: "Kode",
    value: "packages/sdk, services/indexer, services/keeper",
    note: "angka di app berasal dari SDK yang membaca rantai, atau API yang menandai bloknya",
  },
];

export default function Page() {
  return (
    <div className="shell stack">
      <div className="flex items-center gap-2 text-xs font-mono text-[#8b929e] mb-2">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← Back to Vaults
        </Link>
        <span>/</span>
        <span className="text-[#f8f9fa]">Transparansi</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 backdrop-blur-sm shadow-xl">
        <span className="font-mono text-xs uppercase tracking-wider text-[#6db89b]">
          Transparansi & Verifikasi
        </span>
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa] mt-1">
          Yang bisa diperiksa
        </h1>
        <p className="mt-2 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl">
          Halaman ini tidak menampilkan angka uang. Angka uang hanya muncul di halaman vault, dengan
          blok dan sumbernya.
        </p>
      </header>

      <dl className="facts card">
        {ITEMS.map((item) => (
          <div key={item.label} style={{ display: "contents" }}>
            <dt>{item.label}</dt>
            <dd>
              <span className="money font-mono text-[#f8f9fa]">{item.value}</span>
              <div className="text-xs text-[#8b929e] mt-0.5">
                {item.note}
              </div>
            </dd>
          </div>
        ))}
      </dl>

      <div className="banner" data-tone="warn">
        <strong>Klaim yang tidak dibuat</strong>
        <p>
          Tidak ada label &ldquo;audited&rdquo;, tidak ada APY, tidak ada janji penarikan instan.
          Likuiditas segera bergantung pada kas idle dan antrean strategi; UI membedakan nilai posisi
          dari yang dapat ditarik sekarang.
        </p>
      </div>

      <p className="provenance">
        <Link href="/#vaults" className="text-[#6db89b] hover:underline">
          ← Kembali ke katalog
        </Link>
      </p>
    </div>
  );
}
