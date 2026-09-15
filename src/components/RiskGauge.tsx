import { getRiskScoreColor } from "../utils/risk";

interface RiskGaugeProps {
  score: number;
  size?: number;
}

export function RiskGauge({ score, size = 96 }: RiskGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const stroke = size * 0.09;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = getRiskScoreColor(clamped);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Risk score ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-slate-100"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="tabular-nums font-semibold text-slate-900" style={{ fontSize: size * 0.28 }}>
          {clamped}
        </span>
      </div>
    </div>
  );
}
