// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Note: this file is purely for documentation. Any contents are not expected
// to be loaded as the JS file.

/**
 * # Transactions
 *
 * Each session can have at most one active transaction at a time. After the
 * active transaction is completed, the session can immediately be
 * re-used for the next transaction. It is not necessary to create a
 * new session for each transaction.
 *
 * # Transaction Modes
 *
 * Cloud Spanner supports two transaction modes:
 *
 *   1. Locking read-write. This type of transaction is the only way
 *      to write data into Cloud Spanner. These transactions rely on
 *      pessimistic locking and, if necessary, two-phase commit.
 *      Locking read-write transactions may abort, requiring the
 *      application to retry.
 *
 *   2. Snapshot read-only. This transaction type provides guaranteed
 *      consistency across several reads, but does not allow
 *      writes. Snapshot read-only transactions can be configured to
 *      read at timestamps in the past. Snapshot read-only
 *      transactions do not need to be committed.
 *
 * For transactions that only read, snapshot read-only transactions
 * provide simpler semantics and are almost always faster. In
 * particular, read-only transactions do not take locks, so they do
 * not conflict with read-write transactions. As a consequence of not
 * taking locks, they also do not abort, so retry loops are not needed.
 *
 * Transactions may only read/write data in a single database. They
 * may, however, read/write data in different tables within that
 * database.
 *
 * ## Locking Read-Write Transactions
 *
 * Locking transactions may be used to atomically read-modify-write
 * data anywhere in a database. This type of transaction is externally
 * consistent.
 *
 * Clients should attempt to minimize the amount of time a transaction
 * is active. Faster transactions commit with higher probability
 * and cause less contention. Cloud Spanner attempts to keep read locks
 * active as long as the transaction continues to do reads, and the
 * transaction has not been terminated by
 * Commit or
 * Rollback.  Long periods of
 * inactivity at the client may cause Cloud Spanner to release a
 * transaction's locks and abort it.
 *
 * Reads performed within a transaction acquire locks on the data
 * being read. Writes can only be done at commit time, after all reads
 * have been completed.
 * Conceptually, a read-write transaction consists of zero or more
 * reads or SQL queries followed by
 * Commit. At any time before
 * Commit, the client can send a
 * Rollback request to abort the
 * transaction.
 *
 * ### Semantics
 *
 * Cloud Spanner can commit the transaction if all read locks it acquired
 * are still valid at commit time, and it is able to acquire write
 * locks for all writes. Cloud Spanner can abort the transaction for any
 * reason. If a commit attempt returns `ABORTED`, Cloud Spanner guarantees
 * that the transaction has not modified any user data in Cloud Spanner.
 *
 * Unless the transaction commits, Cloud Spanner makes no guarantees about
 * how long the transaction's locks were held for. It is an error to
 * use Cloud Spanner locks for any sort of mutual exclusion other than
 * between Cloud Spanner transactions themselves.
 *
 * ### Retrying Aborted Transactions
 *
 * When a transaction aborts, the application can choose to retry the
 * whole transaction again. To maximize the chances of successfully
 * committing the retry, the client should execute the retry in the
 * same session as the original attempt. The original session's lock
 * priority increases with each consecutive abort, meaning that each
 * attempt has a slightly better chance of success than the previous.
 *
 * Under some circumstances (e.g., many transactions attempting to
 * modify the same row(s)), a transaction can abort many times in a
 * short period before successfully committing. Thus, it is not a good
 * idea to cap the number of retries a transaction can attempt;
 * instead, it is better to limit the total amount of wall time spent
 * retrying.
 *
 * ### Idle Transactions
 *
 * A transaction is considered idle if it has no outstanding reads or
 * SQL queries and has not started a read or SQL query within the last 10
 * seconds. Idle transactions can be aborted by Cloud Spanner so that they
 * don't hold on to locks indefinitely. In that case, the commit will
 * fail with error `ABORTED`.
 *
 * If this behavior is undesirable, periodically executing a simple
 * SQL query in the transaction (e.g., `SELECT 1`) prevents the
 * transaction from becoming idle.
 *
 * ## Snapshot Read-Only Transactions
 *
 * Snapshot read-only transactions provides a simpler method than
 * locking read-write transactions for doing several consistent
 * reads. However, this type of transaction does not support writes.
 *
 * Snapshot transactions do not take locks. Instead, they work by
 * choosing a Cloud Spanner timestamp, then executing all reads at that
 * timestamp. Since they do not acquire locks, they do not block
 * concurrent read-write transactions.
 *
 * Unlike locking read-write transactions, snapshot read-only
 * transactions never abort. They can fail if the chosen read
 * timestamp is garbage collected; however, the default garbage
 * collection policy is generous enough that most applications do not
 * need to worry about this in practice.
 *
 * Snapshot read-only transactions do not need to call
 * Commit or
 * Rollback (and in fact are not
 * permitted to do so).
 *
 * To execute a snapshot transaction, the client specifies a timestamp
 * bound, which tells Cloud Spanner how to choose a read timestamp.
 *
 * The types of timestamp bound are:
 *
 *   - Strong (the default).
 *   - Bounded staleness.
 *   - Exact staleness.
 *
 * If the Cloud Spanner database to be read is geographically distributed,
 * stale read-only transactions can execute more quickly than strong
 * or read-write transaction, because they are able to execute far
 * from the leader replica.
 *
 * Each type of timestamp bound is discussed in detail below.
 *
 * ### Strong
 *
 * Strong reads are guaranteed to see the effects of all transactions
 * that have committed before the start of the read. Furthermore, all
 * rows yielded by a single read are consistent with each other -- if
 * any part of the read observes a transaction, all parts of the read
 * see the transaction.
 *
 * Strong reads are not repeatable: two consecutive strong read-only
 * transactions might return inconsistent results if there are
 * concurrent writes. If consistency across reads is required, the
 * reads should be executed within a transaction or at an exact read
 * timestamp.
 *
 * See TransactionOptions.ReadOnly.strong.
 *
 * ### Exact Staleness
 *
 * These timestamp bounds execute reads at a user-specified
 * timestamp. Reads at a timestamp are guaranteed to see a consistent
 * prefix of the global transaction history: they observe
 * modifications done by all transactions with a commit timestamp <=
 * the read timestamp, and observe none of the modifications done by
 * transactions with a larger commit timestamp. They will block until
 * all conflicting transactions that may be assigned commit timestamps
 * <= the read timestamp have finished.
 *
 * The timestamp can either be expressed as an absolute Cloud Spanner commit
 * timestamp or a staleness relative to the current time.
 *
 * These modes do not require a "negotiation phase" to pick a
 * timestamp. As a result, they execute slightly faster than the
 * equivalent boundedly stale concurrency modes. On the other hand,
 * boundedly stale reads usually return fresher results.
 *
 * See TransactionOptions.ReadOnly.read_timestamp and
 * TransactionOptions.ReadOnly.exact_staleness.
 *
 * ### Bounded Staleness
 *
 * Bounded staleness modes allow Cloud Spanner to pick the read timestamp,
 * subject to a user-provided staleness bound. Cloud Spanner chooses the
 * newest timestamp within the staleness bound that allows execution
 * of the reads at the closest available replica without blocking.
 *
 * All rows yielded are consistent with each other -- if any part of
 * the read observes a transaction, all parts of the read see the
 * transaction. Boundedly stale reads are not repeatable: two stale
 * reads, even if they use the same staleness bound, can execute at
 * different timestamps and thus return inconsistent results.
 *
 * Boundedly stale reads execute in two phases: the first phase
 * negotiates a timestamp among all replicas needed to serve the
 * read. In the second phase, reads are executed at the negotiated
 * timestamp.
 *
 * As a result of the two phase execution, bounded staleness reads are
 * usually a little slower than comparable exact staleness
 * reads. However, they are typically able to return fresher
 * results, and are more likely to execute at the closest replica.
 *
 * Because the timestamp negotiation requires up-front knowledge of
 * which rows will be read, it can only be used with single-use
 * read-only transactions.
 *
 * See TransactionOptions.ReadOnly.max_staleness and
 * TransactionOptions.ReadOnly.min_read_timestamp.
 *
 * ### Old Read Timestamps and Garbage Collection
 *
 * Cloud Spanner continuously garbage collects deleted and overwritten data
 * in the background to reclaim storage space. This process is known
 * as "version GC". By default, version GC reclaims versions after they
 * are one hour old. Because of this, Cloud Spanner cannot perform reads
 * at read timestamps more than one hour in the past. This
 * restriction also applies to in-progress reads and/or SQL queries whose
 * timestamp become too old while executing. Reads and SQL queries with
 * too-old read timestamps fail with the error `FAILED_PRECONDITION`.
 *
 * @property {Object} readWrite
 *   Transaction may write.
 *
 *   Authorization to begin a read-write transaction requires
 *   `spanner.databases.beginOrRollbackReadWriteTransaction` permission
 *   on the `session` resource.
 *
 *   This object should have the same structure as [ReadWrite]{@link google.spanner.v1.ReadWrite}
 *
 * @property {Object} readOnly
 *   Transaction will not write.
 *
 *   Authorization to begin a read-only transaction requires
 *   `spanner.databases.beginReadOnlyTransaction` permission
 *   on the `session` resource.
 *
 *   This object should have the same structure as [ReadOnly]{@link google.spanner.v1.ReadOnly}
 *
 * @typedef TransactionOptions
 * @memberof google.spanner.v1
 * @see [google.spanner.v1.TransactionOptions definition in proto format]{@link https://github.com/googleapis/googleapis/blob/master/google/spanner/v1/transaction.proto}
 */
var TransactionOptions = {
  // This is for documentation. Actual contents will be loaded by gRPC.

  /**
   * Message type to initiate a read-write transaction. Currently this
   * transaction type has no options.
   * @typedef ReadWrite
   * @memberof google.spanner.v1
   * @see [google.spanner.v1.TransactionOptions.ReadWrite definition in proto format]{@link https://github.com/googleapis/googleapis/blob/master/google/spanner/v1/transaction.proto}
   */
  ReadWrite: {
    // This is for documentation. Actual contents will be loaded by gRPC.
  },

  /**
   * Message type to initiate a read-only transaction.
   *
   * @property {boolean} strong
   *   Read at a timestamp where all previously committed transactions
   *   are visible.
   *
   * @property {Object} minReadTimestamp
   *   Executes all reads at a timestamp >= `min_read_timestamp`.
   *
   *   This is useful for requesting fresher data than some previous
   *   read, or data that is fresh enough to observe the effects of some
   *   previously committed transaction whose timestamp is known.
   *
   *   Note that this option can only be used in single-use transactions.
   *
   *   A timestamp in RFC3339 UTC \"Zulu\" format, accurate to nanoseconds.
   *   Example: `"2014-10-02T15:01:23.045123456Z"`.
   *
   *   This object should have the same structure as [Timestamp]{@link google.protobuf.Timestamp}
   *
   * @property {Object} maxStaleness
   *   Read data at a timestamp >= `NOW - max_staleness`
   *   seconds. Guarantees that all writes that have committed more
   *   than the specified number of seconds ago are visible. Because
   *   Cloud Spanner chooses the exact timestamp, this mode works even if
   *   the client's local clock is substantially skewed from Cloud Spanner
   *   commit timestamps.
   *
   *   Useful for reading the freshest data available at a nearby
   *   replica, while bounding the possible staleness if the local
   *   replica has fallen behind.
   *
   *   Note that this option can only be used in single-use
   *   transactions.
   *
   *   This object should have the same structure as [Duration]{@link google.protobuf.Duration}
   *
   * @property {Object} readTimestamp
   *   Executes all reads at the given timestamp. Unlike other modes,
   *   reads at a specific timestamp are repeatable; the same read at
   *   the same timestamp always returns the same data. If the
   *   timestamp is in the future, the read will block until the
   *   specified timestamp, modulo the read's deadline.
   *
   *   Useful for large scale consistent reads such as mapreduces, or
   *   for coordinating many reads against a consistent snapshot of the
   *   data.
   *
   *   A timestamp in RFC3339 UTC \"Zulu\" format, accurate to nanoseconds.
   *   Example: `"2014-10-02T15:01:23.045123456Z"`.
   *
   *   This object should have the same structure as [Timestamp]{@link google.protobuf.Timestamp}
   *
   * @property {Object} exactStaleness
   *   Executes all reads at a timestamp that is `exact_staleness`
   *   old. The timestamp is chosen soon after the read is started.
   *
   *   Guarantees that all writes that have committed more than the
   *   specified number of seconds ago are visible. Because Cloud Spanner
   *   chooses the exact timestamp, this mode works even if the client's
   *   local clock is substantially skewed from Cloud Spanner commit
   *   timestamps.
   *
   *   Useful for reading at nearby replicas without the distributed
   *   timestamp negotiation overhead of `max_staleness`.
   *
   *   This object should have the same structure as [Duration]{@link google.protobuf.Duration}
   *
   * @property {boolean} returnReadTimestamp
   *   If true, the Cloud Spanner-selected read timestamp is included in
   *   the Transaction message that describes the transaction.
   *
   * @typedef ReadOnly
   * @memberof google.spanner.v1
   * @see [google.spanner.v1.TransactionOptions.ReadOnly definition in proto format]{@link https://github.com/googleapis/googleapis/blob/master/google/spanner/v1/transaction.proto}
   */
  ReadOnly: {
    // This is for documentation. Actual contents will be loaded by gRPC.
  }
};

/**
 * A transaction.
 *
 * @property {string} id
 *   `id` may be used to identify the transaction in subsequent
 *   Read,
 *   ExecuteSql,
 *   Commit, or
 *   Rollback calls.
 *
 *   Single-use read-only transactions do not have IDs, because
 *   single-use transactions do not support multiple requests.
 *
 * @property {Object} readTimestamp
 *   For snapshot read-only transactions, the read timestamp chosen
 *   for the transaction. Not returned by default: see
 *   TransactionOptions.ReadOnly.return_read_timestamp.
 *
 *   A timestamp in RFC3339 UTC \"Zulu\" format, accurate to nanoseconds.
 *   Example: `"2014-10-02T15:01:23.045123456Z"`.
 *
 *   This object should have the same structure as [Timestamp]{@link google.protobuf.Timestamp}
 *
 * @typedef Transaction
 * @memberof google.spanner.v1
 * @see [google.spanner.v1.Transaction definition in proto format]{@link https://github.com/googleapis/googleapis/blob/master/google/spanner/v1/transaction.proto}
 */
var Transaction = {
  // This is for documentation. Actual contents will be loaded by gRPC.
};

/**
 * This message is used to select the transaction in which a
 * Read or
 * ExecuteSql call runs.
 *
 * See TransactionOptions for more information about transactions.
 *
 * @property {Object} singleUse
 *   Execute the read or SQL query in a temporary transaction.
 *   This is the most efficient way to execute a transaction that
 *   consists of a single SQL query.
 *
 *   This object should have the same structure as [TransactionOptions]{@link google.spanner.v1.TransactionOptions}
 *
 * @property {string} id
 *   Execute the read or SQL query in a previously-started transaction.
 *
 * @property {Object} begin
 *   Begin a new transaction and execute this read or SQL query in
 *   it. The transaction ID of the new transaction is returned in
 *   ResultSetMetadata.transaction, which is a Transaction.
 *
 *   This object should have the same structure as [TransactionOptions]{@link google.spanner.v1.TransactionOptions}
 *
 * @typedef TransactionSelector
 * @memberof google.spanner.v1
 * @see [google.spanner.v1.TransactionSelector definition in proto format]{@link https://github.com/googleapis/googleapis/blob/master/google/spanner/v1/transaction.proto}
 */
var TransactionSelector = {
  // This is for documentation. Actual contents will be loaded by gRPC.
};