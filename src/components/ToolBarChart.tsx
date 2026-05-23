import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ToolData {
  tool: string;
  findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface ToolBarChartProps {
  tools: ToolData[];
}

const ToolBarChart: React.FC<ToolBarChartProps> = ({ tools }) => {
  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Tool Comparison</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={tools}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="tool" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="critical" fill="#dc2626" name="Critical" />
          <Bar dataKey="high" fill="#ea580c" name="High" />
          <Bar dataKey="medium" fill="#ca8a04" name="Medium" />
          <Bar dataKey="low" fill="#16a34a" name="Low" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ToolBarChart;
