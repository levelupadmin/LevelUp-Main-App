import AppShell from "@/components/layout/AppShell";
import { courses, workshops, categories } from "@/data/mockData";
import { Star, Clock, Users, Calendar } from "lucide-react";
import { useState } from "react";

const Learn = () => {
  const [activeTab, setActiveTab] = useState<"courses" | "workshops">("courses");

  return (
    <AppShell>
      <div className="space-y-5 py-4">
        <div className="px-4">
          <h1 className="font-display text-2xl font-bold text-foreground">Learn</h1>
          <p className="text-sm text-muted-foreground">Master your craft with India's best creators</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-4">
          {(["courses", "workshops"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? "gradient-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Categories */}
        <div className="flex gap-3 overflow-x-auto px-4 hide-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="flex min-w-fit items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className="text-xs text-muted-foreground">({cat.count})</span>
            </button>
          ))}
        </div>

        {activeTab === "courses" && (
          <div className="space-y-4 px-4">
            {courses.map((course) => (
              <div key={course.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
                <div className="relative">
                  <img src={course.thumbnail} alt={course.title} className="h-40 w-full object-cover" />
                  {course.isSubscription && (
                    <span className="absolute right-3 top-3 rounded-full gradient-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                      PRO
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <img src={course.instructorImage} alt={course.instructor} className="h-6 w-6 rounded-full object-cover" />
                    <span className="text-xs text-muted-foreground">{course.instructor}</span>
                  </div>
                  <h3 className="text-base font-display font-bold text-foreground">{course.title}</h3>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-primary" /> {course.rating}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {course.students.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {course.duration}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display font-bold text-primary">₹{course.price}</span>
                    <span className="text-xs text-muted-foreground">or ₹499/mo</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "workshops" && (
          <div className="space-y-3 px-4">
            {workshops.map((ws) => (
              <div key={ws.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <span className="mb-1 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {ws.category}
                    </span>
                    <h3 className="mt-1 font-display font-bold text-foreground">{ws.title}</h3>
                    <p className="text-xs text-muted-foreground">{ws.instructor}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {ws.date}
                      </span>
                      <span>{ws.time}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {ws.seats}/{ws.totalSeats} seats left
                      </span>
                      <div className="h-1.5 flex-1 rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full gradient-primary"
                          style={{ width: `${((ws.totalSeats - ws.seats) / ws.totalSeats) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="font-display text-xl font-bold text-primary">₹{ws.price}</p>
                    <button className="mt-2 rounded-lg gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground">
                      Register
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default Learn;
