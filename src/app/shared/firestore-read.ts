// firestore-read.ts
import {
  DocumentReference, DocumentSnapshot, Firestore, disableNetwork, enableNetwork, onSnapshot,
} from '@angular/fire/firestore';

/** A read failed or did not finish in time. Never means "no document". */
export class ReadUnavailableError extends Error {
  readonly code = 'unavailable';
  constructor(message: string, readonly reason: 'timeout' | 'error' | 'signed-out' | 'cancelled' = 'error') {
    super(message);
  }
}

/**
 * True when a snapshot can be acted on: the document exists, or the server
 * has confirmed that it doesn't. "Missing, from cache" only means Firestore
 * hasn't reached the server yet (for example right after a cold start, when
 * it counts itself offline), so it is not an answer.
 */
export function isSettled<T>(snap: DocumentSnapshot<T>): boolean {
  return snap.exists() || !snap.metadata.fromCache;
}

/**
 * Reads one document, waiting for the connection. Unlike getDoc(), which
 * fails at once while Firestore counts itself offline, this listens until
 * the answer is settled (see isSettled), then stops listening. Rejects with
 * ReadUnavailableError after timeoutMs, or with the listener's error.
 * Call it inside runInInjectionContext, like the other Firestore calls.
 */
export function readSettledDoc<T>(ref: DocumentReference<T>, timeoutMs: number): Promise<DocumentSnapshot<T>> {
  return new Promise((resolve, reject) => {
    let done = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe?.();
      settle();
    };
    const timer = setTimeout(() => finish(() =>
      reject(new ReadUnavailableError(`No answer from the server within ${timeoutMs / 1000}s.`, 'timeout'))), timeoutMs);
    unsubscribe = onSnapshot(ref, { includeMetadataChanges: true },
      snap => { if (isSettled(snap)) finish(() => resolve(snap)); },
      err => finish(() => reject(err)));
    // Settled before onSnapshot returned: stop the listener now.
    if (done) unsubscribe();
  });
}

let reconnecting: Promise<void> | null = null;

/**
 * Makes Firestore try the server again now, for a Retry button. After a
 * while offline it waits longer and longer between attempts (up to about a
 * minute), so even once the phone is back online a read can keep waiting;
 * restarting its network skips that wait. Writes waiting to be sent are
 * kept and go out once it reconnects. Never throws.
 * Call it inside runInInjectionContext, like the other Firestore calls.
 */
export function reconnectNow(firestore: Firestore): Promise<void> {
  reconnecting ??= (async () => {
    try {
      await disableNetwork(firestore);
    } finally {
      await enableNetwork(firestore);
    }
  })()
    .catch(err => console.error('[firestore] reconnect failed:', err?.code ?? err))
    .finally(() => (reconnecting = null));
  return reconnecting;
}
