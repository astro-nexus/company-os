/**
 * CompanyOS Cloud Functions entry point.
 *
 * Server-side logic is deliberately limited to the two places it is actually
 * required:
 *   - attendance, where timestamps and working minutes must be trustworthy;
 *   - role/department assignment, which must never be client-writable.
 *
 * Tasks and activities are written directly from the client SDK and secured
 * by field-level Firestore Security Rules instead.
 */

import {setGlobalOptions} from "firebase-functions";

// For cost control, cap the number of concurrent containers per function.
setGlobalOptions({maxInstances: 10});

export {checkIn, checkOut, startBreak, endBreak} from "./attendance";
export {setUserRole} from "./admin";
