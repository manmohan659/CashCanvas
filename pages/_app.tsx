import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AppProps } from 'next/app';
import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { Database } from '../lib/sqlite/init';
import '../styles/globals.css';
import Layout from '../components/ui/Layout';

interface AppContextType {
  dbReady: boolean;
  db: Database | null;
}

const AppContext = createContext<AppContextType>({ dbReady: false, db: null });

export const useAppContext = () => useContext(AppContext);

function MyApp({ Component, pageProps }: AppProps) {
  const [dbReady, setDbReady] = useState(false);
  const [database, setDatabase] = useState<Database | null>(null);
  const [supabaseClient] = useState(() => createPagesBrowserClient());

  useEffect(() => {
    // Initialize database here
    const initDb = async () => {
      try {
        const { initDatabase } = await import('../lib/sqlite/init');
        const db = await initDatabase();
        setDatabase(db);
        setDbReady(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
        // Allow UI to render even if DB fails to initialize (e.g., wasm not reachable)
        setDatabase(null);
        setDbReady(true);
      }
    };
    
    initDb();
  }, []);

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={pageProps.initialSession}
    >
      <AppContext.Provider value={{ dbReady, db: database }}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </AppContext.Provider>
    </SessionContextProvider>
  );
}

export default MyApp;