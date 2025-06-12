let db: any = null;

// Define the Database type based on your mock implementation
export interface Database {
  exec: (sql: string) => Promise<any[]>;
  upsert: (table: string, data: any) => Promise<any>;
}

export const loadDatabase = async (): Promise<Database> => {
  if (db) return db;
  
  // Mock database for now - replace with actual SQLite implementation
  db = {
    exec: async (sql: string) => {
      console.log('Executing SQL:', sql);
      return [];
    },
    upsert: async (table: string, data: any) => {
      console.log('Upserting into', table, ':', data);
      return data;
    }
  };
  
  // Initialize tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY,
      date TEXT,
      amount REAL,
      category TEXT,
      description TEXT
    )
  `);
  
  return db;
};

// Add the missing initDatabase function
export const initDatabase = loadDatabase;

// Export the db instance
export { db };

export const query = async (sql: string, params: any[] = []) => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  // Mock query results for development
  if (sql.includes('GROUP BY category')) {
    return [
      { category: 'Food', total: -500 },
      { category: 'Transport', total: -200 },
      { category: 'Entertainment', total: -150 }
    ];
  }
  
  if (sql.includes('GROUP BY strftime')) {
    return [
      { month: '2024-01', value: -800 },
      { month: '2024-02', value: -750 },
      { month: '2024-03', value: -900 }
    ];
  }
  
  if (sql.includes('SUM(amount) OVER')) {
    return [
      { date: '2024-01-01', value: 1000 },
      { date: '2024-01-15', value: 800 },
      { date: '2024-02-01', value: 600 }
    ];
  }
  
  return [];
};