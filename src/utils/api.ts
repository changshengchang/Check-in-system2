import { CheckInRecord, EventInfo, RegisteredParticipant } from '../types';

export interface SyncDataResponse {
  eventInfo: EventInfo;
  roster: RegisteredParticipant[];
  checkIns: CheckInRecord[];
  version: number;
  updatedAt: string;
}

/**
 * Fetch latest synced state from backend
 */
export async function fetchEventData(): Promise<SyncDataResponse | null> {
  try {
    const res = await fetch('/api/data', {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[Sync API] Failed to fetch data from server, falling back to local storage:', err);
    return null;
  }
}

/**
 * Update event information on server
 */
export async function updateEventInfoApi(eventInfo: EventInfo): Promise<boolean> {
  try {
    const res = await fetch('/api/event', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventInfo)
    });
    return res.ok;
  } catch (err) {
    console.error('[Sync API] Failed to update event on server:', err);
    return false;
  }
}

/**
 * Submit or update a check-in record on server
 */
export async function submitCheckInApi(record: CheckInRecord): Promise<boolean> {
  try {
    const res = await fetch('/api/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    return res.ok;
  } catch (err) {
    console.error('[Sync API] Failed to submit checkin to server:', err);
    return false;
  }
}

/**
 * Delete a check-in record on server
 */
export async function deleteCheckInApi(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/checkins/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch (err) {
    console.error('[Sync API] Failed to delete checkin on server:', err);
    return false;
  }
}

/**
 * Reset all check-in records on server
 */
export async function resetCheckInsApi(): Promise<boolean> {
  try {
    const res = await fetch('/api/checkins/reset', {
      method: 'POST'
    });
    return res.ok;
  } catch (err) {
    console.error('[Sync API] Failed to reset checkins on server:', err);
    return false;
  }
}

/**
 * Batch update/replace/append roster on server
 */
export async function updateRosterApi(
  roster: RegisteredParticipant[],
  mode: 'replace' | 'append'
): Promise<boolean> {
  try {
    const res = await fetch('/api/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roster, mode })
    });
    return res.ok;
  } catch (err) {
    console.error('[Sync API] Failed to update roster on server:', err);
    return false;
  }
}

/**
 * Add single attendee to roster on server
 */
export async function addRosterParticipantApi(
  participant: RegisteredParticipant
): Promise<boolean> {
  try {
    const res = await fetch('/api/roster/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(participant)
    });
    return res.ok;
  } catch (err) {
    console.error('[Sync API] Failed to add roster participant on server:', err);
    return false;
  }
}

/**
 * Delete single attendee from roster on server
 */
export async function deleteRosterParticipantApi(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/roster/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch (err) {
    console.error('[Sync API] Failed to delete roster participant on server:', err);
    return false;
  }
}
