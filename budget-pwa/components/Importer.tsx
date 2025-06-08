// TODO: Implement file importer component
import React from 'react';

const Importer: React.FC = () => {
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    // TODO: Handle file selection and POST to /api/upload
  };

  return (
    <div>
      <h2>Import Transactions</h2>
      <input type="file" accept=".csv,.ofx" onChange={handleFileUpload} />
      {/* TODO: Add UI for upload progress and status */}
    </div>
  );
};

export default Importer;
