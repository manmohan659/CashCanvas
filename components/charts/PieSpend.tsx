import { PieChart, Pie, Tooltip } from 'recharts';

type Entry = { name: string; value: number };

export default function PieSpend({ data }: { data: Entry[] }) {
  return (
    <PieChart width={400} height={400}>
      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" />
      <Tooltip />
    </PieChart>
  );
}
