import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

type Entry = { month: string; value: number };

export default function BarMonthly({ data }: { data: Entry[] }) {
  return (
    <BarChart width={500} height={300} data={data}>
      <XAxis dataKey="month" />
      <YAxis />
      <Tooltip />
      <Bar dataKey="value" fill="#82ca9d" />
    </BarChart>
  );
}
