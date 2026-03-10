import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const OPTIONS = {
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `  ${ctx.raw} hosts`,
      },
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#6b7280', font: { size: 11 } },
    },
    y: {
      grid: { display: false },
      ticks: { color: '#9ca3af', font: { size: 11, family: 'monospace' } },
    },
  },
}

export default function PortBarChart({ data = [] }) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-600 text-sm">
        No data yet
      </div>
    )
  }

  const top = data.slice(0, 20)

  const chartData = {
    labels: top.map((d) => `${d.port}`),
    datasets: [
      {
        data: top.map((d) => d.count),
        backgroundColor: 'rgba(74, 222, 128, 0.75)',
        borderColor: 'rgba(74, 222, 128, 1)',
        borderWidth: 1,
        borderRadius: 3,
        hoverBackgroundColor: 'rgba(74, 222, 128, 0.95)',
      },
    ],
  }

  return (
    <div style={{ height: Math.max(180, top.length * 26) }}>
      <Bar data={chartData} options={OPTIONS} />
    </div>
  )
}
