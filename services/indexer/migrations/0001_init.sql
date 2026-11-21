-- 0001_init.sql — Avenor indexer schema (epic 4, ticket 1).
--
-- Design rules that are deliberate, not incidental:
--
-- 1. **Every row is idempotent by `(chain_id, tx_hash, log_index)`.** Re-running a backfill over
--    a range must not duplicate anything; `raw_events` therefore carries the natural key of a log
--    and every derived table carries the log coordinates that produced it. `block_hash` is stored
--    next to the block number so a reorg is detectable without trusting the node twice.
--
-- 2. **No foreign keys from event tables to `vaults`/`strategies`.** An indexer sees a `Transfer`
--    from a vault it has not catalogued yet (first deposit in the deploy block, a second vault
--    added later). A FK would make ingestion order-dependent and lose the event; the catalogue
--    tables are metadata, and reconciliation (ticket 3) is what catches a missing catalogue row.
--    FKs are used only where the parent is guaranteed to be written first (`positions` ->
--    nothing, intentionally; `schema_migrations` is standalone).
--
-- 3. **Numbers are `numeric(78,0)`.** USDG is 6-decimal and vault shares are 18-decimal; both fit
--    in `uint256`. `numeric` keeps every digit exactly, unlike `float`, and 78 digits covers
--    `2^256`. Timestamps are `timestamptz` from the block header, never `now()`.
--
-- 4. **`source` columns say where a number came from** (`onchain` = `eth_call`, `indexed` =
--    derived from logs). The app must not present an indexed number as final (epic 4 outcome 5).

CREATE TABLE IF NOT EXISTS schema_migrations (
    name        text PRIMARY KEY,
    checksum    text NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
);

-- Catalogue ---------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vaults (
    chain_id             integer     NOT NULL,
    address              text        NOT NULL,
    name                 text,
    symbol               text,
    asset_address        text        NOT NULL,
    asset_decimals       smallint    NOT NULL,
    share_decimals       smallint    NOT NULL,
    role_manager         text,
    accountant           text,
    deposit_limit        numeric(78,0),
    deployed_block       bigint      NOT NULL,
    deployed_tx_hash     text,
    deployed_block_hash  text,
    source               text        NOT NULL DEFAULT 'indexed',
    updated_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, address),
    CONSTRAINT vaults_source_check CHECK (source IN ('indexed', 'onchain'))
);

CREATE TABLE IF NOT EXISTS strategies (
    chain_id        integer     NOT NULL,
    vault_address   text        NOT NULL,
    address         text        NOT NULL,
    name            text,
    symbol          text,
    asset_address   text,
    added_block     bigint      NOT NULL,
    added_tx_hash   text,
    removed_block   bigint,
    removed_tx_hash text,
    is_active       boolean     NOT NULL DEFAULT true,
    PRIMARY KEY (chain_id, vault_address, address)
);

CREATE INDEX IF NOT EXISTS strategies_by_address
    ON strategies (chain_id, address);

-- Raw logs: the replayable source of truth ------------------------------------------------

CREATE TABLE IF NOT EXISTS raw_events (
    chain_id     integer     NOT NULL,
    block_number bigint      NOT NULL,
    block_hash   text        NOT NULL,
    block_time   timestamptz NOT NULL,
    tx_hash      text        NOT NULL,
    log_index    integer     NOT NULL,
    address      text        NOT NULL,
    topic0       text        NOT NULL,
    topics       text[]      NOT NULL,
    data         text        NOT NULL,
    removed      boolean     NOT NULL DEFAULT false,
    inserted_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS raw_events_by_block
    ON raw_events (chain_id, block_number);
CREATE INDEX IF NOT EXISTS raw_events_by_address
    ON raw_events (chain_id, address, block_number);

-- Block boundaries actually ingested, per stream. Reorg rollback needs a block hash it can
-- compare against the node; one row per chunk end is enough to find a common ancestor without
-- asking the node for every empty block in a 50k-block backfill.
CREATE TABLE IF NOT EXISTS ingested_blocks (
    chain_id     integer NOT NULL,
    stream       text    NOT NULL,
    block_number bigint  NOT NULL,
    block_hash   text    NOT NULL,
    PRIMARY KEY (chain_id, stream, block_number)
);

-- Current role bitmap per account. `RoleSet` carries the whole bitmap, so an event is only
-- interpretable against the previous value; keeping the current bitmap makes the diff explicit
-- and lets `role_events` stay one row per bit.
CREATE TABLE IF NOT EXISTS role_state (
    chain_id      integer  NOT NULL,
    vault_address text     NOT NULL,
    account       text     NOT NULL,
    bitmap        numeric(78,0) NOT NULL,
    updated_block bigint   NOT NULL,
    PRIMARY KEY (chain_id, vault_address, account)
);

-- Derived tables ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS share_price_snapshots (
    chain_id        integer     NOT NULL,
    vault_address   text        NOT NULL,
    block_number    bigint      NOT NULL,
    block_hash      text        NOT NULL,
    block_time      timestamptz NOT NULL,
    total_assets    numeric(78,0) NOT NULL,
    total_supply    numeric(78,0) NOT NULL,
    price_per_share numeric(78,0) NOT NULL,
    source          text        NOT NULL,
    PRIMARY KEY (chain_id, vault_address, block_number),
    CONSTRAINT snapshots_source_check CHECK (source IN ('indexed', 'onchain'))
);

CREATE TABLE IF NOT EXISTS positions (
    chain_id            integer     NOT NULL,
    vault_address       text        NOT NULL,
    account             text        NOT NULL,
    shares              numeric(78,0) NOT NULL,
    first_seen_block    bigint      NOT NULL,
    last_activity_block bigint      NOT NULL,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, vault_address, account),
    CONSTRAINT positions_non_negative CHECK (shares >= 0)
);

-- Share movements. Kept separate from `raw_events` so rebuilding a position is a sum over one
-- small table while the raw log stays available for replay.
CREATE TABLE IF NOT EXISTS share_transfers (
    chain_id     integer     NOT NULL,
    vault_address text       NOT NULL,
    block_number bigint      NOT NULL,
    block_hash   text        NOT NULL,
    tx_hash      text        NOT NULL,
    log_index    integer     NOT NULL,
    from_address text        NOT NULL,
    to_address   text        NOT NULL,
    shares       numeric(78,0) NOT NULL,
    PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS share_transfers_by_from ON share_transfers (chain_id, vault_address, from_address);
CREATE INDEX IF NOT EXISTS share_transfers_by_to ON share_transfers (chain_id, vault_address, to_address);

CREATE TABLE IF NOT EXISTS reports (
    chain_id          integer     NOT NULL,
    vault_address     text        NOT NULL,
    strategy_address  text        NOT NULL,
    block_number      bigint      NOT NULL,
    block_hash        text        NOT NULL,
    block_time        timestamptz NOT NULL,
    tx_hash           text        NOT NULL,
    log_index         integer     NOT NULL,
    gain              numeric(78,0) NOT NULL,
    loss              numeric(78,0) NOT NULL,
    total_fees        numeric(78,0),
    total_refunds     numeric(78,0),
    PRIMARY KEY (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS reports_by_vault ON reports (chain_id, vault_address, block_number);

CREATE TABLE IF NOT EXISTS fees (
    chain_id         integer     NOT NULL,
    vault_address    text        NOT NULL,
    strategy_address text,
    block_number     bigint      NOT NULL,
    block_hash       text        NOT NULL,
    block_time       timestamptz NOT NULL,
    tx_hash          text        NOT NULL,
    log_index        integer     NOT NULL,
    fee_kind         text        NOT NULL,
    recipient        text,
    shares           numeric(78,0),
    assets           numeric(78,0),
    PRIMARY KEY (chain_id, tx_hash, log_index, fee_kind),
    CONSTRAINT fees_kind_check CHECK (fee_kind IN ('performance', 'management', 'protocol', 'refund'))
);

CREATE INDEX IF NOT EXISTS fees_by_vault ON fees (chain_id, vault_address, block_number);

CREATE TABLE IF NOT EXISTS role_events (
    chain_id      integer     NOT NULL,
    vault_address text        NOT NULL,
    account       text        NOT NULL,
    role_bit      integer,
    granted       boolean,
    block_number  bigint      NOT NULL,
    block_hash    text        NOT NULL,
    block_time    timestamptz NOT NULL,
    tx_hash       text        NOT NULL,
    log_index     integer     NOT NULL,
    PRIMARY KEY (chain_id, tx_hash, log_index),
    CONSTRAINT role_events_bit_check CHECK (role_bit IS NULL OR (role_bit >= 0 AND role_bit < 256))
);

CREATE INDEX IF NOT EXISTS role_events_by_account ON role_events (chain_id, vault_address, account);

CREATE TABLE IF NOT EXISTS venue_snapshots (
    chain_id       integer     NOT NULL,
    venue_address  text        NOT NULL,
    block_number   bigint      NOT NULL,
    block_hash     text        NOT NULL,
    block_time     timestamptz NOT NULL,
    total_assets   numeric(78,0) NOT NULL,
    total_supply   numeric(78,0) NOT NULL,
    idle_cash      numeric(78,0),
    source         text        NOT NULL,
    PRIMARY KEY (chain_id, venue_address, block_number),
    CONSTRAINT venue_snapshots_source_check CHECK (source IN ('indexed', 'onchain'))
);

-- Checkpoints -------------------------------------------------------------------------------

-- One row per (chain, stream). `stream` names what is being ingested, so a second contract type
-- (venue snapshots, a future vault) does not share a cursor. `last_block_hash` is what makes a
-- reorg check possible before continuing: the next poll asks the node for that block and compares.
CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
    chain_id        integer     NOT NULL,
    stream          text        NOT NULL,
    last_block      bigint      NOT NULL,
    last_block_hash text        NOT NULL,
    confirmations   integer     NOT NULL DEFAULT 12,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (chain_id, stream)
);