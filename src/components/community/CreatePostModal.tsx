import { useState } from "react";
import {
  Pencil, Camera, HelpCircle, BarChart3, Trophy, Handshake,
  Plus, X, Image as ImageIcon,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { PostType } from "@/data/feedData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const postTypes: { id: PostType; label: string; icon: React.ElementType }[] = [
  { id: "thought", label: "Thought", icon: Pencil },
  { id: "project", label: "Project", icon: Camera },
  { id: "question", label: "Question", icon: HelpCircle },
  { id: "poll", label: "Poll", icon: BarChart3 },
  { id: "milestone", label: "Milestone", icon: Trophy },
  { id: "collab", label: "Collab", icon: Handshake },
];

const skillTags = [
  "Video Editing", "Color Grading", "Cinematography", "Sound Design",
  "Screenwriting", "VFX", "Motion Graphics", "Documentary",
  "Music Video", "Short Film", "DaVinci Resolve", "Premiere Pro",
];

const CreatePostModal = ({ open, onOpenChange }: Props) => {
  const [type, setType] = useState<PostType>("thought");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedbackToggle, setFeedbackToggle] = useState(true);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState("3");
  const [milestoneText, setMilestoneText] = useState("I just completed ");
  const [collabRole, setCollabRole] = useState("");
  const [collabCity, setCollabCity] = useState("");
  const [collabTimeline, setCollabTimeline] = useState("");
  const [collabBudget, setCollabBudget] = useState("Discuss");

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const addPollOption = () => {
    if (pollOptions.length < 4) setPollOptions([...pollOptions, ""]);
  };

  const updatePollOption = (i: number, val: string) => {
    const next = [...pollOptions];
    next[i] = val;
    setPollOptions(next);
  };

  const handlePost = () => {
    onOpenChange(false);
    // Reset
    setType("thought");
    setBody("");
    setTitle("");
    setSelectedTags([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-lg">Create Post</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(90vh-120px)]">
          <div className="px-4 pb-4 space-y-4">
            {/* Type selector */}
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
              {postTypes.map(pt => {
                const isActive = type === pt.id;
                return (
                  <button
                    key={pt.id}
                    onClick={() => setType(pt.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border"
                    style={{
                      background: isActive ? "hsl(var(--highlight) / 0.15)" : "transparent",
                      borderColor: isActive ? "hsl(var(--highlight))" : "hsl(var(--border))",
                      color: isActive ? "hsl(var(--highlight))" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    <pt.icon size={14} />
                    {pt.label}
                  </button>
                );
              })}
            </div>

            {/* Thought */}
            {type === "thought" && (
              <div>
                <Textarea
                  placeholder="What's on your mind?"
                  value={body}
                  onChange={e => setBody(e.target.value.slice(0, 500))}
                  className="min-h-[120px] resize-none"
                />
                <p className="text-xs text-muted-foreground text-right mt-1">{body.length}/500</p>
              </div>
            )}

            {/* Project */}
            {type === "project" && (
              <>
                <Input
                  placeholder="Project title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                <Textarea
                  placeholder="Tell us about your project..."
                  value={body}
                  onChange={e => setBody(e.target.value.slice(0, 500))}
                  className="min-h-[100px] resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">{body.length}/500</p>
                <div className="border border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon size={24} />
                  <p className="text-xs">Tap to add images or videos</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {skillTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                        style={{
                          background: selectedTags.includes(tag) ? "hsl(var(--highlight) / 0.15)" : "transparent",
                          borderColor: selectedTags.includes(tag) ? "hsl(var(--highlight))" : "hsl(var(--border))",
                          color: selectedTags.includes(tag) ? "hsl(var(--highlight))" : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Request feedback from the community</Label>
                  <Switch checked={feedbackToggle} onCheckedChange={setFeedbackToggle} />
                </div>
              </>
            )}

            {/* Question */}
            {type === "question" && (
              <>
                <Textarea
                  placeholder="What's your question?"
                  value={body}
                  onChange={e => setBody(e.target.value.slice(0, 500))}
                  className="min-h-[120px] resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">{body.length}/500</p>
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {skillTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className="text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                        style={{
                          background: selectedTags.includes(tag) ? "hsl(var(--highlight) / 0.15)" : "transparent",
                          borderColor: selectedTags.includes(tag) ? "hsl(var(--highlight))" : "hsl(var(--border))",
                          color: selectedTags.includes(tag) ? "hsl(var(--highlight))" : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Poll */}
            {type === "poll" && (
              <>
                <Textarea
                  placeholder="What do you want to ask?"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <div className="space-y-2">
                  {pollOptions.map((opt, i) => (
                    <Input
                      key={i}
                      placeholder={`Option ${i + 1}`}
                      value={opt}
                      onChange={e => updatePollOption(i, e.target.value)}
                    />
                  ))}
                  {pollOptions.length < 4 && (
                    <Button variant="outline" size="sm" onClick={addPollOption} className="w-full">
                      <Plus size={14} /> Add option
                    </Button>
                  )}
                </div>
                <Select value={pollDuration} onValueChange={setPollDuration}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

            {/* Milestone */}
            {type === "milestone" && (
              <>
                <Textarea
                  placeholder="I just completed..."
                  value={milestoneText}
                  onChange={e => setMilestoneText(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
                <div className="border border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon size={24} />
                  <p className="text-xs">Add a photo (optional)</p>
                </div>
              </>
            )}

            {/* Collab */}
            {type === "collab" && (
              <>
                <Input
                  placeholder="Collaboration title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                <Textarea
                  placeholder="Describe what you're looking for..."
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <Select value={collabRole} onValueChange={setCollabRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Role needed" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Editor", "Cinematographer", "Sound Designer", "Director", "Writer", "Colorist", "VFX Artist"].map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="City (e.g., Mumbai)"
                  value={collabCity}
                  onChange={e => setCollabCity(e.target.value)}
                />
                <Select value={collabTimeline} onValueChange={setCollabTimeline}>
                  <SelectTrigger>
                    <SelectValue placeholder="Timeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {["1 week", "2 weeks", "1 month", "2-3 months", "Flexible"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Budget</p>
                  <RadioGroup value={collabBudget} onValueChange={setCollabBudget} className="flex gap-4">
                    {["Paid", "Unpaid", "Discuss"].map(b => (
                      <div key={b} className="flex items-center gap-1.5">
                        <RadioGroupItem value={b} id={`budget-${b}`} />
                        <Label htmlFor={`budget-${b}`} className="text-sm">{b}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </>
            )}

            {/* Post to (all types) */}
            <Select defaultValue="general">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Post to..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Feed</SelectItem>
                <SelectItem value="filmmaking">🎬 Filmmaking</SelectItem>
                <SelectItem value="video-editing">✂️ Video Editing</SelectItem>
                <SelectItem value="cinematography">📷 Cinematography</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <Button
            onClick={handlePost}
            className="w-full font-semibold"
            style={{ background: "hsl(var(--highlight))", color: "hsl(0 0% 7%)" }}
          >
            Post
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePostModal;
