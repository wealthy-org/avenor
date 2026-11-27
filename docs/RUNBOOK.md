# RUNBOOK

Prosedur insiden vault Avenor. Setiap kode alert dari keeper (`docs/KEEPER.md` §7) menaut ke
`<RUNBOOK_BASE_URL>#<kode>` di halaman ini, jadi judul anchor harus tetap sama.

Aturan yang berlaku untuk semua prosedur:

- Uang dalam `uint256` 6 desimal. Jangan pernah mengetik nominal dari ingatan; ambil dari
  `eth_call` dan catat bloknya.
- `setPaused(true)` **memblokir penarikan**. Itu bukan tombol "aman"; hanya untuk insiden aktif
  (venue dieksploitasi, akuntansi tidak bisa dipercaya).
- Freeze deposit memakai `set_deposit_limit` atau `DepositCapHook`, bukan pause.
- Setiap tindakan darurat dicatat: blok, tx hash, timestamp, siapa, dan alasan. Tanpa catatan itu,
  tindakan tidak dianggap terjadi.
- Tidak ada penyelesaian yang diumumkan tanpa `python scripts/verify-all.py` hijau.

Peran yang dipakai di bawah (lihat `docs/ROLE_PERMISSION_MATRIX.md`):

| Peran | Pemegang | Bisa apa |
| --- | --- | --- |
| `GOVERNANCE` | Timelock 48 jam | semua setter parameter, penugasan role, strategi baru |
| guardian Safe → timelock 6 jam | Guardian | **hanya** `FORCE_REVOKE_MANAGER` (ADR-12 fast lane) |
| `EMERGENCY_MANAGER` | Safe guardian | `setPaused(true/false)`, `shutdown_vault` (emergency shutdown langsung) |
| `REPORTING_MANAGER` | keeper | `process_report` |
| `DEBT_MANAGER` | keeper | `update_debt`, `set_auto_allocate` (dan otomatis diterima oleh pemanggil `shutdown_vault`) |

---

## A. `vault-paused` — penarikan berhenti

**Gejala.** Dengan `isPaused = true`, `maxWithdraw` vault menjadi 0 dan `redeem` revert. Nilai posisi
tetap ada; yang hilang adalah kemampuan keluar. UI wajib menampilkan ini sebagai "penarikan
dihentikan", bukan "saldo 0".

**Langkah.**

1. Konfirmasi: `cast call <vault> "isPaused()(bool)" --block <n>`; catat blok.
2. Tentukan siapa yang mem-pause dan mengapa: `UpdatePaused` event (topic
   `0x7fa27d7f…`, lihat `services/indexer/src/decode.ts`).
3. Perbaiki penyebabnya **sebelum** unpause. Unpause pada venue yang masih rusak hanya memindahkan
   kerugian ke penarik pertama.
4. Fix: `setPaused(false)` dari `EMERGENCY_MANAGER`.
5. Verifikasi: `maxWithdraw` > 0 atau `totalIdle` > 0, lalu lakukan `withdraw` kecil (mis. 1 USDG)
   dari akun uji dan catat tx hash-nya.

**Target.** Diagnosis ≤ 15 menit; unpause ≤ 60 menit dari perbaikan penyebab.

## B. `vault-shutdown` / migrasi

**Gejala.** `isShutdown = true`. `deposit_limit` menjadi 0, `deposit_hook` dibersihkan,
`msg.sender` mendapat `DEBT_MANAGER`, dan `update_debt` hanya menerima 0 (menarik semua dari
strategi). Deposit berhenti permanen; penarikan tetap jalan dari kas idle.

**Langkah.**

1. Tarik semua dana dari strategi: `update_debt(strategy, 0, 0)`. Saat shutdown, `new_debt` dipaksa 0
   oleh vault, jadi nilai selain 0 tidak berarti apa-apa — tetap tulis 0 supaya jelas.
2. Tunggu `totalIdle ≈ totalAssets`. Bila strategi tidak bisa melepas dana (venue illiquid),
   itu bukan bug keeper: catat dan eskalasi.
3. Umumkan: deposit ditutup, penarikan dibuka, tidak ada operasi baru. Jangan pernah menyebut
   shutdown sebagai "pause sementara".
4. Migrasi queue bila perlu; `set_default_queue` menolak strategi tidak aktif (`"!inactive"`), jadi
   revoke dulu.

**Target.** Semua dana idle ≤ 2 jam setelah shutdown diputuskan, atau eskalasi tertulis bila venue
menolak.

## C. `total-assets-moved` — lonjakan gain/loss

**Gejala.** `totalAssets` bergerak lebih dari `MAX_ASSETS_DELTA_BPS` dalam satu tick monitor.

1. Ambil `totalAssets`, `totalSupply`, `totalIdle`, `totalDebt`, dan `strategies(strategy)` pada dua
   blok (sebelum dan sesudah) — bukan dari API indexer saja.
2. Rekonsiliasi: `python scripts/db-test.py` membuktikan mesinnya; untuk data nyata jalankan
   `reconcile()` pada blok tersebut dengan `toleranceBps` yang wajar. Supply harus **eksak**.
3. Bila penurunan berasal dari venue: cek apakah `report` tertunda. Jangan panggil
   `turnOffHealthCheck` untuk "melewati" loss — `Accountant.report` revert `"too much loss"` adalah
   alarm, bukan penghalang.
4. Bila kenaikan tidak bisa dijelaskan: curigai share price manipulation / donation. Hentikan keeper
   (`touch .keeper-stop`), lalu eskalasi ke governance.

**Target.** Penjelasan tertulis (blok + angka) ≤ 30 menit.

## D. `no-withdrawal-capacity` / `liquidity-warning` — Likuiditas venue turun

**Gejala.** `maxWithdraw` vault turun; `withdraw` menarik dana dari venue dan bisa mengurangi debt.
Ingat: `maxWithdraw` **venue** tidak dipakai sebagai sinyal (bisa 0 walau likuid).

1. Ukur tiga angka terpisah, jangan digabung: `totalIdle`, `maxWithdraw(vault, owner)`, dan
   `maxRedeem`. UI wajib membedakan "nilai posisi" dan "dapat ditarik sekarang".
2. Bila `totalIdle` cukup untuk penarikan kecil, tidak ada tindakan darurat. Jangan pause.
3. Bila venue benar-benar tidak bisa melepas dana: catat, umumkan waktu tunggu yang jujur
   (bukan "instan"), dan pertimbangkan `FORCE_REVOKE_MANAGER` lewat timelock 6 jam (ADR-12).
   Ingat konsekuensinya: `force_revoke` menulis-off seluruh `current_debt` sebagai loss, **tidak**
   membakar share, dan share price bisa menjadi 0 bila seluruh aset ada di strategi itu
   (`docs/FEE_CONFIG.md` §7).
4. Setelah venue pulih: `report` untuk mengakui gain, lalu alokasi ulang.

**Target.** Komunikasi ke pengguna ≤ 30 menit; keputusan revoke ≤ 6 jam (batas timelock).

---

## E. `report-stale` — Laporan Yield Terlambat / Tertunda (>24 Jam)

**Gejala.** Monitor mendeteksi `block.timestamp - lastReport > 86400`. Share price tidak terbarui dan yield belum terakumulasi ke vault.

1. **Periksa Saldo Gas Keeper:** Jalankan `cast balance <KEEPER_ADDRESS> --rpc-url <RPC>`. Bila saldo < 0.01 ETH, segera lakukan isi ulang (top-up).
2. **Periksa Log Eksekusi:** Buka log container/layanan keeper (`services/keeper`). Cek apakah transaksi `process_report` revert dengan `"too much gain"` atau `"too much loss"` (lihat Prosedur H).
3. **Periksa Status Proses:** Bila proses berhenti atau unhandled exception, jalankan Prosedur F (Keeper Crash Recovery).
4. **Manual Report Fallback:** Bila proses keeper terhambat tetapi transaksi valid, pemegang peran `REPORTING_MANAGER` dapat memicu report langsung:
   ```bash
   cast send <VAULT_ADDRESS> "process_report(address)(uint256,uint256)" <STRATEGY_ADDRESS> --private-key <KEEPER_KEY>
   ```

**Target.** Diagnosis ≤ 15 menit; report kembali normal ≤ 60 menit.

---

## F. `keeper-crash` / `keeper-heartbeat` — Layanan Keeper Berhenti atau Nonce Macet

**Gejala.** Endpoint `/health` keeper tidak membalas (`status != ok`), transaksi tertahan berstatus pending di mempool (in-flight transaction guard aktif terus), atau terjadi nonce collision.

1. **Inspeksi Nonce:** Bandingkan nonce lokal vs on-chain:
   ```bash
   cast nonce <KEEPER_ADDRESS> --rpc-url <RPC>
   ```
2. **Atasi Transaksi Macet:** Bila ada transaksi pending berjam-jam akibat kenaikan gas tip:
   Kirim transaksi replacement (0 ETH ke diri sendiri) dengan nonce yang sama dan prioritas gas lebih tinggi (+20%):
   ```bash
   cast send <KEEPER_ADDRESS> --value 0 --nonce <PENDING_NONCE> --priority-gas-price 2gwei --private-key <KEEPER_KEY>
   ```
3. **Restart Service:** Restart proses keeper melalui systemd/pm2/docker:
   ```bash
   npm run start --prefix services/keeper
   ```
4. **Verifikasi:** Periksa endpoint `/health` mengembalikan status `ok`, dan log monitor menunjukkan siklus berjalan normal tanpa duplikasi nonce.

**Target.** Pemulihan transaksi dan restart proses ≤ 10 menit.

---

## G. `rpc-lag` / `rpc-outage` — Gangguan Endpoint RPC atau Sequencer Lag

**Gejala.** RPC primer mengembalikan HTTP 429/5xx, timeout, atau ketinggian blok tertinggal jauh (>50 blok) dari L2 Arbitrum Orbit sequencer.

1. **Pemeriksaan Multi-RPC:** Indexer dan Keeper Avenor dilengkapi viem fallback transport lintas endpoint (`FALLBACK_RPC_URLS`). Pastikan fallback RPC aktif dan melayani chain ID `4663` / `46630`.
2. **Rotasi Endpoint:** Bila seluruh endpoint publik mengalami rate limit atau Cloudflare 403, ubah URL RPC di konfigurasi lingkungan (`.env`) ke penyedia privat/dedicated.
3. **Sequencer Outage:** Bila jaringan Robinhood Chain L2 sequencer berhenti memproduksi blok (outage global):
   - Jangan spam transaksi.
   - Amankan vault dengan memantau saldo idle saat jaringan pulih kembali.

**Target.** Failover otomatis < 5 detik; intervensi manual penyedia RPC ≤ 15 menit.

---

## H. `valuation-drift` — Laba / Rugi Melebihi Health Check Accountant

**Gejala.** Keeper gagal mengeksekusi report karena `Accountant` revert dengan `"too much gain"` (>500 bps) atau `"too much loss"` (>200 bps).

1. **Investigasi Angka:** Jangan pernah mematikan health check (`turnOffHealthCheck`) secara terburu-buru! Health check revert adalah pelindung utama dari inflasi palsu atau depeg venue.
2. **Audit Saldo Riil:** Baca saldo kas Morpho venue dan posisi underlying:
   - Hitung selisih aset: `newTotalAssets` vs `current_debt`.
   - Periksa apakah pergerakan disebabkan oleh donasi token, reward distribution, atau haircut kredit di pasar peminjam.
3. **Keputusan Tata Kelola:**
   - Bila gain/loss terbukti valid dan wajar: jadwalkan penyesuaian parameter `maxGain`/`maxLoss` melalui TimelockController 48 jam.
   - Bila terindikasi exploit atau manipulasi share price: segera koordinasikan penghentian deposit (Prosedur B / Freeze) dan isolasi venue.

**Target.** Verifikasi numerik on-chain ≤ 30 menit; eskalasi proposal tata kelola ≤ 24 jam.

---

## I. `key-compromise` — Kebocoran Kunci Privat Operator atau Keeper

**Gejala.** Terdeteksi aktivitas transaksi mencurigakan dari alamat keeper atau dugaan kebocoran private key operator.

1. **Kebocoran Kunci Keeper:**
   - Guardian Safe atau Timelock segera mencabut peran bit `96` (`DEBT_MANAGER` dan `REPORTING_MANAGER`) dari alamat keeper yang bocor:
     ```solidity
     vault.set_role(compromised_keeper, 0);
     ```
   - Generate keypair baru secara offline, kirim seed gas, dan beri wewenang peran `96` ke alamat baru.
2. **Kebocoran Kunci Signer Safe:**
   - Karena Safe tata kelola beroperasi dengan ambang multi-sig (2/3 di testnet, 3/5 di prod), satu kunci bocor **tidak dapat** mengeksekusi transaksi sendirian.
   - Pemilik Safe lainnya segera mengeksekusi `swapOwner` untuk mencabut signer yang bocor dan menunjuk signer pengganti.
3. **Kebocoran Deployer EOA:**
   - Verifikasi melalui `python scripts/check-handover.py`: pastikan deployer sudah memegang 0 peran pada vault (`roles(deployer) == 0`).

**Target.** Pencabutan peran keeper ≤ 15 menit; swap owner Safe ≤ 60 menit.

---

## J. `orderly-shutdown` — Penutupan Permanen Vault dan User Exit

**Gejala.** Keputusan resmi untuk menghentikan operasional vault atau migrasi arsitektur secara total.

1. **Pemicu Shutdown:** Governance Timelock memanggil `vault.shutdown_vault()`.
   - Efek otomatis kontrak: `deposit_limit` menjadi 0 (deposit ditutup permanen), `deposit_hook` dihapus, dan pemanggil menerima peran `DEBT_MANAGER`.
2. **Repatriasi Seluruh Modal ke Kas Idle:**
   - Panggil `vault.update_debt(strategy, 0, 0)` untuk menarik 100% modal dari Morpho strategy kembali ke kas idle vault.
3. **Verifikasi Kas Idle:**
   - Pastikan `totalIdle == totalAssets`. Semua dana kini berada aman di dalam kontrak Vault.
4. **Penarikan Pengguna (User Exit):**
   - Penabung dapat memanggil `withdraw` atau `redeem` kapan saja tanpa batas waktu, tanpa haircut, dan tanpa slippage langsung dari kas idle.

**Target.** Penutupan deposit instan; 100% modal ditarik ke kas idle ≤ 2 jam.

---

## Drill (HITL) — status: DIEKSEKUSI & TERVERIFIKASI (FORK LOKAL ANVIL)

> **Status provenance:** Drill di bawah ini dijalankan di **fork lokal anvil** dari state chain `4663` (bukan transaksi di chain `4663` atau testnet `46630`). Tinggi blok yang dipakai milik run chain lokal. Prosedur dan hasil drill tetap berlaku sebagai latihan runbook operasional yang valid; bukan bukti deploy testnet/mainnet.

Empat drill di bawah adalah bagian dari tiket epik 6 T4 dan **telah dieksekusi** pada staging fork pin `118337511` menggunakan `packages/contracts/script/ExecuteDrills.s.sol`. Bukti on-chain lengkap tercatat di [`docs/DRILL_EVIDENCE.md`](DRILL_EVIDENCE.md).

| Drill | Prosedur | Target waktu | Bukti tercatat | Status |
| --- | --- | --- | --- | --- |
| D1 pause/unpause | A | diagnosis ≤ 15 mnt, unpause ≤ 60 mnt | Blok 26450185, `maxWithdraw` 0 saat pause, withdraw uji 1 USDG sukses pasca unpause | LULUS (fork lokal; testnet belum) |
| D2 force revoke lewat fast lane | D langkah 3 | ≤ 6 jam | Blok 26450195 (schedule) & 26457395 (execute 6h emergency timelock), `current_debt` = 0 | LULUS (fork lokal; testnet belum) |
| D3 penurunan likuiditas venue | D | komunikasi ≤ 30 mnt | Pengukuran 3 angka terpisah (idle, maxWithdraw, maxRedeem) pada blok 26450185 & 26450195 | LULUS (fork lokal; testnet belum) |
| D4 shutdown + migrasi | B | dana idle ≤ 2 jam | Blok 26457395 (`shutdown_vault` oleh guardian), 100% aset ditarik ke kas idle (`1099000000`) | LULUS (fork lokal; testnet belum) |

Prasyarat drill: vault hasil `Deploy.s.sol` pada fork pin `118337511` (bukan mainnet), akun uji,
keeper dalam mode sekali-jalan, dan satu manusia yang menandatangani hasilnya. Drill D2 juga
menutup gap T2 (dry-run keeper terhadap vault yang dideploy).

Kriteria lulus per drill: waktu aktual ≤ target, tidak ada langkah yang harus ditemukan di tengah
insiden, dan setiap angka di catatan punya blok.

## Setelah insiden

1. Tambahkan tes regresi yang gagal sebelum perbaikan (TDD) bila penyebabnya bug kontrak/adapter.
2. Perbarui ambang monitor bila alarm terlambat/terlalu sering — perubahan ambang adalah perubahan
   parameter dan harus masuk commit yang sama dengan `docs/KEEPER.md`.
3. Tulis postmortem dengan garis waktu berblok, bukan narasi.