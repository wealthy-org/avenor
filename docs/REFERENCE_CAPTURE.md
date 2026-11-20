# REFERENCE_CAPTURE — Avenor

Register bukti observasi untuk tiga referensi brief §3. Tujuan: memisahkan **yang benar-benar terbaca** dari **yang diasumsikan**, supaya tidak ada angka referensi yang menyeberang ke produksi.

Metode: pengambilan read-only atas artefak yang tersimpan di `referensi/` (HTML build, source repo, PDF audit) + query API publik Morpho. Tidak ada transaksi wallet, tidak ada login, tidak ada inspeksi state desktop/mobile penuh.

## 1. Kassora (referensi produk/UX, bukan dependensi kontrak)

| Item | Bukti | Temuan |
|---|---|---|
| `https://kassora.org/` | `referensi/kassora.org/index.html`, 2.287 byte | Hanya shell SPA: `<title>KASSORA.org — On-Chain Investment Strategies</title>`, tanpa konten server-rendered. Tidak ada teks mandat, angka, atau label yang bisa dikutip. |
| `/app`, `/app/portfolio`, `/app/docs`, `/app/contracts` | 4 file, masing-masing **2.281 byte identik** | Semua route mengembalikan shell yang sama; isi dirender client-side. Tidak ada state yang tertangkap. |
| `kassora/kassora-overview` README | commit `a061e77` | Sumber klaim produk: deposit USDG → `kUSDG` (ERC-4626), curator mengalokasikan ke strategi ber-cap, guardian pause deposit **tanpa** mempause withdrawal, timelock 1 hari–2 minggu, performance fee hard-cap 30%, virtual shares anti inflation attack, status **pre-launch / unaudited / not deployed**. |

**Gap yang harus ditutup sebelum visual parity ditetapkan:**

1. Tidak ada screenshot desktop maupun mobile. Capture register visual (mobile 390×844, desktop 1440×900, minimal: landing, katalog, detail vault, portfolio, transparency) belum dibuat.
2. Tidak ada rekaman perilaku transaksi (quote, allowance, pending, receipt, error).
3. Tidak ada capture chart, tabel alokasi, atau panel governance.
4. Enam mandat yang disebut brief §3.1 hanya diketahui dari deskripsi brief, bukan dari capture. Jangan menyalin nama/urutan/ikon mandat Kassora.

**Konflik yang tercatat (brief §3.1):** website memasarkan enam mandat; README hanya menjelaskan USDG/kUSDG. Keduanya pre-launch. Untuk produk kita: katalog penuh boleh direncanakan, tetapi **hanya vault yang lolos gate §5 brief yang boleh menerima deposit**. Status `research`/`planned` tanpa CTA deposit, tanpa TVL, tanpa APY.

**Yang boleh diadopsi dari Kassora (lapisan informasi, bukan aset):** urutan katalog → detail (mandat, alokasi, fees, likuiditas, peran) → transaksi → portfolio → transparency. Klaim "withdrawals never paused" **tidak boleh** kita tiru tanpa implementasi khusus: pada Yearn V3 core, `setPaused(true)` memblokir `withdraw`/`redeem` dan `maxWithdraw` mengembalikan `0` (`VaultV3.vy:592`, `:774`). Lihat `WITHDRAWAL_SEMANTICS.md`.

## 2. Yearn (fondasi teknis)

| Item | Bukti | Temuan |
|---|---|---|
| Vault core | `referensi/yearn-vaults-v3/contracts/VaultV3.vy` (2.269 baris) | ERC-4626 + 14 role bitmask, accountant, hooks, queue maks 10 strategi, profit unlock, shutdown vs pause. |
| Factory | `contracts/VaultFactory.vy` | `MAX_FEE_BPS = 5000` (protocol fee maks 50%), `protocol_fee_config()` per vault, `protocol_fee_recipient`. |
| TECH_SPEC | `yearn-vaults-v3/TECH_SPEC.md` | Semantik deposit/withdraw/report/peran; dipakai sebagai dasar `ACCOUNTING.md`. |
| Tokenized Strategy | `referensi/tokenized-strategy/src/TokenizedStrategy.sol` @ `48c53ab` (tag `v3.1.1`) | `API_VERSION "3.1.1"`, `report()`, `tend()`, `shutdownStrategy()`, `maxRedeem(owner, maxLoss)`, `availableDepositLimit`. |
| Periphery | `vault-periphery/src/{managers,accountants,debtAllocators}` | `RoleManager`, `TimelockExecutor` (pembungkus `TimelockController` OZ), `Accountant` (performanceFee/refundRatio/maxGain/maxLoss/maxFee), `DebtAllocator` (targetRatio/maxRatio per strategi). |
| Router | `Yearn-ERC4626-Router` + audit ChainSecurity | Rute deposit/mint/withdraw multi-langkah dengan batas slippage. |

**Catatan versi (dikoreksi 2026-11-19):** sempat tercatat bahwa `API_VERSION` strategi tertulis `3.1.0` padahal tag `v3.1.1`. Itu berasal dari commit yang salah pin (`9b7a1811` = `v3.0.0-beta-29`). Pada pin yang benar (`48c53ab`, tag `v3.1.1`) `API_VERSION = "3.1.1"`, dan bytecode lokal cocok dengan implementasi on-chain (18.224 B, masked 18.171 B, 0 beda). Nomor tag tetap ≠ bukti; yang dipakai adalah keccak runtime dari artefak build kita.

## 3. Robinhood Chain

| Item | Bukti | Temuan |
|---|---|---|
| Chain ID | brief §3.3 + README Kassora | mainnet `4663`, testnet `46630`, gas ETH, explorer `robinhoodchain.blockscout.com`. |
| USDG | Morpho API (chain `4663`) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, symbol `USDG`, **decimals `6`**. Alamat cocok antara brief, README Kassora, dan API. |
| RPC | brief §3.3 | `https://rpc.mainnet.chain.robinhood.com`, `https://rpc.testnet.chain.robinhood.com`. Public RPC tidak dipakai untuk indexer/keeper. |
| Explorer API | `robinhoodchain.blockscout.com/api/v2/...` | Diblokir Cloudflare ("Just a moment..."). Verifikasi source on-chain belum bisa dilakukan dari host ini. |
| `docs.robinhood.com` | koneksi gagal | Sertifikat TLS kedaluwarsa terhadap jam host (2026-11-19) + redirect ISP ke `internetsehat.iconpln.net.id`. Konfigurasi token kontrak resmi belum terverifikasi langsung. |
| State chain (terverifikasi) | RPC `https://robinhood-rpc.publicnode.com` | `chainId=4663`, block `118337511`, timestamp `1795103654`, hash `0xbaa980abd65e0c748b3b5f69d2352b69dd33b03138179bf61c988137291ba0af`. |
| USDG on-chain | `eth_call` di block `118337511` | `symbol()="USDG"`, `decimals()=6`, `totalSupply()=622410599910270` (622.410.599,91 USDG). |
| Pra-infrastruktur Yearn di `4663` | `eth_getCode` | CreateX `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` ada (11.838 B); `TokenizedStrategy` impl `0x3110D1Eec90f0651C18e75AD37711A8777342504` ada (18.224 B, keccak = mainnet); TS factory `0x311de24e…` ada (3.826 B); **Yearn `VaultFactory` `0x444045c5…` codesize 0** → konfirmasi ADR-2. |

**Sisa risiko (jujur):** status "USDG resmi" masih bersandar pada brief + README Kassora + Morpho API, ditambah sekarang pembacaan on-chain `symbol`/`decimals`/`totalSupply`. Belum ada konfirmasi dari sumber resmi Robinhood karena `docs.robinhood.com` tidak bisa dibaca dari host ini. Verifikasi issuer tetap wajib sebelum deposit mainnet dan dicatat di `ACCEPTANCE_EVIDENCE.md`.

## 4. Data venue nyata (dipakai `VENUE_INTEGRATIONS.md`)

Query: Morpho Blue API `vaultV2s(where:{chainId_in:[4663], assetAddress_in:[USDG]})`, diambil 2026-11-19. Angka bergerak; setiap dokumen venue harus mencatat ulang saat implementasi.

| Vault | Simbol | TVL (USD) | Likuiditas segera (USDG) | APY | Curator |
|---|---|---|---|---|---|
| Steakhouse USDG | `steakUSDG` | 538.387.208 | 73.502.768 | 3,71% | `0x9023FBD6A08C666491A2d1648737E400cF42D2Fb` |
| NetNet Credit | `nnUSDG` | 641.487 | **0** | 19,04% (net 16,99%) | `0x3Bb7A23316f82C0e984fA2E784846d8928a35f42` |
| Galaxy USDG RH Stock Tokens | `gUSDGst` | 502.965 | 255.278 | 0,74% | `0xA13094eCEd689b7419BAbA12851374424c1486f1` |
| Yearn Stonk USDG | `ymvST-USDG` | 208.236 | 205.294 | 3,79% (net 3,40%) | `0x90D0f26025571295D18a6c041E47450B81886B51` |
| Grove x Steakhouse USDG | `groveUSDG` | 99.994 | 100.003 | 0,00% | `0x622E19d6903BD4507cfc70b31d5B99535114C0FC` |
| Purinta USDG | `PurintaUSDG` | 67.276 | 53.591 | 5,70% | `0x370EC5d1809B27F1fB18e002cf79837c46F5134c` |

Kesimpulan bukti: **satu venue produksi yang layak ada** (`steakUSDG`), dan ia hanya sebagian kecil likuid segera. Ini menentukan desain withdrawal (butuh buffer idle + antrian strategi + estimasi likuiditas ber-timestamp), bukan sekadar "withdraw kapan saja".

Koreksi (2026-11-19, pin `118337511`): tabel di atas adalah survei awal pada blok yang berbeda dan kolom "likuiditas"-nya bukan `maxWithdraw` venue. Diukur ulang pada pin: TVL `538.856,055994` USDG, kas idle venue (USDG yang benar-benar bisa dibayar) `27.024,457979` USDG = **5,02%**, bukan 13,6%. `steakUSDG.maxWithdraw()`/`maxRedeem()` membalas `0` pada blok itu padahal kas ada dan seluruh posisi 8,33 juta bisa ditebus — jadi getter tersebut **tidak boleh** dipakai sebagai angka "dapat ditarik". Angka itu harus `min(convertToAssets(balanceOf(strategy)), USDG.balanceOf(venue))` dengan `blockNumber` + `blockHash`. Detail + probe: `docs/VENUE_INTEGRATIONS.md` §4.

### 4a. Probe deposit/withdraw pada pin (dijalankan 2026-11-20, state blok `118337511`)

Query: `python scripts/fork-test.py --match-test test_depositSucceedsWhileMaxDepositReportsZero` — script mem-fork blok pin lewat `anvil --fork-state-by-number` + `--hardfork cancun`, memverifikasi pin (`ArbSys.arbBlockNumber()` + fingerprint `totalAssets`), lalu menjalankan `test/fork/VenueProbe.t.sol`. Setiap angka di bawah adalah `assertEq` di tes itu, bukan hasil estimasi API. Alamat pemanggil dibuat sekali pakai (`deal` + `approve`), jadi tidak bergantung pada posisi holder nyata.

| Panggilan | Hasil terukur |
|---|---|
| `maxDeposit(fresh)` / `maxDeposit(HOLDER)` / `maxDeposit(test)` | `0` untuk ketiganya (getter, bukan gate) |
| `deposit(10_000e6, test)` | sukses; USDG terpakai tepat `10_000_000_000`, share dicetak `9_861_977_769_374_748_661_535` |
| `convertToAssets(share hasil deposit)` | `9_999_999_999` (selisih 1 wei pembulatan) |
| `maxWithdraw(test)` setelah deposit | `0` (masih berbohong) |
| `withdraw(2_000e6, test, test)` | USDG diterima `2_000_000_000`; **nilai balik** `1_972_395_553_874_949_732_308` = share yang dibakar (18 desimal) |
| `redeem(sisa, test, test)` | mengembalikan asset `7_999_999_999` (ERC-4626 patuh) |
| `withdraw(30_000_000e6, HOLDER, HOLDER)` | revert; payload **tidak stabil** antar-run (`Panic(0x11)` kadang, data kosong di run lain) — tes hanya meng-assert revert, bukan payload |

Konsekuensi yang mengikat dokumen lain: `maxDeposit = 0` tidak boleh dipercaya (alokasi jadi no-op permanen), dan nilai balik `withdraw` tidak boleh dibandingkan dengan jumlah asset. Keduanya sudah tercermin di `docs/VENUE_INTEGRATIONS.md` §4a dan `packages/config/4663.json` (`venues.steakUSDG.deposit`, `venues.steakUSDG.liquidity.return_semantics`).

## 5. Yang belum dibuktikan (jangan diklaim)

- Belum ada deployment vault Avenor di chain mana pun; belum ada tx hash.
- Belum ada audit/review untuk kombinasi pin kita.
- Belum ada capture Kassora visual; klaim "parity" belum punya dasar.
- Belum ada bukti bahwa Yearn V3 factory resmi sudah dideploy di `4663`; kemungkinan besar kita deploy factory sendiri (keputusan di `ARCHITECTURE.md`).
- Belum ada verifikasi source USDG dari sumber resmi Robinhood (lihat §3).