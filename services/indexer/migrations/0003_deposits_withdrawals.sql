-- 0003_deposits_withdrawals.sql — S-20: track Deposit and Withdraw event logs in dedicated tables.
--
-- Invariant rules (matching 0001_init.sql):
-- 1. Idempotent by (chain_id, tx_hash, log_index).
-- 2. Numbers are numeric(78,0) for exact uint256 precision.
-- 3. Timestamps are timestamptz from block header.
-- 4. No FK to vaults to allow ingestion order independence.

CREATE TABLE IF NOT EXISTS deposits (
    chain_id      integer       NOT NULL,
    vault_address text          NOT NULL,
    block_number  bigint        NOT NULL,
    block_hash    text          NOT NULL,
    block_time    timestamptz   NOT NULL,
    tx_hash       text          NOT NULL,
    log_index     integer       NOT NULL,
    sender        text          NOT NULL,
    owner         text          NOT NULL,
    assets        numeric(78,0) NOT NULL,
    shares        numeric(78,0) NOT NULL,
    PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS deposits_by_vault ON deposits (chain_id, vault_address, block_number);
CREATE INDEX IF NOT EXISTS deposits_by_owner ON deposits (chain_id, vault_address, owner);

CREATE TABLE IF NOT EXISTS withdrawals (
    chain_id      integer       NOT NULL,
    vault_address text          NOT NULL,
    block_number  bigint        NOT NULL,
    block_hash    text          NOT NULL,
    block_time    timestamptz   NOT NULL,
    tx_hash       text          NOT NULL,
    log_index     integer       NOT NULL,
    sender        text          NOT NULL,
    receiver      text          NOT NULL,
    owner         text          NOT NULL,
    assets        numeric(78,0) NOT NULL,
    shares        numeric(78,0) NOT NULL,
    PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS withdrawals_by_vault ON withdrawals (chain_id, vault_address, block_number);
CREATE INDEX IF NOT EXISTS withdrawals_by_owner ON withdrawals (chain_id, vault_address, owner);
