import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface PieSpendProps {
  data: Array<{ category: string; total: number }>;
}

// Generate deterministic colors based on category name
const getColorForCategory = (category: string): string => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

export default function PieSpend({ data }: PieSpendProps) {
  if (!data || data.length === 0) {
    return <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      No spending data available
    </div>;
  }

  return (
    <div style={{ height: '300px', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div>
        <p>Pie Chart Placeholder</p>
        <div>
          {data.map((item, index) => (
            <div key={index}>
              {item.category}: ${Math.abs(item.total)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
