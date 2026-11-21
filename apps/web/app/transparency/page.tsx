// Transparency is a list of what can be verified, not a trust badge. Every item here is either a
// file in this repository or a constant that appears in it; nothing is fetched, so nothing can be
// stale without the build failing.
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
    <div className="stack">
      <div className="stack" style={{ gap: "var(--space-2)" }}>
        <span className="label">Transparansi</span>
        <h2 style={{ margin: 0 }}>Yang bisa diperiksa</h2>
        <p style={{ maxWidth: "var(--measure)", margin: 0 }}>
          Halaman ini tidak menampilkan angka uang. Angka uang hanya muncul di halaman vault, dengan
          blok dan sumbernya.
        </p>
      </div>

      <dl className="facts card">
        {ITEMS.map((item) => (
          <div key={item.label} style={{ display: "contents" }}>
            <dt>{item.label}</dt>
            <dd>
              <span className="money">{item.value}</span>
              <div className="label" style={{ textTransform: "none", letterSpacing: 0 }}>
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
    </div>
  );
}