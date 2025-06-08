// TODO: Implement bar chart for monthly spend vs. income using Recharts
import React from 'react';
// import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'; // Example import

const BarMonthly: React.FC = () => {
  // TODO: Fetch data from SQLite/Supabase and format for Recharts
  const data = [
    { month: 'Jan', income: 4000, expenses: 2400 },
    { month: 'Feb', income: 3000, expenses: 1398 },
    // ... more months
  ];

  return (
    <div>
      <h3>Monthly Spend vs. Income</h3>
      {/* TODO: Implement Recharts BarChart */}
      <p>Bar chart placeholder</p>
    </div>
  );
};

export default BarMonthly;
