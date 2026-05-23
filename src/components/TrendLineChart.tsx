import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TrendLineChartProps {
  data: Array<{
    date: string;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }>;
}

const TrendLineChart: React.FC<TrendLineChartProps> = ({ data }) => {
  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Historical Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="critical" stroke="#dc2626" name="Critical" />
          <Line type="monotone" dataKey="high" stroke="#ea580c" name="High" />
          <Line type="monotone" dataKey="medium" stroke="#ca8a04" name="Medium" />
          <Line type="monotone" dataKey="low" stroke="#16a34a" name="Low" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrendLineChart;
