import React, { useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SEVERITY_HEX } from '../utils/severity';

interface SeverityPieChartProps {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info?: number;
  onSliceClick?: (severity: string) => void;
}

const SEVERITY_COLORS: Record<string, string> = SEVERITY_HEX;

const SeverityPieChart: React.FC<SeverityPieChartProps> = ({ critical, high, medium, low, info = 0, onSliceClick }) => {
  const data = [
    { name: 'Critical', value: critical },
    { name: 'High', value: high },
    { name: 'Medium', value: medium },
    { name: 'Low', value: low },
    { name: 'Info', value: info },
  ].filter(item => item.value > 0);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  const handleClick = useCallback((_data: unknown, index: number) => {
    if (onSliceClick && data[index]) {
      onSliceClick(data[index].name.toLowerCase());
    }
  }, [onSliceClick, data]);

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: { cx: number; cy: number; midAngle?: number; innerRadius: number; outerRadius: number; percent?: number }) => {
    if (!percent || percent === 0) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-(midAngle ?? 0) * RADIAN);
    const y = cy + radius * Math.sin(-(midAngle ?? 0) * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Severity Distribution</h3>
      {total === 0 ? (
        <div className="flex items-center justify-center h-[300px] text-slate-400 text-sm">
          No severity data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              innerRadius={60}
              outerRadius={100}
              dataKey="value"
              nameKey="name"
              style={{ cursor: onSliceClick ? 'pointer' : 'default' }}
              onClick={handleClick}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name.toLowerCase()]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [value, 'Findings']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default SeverityPieChart;
