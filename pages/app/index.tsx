import { useEffect, useState } from 'react';
import { loadDatabase } from '../../lib/sqlite/init';
import Importer from '../../components/Importer';

export default function AppPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadDatabase().then(() => setReady(true));
  }, []);

  if (!ready) return <p>Loading database...</p>;

  return (
    <div>
      <h2>Transactions</h2>
      <Importer />
    </div>
  );
}
