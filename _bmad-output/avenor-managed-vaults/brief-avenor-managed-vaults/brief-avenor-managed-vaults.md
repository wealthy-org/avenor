---
type: brief
title: "Product Brief — Avenor USDG Managed Yield"
status: draft
created: 2026-11-19
parent: "initiative-avenor-managed-vaults"
source: "../../avenor.md"
---

# Product Brief: Avenor — USDG Managed Yield

Dokumen ini merangkum brief induk `avenor.md` (18 Nov 2026) menjadi keputusan produk. Bila ada konflik, `avenor.md` menang; dokumen ini menjelaskan bagaimana kita memenuhinya.

## 1. Arahan brief yang tidak bisa dinegosiasikan

1. Fondasi kontrak = **Yearn V3 Allocator Vault**; Kassora hanya referensi produk/UX, bukan dependensi kontrak.
2. Produk pertama = **USDG Managed Yield** di Robinhood Chain.
3. Deliverable harus mencakup kontrak, integrasi yield source, app, indexer, keeper, role management, docs, dan bukti transaksi — landing page saja tidak cukup.
4. Dokumen wajib (§17): `BASELINE.md`, `REFERENCE_CAPTURE.md`, `ARCHITECTURE.md`, `ACCOUNTING.md`, `WITHDRAWAL_SEMANTICS.md`, `VENUE_INTEGRATIONS.md`, `FEE_CONFIG.md`, `ROLE_PERMISSION_MATRIX.md`.
5. Tidak boleh mengklaim deployed/audited tanpa bukti.

## 2. Terjemahan menjadi keputusan

| Arahan brief | Keputusan kita | Konsekuensi |
|---|---|---|
| Yearn V3 sebagai fondasi | pin `vaults-v3@f449264f` (API 3.1.1), core tidak dipatch | fitur di luar core ditolak |
| Kassora sebagai referensi UX | hanya struktur informasi (katalog → detail → transaksi → portfolio → transparency) | tidak menyalin visual/klaim; capture visual belum ada |
| Produk USDG | satu vault, satu asset, satu venue utama | tidak ada multi-asset di v1 |
| Deliverable lengkap | 7 epik (baseline → kontrak → accounting/peran → data plane → app → ops → launch) | tidak ada "demo dulu, sisanya nanti" |
| Dokumen §17 | 8 file di `docs/` sudah ditulis dari source | status: 8/8 ada, 3 tambahan (`SECURITY_DIFF`, `RUNBOOK`, `ACCEPTANCE_EVIDENCE`) masih terbuka |

## 3. Posisi terhadap Kassora (jujur)

- Kassora: pre-launch, unaudited, menawarkan enam mandat, mengklaim withdrawal tak pernah dipause, memakai virtual shares.
- Avenor: satu mandat sampai terbukti, tanpa klaim pause yang tidak bisa dipenuhi, tanpa virtual shares (core tidak punya), dengan disclosure likuiditas.
- Kita **tidak** lebih aman karena nama besar Yearn: pin 2026 belum diaudit, dan itu harus dikatakan.

## 4. Definisi sukses brief

1. Seseorang bisa deposit USDG, melihat posisinya, dan menarik — seluruhnya di mainnet, dengan bukti hash.
2. Seorang reviewer bisa membuka app + docs dan memverifikasi setiap klaim tanpa menghubungi tim.
3. Tidak ada satu pun klaim di app yang tidak punya baris pendukung di `docs/`.

## 5. Risiko tingkat brief

| Risiko | Status |
|---|---|
| Venue tunggal & likuiditas 13,6% | diketahui, ditampilkan, buffer idle |
| Belum ada audit untuk pin 2026 | diketahui, review eksternal dijadwalkan (epic 7) |
| Explorer/docs Robinhood tidak bisa diverifikasi dari host | diketahui, verifikasi via RPC + catat block |
| Godaan meniru klaim Kassora | dilarang eksplisit di `REFERENCE_CAPTURE.md` §1 dan PRD §4 |