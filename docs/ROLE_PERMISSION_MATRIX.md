# ROLE_PERMISSION_MATRIX — Avenor

Sumber kebenaran: `contracts/interfaces/Roles.sol` + `_enforce_role` di `VaultV3.vy@f449264f`. `ALL = 16383` = gabungan 14 bit. Tidak ada peran "owner"; kekuasaan tertinggi adalah `role_manager`.

## 1. Peta bit → fungsi (verified terhadap source)

| Bit | Role | Nilai | Fungsi yang dijaga (baris `VaultV3.vy`) |
|---|---|---|---|
| 0 | `ADD_STRATEGY_MANAGER` | 1 | `add_strategy` (:1764) |
| 1 | `REVOKE_STRATEGY_MANAGER` | 2 | `revoke_strategy` (:1773) |
| 2 | `FORCE_REVOKE_MANAGER` | 4 | `force_revoke_strategy` (:1787) |
| 3 | `ACCOUNTANT_MANAGER` | 8 | `set_accountant` (:1390) |
| 4 | `QUEUE_MANAGER` | 16 | `set_default_queue` (:1404), `set_use_default_queue` (:1423) |
| 5 | `REPORTING_MANAGER` | 32 | `process_report` (:1703) |
| 6 | `DEBT_MANAGER` | 64 | `update_debt` (:1819), **`set_auto_allocate` (:1438)**; juga didapat otomatis oleh pemanggil `shutdown_vault` (:1853) |
| 7 | `MAX_DEBT_MANAGER` | 128 | `update_max_debt_for_strategy` (:1798) |
| 8 | `DEPOSIT_LIMIT_MANAGER` | 256 | `set_deposit_limit` (:1453), `set_deposit_hook` (:1481) |
| 9 | `WITHDRAW_LIMIT_MANAGER` | 512 | `set_withdraw_hook` (:1505), `set_transfer_hook` (:1518) |
| 10 | `MINIMUM_IDLE_MANAGER` | 1024 | `set_minimum_total_idle` (:1531) |
| 11 | `PROFIT_UNLOCK_MANAGER` | 2048 | `setProfitMaxUnlockTime` (:1550) — camelCase di Vyper |
| 12 | `DEBT_PURCHASER` | 4096 | `buy_debt` (:1719) |
| 13 | `EMERGENCY_MANAGER` | 8192 | `setPaused` (:1834), `shutdown_vault` (:1844) |

Catatan yang sering salah:

- `add_strategy` **tidak** memberi debt; dana hanya mengalir lewat `update_debt` (`DEBT_MANAGER`).
- `set_default_queue` mengubah urutan sumber likuiditas penarikan — ini fungsi setara "treasury routing", bukan konfigurasi kosmetik.
- `set_transfer_hook` bisa **memblokir transfer share** antar wallet. Bila dipakai untuk lockup/allowlist, efeknya setara penarikan tertahan (user tidak bisa memindahkan posisi) walau `withdraw` terbuka. Perlu keputusan produk eksplisit.
- `set_auto_allocate(true)` membuat setiap deposit langsung di-`_update_debt(default_queue[0], max, 0)` (`:695-696`): idle buffer habis sampai `minimum_total_idle`, dan alokasi jadi otomatis tanpa persetujuan keeper. Default Avenor: **`false`** (lihat `ARCHITECTURE.md` ADR-6). Bit-nya **`DEBT_MANAGER`, bukan `QUEUE_MANAGER`** (`:1438`) — dokumen ini sempat salah; dikoreksi 2026-11-20 lewat test `test_eachBitIsSufficientForItsOwnFunction`. Konsekuensinya: keeper hot wallet (pemegang `DEBT_MANAGER`) bisa menyalakan alokasi otomatis, jadi kekuatan keeper mencakup "menghabiskan idle sampai `minimum_total_idle` tanpa tx berikutnya". Itu diterima karena hasilnya diverifikasi publik, tapi harus disebut saat review.
- `set_deposit_hook(hook, override := False)` (`:1470`) **revert `"using deposit limit"`** bila `deposit_limit` belum `max`; dengan `override = True` ia justru menulis `deposit_limit = max` (`:1484-1489`). Jadi limit dan hook tidak bisa diset independen dalam satu urutan: set limit dulu, hook belakangan (atau sebaliknya) sesuai mana yang ingin berlaku. Diuji di `test_eachBitIsSufficientForItsOwnFunction`.
- Nama setter di Vyper sebagian camelCase: `setPaused`, `setName`, `setSymbol`, `setProfitMaxUnlockTime`. Indexer dan SDK tidak boleh menebak dari dokumentasi tahun 2023 (yang memakai snake_case).
- `shutdown_vault` mencabut `deposit_hook`, memaksa `deposit_limit = 0`, **dan memberi `DEBT_MANAGER` ke pemanggil** (`:1853-1857`). Siapa pun yang memegang `EMERGENCY_MANAGER` otomatis mendapat kendali alokasi setelah shutdown.
- `role_manager` bisa `set_role`/`remove_role` untuk siapa pun **tanpa timelock internal**. Jadi timelock hanya nyata bila `role_manager` itu sendiri adalah kontrak timelock.
- `transfer_role_manager` dua langkah (`future_role_manager` lalu `accept_role_manager`); tidak ada batas waktu paksa.
- `buy_debt` = jalur "menyerap bad debt dengan asset treasury" agar loss tidak dilaporkan. Memerlukan dana tunai treasury dan `DEBT_PURCHASER`.

## 2. Penugasan Avenor (rancangan, harus di-encode di deploy script)

Prinsip: **kunci panas tidak boleh memegang apa pun yang bisa memindahkan dana user.** Keeper hanya boleh melakukan hal yang hasilnya bisa diverifikasi publik dan dibatasi.

| Peran | Pemegang | Delay | Alasan |
|---|---|---|---|
| `role_manager` | `TimelockController` (OZ) dengan proposer = Safe 3/5 governance, executor = `TimelockExecutor` periphery | **48 jam** | semua perubahan peran harus terlihat sebelum berlaku |
| `ADD_STRATEGY_MANAGER`, `QUEUE_MANAGER`, `MAX_DEBT_MANAGER`, `MINIMUM_IDLE_MANAGER`, `ACCOUNTANT_MANAGER`, `PROFIT_UNLOCK_MANAGER`, `DEPOSIT_LIMIT_MANAGER`, `WITHDRAW_LIMIT_MANAGER`, `REVOKE_STRATEGY_MANAGER` | Timelock yang sama | 48 jam | perubahan parameter produk |
| `FORCE_REVOKE_MANAGER` | **yang berjalan sekarang:** Timelock 48 jam (`Roles.governanceRoleSet()`). Rancangan tabel ini: Safe 3/5 Emergency lewat `TimelockExecutor` | 48 jam (rancangan: 6 jam) | lihat catatan divergensi di bawah tabel |
| `EMERGENCY_MANAGER` | **Guardian Safe 3/5 terpisah**, diberikan langsung (tanpa timelock) | 0 | pause harus instan saat eksploit aktif; konsekuensinya penarikan ikut berhenti, jadi hanya untuk insiden |
| `REPORTING_MANAGER` | Keeper hot wallet (EOA, dana gas minimal) | 0 | report rutin; loss hanya bisa dilaporkan, bukan ditarik ke keeper |
| `DEBT_MANAGER` | Keeper hot wallet (alokasi rutin) **atau** `DebtAllocator` keeper | 0 | alokasi di dalam batas `targetRatio`/`maxRatio` |
| `DEBT_PURCHASER` | Treasury Safe (bukan keeper) | 0 | butuh kas nyata; hanya saat insiden |
| Strategi (`TokenizedStrategy.management`/`keeper`) | Keeper hot wallet untuk `tend()`, `management` = Timelock | 0 | `tend` tidak boleh butuh governance |

**Divergensi yang belum diputuskan (2026-11-20).** Tabel di atas menempatkan `FORCE_REVOKE_MANAGER` di Safe Emergency dengan delay 6 jam, tetapi `Roles.governanceRoleSet()` memberikannya ke Timelock 48 jam, dan `script/Deploy.s.sol` tidak mendeploy `TimelockExecutor` sama sekali (ADR-4 memakai OZ `TimelockController` langsung). Yang berjalan hari ini adalah versi 48 jam; itu lebih ketat, bukan lebih longgar, tetapi artinya **force revoke tidak bisa dilakukan lebih cepat dari 48 jam** — pernyataan "likuidasi strategi rusak tidak menunggu 48 jam" pada tabel tidak berlaku. Dua jalan keluar: ubah teks (terima 48 jam) atau deploy executor di epik 4. Selama belum diputuskan, test `test_forceRevokeSitsOnGovernanceTimelockWhileMatrixSaysEmergencySafe` mengunci perilaku sekarang dan menandai divergensinya.

Aturan keras:

1. Guardian `EMERGENCY_MANAGER` **tidak boleh** menjadi proposer timelock (mencegah satu tim menahan dana sekaligus mem-pause).
2. Keeper tidak boleh memegang `REVOKE_STRATEGY_MANAGER`; keeper compromise tidak boleh membuat strategi hilang.
3. Setiap grant/revoke peran menghasilkan event + catatan di changelog operasi, dengan tx hash.
4. Semua Safe = 3/5 dengan penandatangan berbeda; tidak ada satu orang yang memegang ≥3 kunci (uji dengan `getOwners` di deploy checklist).
5. `role_manager` wajib timelock **sebelum** deposit pertama dibuka. Vault dengan `role_manager` EOA = tidak boleh menerima deposit publik.

## 3. Matriks wewenang vs dampak user

| Aksi | Peran | Bisa memblokir deposit? | Bisa memblokir withdraw? | Bisa mengubah nilai posisi user? |
|---|---|---|---|---|
| `set_deposit_limit(0)` | `DEPOSIT_LIMIT_MANAGER` | ya | tidak | tidak |
| `set_deposit_hook` | `DEPOSIT_LIMIT_MANAGER` | ya (per wallet) | tidak | tidak |
| `set_paused(true)` | `EMERGENCY_MANAGER` | ya | **ya** | tidak (nilai tetap, akses hilang) |
| `shutdown_vault` | `EMERGENCY_MANAGER` | ya (permanen) | tidak | tidak |
| `update_debt` | `DEBT_MANAGER` | tidak | mempengaruhi likuiditas | ya (via gain/loss venue) |
| `process_report` | `REPORTING_MANAGER` | tidak | tidak | **ya** (mengakui gain/loss) |
| `force_revoke_strategy` | `FORCE_REVOKE_MANAGER` | tidak | tidak | **ya** (mengakui loss) |
| `set_accountant` | `ACCOUNTANT_MANAGER` | tidak | tidak | ya (fee) |
| `set_profit_max_unlock_time` | `PROFIT_UNLOCK_MANAGER` | tidak | tidak | ya (kecepatan realisasi gain) |
| `set_default_queue` | `QUEUE_MANAGER` | tidak | ya (urutan/efisiensi) | tidak langsung |
| `set_transfer_hook` | `WITHDRAW_LIMIT_MANAGER` | tidak | tidak langsung (transfer share bisa diblokir) | tidak |
| `set_auto_allocate` | **`DEBT_MANAGER`** | tidak | ya (idle habis → withdraw bergantung venue) | tidak langsung |
| `set_role` | `role_manager` | ya | ya | ya |

## 4. Test wajib

- Setiap fungsi di §1 revert untuk caller tanpa bit (fuzz: satu bit saja tidak cukup bila fungsi butuh bit lain). → `test/unit/RoleEnforcement.t.sol` (13 test): 21 fungsi role-gated ditolak `"not allowed"` untuk akun tanpa bit, 14 bit dibuktikan cukup untuk fungsinya sendiri, fuzz 1024 run membuktikan pengecekan bit eksak (bukan "roles != 0"), plus regresi efek samping `shutdown_vault`.
- `role_manager` EOA tidak bisa dipakai di deploy script produksi (assert di script, bukan hanya di dokumen).
- `shutdown_vault` memberi `DEBT_MANAGER` ke pemanggil (regression test, karena ini efek samping tersembunyi).
- Setelah `transfer_role_manager` step 1, peran lama tetap berlaku sampai step 2 (`accept_role_manager`).
- Timelock: grant/revoke peran tidak bisa dieksekusi dalam satu blok oleh satu kunci.