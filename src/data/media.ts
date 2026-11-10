import type { MediaAsset } from "./types";
import duasTrajetorias from "./transcripts/duas-trajetorias.json" with { type: "json" };
import quemInforma from "./transcripts/quem-informa.json" with { type: "json" };

const teaser = {
  kind: "video",
  purpose: "ambient",
  src: "/media/teaser-longform.mp4",
  poster: "/images/teaser-longform.webp",
  status: "received",
  hasAudio: true,
} as const;

export const media = [
  {
    ...teaser,
    id: "opening",
    title: "Teaser de abertura",
  },
  {
    ...teaser,
    id: "closing",
    title: "Teaser de encerramento",
  },
  {
    id: "comparison",
    kind: "video",
    purpose: "editorial",
    title: "Vídeo comparativo",
    src: "/media/comparacao.mp4",
    poster: "/images/comparacao.webp",
    status: "received",
    hasAudio: true,
  },
  {
    id: "adultization",
    kind: "video",
    purpose: "editorial",
    title: "Vídeo sobre adultização",
    src: "/media/adultizacao-revisado.mp4",
    poster: "/images/adultizacao-revisado.webp",
    status: "received",
    hasAudio: true,
  },
  {
    id: "checking-future",
    kind: "audio",
    purpose: "editorial",
    title: "Duas trajetórias, muitas histórias",
    src: "/media/duas-trajetorias.m4a",
    status: "received",
    hasAudio: true,
    transcript: duasTrajetorias,
  },
  {
    id: "journalist-influencer",
    kind: "audio",
    purpose: "editorial",
    title: "Quem informa em tempos de transformação?",
    src: "/media/quem-informa.m4a",
    status: "received",
    hasAudio: true,
    transcript: quemInforma,
  },
] satisfies MediaAsset[];
