import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

type Entry = { date: string; value: number };

export default function LineTrend({ data }: { data: Entry[] }) {
  return (
    <LineChart width={500} height={300} data={data}>
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="value" stroke="#8884d8" />
    </LineChart>
  );
}
