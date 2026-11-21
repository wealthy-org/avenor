# WITHDRAWAL_SEMANTICS — Avenor

Dokumen ini mengikat: (a) apa yang benar-benar dilakukan kontrak, (b) apa yang boleh dijanjikan UI, (c) kasus yang wajib punya test. Sumber: `VaultV3.vy@f449264f` (API `3.1.1`) dan `tokenized-strategy@48c53ab`.

## 1. Dua overload, dua default yang berbeda

```vyper
def withdraw(assets, receiver, owner, max_loss: uint256 = 0,       strategies: DynArray[address,10] = []) -> uint256
def redeem(shares,  receiver, owner, max_loss: uint256 = MAX_BPS,  strategies: DynArray[address,10] = []) -> uint256
```

| Jalur | Default `max_loss` | Arti | Konsekuensi |
|---|---|---|---|
| `withdraw` | `0` | **tidak boleh ada loss** | transaksi revert bila perlu realisasi loss > 0 |
| `redeem` | `10000` | **semua loss diterima** | user bisa menerima jauh lebih sedikit dari perkiraan |

Ini adalah jebakan utama produk ini. Aturan Avenor:

1. UI **tidak pernah** memakai default. Setiap transaksi mengirim `max_loss` eksplisit yang ditampilkan ke user sebagai angka assets dan persen.
2. Alur default produk: `withdraw`/`redeem` dengan `max_loss` dari kebijakan (awal: `0` untuk produk lending dengan venue likuid; bukan nilai permissive diam-diam).
3. `max_loss` mengukur **unrealised loss strategi saat penarikan**, bukan slippage DEX dan bukan perubahan `pps`. Ia tidak melindungi dari perubahan harga setelah quote.

## 2. Urutan sumber dana

`_redeem` (`:751-945`):

1. `assert not paused` (`:774`) — pause memblokir seluruh penarikan.
2. `withdraw_hook.available_withdraw_limit(owner, max_loss, queue)` bila hook dipasang.
3. Pakai `total_idle` lebih dulu. Bila cukup, selesai tanpa menyentuh strategi.
4. Bila kurang: iterasi queue (`strategies` yang dikirim user, atau `default_queue` bila `use_default_queue == true` atau array kosong), maksimal 10 entri (di luar itu revert — di luar kemampuan indexer; transaksi memakan gas lebih tinggi).
5. Per strategi:
   - `to_withdraw = min(butuh, current_debt)`
   - `unrealised_loss = _assess_share_of_unrealised_losses(strategy, current_debt, to_withdraw)` — loss ini dibebankan **ke penarik**, bukan ke depositor yang tinggal.
   - `strategy_limit = convertToAssets(IStrategy(strategy).maxRedeem(vault))` — batas likuiditas venue. Untuk strategi kita, `maxRedeem` ini dihitung `TokenizedStrategy` dari `availableWithdrawLimit` = idle + `min(nilai posisi venue, kas idle venue)`, **bukan** dari `venue.maxWithdraw()` (lihat §6).
   - Bila `max_loss < MAX_BPS` dan akumulasi loss melebihi `(have + to_withdraw) * max_loss / 10000`, loop berhenti (bukan revert) → penarikan parsial.
6. Selisih antara `assets` yang diminta dan yang berhasil dikumpulkan menjadi loss yang ditanggung penarik; `Transfer` shares terjadi, asset dikirim ke `receiver`.

Konsekuensi operasional: **likuiditas adalah properti waktu, bukan properti vault.** Kas idle `steakUSDG` (venue utama) = `27.024.457,979514 USDG` pada block `118337511` (≈5,0% TVL, lihat `VENUE_INTEGRATIONS.md` §4), jadi `maxWithdraw` user bisa jauh di bawah nilai posisinya. UI wajib menampilkan:

- `nilai posisi` (`convertToAssets(balanceOf)`)
- `dapat ditarik sekarang` (`maxWithdraw(owner)` vault, block terakhir + timestamp + `blockHash`)
- `estimasi waktu` bila > `maxWithdraw` (bergantung venue; status "unknown" bila tidak ada data)
- `loss toleransi` yang akan dikirim

Catatan yang mahal kalau salah: `maxWithdraw` di sini adalah getter **vault** kita. Getter venue di bawahnya tidak boleh dibaca langsung — pada block pin `steakUSDG.maxWithdraw(holder)` = `0` sementara `redeem` seluruh posisi 8,21 juta share berhasil membayar 8.328.471,0105 USDG. Adapter memakai batas terukur, dan unit test `MorphoVaultStrategy.t.sol::test_venueWithdrawLimitIsMeasuredNotReadFromMaxWithdraw` mengunci perilaku itu.

## 3. Pause vs shutdown (beda keras)

| Aksi | `paused = true` | `shutdown = true` |
|---|---|---|
| `deposit` | revert (`_max_deposit` → 0, `:535-537`) | revert permanen (`set_deposit_limit`/hook dilarang saat shutdown, `:1448-1452`, `:1480-1484`) |
| `mint` | revert | revert |
| `withdraw` / `redeem` | **revert** (`assert not self.paused`, `:774`) | **jalan normal** |
| `maxWithdraw` / `maxRedeem` | `0` (`:592` untuk withdraw; `maxRedeem` = 0 karena `min` dengan nol) | normal |
| `transfer` shares | tetap jalan | tetap jalan |
| `process_report` | **jalan** (tidak ada cek paused di `_process_report`) | jalan |
| `update_debt` | jalan untuk `increase_debt = false`; menambah debt diblokir (`:1016-1017`) | hanya boleh menarik (`decrease_debt`) |
| `add_strategy` | jalan (role-gated) | boleh, tapi tidak bisa didanai |

Karena itu, klaim "withdrawals never paused" (gaya Kassora) **tidak tersedia di Yearn V3 core**. Avenor mengambil kebijakan:

- **Freeze risiko baru = `deposit_limit = 0`** atau `deposit_hook` yang menolak deposit baru. Ini tidak menyentuh penarikan.
- **`setPaused(true)` hanya untuk insiden aktif** (mis. salah report/exploit), dengan konsekuensi jujur: penarikan ikut berhenti, dan UI menampilkannya sebagai "withdrawals suspended — incident mode" plus alasan dan ETA. Jangan pernah menjual produk dengan janji "exit selalu terbuka" bila jalur yang dipakai bisa mem-pause semuanya.
- `shutdown_vault()` = exit permanen: deposit mati, penarikan hidup, alokasi hanya recall. Ini jalur akhir produk, bukan tombol harian.
- Role `EMERGENCY_MANAGER` (bit 8192) memegang `setPaused` + `shutdown_vault`; `WITHDRAW_LIMIT_MANAGER` (512) memegang `set_withdraw_hook`.

## 4. Queue dan alokasi likuiditas

- `default_queue` maks 10 strategi (`MAX_QUEUE`), di-set `QUEUE_MANAGER`.
- `use_default_queue = true` memaksa semua penarikan lewat default queue; user tidak bisa memilih urutan. Untuk produk ini: **`true`**, supaya hasil tidak bergantung pada pemilihan user dan tidak ada front-running urutan.
- `minimum_total_idle` menahan buffer idle yang tidak bisa didebt-kan; ini alat utama menjaga exit cepat.
- `auto_allocate` (`:695-696`) mendorong seluruh idle baru ke `default_queue[0]` pada setiap deposit. Avenor memakai `auto_allocate = false`: alokasi harus lewat keeper/`DebtAllocator` agar ada jeda audit dan buffer idle tidak tergerus. Bila diaktifkan, `maxWithdraw` langsung bergantung pada venue saat deposit masuk — perilaku yang tidak boleh tersembunyi.
- Idle reserve bukan sumber yield kedua; ia biaya likuiditas. Tampilkan sebagai "liquidity buffer", bukan "strategy".

## 5. Alur UI yang mengikat (deposit & withdraw)

Deposit:

1. Baca `asset.balanceOf(user)`, `asset.allowance(user, vault)`, `maxDeposit(user)`, `previewDeposit(amount)`.
2. Tampilkan `maxDeposit = 0` sebagai alasan eksplisit (cap penuh / paused / shutdown), bukan tombol mati tanpa teks. Ini `maxDeposit` **vault**, bukan venue: `steakUSDG` membalas `0` sambil menerima deposit, jadi getter venue tidak boleh dipakai sebagai status kapasitas UI (`docs/VENUE_INTEGRATIONS.md` §4a).
3. `approve` jumlah persis; `approve(max)` hanya pilihan eksplisit dengan label risikonya.
4. Simulasi via `eth_call` (`previewDeposit` + `staticcall deposit` bila memungkinkan) dan tampilkan quote + block + timestamp.
5. Kirim tx; status: `pending` ≠ `confirmed`; setelah receipt, baca shares aktual dari event `Deposit`, bukan dari quote.
6. Tangani: wrong network, gas kurang, user reject, revert (`exceed deposit limit`, `cannot mint zero`), quote berubah, replacement tx, RPC gagal.

Withdraw:

1. Pilih input dalam `assets` atau `shares`; konversi dengan `previewWithdraw`/`previewRedeem`.
2. Baca `maxWithdraw(owner)` / `maxRedeem(owner)` **vault**; bila permintaan > batas, tawarkan jumlah maksimum, bukan membiarkan revert. Jangan menghitung ulang batas ini dari getter venue.
3. Tampilkan `max_loss` sebagai angka assets + persen, dengan opsi "0% (fail if loss)" sebagai default.
4. Kirim `withdraw(assets, receiver, owner, maxLoss)` atau `redeem(shares, ..., maxLoss)` dengan `strategies = []` (pakai default queue).
5. Setelah receipt, tampilkan assets yang benar-benar keluar (event `Withdraw`), shares dibakar, dan selisih terhadap estimasi.

## 6. Kasus test wajib (bukan opsional)

| # | Kasus | Ekspektasi |
|---|---|---|
| W1 | Idle cukup | tidak menyentuh strategi; `maxWithdraw == convertToAssets` |
| W2 | Idle kurang, 1 strategi likuid | recall tepat sebesar kebutuhan, sisa debt tetap |
| W3 | `maxWithdraw` < nilai posisi (venue cap) | `withdraw` penuh revert `max loss`; `redeem` parsial sesuai `max_loss` |
| W4 | `redeem` dengan default `max_loss = 10000` | loss terealisasi diterima; UI harus mencegah jalur ini tanpa persetujuan eksplisit |
| W5 | Unrealised loss di strategi + `max_loss = 0` | revert; user diberi tahu venue bermasalah, bukan "saldo hilang" |
| W6 | `paused = true` | `withdraw`/`redeem` revert, `maxWithdraw == 0`, `transfer` tetap jalan |
| W7 | `shutdown = true` | deposit revert; withdraw jalan; `update_debt` hanya recall |
| W8 | `withdraw_hook` membatasi | `available_withdraw_limit` menang atas perhitungan internal |
| W9 | Queue 10 strategi, kebutuhan melebihi total debt | penarikan parsial; sisa shares utuh |
| W10 | Penarikan di block yang sama dengan report | hasil deterministik; tidak ada profit ganda |
| W11 | `use_default_queue = false` + user mengirim urutan strategi sendiri | perilaku berbeda harus dilarang di produk (assert konfigurasi) |
| W12 | Dust/rounding ekstrem (1 unit) | tidak ada revert tak terduga, tidak ada shares gratis |
| W13 | `deposit_hook` menolak semua deposit (allowlist kosong atau cap 0) | `maxDeposit == 0`, `deposit` revert `exceed deposit limit`, tetapi `maxWithdraw`/`redeem` tetap penuh; dibuktikan `test/unit/DepositCapHook.t.sol::test_rejectEveryoneStillAllowsFullExit` dan `test_capOfZeroDoesNotBlockWithdrawals` |