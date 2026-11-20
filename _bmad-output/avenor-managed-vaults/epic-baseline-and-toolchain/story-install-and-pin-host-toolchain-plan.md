---
title: 'Install and pin host toolchain'
type: 'chore'
ticket: 1
created: '2026-11-19'
status: 'done'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/BASELINE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `forge` tidak terpasang, dan `eth-ape==0.8.10` (dependensi kompilasi Vyper upstream) tidak mendukung Python 3.13 yang terpasang di host. Tanpa toolchain yang benar, bytecode vault tidak bisa direproduksi dan seluruh baseline teknis hanya klaim.

**Approach:** Pasang Foundry pada versi yang dipin, siapkan interpreter Python 3.11 terisolasi untuk `ape` + `vyper==0.3.10`, lalu ganti tabel "Toolchain host" di `docs/BASELINE.md` §5 dengan versi terukur nyata.

</frozen-after-approval>

## Implementation Notes

- Foundry: `foundryup` lalu pin versi; catat output `forge --version` (commit hash nightly/stable) ke `docs/BASELINE.md` §5. Jangan pakai `latest` yang berubah tanpa catatan.
- Python: jangan menyentuh Python global 3.13. Buat env terpisah, mis. `uv venv .venv-ape --python 3.11` lalu `uv pip install -r referensi/yearn-vaults-v3/requirements.txt`. Verifikasi `ape --version` dan `vyper --version` dari dalam env.
- Windows: `ape` butuh `eth-ape` plugin vyper (`ape-vyper`); pastikan plugin yang terpasang kompatibel dengan `eth-ape==0.8.10`. Bila resolver gagal, dokumentasikan versi plugin yang dipakai, jangan meng-upgrade apa pun secara diam-diam.
- Jangan commit `.venv-ape` dan `out/`; tambahkan `.gitignore` (Foundry + Node + Python).
- Catat juga `solc 0.8.18` availabilitas: `forge` akan mengunduh; simpan `~/.svm/0.8.18` dan catat di dokumen.
- Node 24 sudah memenuhi kebutuhan app; tidak perlu mengubah versi Node.

## Acceptance Evidence

1. Output `forge --version`, `ape --version`, `vyper --version`, `solc --version`, `uv --version` (teks mentah) ditempel di `docs/BASELINE.md` §5.
2. `docs/BASELINE.md` tidak lagi memuat frasa "tidak terpasang".
3. `.gitignore` menolak `out/`, `cache/`, `.venv*`, `node_modules/`.
4. Kegagalan yang tersisa (jika ada) ditulis sebagai blocker eksplisit, bukan disembunyikan.

## Out of Scope

- Kompilasi vault (ticket berikutnya).
- Instalasi Node/Postgres.
- Konfigurasi CI.

## Completion Evidence (2026-11-19)

| Tool | Versi terukur | Lokasi |
|---|---|---|
| `forge` / `cast` | `1.9.0`, commit `6056c5845d34205a83cf7108042adb137325c9df`, build `2026-11-02` | `avenor/.tools/foundry/` |
| zip sha256 | `2b02444d46c9218fe2e6be66015265ce131fe6b7c384e33e630b00f9a0bff072` | cocok dengan `.sha256` rilis resmi |
| Python (env vault) | `3.11.16` | `.venv-ape` |
| `vyper` (pin v3.1.1) | `0.3.10+commit.9136169` | `.venv-ape` |
| `vyper` (pin v3.0.2) | `0.3.7+commit.6020b8b` | `.venv-037` |
| `solc` | `0.8.18` (via `svm`) | dipakai `forge` |
| `uv` | `0.12.9` | pembuat env |

- `docs/BASELINE.md` §5 sudah memuat angka nyata; frasa "tidak terpasang" hilang.
- `.gitignore` ditambahkan: `.tools/`, `.venv-ape/`, `.venv-037/`, `out/`, `cache/`, `.tmp/`, `referensi/.tmp/`, `node_modules/`, `.env*`.
- Blocker yang tersisa ditulis eksplisit di `README.md` §Blocker dan `docs/BASELINE.md` §5 (TLS `docs.robinhood.com`, Cloudflare Blockscout, RPC tanpa arsip) — tidak ada yang disembunyikan.
