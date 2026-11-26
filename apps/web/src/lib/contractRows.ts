// The contract rows on the home page, built from what was read during the render.
//
// The previous version printed a fixed table of chain-4663 capture addresses with a paragraph saying
// they were staging-fork deployments. On any other chain that table described contracts the page had
// not read. These rows come from the vault row, its allocation, its roles and code evidence instead,
// so the table can only name an address the node itself named.

import type { Allocation, Roles, VaultRow } from "./vaultView.ts";
import type { ContractEvidence } from "./evidence.ts";

export interface ContractRow {
  name: string;
  address: string;
  role: string;
  /** What is actually known about this address in this render. */
  observed: string;
  /** True only when the code at the address was read this render. */
  checked: boolean;
}

function shortHex(value: string | null | undefined): string {
  if (!value) return "not available";
  return value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-4)}`;
}

export function buildContractRows(input: {
  vault: VaultRow;
  allocation: Allocation | null;
  roles: Roles | null;
  evidence: ContractEvidence | null;
  /** Block the rows were read at, for the observations that name one. */
  blockNumber: bigint | null;
}): ContractRow[] {
  const { vault, allocation, roles, evidence, blockNumber } = input;
  const at = blockNumber === null ? "an unnamed block" : `block ${blockNumber.toString()}`;
  const rows: ContractRow[] = [];

  rows.push({
    name: `${vault.symbol} allocator vault`,
    address: vault.address,
    role: "ERC-4626 allocator vault, Yearn V3 lineage",
    observed:
      evidence === null
        ? "code not read this render, so no size or hash is printed"
        : `${evidence.codeSize.toLocaleString("en-US")} bytes of implementation runtime; keccak256 ${shortHex(evidence.codeHash)}${
            evidence.implementation ? ` behind a proxy at ${shortHex(evidence.implementation)}` : ""
          }`,
    checked: evidence !== null,
  });

  rows.push({
    name: "Underlying asset",
    address: vault.assetAddress,
    role: `What the vault reports from asset(), ${vault.assetDecimals} decimals`,
    observed: `Named by asset() at ${at}. This page does not read its code.`,
    checked: false,
  });

  for (const strategy of allocation?.strategies ?? []) {
    rows.push({
      name: strategy.venue === null ? "Strategy (venue not named)" : strategy.venue,
      address: strategy.address,
      role: `Strategy in the default queue, ${strategy.debtBps} bps of assets`,
      observed: `Debt and activation read at ${at}.`, 
      checked: false,
    });
  }

  const roleManager = roles?.roleManager ?? vault.roleManager;
  if (roleManager !== null && roleManager !== undefined) {
    const delay =
      roles?.timelockMinDelaySeconds === null || roles?.timelockMinDelaySeconds === undefined
        ? "delay not read"
        : `minimum delay ${roles.timelockMinDelaySeconds} s`;
    rows.push({
      name: roles === null ? "Role manager (vault row)" : "Role manager (roles read)",
      address: roleManager,
      role: `Holds the vault's roles; ${delay}`,
      observed:
        roles === null
          ? `From the vault row, not a roles() read this render.`
          : `role_manager() answered at ${at}.`,
      checked: roles !== null,
    });
  }

  if (vault.accountant !== null) {
    rows.push({
      name: "Accountant",
      address: vault.accountant,
      role: "Fee reporting for the vault",
      observed: `Named by accountant() at ${at}.`,
      checked: false,
    });
  }

  return rows;
}
