---
title: "Execute limited launch with caps, allowlist and on-call"
type: 'implement'
ticket: 3
created: '2026-11-23'
status: 'in-progress'
baseline_revision: '6ae57dadd5e8c5f91784233f7bac7b901ed096de'
route: 'oneshot'
route_source: 'pinned'
risk: 'high'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: []
---

# Implementation Plan — Tiket 7.3: Execute limited launch with caps, allowlist and on-call

**Parent Epic:** Epic 7: Security Review, Limited Launch & Transaction Proof  
**Tiket:** 3 / 5 (`hitl: true`, `risk: high`)  
**Status:** in-progress (sebelumnya `done`, lihat §0)

---

## 0. Koreksi status (2026-12-01) — kembali ke `in-progress`

Dokumen ini sebelumnya bertanda `Status: done` / `Completed At: 2026-11-23`, dan filenya **tidak punya
frontmatter**, jadi `tickets.py` tidak pernah melihat statusnya: pohon tiket membaca 7.3 sebagai
`backlog` sementara file ini membaca `done`. Dua sumber, dua jawaban, keduanya tidak terhubung.

Yang membatalkan `done` bukan gaya penulisan, melainkan chain `4663` itu sendiri. Semua pemeriksaan di
bawah dijalankan ke `https://rpc.solidrpc.io/public/evm/4663` pada `2026-12-01`:

| Klaim di §2 dan §3 dokumen ini | Perintah | Hasil nyata |
|---|---|---|
| Dead shares dicetak ke vault | `eth_getCode(0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA, "latest")` | `0x` — tidak ada vault |
| Deposit limit dibuka timelock | `eth_getCode(0x2C328D592819524F741A88A18572372CCE196782, "latest")` | `0x` — tidak ada timelock |
| User deposit 1.000 USDG (§2, blok `118337652`) | `eth_getTransactionByHash(0xfa576557a5063be639a5b7be6b1bc247f671a79cd4d21eca0f0e8543d4ead1f5)` | `null` |
| User withdraw 200 USDG (§2, blok `118337656`) | `eth_getTransactionByHash(0xe9c8cd8d03aa752644e7b866c44ae57359602af0ef6c8f90c5bb47a5b5dc49db)` | `null` |
| Timelock menerima `role_manager` | `eth_getTransactionByHash(0x098f2f579b30833f099609e6c3a5aee339bc007e5620ab8510885a6ef1fe0779)` | `null` |
| Emergency timelock ada | `eth_getCode(0xf2Bf7C00B4696726B3c1f6E7b87d1a4acB050a8F, "latest")` | `0x` |
| Strategy ada | `eth_getCode(0xf070f5a2Ddf4d106502235597bd42fd9eDaF7bFE, "latest")` | `0x` |
| Accountant ada | `eth_getCode(0x47834D4241A7A5188A253CC0203AB49D4621a069, "latest")` | `0x` |
| Akun uji `0x235eAb…7A48` ada | `eth_getCode(0x235eAb7b5C1E62c23D8ed6D2e8C31c2ec7107A48, "latest")` | `0x` |
| Venue `steakUSDG` ada (kontrol positif) | `eth_getCode(0xBeEff033F34C046626B8D0A041844C5d1A5409dd, "latest")` | 21.808 byte — RPC menjawab, jadi hasil `0x` di atas bukan RPC rusak |

Blok `118337648/652/656` **ada** di chain `4663` (hash `0xb34cf605…c112b7`, `0xae696e06…b135f4`,
`0x84526784…cafc8`; timestamp `1795103668`, `1795103668`, `1795103669` = `2026-11-19T15:54:28Z`,
`…28Z`, `…29Z`), tetapi transaksi yang dokumen ini sebut terjadi di dalamnya tidak ada di chain mana pun
yang bisa dibaca. Kesimpulannya sama dengan `docs/ACCEPTANCE_EVIDENCE.md` §0: yang dijalankan adalah
**rehearsal fork anvil**, dan `packages/contracts/deployments/4663.stage.json` mencatatnya sendiri —
`"recordedOn": "anvil-fork"`, `blockNumber: 26450152` (chain lokal), bukan pin `118337511`.

Dua baris checklist di §3 yang paling merusak, karena keduanya mengklaim sesuatu yang dibantah dokumen
lain di repo ini:

- `[x] Soak test keeper 7 hari terverifikasi bersih` — `services/keeper/test/soak.test.ts` menjalankan
  168 siklus in-process dalam hitungan detik. Rencana tiket 6.5 (`story-seven-day-soak-with-keeper-metrics-plan.md`)
  sudah dikoreksi ke `in-progress` dan menyebut angka itu **bukan** soak. File ini belum ikut.
- `[x] Rehearsal deposit & withdrawal pengguna terverifikasi on-chain dan via Web App` — tidak ada satu
  pun hash-nya yang bisa dibuka, dan `docs/WEB_APP.md` §8 menulis bahwa deposit/withdraw belum pernah
  dijalankan terhadap vault terdeploy karena vault terdeploy belum ada.

Status `done` juga bertentangan dengan kriteria `verify` tiket ini di `tickets.toml`: "Deposit nyata
berhasil dalam cap; peran terverifikasi on-chain; timelock aktif; tidak ada alarm kritis 72 jam
pertama." Tidak satu pun dari empat klausa itu punya objek di chain `4663`.

---

## Sisa pekerjaan untuk `done`

- [ ] **Deploy nyata** `Deploy.s.sol` ke `4663` (blocker: `PROPOSER_ADDRESS`/`GUARDIAN_ADDRESS` wajib
      kontrak, `docs/DEPLOYMENT.md` §8) dan simpan `deployments/4663.<mode>.json` dengan hash blok.
- [ ] Seed dead shares di vault nyata; catat `totalSupply` sesudahnya.
- [ ] `accept_role_manager()` + `acceptManagement()` lewat TimelockController setelah 48 jam **wall-clock**.
- [ ] Buka deposit lewat `set_deposit_hook(hook, True)` dengan cap global `250.000 USDG` / wallet
      `25.000 USDG`; verifikasi `eth_call` `maxDeposit` per alamat uji.
- [ ] Deposit + withdraw 200 USDG oleh wallet asli, `max_loss = 0` eksplisit, tiga hash yang bisa dibuka.
- [ ] 72 jam pertama tanpa alarm kritis, dengan log keeper dari staging sungguhan.
- [ ] Update `docs/ACCEPTANCE_EVIDENCE.md` §3 dengan hash chain, bukan hash anvil.

Dokumen ini **tidak** dihapus dan tidak ditulis ulang: rehearsal fork yang dicatat di §2 tetap sah sebagai
rehearsal (angka, gas, dan hasilnya nyata terhadap bytecode kanonik). Yang berubah hanya klaimnya.

---

## 1. Konteks & Tujuan

Melakukan validasi peluncuran terbatas (*limited launch*) dengan kontrol ketat:
1. `deposit_limit` awal bertahap (dimulai dari cap konservatif 50.000 USDG).
2. Mekanisme penutupan deposit melalui `deposit_limit = 0` / `deposit_hook` (bukan `setPaused`).
3. Seed dead shares (1.000 USDG) untuk mencegah ERC-4626 inflation attack.
4. Peran TimelockController 48 jam dan Emergency Timelock 6 jam aktif.
5. Rehearsal transfer dan penerimaan `role_manager` oleh TimelockController 48 jam.
6. Rehearsal penarikan dwiarah (*bidirectional withdrawal*) dengan explicit `max_loss = 0`.
7. Keeper dan monitoring siaga tanpa alarm palsu.

---

## 2. Rehearsal Fork — hasil apa adanya (bukan chain record)

Kolom kiri adalah hasil eksekusi nyata terhadap bytecode kanonik di atas fork lokal pin `118337511`.
Kolom status **sebelumnya** `✅ Lolos` untuk semua baris; sekarang dibaca sebagai "berjalan di fork",
bukan "terjadi di `4663`".

| Komponen | Target | Hasil rehearsal | Nature |
|----------|--------|-----------------|--------|
| Dead Shares Seeding | 1.000 USDG | `1.000.000.000` base units dicetak ke vault | fork anvil |
| Deposit Limit Kontrol | Buka bertahap | Timelock `set_deposit_limit(50.000 USDG)`, blok lokal `118337648` | fork anvil |
| User Deposit Rehearsal | Deposit sukses | User `0x235eAb…` deposit 1.000 USDG, blok lokal `118337652` | fork anvil |
| User Withdrawal Rehearsal | Withdraw 200 USDG | withdraw 200 USDG dengan `max_loss = 0`, blok lokal `118337656` | fork anvil |
| Timelock 48h Handoff | Role Manager diterima | `accept_role_manager()` & `acceptManagement()` dieksekusi | fork anvil, detik bukan jam |
| Incident Drills (D1-D4) | 4 skenario lolos | Pause, 6h force-revoke, liquidity monitor, shutdown | fork anvil (`docs/DRILL_EVIDENCE.md`) |
| Web App Integration | Status & Portofolio | Portofolio user `800 avUSDG`, TVL `1.800 USDG` | node JSON-RPC skrip, bukan wallet |

---

## 3. Checklist Kesiapan Mainnet (Limited Launch Gate)

Semua baris kembali ke `[ ]`. Yang tetap `[x]` hanya yang bisa dibuktikan lokal tanpa chain `4663`.

- [x] Verifikasi toolchain dan bytecode matching (`verify-all.py`).
- [x] Dokumen cakupan audit independen (`docs/AUDIT_SCOPE.md`).
- [x] Register remediasi 12 temuan audit tertutup test regresi (`docs/REMEDIATION.md`).
- [ ] 4 Incident Drills tereksekusi dengan bukti on-chain (`docs/DRILL_EVIDENCE.md`) — awalnya `[x]`;
      drill berjalan di chain lokal `26450185/195/395`, bukan `4663`.
- [ ] Rehearsal deposit & withdrawal pengguna terverifikasi on-chain dan via Web App — awalnya `[x]`;
      ketiga hash mengembalikan `null` dan vault tidak punya kode.
- [ ] Timelock delay 48 jam untuk `accept_role_manager()` dan `acceptManagement()` tereksekusi — awalnya
      `[x]`; tidak ada timelock di `4663`, dan di fork delay 48 jam tidak pernah lewat.
- [ ] Soak test keeper 7 hari terverifikasi bersih (`services/keeper/test/soak.test.ts`) — awalnya `[x]`;
      yang ada 168 siklus in-process, lihat tiket 6.5.
- [x] Dokumen bukti penerimaan transaksi (`docs/ACCEPTANCE_EVIDENCE.md`) dan pengungkapan risiko
      (`docs/RISK_DISCLOSURE.md`) — dokumennya ada; provenance-nya sudah dikoreksi di §0 dokumen itu.

Gate ini tidak boleh ditutup sebelum `docs/DEPLOYMENT.md` §7 (`pendingActions`) kosong.
