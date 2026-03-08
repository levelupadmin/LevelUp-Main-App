import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { mockFlaggedItems } from "@/data/adminData";
import { Shield, AlertTriangle, MessageSquare, User, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const typeIcon = { post: MessageSquare, comment: AlertTriangle, user: User };

const AdminModeration = () => {
  const { toast } = useToast();
  const [items, setItems] = useState(mockFlaggedItems);

  const openCount = items.filter((i) => i.status === "open").length;
  const resolvedToday = items.filter((i) => i.status === "resolved").length;

  const handleAction = (id: string, action: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "resolved" as const } : i)));
    toast({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} action taken`,
      description: "Report has been resolved.",
    });
  };

  const renderItems = (type: string | null) => {
    const filtered = items.filter((i) => (!type || i.type === type));
    if (filtered.length === 0) return <div className="py-12 text-center text-muted-foreground">No items found.</div>;

    return (
      <div className="space-y-3">
        {filtered.map((item) => {
          const Icon = typeIcon[item.type];
          return (
            <div key={item.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="rounded-md bg-secondary p-2 mt-0.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={
                        item.status === "open"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-green-500/10 text-green-400 border-green-500/20"
                      }>
                        {item.status}
                      </Badge>
                      <Badge variant="outline" className="bg-secondary text-muted-foreground">{item.type}</Badge>
                      <span className="text-xs text-muted-foreground">{item.reason}</span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{item.content}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>By: {item.author}</span>
                      <span>Reported by: {item.reporter}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{item.timestamp}</span>
                    </div>
                  </div>
                </div>
                {item.status === "open" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleAction(item.id, "dismiss")}>Dismiss</Button>
                    <Button size="sm" variant="outline" className="text-[hsl(var(--highlight))]" onClick={() => handleAction(item.id, "warn")}>
                      Warn
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleAction(item.id, "remove")}>Remove</Button>
                  </div>
                )}
                {item.status === "resolved" && (
                  <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Moderation</h1>
          <p className="text-sm text-muted-foreground">Review flagged content and manage reports</p>
        </div>

        {/* Stats Bar */}
        <div className="flex gap-4">
          {[
            { label: "Open Reports", value: openCount, icon: AlertTriangle },
            { label: "Resolved Today", value: resolvedToday, icon: CheckCircle2 },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-lg font-bold text-foreground">{s.value}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            );
          })}
        </div>

        <Tabs defaultValue="all">
          <TabsList className="bg-secondary">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="post">Flagged Posts</TabsTrigger>
            <TabsTrigger value="comment">Comments</TabsTrigger>
            <TabsTrigger value="user">Reported Users</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4">{renderItems(null)}</TabsContent>
          <TabsContent value="post" className="mt-4">{renderItems("post")}</TabsContent>
          <TabsContent value="comment" className="mt-4">{renderItems("comment")}</TabsContent>
          <TabsContent value="user" className="mt-4">{renderItems("user")}</TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminModeration;
