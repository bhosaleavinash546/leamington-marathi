// Waterfall chart showing the variance contribution per cost element.
// Chart.js doesn't have a native waterfall type, so we build it using
// a stacked bar with a transparent "spacer" dataset.

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { ComparisonDetail } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Props {
  details: ComparisonDetail[];
}

export default function WaterfallChart({ details }: Props) {
  const sorted = [...details].sort((a, b) => a.sort_order - b.sort_order);

  // Build running base (offset) and bar height for each column
  let runningBase = 0;
  const bars: { label: string; base: number; delta: number; isPositive: boolean }[] = [];

  for (const d of sorted) {
    const delta = Number(d.variance);
    bars.push({ label: d.cost_element, base: runningBase, delta, isPositive: delta >= 0 });
    runningBase += delta;
  }

  const labels     = bars.map((b) => b.label);
  const spacerData = bars.map((b) => (b.isPositive ? b.base : b.base + b.delta));
  const posData    = bars.map((b) => (b.isPositive ? b.delta : 0));
  const negData    = bars.map((b) => (!b.isPositive ? Math.abs(b.delta) : 0));

  const data = {
    labels,
    datasets: [
      {
        label: 'Spacer',
        data: spacerData,
        backgroundColor: 'rgba(0,0,0,0)',
        stack: 'waterfall',
        // Hide spacer from tooltip
        tooltip: { enabled: false },
      },
      {
        label: 'Over target (quote higher)',
        data: posData,
        backgroundColor: 'rgba(239, 68, 68, 0.75)',   // red
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
        borderRadius: 4,
        stack: 'waterfall',
      },
      {
        label: 'Under target (quote lower)',
        data: negData,
        backgroundColor: 'rgba(22, 163, 74, 0.75)',   // green
        borderColor: 'rgba(22, 163, 74, 1)',
        borderWidth: 1,
        borderRadius: 4,
        stack: 'waterfall',
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        filter: (item: { datasetIndex: number }) => item.datasetIndex !== 0, // hide spacer
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) => {
            const isNeg = ctx.dataset.label?.includes('Under');
            const val = ctx.parsed.y;
            return `${ctx.dataset.label}: ${isNeg ? '-' : '+'}${val.toFixed(4)}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { maxRotation: 35, minRotation: 20 },
      },
      y: {
        stacked: true,
        title: { display: true, text: 'Variance (Quote − Should-Cost)' },
      },
    },
  };

  return <Bar data={data} options={options} />;
}
