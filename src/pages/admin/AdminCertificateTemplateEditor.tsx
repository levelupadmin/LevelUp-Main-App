import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, X, Upload, GripVertical } from "lucide-react";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  AVAILABLE_VARIABLES,
  DEFAULT_FONT_OPTIONS,
  FONT_FAMILIES,
  VariablePosition,
} from "@/lib/certificate-generator";

interface TemplateData {
  id?: string;
  course_id: string;
  background_image_url: string;
  variable_positions: VariablePosition[];
  completion_threshold: number;
  auto_generate: boolean;
  is_active: boolean;
}

const AdminCertificateTemplateEditor = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [courseName, setCourseName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showVariableMenu, setShowVariableMenu] = useState(false);

  const [template, setTemplate] = useState<TemplateData>({
    course_id: courseId || "",
    background_image_url: "",
    variable_positions: [],
    completion_threshold: 100,
    auto_generate: false,
    is_active: true,
  });
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Drag state
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Load course name and existing template
  useEffect(() => {
    if (!courseId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [courseRes, tmplRes] = await Promise.all([
          supabase.from("courses").select("title").eq("id", courseId).single(),
          (supabase as any)
            .from("certificate_templates")
            .select("*")
            .eq("course_id", courseId)
            .maybeSingle(),
        ]);

        if (courseRes.data) setCourseName(courseRes.data.title);

        if (tmplRes.data) {
          setTemplateId(tmplRes.data.id);
          setTemplate({
            course_id: courseId,
            background_image_url: tmplRes.data.background_image_url || "",
            variable_positions: tmplRes.data.variable_positions || [],
            completion_threshold: tmplRes.data.completion_threshold ?? 100,
            auto_generate: tmplRes.data.auto_generate ?? false,
            is_active: tmplRes.data.is_active ?? true,
          });
        }
      } catch (err) {
        console.error("Failed to load template", err);
        toast.error("Failed to load certificate template");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [courseId]);

  // Canvas scaling
  const getScale = useCallback(() => {
    if (!canvasRef.current) return 1;
    return canvasRef.current.clientWidth / CANVAS_WIDTH;
  }, []);

  // Save
  const handleSave = async () => {
    if (!courseId) return;
    setSaving(true);
    try {
      const payload = {
        course_id: courseId,
        background_image_url: template.background_image_url,
        variable_positions: template.variable_positions,
        completion_threshold: template.completion_threshold,
        auto_generate: template.auto_generate,
        is_active: template.is_active,
      };

      if (templateId) {
        const { error } = await (supabase as any)
          .from("certificate_templates")
          .update(payload)
          .eq("id", templateId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("certificate_templates")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (data) setTemplateId(data.id);
      }
      toast.success("Certificate template saved");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;
    setUploading(true);
    try {
      const path = `templates/${courseId}/background.png`;
      const { error: uploadErr } = await supabase.storage
        .from("certificates")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from("certificates").getPublicUrl(path);
      setTemplate((prev) => ({ ...prev, background_image_url: data.publicUrl }));
      toast.success("Background image uploaded");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Add variable
  const addVariable = (varDef: { key: string; label: string }) => {
    // Allow multiple custom_text, but only one of each other type
    if (
      varDef.key !== "custom_text" &&
      template.variable_positions.some((v) => v.key === varDef.key)
    ) {
      toast.error(`${varDef.label} is already placed`);
      return;
    }
    const newVar: VariablePosition = {
      key: varDef.key,
      label: varDef.label,
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      ...DEFAULT_FONT_OPTIONS,
    };
    setTemplate((prev) => ({
      ...prev,
      variable_positions: [...prev.variable_positions, newVar],
    }));
    setShowVariableMenu(false);
  };

  // Remove variable
  const removeVariable = (index: number) => {
    setTemplate((prev) => ({
      ...prev,
      variable_positions: prev.variable_positions.filter((_, i) => i !== index),
    }));
  };

  // Update variable property
  const updateVariable = (index: number, updates: Partial<VariablePosition>) => {
    setTemplate((prev) => ({
      ...prev,
      variable_positions: prev.variable_positions.map((v, i) =>
        i === index ? { ...v, ...updates } : v
      ),
    }));
  };

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const scale = getScale();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const vp = template.variable_positions[index];
    const mouseX = (e.clientX - rect.left) / scale;
    const mouseY = (e.clientY - rect.top) / scale;

    setDraggingIndex(index);
    setDragOffset({ x: mouseX - vp.x, y: mouseY - vp.y });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingIndex === null) return;
      const scale = getScale();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = (e.clientX - rect.left) / scale;
      const mouseY = (e.clientY - rect.top) / scale;

      const newX = Math.max(0, Math.min(CANVAS_WIDTH, mouseX - dragOffset.x));
      const newY = Math.max(0, Math.min(CANVAS_HEIGHT, mouseY - dragOffset.y));

      updateVariable(draggingIndex, { x: Math.round(newX), y: Math.round(newY) });
    },
    [draggingIndex, dragOffset, getScale]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  if (loading) {
    return (
      <AdminLayout title="Certificate Template">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AdminLayout>
    );
  }

  const scale = canvasRef.current ? canvasRef.current.clientWidth / CANVAS_WIDTH : 0.4;

  return (
    <AdminLayout title="Certificate Template">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/admin/courses/${courseId}`)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold">{courseName}</h2>
            <p className="text-sm text-muted-foreground">Certificate Template Editor</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Template"}
        </Button>
      </div>

      <div className="flex gap-6">
        {/* Left sidebar - Settings */}
        <div className="w-72 shrink-0 space-y-6">
          {/* Settings card */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-medium text-sm">Settings</h3>

            {/* Completion threshold */}
            <div className="space-y-2">
              <Label className="text-xs">
                Completion Threshold: {template.completion_threshold}%
              </Label>
              <input
                type="range"
                min={0}
                max={100}
                value={template.completion_threshold}
                onChange={(e) =>
                  setTemplate((prev) => ({
                    ...prev,
                    completion_threshold: Number(e.target.value),
                  }))
                }
                className="w-full accent-primary"
              />
            </div>

            {/* Auto-generate */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Auto-generate</Label>
              <Switch
                checked={template.auto_generate}
                onCheckedChange={(checked) =>
                  setTemplate((prev) => ({ ...prev, auto_generate: checked }))
                }
              />
            </div>

            {/* Active */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Active</Label>
              <Switch
                checked={template.is_active}
                onCheckedChange={(checked) =>
                  setTemplate((prev) => ({ ...prev, is_active: checked }))
                }
              />
            </div>
          </div>

          {/* Variables */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Variables</h3>
              <div className="relative">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowVariableMenu(!showVariableMenu)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
                {showVariableMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-md border bg-popover p-1 shadow-md">
                    {AVAILABLE_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => addVariable(v)}
                        className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-accent"
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {template.variable_positions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No variables placed yet. Click "Add" to place variables on the certificate.
              </p>
            )}

            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {template.variable_positions.map((vp, index) => (
                <div
                  key={`${vp.key}-${index}`}
                  className="rounded border bg-background p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{vp.label}</span>
                    <button
                      onClick={() => removeVariable(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Custom text value */}
                  {vp.key === "custom_text" && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Text</Label>
                      <Input
                        value={vp.value || ""}
                        onChange={(e) =>
                          updateVariable(index, { value: e.target.value })
                        }
                        placeholder="Enter text..."
                        className="h-7 text-xs"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {/* Font size */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Size</Label>
                      <Input
                        type="number"
                        value={vp.fontSize}
                        onChange={(e) =>
                          updateVariable(index, { fontSize: Number(e.target.value) })
                        }
                        className="h-7 text-xs"
                        min={8}
                        max={200}
                      />
                    </div>

                    {/* Max width */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">
                        Max Width
                      </Label>
                      <Input
                        type="number"
                        value={vp.maxWidth}
                        onChange={(e) =>
                          updateVariable(index, { maxWidth: Number(e.target.value) })
                        }
                        className="h-7 text-xs"
                        min={50}
                        max={2400}
                      />
                    </div>
                  </div>

                  {/* Font family */}
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Font</Label>
                    <Select
                      value={vp.fontFamily}
                      onValueChange={(val) =>
                        updateVariable(index, { fontFamily: val })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_FAMILIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {/* Color */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Color</Label>
                      <input
                        type="color"
                        value={vp.fontColor}
                        onChange={(e) =>
                          updateVariable(index, { fontColor: e.target.value })
                        }
                        className="w-full h-7 rounded border cursor-pointer"
                      />
                    </div>

                    {/* Weight */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Weight</Label>
                      <Select
                        value={vp.fontWeight}
                        onValueChange={(val) =>
                          updateVariable(index, { fontWeight: val })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="bold">Bold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Alignment */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Align</Label>
                      <Select
                        value={vp.textAlign}
                        onValueChange={(val) =>
                          updateVariable(index, {
                            textAlign: val as CanvasTextAlign,
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Left</SelectItem>
                          <SelectItem value="center">Center</SelectItem>
                          <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Position display */}
                  <p className="text-[10px] text-muted-foreground">
                    x: {vp.x}, y: {vp.y}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main canvas area */}
        <div className="flex-1 min-w-0">
          <div
            ref={canvasRef}
            className="relative w-full border rounded-lg overflow-hidden bg-gray-100 select-none"
            style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {template.background_image_url ? (
              <img
                src={template.background_image_url}
                alt="Certificate background"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Upload className="h-10 w-10" />
                <p className="text-sm">Upload a certificate background image</p>
                <label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button variant="outline" size="sm" asChild disabled={uploading}>
                    <span>{uploading ? "Uploading..." : "Choose Image"}</span>
                  </Button>
                </label>
              </div>
            )}

            {/* Replace image button when image exists */}
            {template.background_image_url && (
              <label className="absolute top-2 right-2 z-20">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button variant="secondary" size="sm" asChild disabled={uploading}>
                  <span>
                    <Upload className="h-3 w-3 mr-1" />
                    {uploading ? "Uploading..." : "Replace"}
                  </span>
                </Button>
              </label>
            )}

            {/* Variable chips */}
            {template.variable_positions.map((vp, index) => {
              const currentScale = canvasRef.current
                ? canvasRef.current.clientWidth / CANVAS_WIDTH
                : 0.4;
              return (
                <div
                  key={`chip-${vp.key}-${index}`}
                  className={`absolute z-10 cursor-grab flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium shadow-sm border whitespace-nowrap ${
                    draggingIndex === index
                      ? "bg-primary text-primary-foreground border-primary cursor-grabbing"
                      : "bg-white/90 text-foreground border-gray-300 hover:border-primary"
                  }`}
                  style={{
                    left: `${vp.x * currentScale}px`,
                    top: `${vp.y * currentScale}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                  onMouseDown={(e) => handleMouseDown(e, index)}
                >
                  <GripVertical className="h-3 w-3 opacity-50" />
                  {vp.label}
                  {vp.key === "custom_text" && vp.value ? `: ${vp.value}` : ""}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeVariable(index);
                    }}
                    className="ml-1 hover:text-destructive"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Canvas info */}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Canvas: {CANVAS_WIDTH} x {CANVAS_HEIGHT}px (A4 Landscape at 150 DPI). Drag
            variables to position them on the certificate.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminCertificateTemplateEditor;
