import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  revenueData, userGrowthData, completionData, cityDistribution, enrollmentByCategory, mentorStats,
} from "@/data/adminData";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COLORS = [
  "hsl(40, 60%, 55%)", "hsl(200, 60%, 55%)", "hsl(150, 50%, 50%)",
  "hsl(280, 50%, 55%)", "hsl(0, 60%, 55%)", "hsl(30, 70%, 55%)",
  "hsl(180, 50%, 50%)", "hsl(60, 50%, 50%)",
];

const AdminAnalytics = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [range, setRange] = useState("all");

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {isSuperAdmin ? "Platform metrics and growth trends" : "Your cohort performance"}
            </p>
          </div>
          <Tabs value={range} onValueChange={setRange}>
            <TabsList className="bg-secondary">
              <TabsTrigger value="7d" className="text-xs">7d</TabsTrigger>
              <TabsTrigger value="30d" className="text-xs">30d</TabsTrigger>
              <TabsTrigger value="90d" className="text-xs">90d</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isSuperAdmin ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Revenue Chart */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Revenue (₹)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 16%)" />
                  <XAxis dataKey="month" stroke="hsl(0, 0%, 45%)" fontSize={12} />
                  <YAxis stroke="hsl(0, 0%, 45%)" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(0, 0%, 10%)", border: "1px solid hsl(0, 0%, 16%)", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(0, 0%, 95%)" }}
                    formatter={(v: number) => [`₹${v.toLocaleString()}`, "Revenue"]}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(40, 60%, 55%)" strokeWidth={2} dot={{ fill: "hsl(40, 60%, 55%)", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* User Growth */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">User Growth</h3>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={userGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 16%)" />
                  <XAxis dataKey="month" stroke="hsl(0, 0%, 45%)" fontSize={12} />
                  <YAxis stroke="hsl(0, 0%, 45%)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "hsl(0, 0%, 10%)", border: "1px solid hsl(0, 0%, 16%)", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(0, 0%, 95%)" }}
                  />
                  <Area type="monotone" dataKey="users" stroke="hsl(200, 60%, 55%)" fill="hsl(200, 60%, 55%)" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Completion Rates */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Course Completion Rates</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={completionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 16%)" />
                  <XAxis type="number" stroke="hsl(0, 0%, 45%)" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="course" stroke="hsl(0, 0%, 45%)" fontSize={12} width={100} />
                  <Tooltip
                    contentStyle={{ background: "hsl(0, 0%, 10%)", border: "1px solid hsl(0, 0%, 16%)", borderRadius: 8 }}
                    formatter={(v: number) => [`${v}%`, "Completion"]}
                  />
                  <Bar dataKey="rate" fill="hsl(150, 50%, 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* City Distribution */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Users by City</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={cityDistribution} dataKey="users" nameKey="city" cx="50%" cy="50%" outerRadius={80} label={({ city, percent }) => `${city} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {cityDistribution.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(0, 0%, 10%)", border: "1px solid hsl(0, 0%, 16%)", borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Top Courses by Enrollment */}
            <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold text-foreground mb-4">Top Categories by Enrollment</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={enrollmentByCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 16%)" />
                  <XAxis dataKey="category" stroke="hsl(0, 0%, 45%)" fontSize={12} />
                  <YAxis stroke="hsl(0, 0%, 45%)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "hsl(0, 0%, 10%)", border: "1px solid hsl(0, 0%, 16%)", borderRadius: 8 }}
                  />
                  <Bar dataKey="enrollments" fill="hsl(40, 60%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          /* Mentor view */
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Enrolled Students", value: mentorStats.enrolledStudents },
              { label: "Pending Submissions", value: mentorStats.pendingSubmissions },
              { label: "Upcoming Sessions", value: mentorStats.upcomingSessions },
              { label: "Avg Rating", value: mentorStats.avgRating },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAnalytics;
