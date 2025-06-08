import { useEffect, useRef } from 'react';
import { loadDatabase } from '../lib/sqlite/init';

export function useOfflineDB() {
  const dbRef = useRef<any>(null);

  useEffect(() => {
    loadDatabase().then(db => {
      dbRef.current = db;
    });
  }, []);

  return dbRef;
}
