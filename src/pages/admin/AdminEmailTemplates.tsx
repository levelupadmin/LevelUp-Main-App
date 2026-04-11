import { useEffect, useState, useCallback, useRef } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import DOMPurify from "dompurify";

interface TemplateRow {
  id: string;
  template_key: string;
  name: string;
  subject: string;
  html_body: string;
  text_body: string;
  variables: { key: string; label: string }[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SAMPLE_DATA: Record<string, string> = {
  student_name: "Jane Doe",
  app_url: "https://app.leveluplearning.in",
  course_name: "Advanced React Patterns",
  course_id: "abc-123",
  offering_name: "React Masterclass Q1",
  amount: "4,999",
  payment_id: "pay_QrstuVwXyZ",
  date: new Date().toLocaleDateString("en-IN"),
  certificate_number: "CERT-2026-0042",
};

const AdminEmailTemplates = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<TemplateRow | null>(null);
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [textBody, setTextBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const htmlBodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("email_templates")
      .select("*")
      .order("created_at", { ascending: true });
    setTemplates((data || []) as TemplateRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEditor = (t: TemplateRow) => {
    setEditTemplate(t);
    setSubject(t.subject);
    setHtmlBody(t.html_body);
    setTextBody(t.text_body);
    setIsActive(t.is_active);
    setShowPreview(false);
    setEditOpen(true);
  };

  const insertVariable = (key: string, target: "subject" | "html" | "text") => {
    const placeholder = `{{${key}}}`;
    if (target === "subject" && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const newVal = subject.slice(0, start) + placeholder + subject.slice(end);
      setSubject(newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    } else if (target === "html" && htmlBodyRef.current) {
      const el = htmlBodyRef.current;
      const start = el.selectionStart ?? htmlBody.length;
      const end = el.selectionEnd ?? htmlBody.length;
      const newVal = htmlBody.slice(0, start) + placeholder + htmlBody.slice(end);
      setHtmlBody(newVal);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    }
  };

  const renderPreview = (html: string) => {
    let rendered = html;
    for (const [key, val] of Object.entries(SAMPLE_DATA)) {
      rendered = rendered.replaceAll(`{{${key}}}`, val);
    }
    return DOMPurify.sanitize(rendered);
  };

  const handleSave = async () => {
    if (!editTemplate) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("email_templates")
      .update({
        subject,
        html_body: htmlBody,
        text_body: textBody,
        is_active: isActive,
      })
      .eq("id", editTemplate.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template saved" });
      setEditOpen(false);
      load();
    }
    setSaving(false);
  };

  return (
    <AdminLayout title="Email Templates">
      <p className="text-muted-foreground text-sm mb-6">
        Manage transactional email templates. Edit content and variables for automated emails.
      </p>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Template Key</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Subject</th>
              <th className="px-5 py-3 font-medium">Active</th>
              <th className="px-5 py-3 font-medium">Last Updated</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Loading...</td></tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No templates found
                </td>
              </tr>
            ) : templates.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-5 py-3 font-mono text-xs">{t.template_key}</td>
                <td className="px-5 py-3 font-medium">{t.name}</td>
                <td className="px-5 py-3 text-muted-foreground max-w-[250px] truncate">{t.subject}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${t.is_active ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]" : "bg-secondary text-muted-foreground"}`}>
                    {t.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs">
                  {new Date(t.updated_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => openEditor(t)} className="p-1.5 rounded hover:bg-secondary" title="Edit template">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template: {editTemplate?.name}</DialogTitle>
          </DialogHeader>
          {editTemplate && (
            <div className="space-y-5">
              {/* Template key (read-only) */}
              <div>
                <Label className="text-muted-foreground">Template Key</Label>
                <p className="font-mono text-sm mt-1">{editTemplate.template_key}</p>
              </div>

              {/* Available variables */}
              <div>
                <Label className="mb-2 block">Available Variables</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(editTemplate.variables || []).map((v) => (
                    <Badge
                      key={v.key}
                      variant="secondary"
                      className="cursor-pointer hover:bg-[hsl(var(--cream)/0.2)] transition-colors text-xs"
                      onClick={() => insertVariable(v.key, "html")}
                      title={`Click to insert {{${v.key}}} into HTML body`}
                    >
                      {`{{${v.key}}}`} — {v.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <Label>Subject</Label>
                <Input
                  ref={subjectRef}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {(editTemplate.variables || []).map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key, "subject")}
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      +{`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* HTML Body */}
              <div>
                <Label>HTML Body</Label>
                <Textarea
                  ref={htmlBodyRef}
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  rows={20}
                  className="font-mono text-xs"
                />
              </div>

              {/* Text Body */}
              <div>
                <Label>Plain Text Body</Label>
                <Textarea
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>Active</Label>
              </div>

              {/* Preview toggle */}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="gap-2"
                >
                  {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showPreview ? "Hide Preview" : "Show Preview"}
                </Button>

                {showPreview && (
                  <div className="mt-3 border border-border rounded-lg overflow-hidden">
                    <div className="bg-secondary/50 px-4 py-2 text-xs text-muted-foreground border-b border-border">
                      Preview (with sample data)
                    </div>
                    <div
                      className="p-4 bg-white text-black"
                      dangerouslySetInnerHTML={{ __html: renderPreview(htmlBody) }}
                    />
                  </div>
                )}
              </div>

              {/* Save */}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : "Save Template"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminEmailTemplates;
