import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SEVERITY_HEX } from '../utils/severity';

interface TrendLineChartProps {
  data: Array<{
    date: string;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info?: number;
    coverage_avg?: number;
  }>;
}

const TrendLineChart: React.FC<TrendLineChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Historical Trend</h3>
        <div className="flex items-center justify-center h-[300px] text-slate-400 text-sm">
          No trend data available
        </div>
      </div>
    );
  }

  const hasCoverage = data.some(d => d.coverage_avg !== undefined && d.coverage_avg !== null);

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Historical Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" />
          {hasCoverage && <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />}
          <Tooltip />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="critical" stroke={SEVERITY_HEX.critical} name="Critical" />
          <Line yAxisId="left" type="monotone" dataKey="high" stroke={SEVERITY_HEX.high} name="High" />
          <Line yAxisId="left" type="monotone" dataKey="medium" stroke={SEVERITY_HEX.medium} name="Medium" />
          <Line yAxisId="left" type="monotone" dataKey="low" stroke={SEVERITY_HEX.low} name="Low" />
          {hasCoverage && (
            <Line yAxisId="right" type="monotone" dataKey="coverage_avg" stroke="#6366f1" name="Coverage Avg" strokeDasharray="5 5" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrendLineChart;
