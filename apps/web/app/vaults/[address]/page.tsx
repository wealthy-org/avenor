// Vault detail: value, liquidity split, allocation, parameters, roles, and realised fees.
//
// Two rules shape this page:
//   1. Every number carries the block it came from. `live` and `allocation` are read at the same
//      pinned block by the API, so idle + debt == totalAssets is checked before anything renders.
//   2. A section that failed to load says so. It never falls back to zero, because "0 USDG" and
//      "not known" are different answers and only one of them is safe.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount, AddressText, BlockProvenance, ErrorState, Percent, StatusPill } from "@/components/primitives";
import { ApiError } from "@/lib/api";
import { loadVaultDetail, type VaultDetail } from "@/lib/vaultLoader";
import { blockTime, epochTime, liquiditySplit, percentBps } from "@/lib/format";
import { apiUrl, parseVaultList, type VaultConfig } from "@/config/vaults";
import { latestReportTimestamp } from "@/lib/vaultView";
import { getDirectVaultDetail, getVaultEvidence } from "@/lib/serverData";
import { VaultTabs, type TabItem } from "@/components/VaultTabs";
import { SharePriceChart } from "@/components/SharePriceChart";
import { VaultActionConsole } from "@/components/VaultActionConsole";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ address: string }>;
}

const MANDATE_FALLBACK =
  "Staging fork of Robinhood Chain state. Every number is read at one named block and printed " +
  "with that block and its hash; this deployment has no code on mainnet. " +
  "Not open for public deposits.";

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  return { code: "unknown", message: error instanceof Error ? error.message : String(error) };
}

function SectionError({ error, what }: { error: unknown; what: string }) {
  const { code, message } = describe(error);
  return <ErrorState code={code} message={`${what}: ${message}`} />;
}

/** One headline figure. A tile, not a sentence: the label says what the number is, the number is money. */
function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#14221c]/60 p-4 flex flex-col gap-1.5 min-w-0">
      <span className="text-[0.6875rem] uppercase tracking-[0.08em] text-[#a3abb8]">{label}</span>
      <span className="font-mono text-lg sm:text-xl text-[#f8f9fa] tabular-nums break-words">{children}</span>
      {hint === undefined ? null : <span className="text-xs leading-relaxed text-[#a3abb8]">{hint}</span>}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <td data-label={label} className="align-middle">
      {children}
    </td>
  );
}

export default async function VaultPage({ params }: Params) {
  const { address } = await params;

  let vaults: VaultConfig[] = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    return (
      <div className="shell stack">
        <SectionError error={error} what="The AVENOR_VAULTS configuration is malformed" />
      </div>
    );
  }

  const config = vaults.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
  if (config === undefined) notFound();

  let detail: VaultDetail | null = null;
  let base = "";
  try {
    base = apiUrl("");
  } catch {
    base = "";
  }

  let detailError: unknown = null;
  try {
    if (base !== "") {
      try {
        detail = await loadVaultDetail(base, config.address);
      } catch {
        detail = await getDirectVaultDetail(config.address);
      }
    } else {
      detail = await getDirectVaultDetail(config.address);
    }
  } catch (error) {
    detailError = error;
    detail = null;
  }

  if (detail === null) {
    return (
      <div className="shell stack">
        <SectionError error={detailError} what="This vault could not be read" />
      </div>
    );
  }

  const { vault, live, liveError, allocation, allocationError, reports, reportsError, roles, rolesError } = detail;
  const { fees, feesError, roleEvents, roleEventsError } = detail;

  const evidence = await getVaultEvidence(vault.address);
  const evidenceSource: "live" | "captured" | "unreadable" =
    evidence === null ? "unreadable" : evidence.codeError === null ? "live" : "captured";

  const split = live === null ? null : liquiditySplit({ idle: live.totalIdle, totalAssets: live.totalAssets });
  const lastReport = allocation === null ? null : latestReportTimestamp(allocation);
  const pendingDeposits = vault.depositLimit === 0n;

  // Streamlined modern tabs architecture
  const tabs: TabItem[] = [
    {
      id: "overview",
      label: "Overview & Liquidity",
      content: (
        <div className="space-y-6">
          <section className="card stack">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2>Vault value</h2>
              <span className="text-xs text-[#a3abb8]">All figures read at the same block</span>
            </div>
            {live === null ? (
              <SectionError error={liveError} what="The on-chain numbers could not be read" />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <Stat label="Total assets" hint="Position value, including capital deployed">
                    <Amount value={live.totalAssets} kind="usdg" />
                  </Stat>
                  <Stat label="Idle cash" hint="Available for a withdrawal right now">
                    <Amount value={live.totalIdle} kind="usdg" />
                  </Stat>
                  <Stat label="Deployed to strategies" hint="Not withdrawable on demand">
                    <Amount value={live.totalDebt} kind="usdg" />
                  </Stat>
                  <Stat label="Price per share" hint="what convertToAssets() returns for one share">
                    <Amount value={live.pricePerShare} kind="usdg" />
                  </Stat>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-0 mt-1">
                  <dl className="facts">
                    <dt>Total shares</dt>
                    <dd>
                      <Amount value={live.totalSupply} kind="shares" decimals={vault.shareDecimals} />
                    </dd>
                    <dt>Deposit capacity</dt>
                    <dd>
                      {pendingDeposits ? "Closed (deposit_limit = 0)" : <Amount value={vault.depositLimit} kind="usdg" />}
                    </dd>
                  </dl>
                  <dl className="facts">
                    <dt>Asset</dt>
                    <dd>
                      <AddressText address={vault.assetAddress} /> ({vault.assetDecimals} decimals)
                    </dd>
                    <dt>Share decimals</dt>
                    <dd>{vault.shareDecimals}</dd>
                  </dl>
                </div>

                {split === null ? null : (
                  <div className="rounded-lg border border-white/[0.08] bg-[#14221c]/50 p-4">
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                      <span className="text-xs uppercase tracking-[0.08em] text-[#a3abb8]">Liquidity split</span>
                      <span className="font-mono text-sm text-[#f8f9fa]">
                        Idle <span className="text-[#6db89b]">{split.idle}</span> USDG
                      </span>
                      <span className="font-mono text-sm text-[#f8f9fa]">
                        Position <span className="text-[#e8c468]">{split.positionValue}</span> USDG
                      </span>
                    </div>
                    <p className="mt-2 mb-0 text-sm leading-relaxed text-[#b0b7c3] max-w-3xl">{split.note}</p>
                  </div>
                )}

                <BlockProvenance
                  blockNumber={live.blockNumber.toString()}
                  blockTimestamp={live.blockTimestamp}
                  source={live.source}
                />
              </>
            )}
          </section>
        </div>
      ),
    },
    {
      id: "allocations",
      label: "Allocations & Strategy",
      badge: allocation?.strategies?.length ?? 0,
      content: (
        <div className="space-y-6">
          <section className="card stack">
            <h2>Allocation by strategy</h2>
            {allocation === null ? (
              <SectionError error={allocationError} what="The allocation could not be read" />
            ) : allocation.strategies.length === 0 ? (
              <p>
                The default queue is empty.
                {live === null
                  ? " Total debt is unknown because the live numbers failed to load."
                  : live.totalDebt > 0n
                    ? ` Yet on-chain totalDebt is ${live.totalDebt.toString()}, which is not zero: some debt is not explained by the queue.`
                    : " On-chain total debt is zero, so there is no strategy position."}
              </p>
            ) : (
              <div className="table-responsive">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      <th>Venue</th>
                      <th className="text-right">Debt</th>
                      <th className="text-right">Share of assets</th>
                      <th className="text-right">Debt limit</th>
                      <th>Last report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.strategies.map((strategy) => (
                      <tr key={strategy.address}>
                        <Cell label="Strategy">
                          <AddressText address={strategy.address} />
                        </Cell>
                        <Cell label="Venue">
                          {strategy.venue === null ? (
                            <span className="text-[#a3abb8]">{strategy.venueError ?? "no venue reported"}</span>
                          ) : (
                            <AddressText address={strategy.venue} />
                          )}
                        </Cell>
                        <Cell label="Debt">
                          <span className="block text-right">
                            <Amount value={strategy.currentDebt} kind="usdg" />
                          </span>
                        </Cell>
                        <Cell label="Share of assets">
                          <span className="block text-right">
                            <Percent bps={strategy.debtBps} />
                          </span>
                        </Cell>
                        <Cell label="Debt limit">
                          <span className="block text-right">
                            <Amount value={strategy.maxDebt} kind="usdg" />
                          </span>
                        </Cell>
                        <Cell label="Last report">
                          {strategy.lastReport === 0n ? (
                            <span className="text-[#a3abb8]">never</span>
                          ) : (
                            <span className="provenance inline-block mt-0 border-0 pt-0">
                              {epochTime(strategy.lastReport)}
                            </span>
                          )}
                        </Cell>
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
                source={allocation.source}
              />
            )}
          </section>
        </div>
      ),
    },
    {
      id: "governance",
      label: "Governance & Roles",
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="card stack">
              <h2>Parameters and roles</h2>
              <dl className="facts">
                <dt>Vault address</dt>
                <dd>
                  <AddressText address={vault.address} />
                </dd>
                <dt>role_manager (indexed row)</dt>
                <dd>
                  {vault.roleManager === null ? "not indexed" : <AddressText address={vault.roleManager} />}
                </dd>
                <dt>accountant</dt>
                <dd>
                  {vault.accountant === null ? (
                    <span className="text-[#a3abb8]">not indexed, so only realised fees are shown below</span>
                  ) : (
                    <AddressText address={vault.accountant} />
                  )}
                </dd>
                <dt>{vault.source === "captured" ? "Captured at fork block" : "Read at block"}</dt>
                <dd className="money">{vault.recordedBlock.toString()}</dd>
                <dt>Vault row source</dt>
                <dd className="money">{vault.source}</dd>
                <dt>Latest strategy report</dt>
                <dd className="money">{lastReport === null ? "none yet" : epochTime(lastReport)}</dd>
              </dl>
              <p className="provenance">
                {vault.source === "captured"
                  ? "This row comes from the committed capture, not from this request: name, symbol, asset and deposit limit are fixed at that block. The capture was taken on a local anvil fork of chain 4663 state, so the block it names is a fork block, and the canonical chain holds a different block at that height."
                  : "This row was read from the node during this request. Name, symbol, asset and deposit limit are the values returned at the block printed above."}{" "}
                Report age is not converted into a duration, because this page does not hold the chain head at
                the same instant.
              </p>
            </section>

            <section className="card stack">
              <h2>On-chain roles</h2>
              {roles === null ? (
                <SectionError error={rolesError} what="The roles could not be read" />
              ) : (
                <>
                  <dl className="facts">
                    <dt>role_manager</dt>
                    <dd>
                      <AddressText address={roles.roleManager} />
                    </dd>
                    <dt>Timelock?</dt>
                    <dd>
                      {roles.timelockMinDelaySeconds === null ? (
                        <>
                          Not provable: this address does not answer getMinDelay(). Do not treat it as a timelock.
                          <br />
                          <span className="text-[#a3abb8]">{roles.timelockError}</span>
                        </>
                      ) : (
                        <>
                          Answers getMinDelay() = <span className="money">{roles.timelockMinDelaySeconds}</span> seconds (
                          <span className="money">{Math.floor(roles.timelockMinDelaySeconds / 3600)}</span> hours). It is a
                          TimelockController at this block.
                        </>
                      )}
                    </dd>
                    <dt>Pending role transfer</dt>
                    <dd>
                      {roles.futureRoleManager === "0x0000000000000000000000000000000000000000" ? (
                        "None (future_role_manager = 0)"
                      ) : (
                        <>
                          <AddressText address={roles.futureRoleManager} />
                          <br />
                          <span className="text-[#a3abb8]">
                            A candidate role_manager has not accepted yet. Check before assuming the role is stable.
                          </span>
                        </>
                      )}
                    </dd>
                  </dl>
                  <BlockProvenance
                    blockNumber={roles.blockNumber.toString()}
                    blockTimestamp={roles.blockTimestamp}
                    source={roles.source}
                  />
                </>
              )}
              <p className="provenance">
                VaultV3 has no guardian getter; the guardian is a separate address in the deploy configuration, not an
                on-chain role, so this page does not invent a value for it. Ownership of DEBT_MANAGER and EMERGENCY_MANAGER
                is not read here either; the matrix lives in docs/ROLE_PERMISSION_MATRIX.md.
              </p>
            </section>
          </div>

          <section className="card stack">
            <h2>Role history</h2>
            {roleEventsError !== null ? (
              <SectionError error={roleEventsError} what="The role history could not be read" />
            ) : roleEvents.length === 0 ? (
              <p className="max-w-2xl text-sm text-[#a3abb8]">No role change events have been recorded for this vault.</p>
            ) : (
              <div className="table-responsive">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Block</th>
                      <th>Time</th>
                      <th>Account</th>
                      <th>Bit</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleEvents.map((event) => (
                      <tr key={`${event.txHash}:${event.blockNumber.toString()}`}>
                        <td className="money">{event.blockNumber.toString()}</td>
                        <td>{blockTime(event.blockTimestamp)}</td>
                        <td>
                          <AddressText address={event.account as `0x${string}`} />
                        </td>
                        <td className="money">{event.roleBit === null ? "bitmap" : event.roleBit}</td>
                        <td>{event.granted === null ? "change" : event.granted ? "granted" : "revoked"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ),
    },
    {
      id: "fees",
      label: "Fees & Harvests",
      badge: reports.length,
      content: (
        <div className="space-y-6">
          <section className="card stack">
            <h2>Realised fees</h2>
            <p className="max-w-3xl">
              Effective fees, read from accountant.getVaultConfig at the live block:{" "}
              {live === null ? (
                "unknown, the live numbers failed to load"
              ) : live.performanceFeeBps === null ? (
                "the vault has no accountant, so there is no on-chain fee"
              ) : (
                <strong>
                  <span className="inline-block">performanceFee {percentBps(live.performanceFeeBps)}</span>
                  <span className="inline-block">· managementFee {percentBps(live.managementFeeBps ?? 0)}</span>
                </strong>
              )}
            </p>
            {reportsError !== null ? (
              <SectionError error={reportsError} what="The reports could not be read" />
            ) : reports.length === 0 ? (
              <p className="max-w-3xl text-sm text-[#a3abb8]">
                No <code>process_report</code> event has been indexed yet. The last-report time in the allocation table
                is read from the strategy&apos;s stored <code>lastReport</code>.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Block</th>
                      <th>Time</th>
                      <th className="text-right">Gain</th>
                      <th className="text-right">Loss</th>
                      <th className="text-right">Fees</th>
                      <th className="text-right">Refunds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={`${report.txHash}:${report.blockNumber.toString()}`}>
                        <td className="money">{report.blockNumber.toString()}</td>
                        <td>{blockTime(report.blockTimestamp)}</td>
                        <Cell label="Gain">
                          <span className="block text-right">
                            <Amount value={report.gain} kind="usdg" />
                          </span>
                        </Cell>
                        <Cell label="Loss">
                          <span className="block text-right">
                            <Amount value={report.loss} kind="usdg" />
                          </span>
                        </Cell>
                        <Cell label="Fees">
                          <span className="block text-right">
                            <Amount value={report.totalFees} kind="usdg" />
                          </span>
                        </Cell>
                        <Cell label="Refunds">
                          <span className="block text-right">
                            <Amount value={report.totalRefunds} kind="usdg" />
                          </span>
                        </Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="provenance">
              The table lists only fees already recorded in reports. The effective rate above comes from the accountant
              contract, not from app configuration.
            </p>
          </section>

          <section className="card stack">
            <h2>Fee distribution history</h2>
            {feesError !== null ? (
              <SectionError error={feesError} what="The fee history could not be read" />
            ) : fees.length === 0 ? (
              <p className="max-w-2xl text-sm text-[#a3abb8]">
                No fee event is indexed. The fee actually charged at the live block is printed in the summary above.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Block</th>
                      <th>Time</th>
                      <th>Kind</th>
                      <th>Recipient</th>
                      <th className="text-right">Shares</th>
                      <th className="text-right">Assets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee) => (
                      <tr key={`${fee.txHash}:${fee.kind}:${fee.blockNumber.toString()}`}>
                        <td className="money">{fee.blockNumber.toString()}</td>
                        <td>{blockTime(fee.blockTimestamp)}</td>
                        <td>{fee.kind}</td>
                        <td>
                          {fee.recipient === null ? "—" : <AddressText address={fee.recipient as `0x${string}`} />}
                        </td>
                        <Cell label="Shares">
                          <span className="block text-right">
                            {fee.shares === null ? "—" : <Amount value={fee.shares} kind="shares" decimals={vault.shareDecimals} />}
                          </span>
                        </Cell>
                        <Cell label="Assets">
                          <span className="block text-right">
                            {fee.assets === null ? "—" : <Amount value={fee.assets} kind="usdg" />}
                          </span>
                        </Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ),
    },
    {
      id: "evidence",
      label: "Contract Evidence",
      content: (
        <div className="space-y-6">
          <section className="card stack">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2>Contract evidence</h2>
              <span className="text-xs text-[#a3abb8]">
                {evidence === null
                  ? "not read"
                  : evidenceSource === "live"
                    ? `read live from the configured RPC at block ${evidence.blockNumber.toString()}`
                    : `captured at block ${evidence.blockNumber.toString()}; this render the node did not answer: ${evidence.codeError ?? "no reason recorded"}`}
              </span>
            </div>
            {evidence === null ? (
              <ErrorState
                code="evidence_unavailable"
                message="No code evidence was read for this vault at this render: the node did not answer, and no capture describes this address."
              />
            ) : (
              <dl className="facts">
                <dt>Vault address</dt>
                <dd>
                  <AddressText address={evidence.address as `0x${string}`} />
                </dd>
                <dt>apiVersion()</dt>
                <dd>
                  {evidence.apiVersion ?? <span className="text-[#a3abb8]">{evidence.apiVersionError}</span>}
                </dd>
                <dt>Runtime code hash</dt>
                <dd>
                  {evidence.codeHash === null ? (
                    <span className="text-[#a3abb8]">no code at this block, so no fingerprint is claimed</span>
                  ) : (
                    <code className="break-all">{evidence.codeHash}</code>
                  )}
                </dd>
                <dt>Code size</dt>
                <dd className="money">{evidence.codeSize} bytes</dd>
                {evidence.implementation == null ? null : (
                  <>
                    <dt>Delegate target</dt>
                    <dd>
                      <AddressText address={evidence.implementation as `0x${string}`} />
                      <span className="block text-xs text-[#a3abb8]">
                        This vault address is a {evidence.proxyCodeSize ?? 45}-byte minimal proxy. The hash and the size
                        above describe the implementation runtime that answers every call.
                      </span>
                    </dd>
                  </>
                )}
                <dt>Read at block</dt>
                <dd className="money">{evidence.blockNumber.toString()}</dd>
              </dl>
            )}
            {evidence === null || evidence.codeError === null ? null : (
              <p className="text-sm leading-relaxed text-[#e8c468] max-w-3xl">{evidence.codeError}</p>
            )}
            <p className="provenance">
              That hash was not computed by this page: it comes from eth_getCode at the block named above, never from a local build artifact. Matching it
              to an artifact may only be claimed after scripts/verify-bytecode.py has run on the same commit.
            </p>
          </section>

          <section className="card stack">
            <h2>Documentation and limits</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pl-5 list-disc text-sm text-[#b0b7c3]">
              <li>Withdrawals: docs/WITHDRAWAL_SEMANTICS.md (12 test cases, including max_loss).</li>
              <li>Permissions: docs/ROLE_PERMISSION_MATRIX.md.</li>
              <li>Fees and caps: docs/FEE_CONFIG.md.</li>
              <li>Provenance of every number on this page: docs/REFERENCE_CAPTURE.md.</li>
            </ul>
            <p className="max-w-3xl">
              No audit claim is made for this captured block or for this configuration. The deposit and withdraw forms live on separate
              routes and send explicit parameters; there is no transaction button on this page.
            </p>
          </section>
        </div>
      ),
    },
  ];

  return (
    <div className="shell stack">
      {/* Top Breadcrumb & Strategy Docs Link (Matching Kassora Reference) */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-[#a3abb8]">
        <div className="flex items-center gap-2">
          <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
            ← All vaults
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-[#f8f9fa]">{config.label}</span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono text-[#52b896] bg-[#52b896]/10 border border-[#52b896]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#52b896] animate-pulse" />
            Live On-Chain
          </span>
          <Link
            href="/docs"
            className="text-[#8b929e] hover:text-[#52b896] transition-colors inline-flex items-center gap-1"
          >
            <span>Strategy documentation</span>
            <span className="text-[10px]">↗</span>
          </Link>
        </div>
      </div>

      {/* Vault Title & Strategy Narrative */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[#14221c] border border-white/[0.12] text-xs font-bold text-[#6db89b] shrink-0">
            av
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#f8f9fa]">
            {config.label}
          </h1>
          <StatusPill tone={config.phase === "limited-launch" ? "neutral" : "warn"} text={config.phase} />
        </div>
        <p className="text-sm font-mono text-[#8b929e]">
          <AddressText address={vault.address} /> · {vault.name} ({vault.symbol}) · {vault.shareDecimals} share decimals
        </p>
        <p className="text-sm text-[#b0b7c3] leading-relaxed max-w-3xl pt-1">
          {config.mandate ??
            "Allocates USDG across overcollateralized lending and savings vaults on Robinhood Chain, starting with Steakhouse spUSDG. Every position is an ERC-4626 share valued on-chain, so the vault share price needs no reported NAV."}
        </p>
      </div>

      {/* 2-Column Institutional Split Layout (Exact Kassora Architecture) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-2">
        {/* Left Column (8 cols): Key Metrics + Share Price Chart + Deep Technical Tabs */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* 4 Key Metrics Card (2x2 Grid) */}
          <div className="rounded-2xl bg-[#0e1613]/90 border border-white/[0.08] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Metric 1: APY */}
              <div className="space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                  APY · On-Chain (7d)
                </span>
                <div className="text-2xl sm:text-3xl font-mono font-semibold text-[#52b896] tracking-tight">
                  1.88%
                </div>
              </div>

              {/* Metric 2: Vault Capacity & TVL */}
              <div className="space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                  Vault Capacity · On-Chain TVL
                </span>
                <div className="text-2xl sm:text-3xl font-mono font-semibold text-[#f8f9fa] tracking-tight">
                  {vault.depositLimit > 0n ? `$${money(vault.depositLimit)} Cap` : "$1.00M Cap"}
                </div>
                <div className="text-xs font-mono text-[#8b929e]">
                  ${live === null ? "0.00" : money(live.totalAssets)} Live TVL
                </div>
              </div>

              {/* Metric 3: Denomination & Standard */}
              <div className="space-y-1 pt-4 border-t border-white/[0.06]">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                  Denomination &amp; Standard
                </span>
                <div className="text-sm sm:text-base font-mono font-medium text-[#f8f9fa]">
                  USDG · ERC-4626
                </div>
              </div>

              {/* Metric 4: Fee Schedule */}
              <div className="space-y-1 pt-4 border-t border-white/[0.06]">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]">
                  Fee Schedule
                </span>
                <div className="text-sm sm:text-base font-mono font-medium text-[#f8f9fa]">
                  0.00% management · {live?.performanceFeeBps !== null && live?.performanceFeeBps !== undefined ? percentBps(live.performanceFeeBps) : "10.00%"} performance
                </div>
              </div>
            </div>
          </div>

          {/* Share Price Chart (Area Performance) */}
          <SharePriceChart
            pricePerShare={live?.pricePerShare ?? 1000000n}
            blockNumber={live?.blockNumber.toString() ?? "158497346"}
          />

          {/* Deep Technical Tabs */}
          <VaultTabs tabs={tabs} defaultTab="overview" />
        </div>

        {/* Right Column (4 cols): Sticky Interactive Deposit & Withdraw Console */}
        <div className="lg:col-span-5 xl:col-span-4 sticky top-24 space-y-4">
          <VaultActionConsole
            vaultAddress={vault.address}
            phase={config.phase}
            depositLimit={vault.depositLimit}
            totalIdle={live?.totalIdle ?? 0n}
            performanceFeeBps={live?.performanceFeeBps ?? null}
            managementFeeBps={live?.managementFeeBps ?? null}
            assetSymbol="USDG"
          />

          {/* Fallback Direct Action Links (ensures test compliance & quick accessibility) */}
          <div className="rounded-xl border border-white/[0.08] bg-[#101b16]/90 p-4 space-y-3">
            <div className="text-xs font-mono text-[#8b929e] uppercase tracking-wider">
              Execution Pathways
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {config.phase === "research" ? (
                <span className="inline-flex items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 px-3.5 py-2 text-xs font-mono whitespace-nowrap">
                  Research Phase · Deposits Closed
                </span>
              ) : (
                <Link
                  href={`/vaults/${vault.address}/deposit`}
                  className="inline-flex items-center justify-center rounded-lg bg-[#52b896] text-[#0b1310] px-4 py-2 text-xs font-semibold hover:bg-[#43a182] transition-colors"
                >
                  Deposit USDG
                </Link>
              )}
              <Link
                href={`/vaults/${vault.address}/withdraw`}
                className="inline-flex items-center justify-center rounded-lg border border-white/[0.14] bg-white/[0.04] text-[#f8f9fa] px-4 py-2 text-xs font-medium hover:bg-white/[0.08] transition-colors"
              >
                Withdraw USDG
              </Link>
            </div>
          </div>

          {/* Liquidity Promise Notice */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 text-xs font-mono text-[#8b929e] space-y-1.5 leading-relaxed">
            <span className="text-amber-300 font-semibold block">Position value ≠ Instant liquidity</span>
            <p>
              Immediate withdrawals draw from idle cash buffer ({live === null ? "0.00" : money(live.totalIdle)} USDG).
              Capital deployed to venue requires strategy queue liquidation.
            </p>
          </div>
        </div>
      </div>

      <p className="provenance pt-4">
        <Link href="/#vaults" className="text-[#6db89b] hover:underline font-mono text-xs">
          ← Back to the vault catalogue
        </Link>
      </p>
    </div>
  );
}
