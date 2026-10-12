export type AssetStatus = "placeholder" | "received" | "approved";
export type ChapterId =
  | "abertura"
  | "contexto"
  | "comentarios"
  | "comparacao"
  | "jornalismo"
  | "cronologia"
  | "adultizacao"
  | "cartilha"
  | "encerramento";
export type SourceRef = { label: string; url?: string; collectedAt?: string };
export type MediaId =
  | "opening"
  | "closing"
  | "felca"
  | "comparison"
  | "checking-future"
  | "journalist-influencer";
export type MediaAsset = {
  id: MediaId;
  kind: "audio" | "video";
  purpose: "ambient" | "editorial";
  title: string;
  src: string;
  mobileSrc?: string;
  mobilePoster?: string;
  poster?: string;
  status: AssetStatus;
  hasAudio: boolean;
  transcript?: string;
  pendingId: string;
};
export type TimelineEntry = {
  id: string;
  dateLabel: string;
  dateISO?: string;
  title: string;
  paragraphs: string[];
  sources: SourceRef[];
  status: AssetStatus;
  category?: string;
};
export type CommentGroupId =
  "journalism" | "moral-authority" | "opposition" | "adultization";
export type Comment = {
  id: string;
  text: string;
  likes: number | null;
  replies: number | null;
  likesLiteral: string;
  repliesLiteral: string;
  likesState: "exact" | "approximate" | "placeholder";
  source?: SourceRef;
  status: AssetStatus;
};
export type CommentGroup = {
  id: CommentGroupId;
  title: string;
  heading: string;
  comments: Comment[];
  expertQuotes: { text: string; attribution: string; source?: SourceRef }[];
  analysis: string[];
  topics: string[];
  pendingDistribution: string;
};
export type Dispose = () => void;
export type ContentRecord = {
  id: string;
  origin: string;
  sourceLocator: string;
  sourceText: string;
  targetChapter: ChapterId;
  status: AssetStatus;
  pendingId?: string;
  verification: "literal" | "adapted-interface";
  adaptation?: string;
};
export type AssetRecord = {
  id: string;
  origin: string;
  localPath: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  status: AssetStatus;
};
