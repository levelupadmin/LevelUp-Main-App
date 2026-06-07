// Shared types for the ChapterViewer page and its extracted sub-components.

export interface Chapter {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  media_url: string | null;
  embed_url: string | null;
  article_body: string | null;
  make_free: boolean;
  section_id: string;
  sort_order: number;
  duration_seconds: number | null;
}

export interface ChapterSibling {
  id: string;
  title: string;
  duration_seconds: number | null;
  content_type: string;
  thumbnail_url: string | null;
  vdocipher_thumbnail_url: string | null;
  description: string | null;
}

export interface Resource {
  id: string;
  filename: string;
  file_url: string;
  file_size_bytes: number | null;
}

export interface QnaReply {
  id: string;
  reply_text: string;
  user_id: string;
  is_instructor_reply: boolean;
  created_at: string;
  user_name?: string;
}

export interface QnaItem {
  id: string;
  question_text: string;
  user_id: string;
  is_resolved: boolean;
  created_at: string;
  user_name?: string;
  replies: QnaReply[];
}
