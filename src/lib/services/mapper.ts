/** Shared Firestore snapshot mapping helpers. */

import type {
  DocumentSnapshot,
  QuerySnapshot,
} from "firebase/firestore";

/** Maps a query snapshot to typed documents with their IDs attached. */
export function mapDocs<T>(snapshot: QuerySnapshot): T[] {
  return snapshot.docs.map((d) => ({id: d.id, ...d.data()}) as T);
}

/** Maps a single snapshot to a typed document, or null when absent. */
export function mapDoc<T>(snapshot: DocumentSnapshot): T | null {
  return snapshot.exists() ?
    ({id: snapshot.id, ...snapshot.data()} as T) :
    null;
}
