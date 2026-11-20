---
title: 'Reproduce VaultV3/VaultFactory bytecode and publish artifacts'
type: 'feature'
ticket: 2
created: '2026-11-19'
status: 'done'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/BASELINE.md', 'referensi/yearn-vaults-v3', 'referensi/tokenized-strategy']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Kita akan deploy vault sendiri di chain `4663` (ADR-2). Tanpa bytecode yang tereproduksi dari source yang dipin, klaim "fondasi kami adalah Yearn V3 v3.1.1" tidak bisa dibuktikan, dan ABI yang dipakai app/SDK bisa menyimpang dari kontrak yang benar-benar dideploy.

**Approach:** Kompilasi `contracts/VaultV3.vy` dan `contracts/VaultFactory.vy` dengan parameter rilis (Vyper `0.3.10`, evm `paris`, `optimize = codesize`), bandingkan `keccak256` runtime bytecode terhadap artefak rilis upstream, lalu commit ABI + bytecode + script pembanding ke `packages/core`.

</frozen-after-approval>

## Implementation Notes

- Parameter harus identik: `vyper 0.3.10`, `--evm-version paris`, `optimize: codesize`. Perbedaan optimizer menghasilkan bytecode berbeda dan mematikan seluruh verifikasi.
- Urutan sanity: kompilasi `VaultV3.vy` dulu, lalu `VaultFactory.vy` (factory memakai `VAULT_ORIGINAL` sebagai immutable, jadi butuh alamat asli, bukan hasil kompilasi kita — jangan menyamakan factory bytecode yang berisi alamat berbeda).
- Bandingkan **runtime** bytecode (bukan creation code) lewat `keccak256`; jika berbeda, cari penyebab (versi compiler, evm version, metadata) sebelum menyimpulkan source berbeda.
- Artefak yang dipublikasikan: `abi`, `bytecode`, `deployedBytecode`, `compiler`, `settings`, `sourceKeccak` — satu file JSON per kontrak dengan field `_meta` berisi commit pin.
- Jangan menyalin ABI dari docs atau dari npm package; ABI harus keluar dari artefak ini agar indexer/app tidak memakai nama fungsi yang salah (mis. `setProfitMaxUnlockTime` camelCase).
- Catat hasil di `docs/BASELINE.md` §6 (checklist `ape compile`).

## Acceptance Evidence

1. `packages/core/artifacts/VaultV3.json` + `VaultFactory.json` ada, berisi compiler setting dan hash.
2. `scripts/verify-bytecode.ts` (atau `.py`) mencetak hash kita vs hash rilis dan hasil `MATCH`.
3. `docs/BASELINE.md` §6 butir "ape compile ... mereproduksi bytecode" tercentang dengan hash.
4. Bila tidak match: dokumen menyebut selisih dan keputusan (terima/tolak), tidak ada klaim "identik".

## Out of Scope

- Deploy on-chain.
- Verifikasi source di explorer.
- Kompilasi `TokenizedStrategy.sol` (dilakukan di paket kontrak dengan solc `0.8.18`).

## Completion Evidence (2026-11-19)

Artefak: `packages/core/artifacts/VaultV3.json`, `packages/core/artifacts/VaultFactory.json` (runtime + creation hex, keccak, source keccak, argv compiler, ABI, `_meta` pin).

| Objek | Ukuran | keccak256 |
|---|---|---|
| `VaultV3` runtime (pin `f449264`, vyper 0.3.10, codesize, paris) | 23.462 B | `0x6909c58e42814ae46cadd909f29f19163751b77ff4a2ccf62c5a87e933e02be6` |
| `VaultV3` creation | 23.536 B | `0xc00d80e0f2117e5b3b97f4c198dddc82bd96ee64529f8a5cd848e19eae94121b` |
| `VaultFactory` runtime | 3.604 B | `0xdfc2a10112cf82c15ada486a586ff1a5bebd312e9dbe86ef8c13d92683bddec2` |
| `VaultFactory` creation | 3.834 B | `0xde30ee1a9a055cc0097e5671a9dcf97f07c98c7d5e6c8b1a7f8a678d9fd9564f` |
| `VaultV3` v3.0.2 runtime (vyper 0.3.7, paris) | 23.675 B | `0x4075239962ac41f7f4876a094deea45dfb667d719de30f4abceaf35348db9858` |

- Determinisme: dua run kompilasi menghasilkan bytecode identik (`v311-deterministic`).
- Reproduksi rilis on-chain: `v3.0.2` lokal == `0x1ab62413e0cf2eBEb73da7D40C70E7202ae14467` di mainnet, arbitrum, base, optimism.
- `scripts/compile-vault.py` mewajibkan pin (`git rev-parse HEAD`) dan menulis artefak secara atomik; mode `--check` membandingkan tanpa menulis.
- `scripts/verify-bytecode.py all` → **14/14 checks passed**. Klaim yang tidak dibuat: "Vault v3.1.1 sudah terbukti on-chain" — tidak ada deployment publik v3.1.1, dan `VAULT_ORIGINAL` yang immutable di semua network masih `0x1ab6…` (v3.0.2). Ini dicatat sebagai cek `v311-no-public-deployment-claim`.
