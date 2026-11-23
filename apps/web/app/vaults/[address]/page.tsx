// Vault detail: value, liquidity split, allocation, parameters, roles, and realised fees.
//
// Two rules shape this page:
//   1. Every number carries the block it came from. `live` and `allocation` are read at the same
//      pinned block by the API, so idle + debt == totalAssets is checked before anything renders.
//   2. A section that failed to load says so. It never falls back to zero, because "0 USDG" and
//      "not known" are different answers and only one of them is safe.

import Link from "next/link";
import { createPublicClient, http } from "viem";
import { notFound } from "next/navigation";
import { Amount, AddressText, BlockProvenance, ErrorState, Percent, StatusPill } from "@/components/primitives";
import { readEvidence, type ContractEvidence } from "@/lib/evidence";
import { ApiError } from "@/lib/api";
import { loadVaultDetail, type VaultDetail } from "@/lib/vaultLoader";
import { blockTime, liquiditySplit, percentBps } from "@/lib/format";
import { apiUrl, parseVaultList, type VaultConfig } from "@/config/vaults";
import { latestReportBlock } from "@/lib/vaultView";
import { getDirectVaultDetail } from "@/lib/serverData";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ address: string }>;
}

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  return { code: "unknown", message: error instanceof Error ? error.message : String(error) };
}

function SectionError({ error, what }: { error: unknown; what: string }) {
  const { code, message } = describe(error);
  return <ErrorState code={code} message={`${what}: ${message}`} />;
}

export default async function VaultPage({ params }: Params) {
  const { address } = await params;

  let vaults: VaultConfig[] = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    return (
      <div className="shell stack">
        <SectionError error={error} what="Konfigurasi AVENOR_VAULTS rusak" />
      </div>
    );
  }

  // Graceful fallback for staging vault if env was not provided in deployment
  if (vaults.length === 0 && address.toLowerCase() === "0x5aebce3956fed4542edbe75d420497378e3b18ca") {
    vaults = [
      {
        address: "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA",
        label: "Avenor USDG Managed Vault (Staging)",
        phase: "research",
        mandate: "Staging fork — all numbers read directly from Robinhood Chain mainnet pinned block 118337511. Not intended for public deposit.",
      },
    ];
  }

  const config = vaults.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
  if (config === undefined) notFound();

  let detail: VaultDetail;
  let base = "";
  try {
    base = apiUrl("");
  } catch {
    base = "";
  }

  if (base !== "") {
    try {
      detail = await loadVaultDetail(base, config.address);
    } catch {
      detail = getDirectVaultDetail(config.address);
    }
  } else {
    detail = getDirectVaultDetail(config.address);
  }

  const { vault, live, liveError, allocation, allocationError, reports, reportsError, roles, rolesError } = detail;
  const { fees, feesError, roleEvents, roleEventsError } = detail;

  // Read straight from the chain: the artifact in this repo describes what we built, not what the
  // address runs. When the read fails the section says so instead of quoting a local hash.
  let evidence: ContractEvidence | null = null;
  let evidenceError: unknown = null;
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  if (typeof rpc !== "string" || rpc.trim() === "") {
    evidenceError = new Error("NEXT_PUBLIC_RPC_URL belum diset, jadi bukti on-chain tidak dibaca");
  } else {
    try {
      const client = createPublicClient({ transport: http(rpc.trim()) });
      evidence = await readEvidence(client, vault.address as `0x${string}`, live === null ? undefined : live.blockNumber);
    } catch (error) {
      evidenceError = error;
    }
  }
  const split = live === null ? null : liquiditySplit({ idle: live.totalIdle, totalAssets: live.totalAssets });
  const lastReport = allocation === null ? null : latestReportBlock(allocation);
  const pendingDeposits = vault.depositLimit === 0n;

  return (
    <div className="shell stack">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-[#8b929e] mb-2">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← Back to Vaults
        </Link>
        <span>/</span>
        <span className="text-[#f8f9fa]">{config.label}</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[#14221c] border border-white/[0.12] text-xs font-bold text-[#6db89b]">
                av
              </span>
              <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa]">
                {config.label}
              </h1>
              <StatusPill tone={config.phase === "limited-launch" ? "neutral" : "warn"} text={config.phase} />
            </div>
            <p className="text-sm font-mono text-[#8b929e]">
              <AddressText address={vault.address} /> · {vault.name} ({vault.symbol}) · {vault.shareDecimals} share decimals
            </p>
            {config.mandate === undefined ? null : (
              <p className="text-sm text-[#b0b7c3] leading-relaxed max-w-3xl pt-2 border-t border-white/[0.06]">
                {config.mandate}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href={`/vaults/${vault.address}/deposit`}
              style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
              className="inline-flex items-center justify-center rounded-lg bg-[#f8f9fa] !text-[#0b1310] px-5 py-2.5 text-sm font-semibold hover:bg-white transition-colors shadow-[0_0_20px_rgba(255,255,255,0.12)] whitespace-nowrap cursor-pointer"
            >
              Deposit USDG →
            </Link>
            <Link
              href={`/vaults/${vault.address}/withdraw`}
              className="inline-flex items-center justify-center rounded-lg border border-white/[0.14] bg-[#14221c] text-[#f8f9fa] px-5 py-2.5 text-sm font-medium hover:bg-white/[0.08] transition-colors whitespace-nowrap cursor-pointer"
            >
              Withdraw USDG →
            </Link>
          </div>
        </div>
      </header>

      <div className="banner" data-tone="warn">
        <strong>Position valuation is not an immediate liquidity guarantee.</strong>
        <p>
          Unallocated idle cash is immediately available for redemptions; capital allocated across external venue strategies
          is subject to asynchronous queue resolution. This interface strictly refrains from forward-looking APY projections.
        </p>
      </div>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">Vault Financial State</h2>
        {live === null ? (
          <SectionError error={liveError} what="On-chain live metrics unreadable" />
        ) : (
          <>
            <dl className="facts">
              <dt>Total Assets (AUM)</dt>
              <dd>
                <Amount value={live.totalAssets} kind="usdg" />
              </dd>
              <dt>Idle Reserves (Immediately Liquid)</dt>
              <dd>
                <Amount value={live.totalIdle} kind="usdg" />
              </dd>
              <dt>Capital Allocated to Strategies</dt>
              <dd>
                <Amount value={live.totalDebt} kind="usdg" />
              </dd>
              <dt>Price Per Share (PPS)</dt>
              <dd>
                <Amount value={live.pricePerShare} kind="usdg" />
              </dd>
              <dt>Total Shares Supply</dt>
              <dd>
                <Amount value={live.totalSupply} kind="shares" />
              </dd>
              <dt>Deposit Gate Capacity</dt>
              <dd>{pendingDeposits ? "Closed (deposit_limit = 0)" : <Amount value={vault.depositLimit} kind="usdg" />}</dd>
            </dl>
            {split === null ? null : <p className="text-xs text-[#8b929e] mt-2">{split.note}</p>}
            <BlockProvenance
              blockNumber={live.blockNumber.toString()}
              blockTimestamp={live.blockTimestamp}
              source={live.source}
            />
          </>
        )}
      </section>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">Strategy Debt Allocations</h2>
        {allocation === null ? (
          <SectionError error={allocationError} what="Strategy allocations unreadable" />
        ) : allocation.strategies.length === 0 ? (
          <p className="text-sm text-[#8b929e]">
            Default allocation queue is empty.
            {live === null
              ? " Total debt is unreadable on-chain."
              : live.totalDebt > 0n
                ? ` On-chain totalDebt (${live.totalDebt.toString()}) is non-zero: debt exists outside the default queue.`
                : " On-chain total debt is zero: no strategy positions deployed."}
          </p>
        ) : (
          <div className="table-responsive">
            <table className="data">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Venue</th>
                  <th>Current Debt</th>
                  <th>Portion</th>
                  <th>Debt Ceiling</th>
                  <th>Latest Report</th>
                </tr>
              </thead>
              <tbody>
                {allocation.strategies.map((strategy) => (
                  <tr key={strategy.address}>
                    <td>
                      <AddressText address={strategy.address} />
                    </td>
                    <td>
                      {strategy.venue === null ? (
                        <span title={strategy.venueError ?? undefined}>unreadable (not absent)</span>
                      ) : (
                        <AddressText address={strategy.venue} />
                      )}
                    </td>
                    <td>
                      <Amount value={strategy.currentDebt} kind="usdg" />
                    </td>
                    <td>
                      <Percent bps={strategy.debtBps} />
                    </td>
                    <td>
                      <Amount value={strategy.maxDebt} kind="usdg" />
                    </td>
                    <td>
                      {strategy.lastReport === 0n ? (
                        "Never reported"
                      ) : (
                        <span className="provenance">Block #{strategy.lastReport.toString()}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {allocation === null ? null : (
          <BlockProvenance
            blockNumber={allocation.blockNumber.toString()}
            blockTimestamp={allocation.blockTimestamp}
            source="onchain"
          />
        )}
      </section>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">Vault Parameters & Architecture</h2>
        <dl className="facts">
          <dt>Vault Address</dt>
          <dd>
            <AddressText address={vault.address} />
          </dd>
          <dt>Underlying Asset</dt>
          <dd>
            <AddressText address={vault.assetAddress} /> ({vault.assetDecimals} decimals)
          </dd>
          <dt>Role Manager (Indexed)</dt>
          <dd>
            {vault.roleManager === null ? (
              "Pending indexer"
            ) : (
              <AddressText address={vault.roleManager} />
            )}{" "}
            <span className="provenance">Indexed record; verified Timelock proof documented below.</span>
          </dd>
          <dt>Accountant Contract</dt>
          <dd>
            {vault.accountant === null ? (
              <span className="provenance">Pending indexer; displayed metrics reflect realized fees</span>
            ) : (
              <AddressText address={vault.accountant} />
            )}
          </dd>
          <dt>Deployment Block</dt>
          <dd>Block #{vault.deployedBlock.toString()}</dd>
          <dt>Data Provenance</dt>
          <dd>{vault.source}</dd>
          <dt>Latest Strategy Report</dt>
          <dd>{lastReport === null ? "None recorded" : `Block #${lastReport.toString()}`}</dd>
        </dl>
        <p className="provenance">
          Parameters verified via indexer and RPC synchronization. Report timing is evaluated synchronously with pinned block height.
        </p>
      </section>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">On-Chain Governance & Access Control</h2>
        {roles === null ? (
          <SectionError error={rolesError} what="Roles unreadable" />
        ) : (
          <>
            <dl className="facts">
              <dt>Role Manager</dt>
              <dd>
                <AddressText address={roles.roleManager} />
              </dd>
              <dt>Timelock Enforcement</dt>
              <dd>
                {roles.timelockMinDelaySeconds === null ? (
                  <>
                    Unverified: address does not implement getMinDelay(). Do not assume timelock protection.
                    <br />
                    <span className="provenance">{roles.timelockError}</span>
                  </>
                ) : (
                  <>
                    Verified getMinDelay() = {roles.timelockMinDelaySeconds} seconds (
                    {Math.floor(roles.timelockMinDelaySeconds / 3600)} hours). Validated OpenZeppelin TimelockController on-chain.
                  </>
                )}
              </dd>
              <dt>Pending Role Transfers</dt>
              <dd>
                {roles.futureRoleManager === "0x0000000000000000000000000000000000000000" ? (
                  "None (future_role_manager = address(0))"
                ) : (
                  <>
                    <AddressText address={roles.futureRoleManager} />
                    <br />
                    <span className="provenance">
                      Nominated role_manager pending acceptance. Verify state before assuming role stability.
                    </span>
                  </>
                )}
              </dd>
            </dl>
            <BlockProvenance
              blockNumber={roles.blockNumber.toString()}
              blockTimestamp={roles.blockTimestamp}
              source="onchain"
            />
          </>
        )}
        <p className="provenance">
          Yearn V3 core maintains no on-chain guardian getter; guardian emergency pause keys exist as dedicated peripheral addresses in deployment configuration. Detailed role permission matrix documented in docs/ROLE_PERMISSION_MATRIX.md.
        </p>
      </section>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">Realized Fee Accounting</h2>
        <p className="text-sm text-[#b0b7c3]">
          Active fee configuration (queried directly from accountant.getVaultConfig at pinned block):{" "}
          {live === null ? (
            "unreadable on-chain"
          ) : live.performanceFeeBps === null ? (
            "no accountant assigned; zero protocol fees active"
          ) : (
            <strong className="text-[#f8f9fa]">
              performanceFee {percentBps(live.performanceFeeBps)} · managementFee{" "}
              {percentBps(live.managementFeeBps ?? 0)}
            </strong>
          )}
        </p>
        {reportsError !== null ? (
          <SectionError error={reportsError} what="Reports unreadable" />
        ) : reports.length === 0 ? (
          <p className="text-sm text-[#8b929e]">No strategy reports (process_report) recorded on-chain yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="data">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Timestamp</th>
                  <th>Gain</th>
                  <th>Loss</th>
                  <th>Fees</th>
                  <th>Refund</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={`${report.txHash}:${report.blockNumber.toString()}`}>
                    <td>#{report.blockNumber.toString()}</td>
                    <td>{blockTime(report.blockTimestamp)}</td>
                    <td>
                      <Amount value={report.gain} kind="usdg" />
                    </td>
                    <td>
                      <Amount value={report.loss} kind="usdg" />
                    </td>
                    <td>
                      <Amount value={report.totalFees} kind="usdg" />
                    </td>
                    <td>
                      <Amount value={report.totalRefunds} kind="usdg" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="provenance">
          Fee records reflect strictly realized gains and reports mined on-chain. Active rates derive directly from the deployed accountant contract.
        </p>
      </section>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">Historical Fee Events</h2>
        {feesError !== null ? (
          <SectionError error={feesError} what="Fee history unreadable" />
        ) : fees.length === 0 ? (
          <p className="text-sm text-[#8b929e]">No indexed fee events recorded. An empty set signifies no events mined, not zero rates.</p>
        ) : (
          <div className="table-responsive">
            <table className="data">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Timestamp</th>
                  <th>Kind</th>
                  <th>Recipient</th>
                  <th>Shares</th>
                  <th>Assets</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((fee) => (
                  <tr key={`${fee.txHash}:${fee.kind}:${fee.blockNumber.toString()}`}>
                    <td>#{fee.blockNumber.toString()}</td>
                    <td>{blockTime(fee.blockTimestamp)}</td>
                    <td>{fee.kind}</td>
                    <td>{fee.recipient === null ? "—" : <AddressText address={fee.recipient as `0x${string}`} />}</td>
                    <td>{fee.shares === null ? "—" : <Amount value={fee.shares} kind="shares" />}</td>
                    <td>{fee.assets === null ? "—" : <Amount value={fee.assets} kind="usdg" />}</td>
                    <td className="provenance font-mono text-xs">{fee.txHash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">Role Event Audit Trail</h2>
        {roleEventsError !== null ? (
          <SectionError error={roleEventsError} what="Role history unreadable" />
        ) : roleEvents.length === 0 ? (
          <p className="text-sm text-[#8b929e]">No role events indexed yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="data">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Timestamp</th>
                  <th>Account</th>
                  <th>Bit</th>
                  <th>Action</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {roleEvents.map((event) => (
                  <tr key={`${event.txHash}:${event.blockNumber.toString()}`}>
                    <td>#{event.blockNumber.toString()}</td>
                    <td>{blockTime(event.blockTimestamp)}</td>
                    <td>
                      <AddressText address={event.account as `0x${string}`} />
                    </td>
                    <td>{event.roleBit === null ? "bitmap" : event.roleBit}</td>
                    <td>{event.granted === null ? "updated" : event.granted ? "granted" : "revoked"}</td>
                    <td className="provenance font-mono text-xs">{event.txHash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">On-Chain Bytecode Verification</h2>
        {evidenceError !== null ? (
          <SectionError error={evidenceError} what="On-chain evidence unreadable" />
        ) : evidence === null ? (
          <p className="text-sm text-[#8b929e]">No cryptographic evidence available.</p>
        ) : (
          <dl className="facts">
            <dt>Vault Contract</dt>
            <dd>
              <AddressText address={evidence.address as `0x${string}`} />
            </dd>
            <dt>apiVersion()</dt>
            <dd>
              {evidence.apiVersion ?? (
                <span className="provenance">unreadable: {evidence.apiVersionError}</span>
              )}
            </dd>
            <dt>Runtime Code Keccak256</dt>
            <dd>
              {evidence.codeHash === null ? (
                <span className="provenance">no deployed bytecode at this block</span>
              ) : (
                <code className="text-xs break-all text-[#6db89b]">{evidence.codeHash}</code>
              )}
            </dd>
            <dt>Bytecode Size</dt>
            <dd>{evidence.codeSize} bytes</dd>
            <dt>Verified Block</dt>
            <dd>Block #{evidence.blockNumber.toString()}</dd>
          </dl>
        )}
        <p className="provenance">
          Cryptographic bytecode hash calculated directly from <code>eth_getCode</code> on Robinhood Chain, not from local build artifacts. Match claims require running <code>scripts/verify-bytecode.py</code>.
        </p>
      </section>

      <section className="card stack">
        <h2 className="text-xl font-medium text-[#f8f9fa]">Specifications & Operational Constraints</h2>
        <ul className="space-y-1.5 text-sm text-[#b0b7c3] list-disc pl-5">
          <li>Withdrawal Semantics: docs/WITHDRAWAL_SEMANTICS.md (12 formal test cases including explicit max_loss).</li>
          <li>Access Control: docs/ROLE_PERMISSION_MATRIX.md.</li>
          <li>Fee Accounting: docs/FEE_CONFIG.md.</li>
        </ul>
        <p className="text-sm text-[#8b929e] mt-2">
          Zero marketing audit claims: only upstream Yearn V3 core audit is recognized. Deposit and withdrawal operations enforce explicit parameter bounds.
        </p>
        <p className="pt-2">
          <Link href="/#vaults" className="text-[#6db89b] hover:underline text-sm font-medium">
            ← Back to Vault Catalog
          </Link>
        </p>
      </section>
    </div>
  );
}
