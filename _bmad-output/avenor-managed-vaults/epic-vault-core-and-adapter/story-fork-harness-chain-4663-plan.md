---
title: 'Build fork harness for chain 4663 with pinned block'
type: 'chore'
ticket: 3
created: '2026-11-19'
status: 'done'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/VENUE_INTEGRATIONS.md', 'docs/REFERENCE_CAPTURE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Semua klaim tentang venue (`steakUSDG`, likuiditas ~13,6%, `maxWithdraw`) harus diuji terhadap state chain nyata. Tanpa fork harness yang deterministik, test akan flaky dan angka likuiditas berubah setiap blok.

**Approach:** Harness Foundry `anvil --fork` ke chain `4663` dengan block pin, fixture alamat dari `packages/config`, helper whale/impersonate USDG, dan aturan bahwa tidak ada test yang bergantung pada block terbaru.

</frozen-after-approval>

## Implementation Notes

> **Koreksi rencana (2026-11-19):** dua keputusan awal di bawah diubah setelah harness ditulis.
> (1) Tidak ada helper `anvil` terpisah — `forge test` memilih fork sendiri lewat
> `vm.createSelectFork`, jadi satu perintah tetap cukup dan tidak ada port/proses yang bocor.
> (2) Nama env final: `FORK_RPC_URL` (override opsional) + `FORK_STRICT=true` (skip jadi gagal);
> `ROBINHOOD_RPC_URL`/`FORK_BLOCK_NUMBER` dibatalkan karena blok pin adalah konstanta, bukan
> pilihan runtime — membiarkannya bisa diubah mengundang "pin" yang berbeda antar run.
> (3) Whale USDG pakai `deal` saja: meng-impersonate holder nyata butuh `anvil_setBalance`
> dan tidak menambah bukti apa pun untuk adapter.

- Env: `FORK_RPC_URL` (opsional; endpoint archive yang masih melayani pin), `FORK_STRICT` (opsional).

> **Koreksi rencana kedua (2026-11-19, setelah tiket selesai):** perintah `forge test --match-path 'test/fork/*'`
> langsung ke RPC **tidak cukup**, dan tiga flag di bawah wajib. Semua ini ditemukan dengan
> membaca error, bukan ditebak (detail di §Blocker):
>
> 1. `--hardfork cancun`. Default toolchain `london` membuat bytecode venue (`PUSH0`) halt pada
>    opcode yang belum aktif: `EvmError: NotActivated`. `NotActivated` adalah `HaltReason` revm,
>    bukan error RPC. Jangan "memperbaiki" ini lewat `evm_version` di `foundry.toml` — itu mengubah
>    bytecode kontrak kita dan membatalkan bukti reproduksi `0.8.18`.
> 2. `--fork-state-by-number`. `forge` 1.9 mengirim parameter blok EIP-1898 berbentuk *object*
>    (`{"blockHash":…,"requireCanonical":false}`); `drpc` dan `solidrpc` menolaknya dengan
>    `json: cannot unmarshal object into Go value of type string` (`-32601`).
> 3. `--fork-url http://127.0.0.1:<port>`. `forge` 1.9 memanggil `eth_getAccountInfo` saat memulai
>    fork; endpoint publik tidak punya method itu, `anvil` punya. Jadi `scripts/fork-test.py`
>    menyalakan `anvil --fork-url <archive> --fork-block-number 118337511 --chain-id 4663`,
>    memverifikasi fingerprint lewat `eth_call totalAssets` di anvil lokal itu, lalu meneruskan ke
>    `forge` dengan tiga flag di atas. State tetap berasal dari node; anvil hanya menghapus quirk RPC.
>
> Env yang dipakai sekarang: `FORK_RPC_URL` (archive yang masih melayani pin), `FORK_EXTRA_RPCS`
> (cadangan, ikut diprobe), `FORK_STRICT` (default `true` di `scripts/fork-test.py`).
- `anvil --fork-url $ROBINHOOD_RPC_URL --fork-block-number $FORK_BLOCK_NUMBER --chain-id 4663`.
- Fixture: USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 desimal), `steakUSDG` `0xBeEff033F34C046626B8D0A041844C5d1A5409dd`. Alamat ada di config, bukan hard-coded di test.
- Whale USDG: cari holder besar lewat `balanceOf` pada beberapa kandidat (vault venue, alamat treasury) atau gunakan `deal` cheatcode dengan `adjust` agar `totalSupply` konsisten. Prefer `deal` + `stdstore` hanya bila perlu.
- Assertion lingkungan sebelum test berjalan: `USDG.decimals() == 6`, `venue.asset() == USDG`, `venue.totalAssets() > 0`. Bila gagal, test abort dengan pesan jelas (state fork berubah / alamat salah).
- Cache state fork (`--fork-cache`) agar CI tidak memukul RPC terus-menerus; dokumentasikan cara refresh cache.
- Jangan pernah menjalankan `--broadcast` pada fork mainnet tanpa `--dry-run` review.

## Bukti yang sudah ada di repo (2026-11-19)

| Artefak | Isi |
|---|---|
| `packages/contracts/test/fork/ForkBase.sol` | Konstanta pin (`118337511`, ts `1795103654`), alamat USDG/`steakUSDG`/TS impl/holder nyata, `_selectPinnedFork()`, `_requirePinnedFork()` (skip loud / revert bila `FORK_STRICT`), `_dealUsdg()` |
| `packages/contracts/test/fork/VenueProbe.t.sol` | 6 test observasi: fingerprint pin, desimal 6 vs 18, `maxDeposit(fresh)=0`, holder 8,2 juta share punya nilai tapi `maxWithdraw=0`, `withdraw` di atas likuiditas revert, `TS_IMPL.code.length == 18224` |
| `scripts/fork-status.py` | Probe semua RPC dari `packages/config/4663.json`: apakah blok pin masih dilayani + cocok fingerprint; exit 1 bila tidak ada. Ini yang membuat "test skip" bisa dijelaskan, bukan ditebak |

Determinisme dijaga lewat **fingerprint state**, bukan trust ke nomor blok: `_selectPinnedFork()` menolak fork bila `totalAssets`/`totalSupply` `steakUSDG` tidak sama dengan nilai yang tercatat. Nomor blok saja bisa "benar" sementara node menyajikan state lain (terlihat: `forge` sempat melaporkan `block.number = 26450152` dengan `timestamp` pin).

## Blocker yang ditemukan saat menulis harness — semuanya sudah ditutup

1. **Blok pin dipangkas node gratis — SELESAI.** `publicnode` menolak archive (`Archive requests require a personal token`), `thirdweb` menolak state historis, `drpc` memangkas pin ini (`Unknown state. First available state is 1`; jendranya hanya ~150-200 blok ≈ 60-70 detik pada ~3 blok/detik). Yang masih melayani (2026-11-19, keyless): `https://rpc.solidrpc.io/public/evm/4663` dan `https://robinhood.api.onfinality.io/public`. Keduanya tercatat di `packages/config/4663.json` (`_meta.rpc`) dan `.env.example`; yang mati dipindah ke `retired` supaya tidak dipakai lagi. `_requirePinnedFork()` tetap **skip loud** secara default; `scripts/fork-test.py` menyalakan `FORK_STRICT=true`.
2. **State tidak konsisten untuk blok yang sama — SELESAI, dengan penjelasan.** Dua penyebab nyata: (a) `NotActivated` karena hardfork default `london` (venue memakai `PUSH0`) — bukan state salah; (b) pin dibandingkan dengan `block.number`, padahal chain `4663` adalah Arbitrum Orbit: `block.number` = tinggi L1 (`26450152`), tinggi L2 = `ArbSys(0x64).arbBlockNumber()` = `118337511`. `ForkBase` sekarang meng-assert `_arbBlockNumber() == PIN_BLOCK`. Fingerprint `totalAssets` + `totalSupply` tetap jadi pengaman kedua.
3. **`forge test --offline` tidak mematikan fork RPC** — tetap benar, dan tetap tidak menolong: yang gagal adalah ketersediaan state + capability RPC, bukan resolusi dependency.

## Acceptance Evidence

1. **Terpenuhi.** `python scripts/fork-test.py` 6/6 PASS dua kali berturut-turut pada blok `118337511`: run 1 `71,76s`, run 2 `94,45s`. Setiap run mencetak pin, endpoint (diredaksi), fingerprint `steakUSDG.totalAssets = 538856055994280`, dan baris `local fork : state at pin reproduced`; `forge` hanya dijalankan setelah fingerprint cocok.
2. **Terpenuhi.** Bila pin tidak bisa dilayani siapa pun, script berhenti dengan `BLOCKED: no endpoint could serve the pinned state to a local fork.` plus path log `anvil`, exit code 1 — bukan hijau palsu.
3. **Terpenuhi.** `packages/config/4663.json` memuat USDG, `steakUSDG`, `observed_at{blockNumber,blockTimestamp,blockHash}`, `snapshot.idleUsdg`, dan blok `liquidity` berisi seluruh probe `maxWithdraw`/`withdraw`/`redeem` beserta `Panic(0x11)`.
4. **Terpenuhi.** Test hanya memakai RPC (`eth_call`/`eth_getCode`/fork state); tidak ada panggilan explorer.
5. **Temuan sampingan yang mengubah kode:** probe venue membuktikan `venue.maxWithdraw()` = `0` padahal kas idle `27.024.457,979514` USDG dan seluruh posisi bisa ditebus. Adapter yang memakai getter itu akan menolak penarikan yang sebenarnya bisa dilayani. Diperbaiki: `MorphoVaultStrategy._venueLiquidity() = min(convertToAssets(balanceOf(this)), USDG.balanceOf(venue))`, dipakai `_freeFunds` dan `availableWithdrawLimit`; dikunci `MockVenue.setMaxWithdrawLies()` + dua unit test baru (`forge test --match-path 'test/unit/*'` → 65 pass) dan `VenueProbe.test_maxWithdrawIsZeroButIdleCashCoversThePosition`.

   Per 2026-11-20 probe yang sama juga membuktikan dua hal lain yang mengubah adapter: `venue.maxDeposit()` membalas `0` untuk semua alamat sambil menerima `deposit(10_000e6)` (jadi nol tidak boleh dipercaya), dan `venue.withdraw()` mengembalikan share yang dibakar, bukan asset (jadi payout diukur lewat delta saldo). Payload revert di atas kas idle tidak di-pin karena tidak stabil antar-run. Suite fork kini 11 test (`VenueProbe` 7 + `VaultE2E` 4), semuanya hijau pada pin yang sama.

## Out of Scope

- Deploy script.
- Test invariant (epic 3).