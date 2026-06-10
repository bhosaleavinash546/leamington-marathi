import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TooltipItem,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { ComparisonDetail } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Props {
  details: ComparisonDetail[];
}

export default function BarChart({ details }: Props) {
  const sorted = [...details].sort((a, b) => a.sort_order - b.sort_order);

  const labels = sorted.map((d) => d.cost_element);
  const shouldCostData = sorted.map((d) => Number(d.should_cost_value));
  const quoteData      = sorted.map((d) => Number(d.quote_value));

  const data = {
    labels,
    datasets: [
      {
        label: 'Should-Cost',
        data: shouldCostData,
        backgroundColor: 'rgba(79, 70, 229, 0.75)',   // indigo
        borderColor: 'rgba(79, 70, 229, 1)',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Supplier Quote',
        data: quoteData,
        backgroundColor: 'rgba(245, 158, 11, 0.75)',  // amber
        borderColor: 'rgba(245, 158, 11, 1)',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            `${ctx.dataset.label}: ${Number(ctx.parsed.y ?? 0).toFixed(4)}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Unit Cost (currency)' },
      },
      x: {
        ticks: { maxRotation: 35, minRotation: 20 },
      },
    },
  };

  return <Bar data={data} options={options} />;
}
