import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { AnalyticsPayload } from "@/lib/ai-coach.schema";

/** Trend of the user's recent attempt percentages (oldest → newest). */
export function PerformanceTrendChart({ analytics }: { analytics: AnalyticsPayload }) {
  const data = [...analytics.recent_attempts]
    .filter((a) => a.submitted_at)
    .sort((a, b) => (a.submitted_at! < b.submitted_at! ? -1 : 1))
    .map((a, i) => ({
      label: `${i + 1}`,
      title: a.exam_title,
      percent: Number(a.percent.toFixed(1)),
    }));

  if (data.length < 2) return null;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">روند درصد آزمون‌های اخیر</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                fontSize: 12,
                direction: "rtl",
              }}
              formatter={(value: number) => [`${formatNumber(value, 1)}٪`, "درصد"]}
              labelFormatter={(_, payload) =>
                (payload?.[0]?.payload as { title?: string } | undefined)?.title ?? ""
              }
            />
            <Line
              type="monotone"
              dataKey="percent"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Correct-answer rate per subject. */
export function SubjectComparisonChart({ analytics }: { analytics: AnalyticsPayload }) {
  const data = analytics.subjects
    .filter((s) => s.attempts > 0)
    .slice(0, 8)
    .map((s) => ({ name: s.name, rate: Number(s.correct_rate.toFixed(1)) }));

  if (data.length === 0) return null;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">مقایسه درس‌ها (درصد پاسخ صحیح)</CardTitle>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              interval={0}
              stroke="var(--color-muted-foreground)"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                fontSize: 12,
                direction: "rtl",
              }}
              formatter={(value: number) => [`${formatNumber(value, 1)}٪`, "پاسخ صحیح"]}
            />
            <Bar dataKey="rate" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
