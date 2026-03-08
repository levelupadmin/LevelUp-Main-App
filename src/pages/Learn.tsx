import AppShell from "@/components/layout/AppShell";
import { courses, workshops, categories } from "@/data/mockData";
import { Star, Clock, Users, Calendar } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Learn = () => {
  const [activeTab, setActiveTab] = useState<"courses" | "workshops">("courses");
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Learn</h1>
          <p className="text-sm text-muted-foreground">Master your craft with India's best creators</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-border">
          {(["courses", "workshops"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "courses" ? "Masterclasses" : "Workshops"}
            </button>
          ))}
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="flex min-w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30"
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className="text-xs text-muted-foreground">({cat.count})</span>
            </button>
          ))}
        </div>

        {activeTab === "courses" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <div
                key={course.id}
                className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
                onClick={() => navigate(`/learn/course/${course.id}`)}
              >
                <div className="relative">
                  <img src={course.thumbnail} alt={course.title} className="h-44 w-full object-cover" />
                  {course.isSubscription && (
                    <span className="absolute right-3 top-3 rounded-md bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                      PRO
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <img src={course.instructorImage} alt={course.instructor} className="h-6 w-6 rounded-full object-cover" />
                    <span className="text-xs text-muted-foreground">{course.instructor}</span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{course.title}</h3>
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
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                    <span className="font-bold text-primary">₹{course.price}</span>
                    <span className="text-xs text-muted-foreground">or ₹499/mo</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "workshops" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {workshops.map((ws) => (
              <div
                key={ws.id}
                className="cursor-pointer rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30"
                onClick={() => navigate(`/workshops/${ws.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <span className="mb-2 inline-block rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {ws.category}
                    </span>
                    <h3 className="mt-1 font-bold text-foreground">{ws.title}</h3>
                    <p className="text-xs text-muted-foreground">{ws.instructor}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {ws.date}
                      </span>
                      <span>{ws.time}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {ws.seats}/{ws.totalSeats} seats left
                      </span>
                      <div className="h-1.5 flex-1 rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${((ws.totalSeats - ws.seats) / ws.totalSeats) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-xl font-bold text-primary">₹{ws.price}</p>
                    <button className="mt-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
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
