import { parseVaultList } from "@/config/vaults";
import { shortAddress } from "@/lib/format";

// The catalog is intentionally boring: it lists what an operator configured and nothing else. No
// TVL, no APY, no "audited" badge — the three things this page cannot know at build time.
export default function Page() {
  let vaults;
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    return (
      <div className="stack">
        <h2>Vault tidak bisa dibaca</h2>
        <div className="banner" data-tone="danger" role="alert">
          <strong>Konfigurasi tidak valid</strong>
          <p>{error instanceof Error ? error.message : String(error)}</p>
          <p>Halaman ini tidak menampilkan vault tiruan sebagai gantinya.</p>
        </div>
      </div>
    );
  }

  if (vaults.length === 0) {
    return (
      <div className="stack">
        <h2>Belum ada vault</h2>
        <div className="banner" role="status">
          <strong>Tidak ada vault yang dikonfigurasi</strong>
          <p>
            Katalog kosong karena belum ada vault yang lolos gate untuk ditampilkan. Setel{" "}
            <code>AVENOR_VAULTS</code> hanya setelah vault benar-benar dideploy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="stack" style={{ gap: "var(--space-2)" }}>
        <span className="label">Katalog</span>
        <h2 style={{ margin: 0 }}>Vault USDG</h2>
        <p style={{ maxWidth: "var(--measure)", margin: 0 }}>
          Hanya vault yang sudah dideploy yang muncul di sini. Status, angka, dan alamat di halaman
          detail berasal dari rantai dan indexer, dengan nomor blok.
        </p>
      </div>

      <table className="data">
        <caption className="label" style={{ textAlign: "left", paddingBottom: "var(--space-2)" }}>
          {vaults.length} vault terkonfigurasi
        </caption>
        <thead>
          <tr>
            <th scope="col">Vault</th>
            <th scope="col">Alamat</th>
            <th scope="col">Fase</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {vaults.map((vault) => (
            <tr key={vault.address}>
              <td>{vault.label}</td>
              <td className="money" title={vault.address}>
                {shortAddress(vault.address)}
              </td>
              <td>
                <span className="pill">{vault.phase === "limited-launch" ? "limited launch" : "research"}</span>
              </td>
              <td>
                <a href={`/vaults/${vault.address}`}>Buka</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="banner" data-tone="warn">
        <strong>Yang belum ada di halaman ini</strong>
        <p>
          APY, TVL, dan label &ldquo;diaudit&rdquo; sengaja tidak ditampilkan: APY butuh data venue
          ber-timestamp, TVL butuh rekonsiliasi, dan audit hanya boleh disebut untuk pin dengan
          cakupan dan tanggal. Fase &ldquo;research&rdquo; berarti belum boleh menerima deposit publik.
        </p>
      </div>
    </div>
  );
}