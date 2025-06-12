import { useState } from 'react';
import React from 'react';
interface ImporterProps {
  onImportComplete: () => void;
}

export default function Importer({ onImportComplete }: ImporterProps) {
  const [importing, setImporting] = useState(false);
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    try {
      // Mock import process
      console.log('Importing file:', file.name);
      await new Promise(resolve => setTimeout(resolve, 2000));
      onImportComplete();
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setImporting(false);
    }
  };
  
  return (
    <div>
      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={handleFileUpload}
        disabled={importing}
      />
      {importing && <p>Importing...</p>}
    </div>
  );
}
