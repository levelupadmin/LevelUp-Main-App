import { Bot } from "lucide-react";

const QnAChatbotTab = () => (
  <div className="space-y-6 max-w-2xl">
    <div>
      <h2 className="text-lg font-semibold text-foreground">QnA Chatbot</h2>
      <p className="text-sm text-muted-foreground">AI-powered Q&A assistant for this course</p>
    </div>
    <div className="rounded-xl border border-dashed border-border py-16 text-center">
      <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">Chatbot configuration coming soon</p>
      <p className="text-xs text-muted-foreground mt-1">Set up an AI assistant trained on your course content</p>
    </div>
  </div>
);

export default QnAChatbotTab;
