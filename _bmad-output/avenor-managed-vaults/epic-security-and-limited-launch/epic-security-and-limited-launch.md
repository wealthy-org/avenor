---
type: epic
title: "Slice S6 — Security Review, Limited Launch & Transaction Proof"
parent: "initiative-avenor-managed-vaults"
covers: ["S6"]
status: draft
---

# Epic 7: Security Review, Limited Launch & Transaction Proof

## Intent
Meluncurkan produk yang klaimnya bisa dipertahankan di depan pengguna, auditor, dan regulator: temuan kritis nol, cap kecil yang bisa dinaikkan, dan bukti transaksi yang bisa diperiksa siapa pun.

## Outcome
Review keamanan eksternal selesai dengan remediasi terdokumentasi, launch terbatas dengan allowlist + cap, dan `docs/ACCEPTANCE_EVIDENCE.md` berisi alamat, tx hash, dan hasil verifikasi.

## Done When
1. Scope review tertulis (kontrak kita + konfigurasi + pin upstream), reviewer independen, dan laporan tersimpan.
2. Semua temuan critical/high ditutup atau diterima tertulis dengan alasan + mitigasi operasional.
3. Launch terbatas: `deposit_limit` kecil, `DepositCapHook` allowlist aktif, `minimum_total_idle` menahan buffer, monitoring siaga.
4. Bukti transaksi: deposit, report, withdraw (termasuk satu penarikan parsial) tercatat dengan hash + screenshot + state sebelum/sesudah.
5. `docs/ACCEPTANCE_EVIDENCE.md` final; semua tautan dokumen di app menunjuk file yang ada.
6. Komunikasi risiko terbit: apa yang dijamin, apa yang tidak (loss venue, pause, likuiditas, fee).

## Boundaries
- Tidak menaikkan cap sebelum soak + review selesai.
- Tidak mengklaim "audited" untuk core versi 2026; hanya menyebut audit upstream 2023 dengan cakupan yang benar.
- Tidak ada janji hasil (yield pasti) dalam materi apa pun.

## Risiko
- Reviewer eksternal butuh waktu → mulai dari sekarang, jangan di akhir.
- Temuan high pada adapter bisa memaksa desain ulang `_freeFunds` → siapkan jalur "strategi tanpa penarikan parsial" sebagai fallback.
- Tekanan untuk meluncurkan tanpa cap → ditolak; ADR-5/ADR-7 adalah syarat, bukan saran.