import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AppProps } from 'next/app';
import { Database } from '../lib/sqlite/init';

interface AppContextType {
  dbReady: boolean;
  db: Database | null;
}

const AppContext = createContext<AppContextType>({ dbReady: false, db: null });

export const useAppContext = () => useContext(AppContext);

function MyApp({ Component, pageProps }: AppProps) {
  const [dbReady, setDbReady] = useState(false);
  const [db, setDb] = useState<Database | null>(null);

  useEffect(() => {
    // Initialize database here
    const initDb = async () => {
      try {
        const { initDatabase } = await import('../lib/sqlite/init');
        const database = await initDatabase();
        setDb(database);
        setDbReady(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    };
    
    initDb();
  }, []);

  return (
    <AppContext.Provider value={{ dbReady, db }}>
      <Component {...pageProps} />
    </AppContext.Provider>
  );
}

export default MyApp;