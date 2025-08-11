import React, { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Pie3D from '../../components/charts/Pie3D';
import { getCurrentUserId, query } from '../../lib/sqlite/init';
import { useRouter } from 'next/router';

export default function Pie3DPage() {
  const router = useRouter();
  const [data, setData] = useState<Array<{ category: string; total: number }>>([]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUserId();
      const rows = await query(
        "SELECT COALESCE(NULLIF(TRIM(category), ''), 'Unknown') as category, SUM(amount) as total FROM transactions WHERE amount < 0 AND user_id = ? GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Unknown')",
        [user]
      );
      const processed = (rows as any[])
        .map((r) => ({ category: r.category || 'Unknown', total: Math.abs(Number(r.total) || 0) }))
        .filter((r) => r.total > 0);
      setData(processed);
    })();
  }, []);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn ghost" onClick={() => router.push('/app')}>← Back</button>
        <h2 style={{ margin: 0 }}>Spending by Category — 3D</h2>
      </div>
      <Card title="3D Pie">
        <Pie3D data={data} onSliceClick={(c) => router.push(`/app/category/${encodeURIComponent(c)}`)} />
      </Card>
    </div>
  );
}


