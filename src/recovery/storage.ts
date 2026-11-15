import type { RecoveryEpisode, RecoveryTrial } from './session';

export interface RecoveryStorage {
  load(): Promise<RecoveryEpisode | undefined>;
  save(episode: RecoveryEpisode): Promise<void>;
  archive(sessionId: string, trial: RecoveryTrial): Promise<void>;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('backlot-recovery', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('episodes');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const browserStorage: RecoveryStorage = {
  async load() {
    const db = await openDatabase();
    try {
      return await new Promise<RecoveryEpisode | undefined>((resolve, reject) => {
        const store = db.transaction('episodes').objectStore('episodes');
        const request = store.get('latest');
        request.onsuccess = () => {
          // Earlier builds stored the entire episode at this key.
          if (typeof request.result !== 'string') return resolve(request.result);
          const episode = store.get(request.result);
          episode.onsuccess = () => resolve(episode.result);
          episode.onerror = () => reject(episode.error);
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  },
  async save(episode) {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('episodes', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore('episodes');
        const key = 'session-' + episode.sessionId;
        const previous = store.get(key);
        previous.onsuccess = () => {
          // Two tabs can resume the same episode. Merge inside the write transaction so
          // independently measured trials remain accessible in the shared archive.
          const stored = previous.result as RecoveryEpisode | undefined;
          const trials = new Map(stored?.trials.map(t => [t.id, t]));
          for (const trial of episode.trials) trials.set(trial.id, trial);
          const merged = { ...episode, trials: [...trials.values()] };
          store.put(merged, key);
          if (merged.trials.some(trial => trial.skill)) store.put(key, 'latest');
        };
      });
    } finally {
      db.close();
    }
  },
  async archive(sessionId, trial) {
    const response = await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'recovery-trial', version: 1, sessionId, attemptId: trial.id, trial }),
    });
    if (!response.ok || !(await response.json()).ok) throw new Error(`Trial archive returned ${response.status}`);
  },
};
