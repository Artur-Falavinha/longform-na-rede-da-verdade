import type { TimelineEntry } from "./types";
export const timeline = [
  {
    id: "antecedentes",
    dateLabel: "Antes da denúncia · data pendente",
    title: "Antecedentes do caso",
    paragraphs: [
      "Contexto anterior ao vídeo, datas e fontes a enviar pelas autoras — N05.",
    ],
    sources: [
      {
        label: "Material editorial pendente",
      },
    ],
    status: "placeholder",
  },
  {
    id: "video-adultizacao",
    dateLabel: "6 ago 2025",
    dateISO: "2025-08-06",
    category: "Publicação",
    title: 'Vídeo "Adultização" e Denúncias',
    paragraphs: [
      "Felca publica o vídeo no YouTube. Aproximadamente 50 minutos de conteúdo sobre exposição, exploração e sexualização de crianças e adolescentes nas redes sociais. Em 8 de agosto, perfis de Hytalo Santos são suspensos das plataformas.",
    ],
    sources: [
      {
        label: "Base44 — conteúdo inicial das autoras",
        url: "https://narededaverdade.base44.app/",
        collectedAt: "2026-10-10",
      },
      {
        label: "Referência original e atualização a confirmar pelas autoras",
      },
    ],
    status: "received",
  },
  {
    id: "acao-mppb",
    dateLabel: "11 ago 2025",
    dateISO: "2025-08-11",
    category: "Institucional",
    title: "Ação Civil Pública do MPPB",
    paragraphs: [
      "O Ministério Público da Paraíba apresenta ação civil pública solicitando medidas contra Hytalo Santos — cinco dias após a publicação do vídeo. A ação resultou em decisão judicial que determinou a suspensão dos perfis, interrupção da monetização e proibição de contato com menores.",
    ],
    sources: [
      {
        label: "Base44 — conteúdo inicial das autoras",
        url: "https://narededaverdade.base44.app/",
        collectedAt: "2026-10-10",
      },
      {
        label: "Referência original e atualização a confirmar pelas autoras",
      },
    ],
    status: "received",
  },
  {
    id: "prisao-preventiva",
    dateLabel: "15 ago 2025",
    dateISO: "2025-08-15",
    category: "Judicial",
    title: "Prisão preventiva de Hytalo Santos e do marido",
    paragraphs: [
      "Hytalo Santos e Israel Natã Vicente são presos preventivamente. Em 23 de setembro, o Tribunal de Justiça da Paraíba recebe a denúncia apresentada pelo Ministério Público.",
    ],
    sources: [
      {
        label: "Base44 — conteúdo inicial das autoras",
        url: "https://narededaverdade.base44.app/",
        collectedAt: "2026-10-10",
      },
      {
        label: "Referência original e atualização a confirmar pelas autoras",
      },
    ],
    status: "received",
  },
  {
    id: "tv-globo",
    dateLabel: "13 out 2025",
    dateISO: "2025-10-13",
    category: "Mídia",
    title: "Felca na TV Globo",
    paragraphs: [
      "O caso alcança a TV aberta e o influenciador aparece em programa da TV Globo. A cobertura jornalística, iniciada pela CNN Brasil em 9 de agosto de 2025, já havia incorporado o caso à agenda da imprensa.",
    ],
    sources: [
      {
        label: "Base44 — conteúdo inicial das autoras",
        url: "https://narededaverdade.base44.app/",
        collectedAt: "2026-10-10",
      },
      {
        label: "Referência original e atualização a confirmar pelas autoras",
      },
    ],
    status: "received",
  },
  {
    id: "condenacao",
    dateLabel: "23 fev 2026",
    dateISO: "2026-02-23",
    category: "Judicial",
    title: "Condenação de Hytalo e Israel",
    paragraphs: [
      "Hytalo Santos é condenado, em primeira instância, a 11 anos e 4 meses de prisão. Israel Natã Vicente é condenado a 8 anos e 10 meses, por crimes relacionados à exploração de conteúdo pornográfico envolvendo adolescentes. A decisão estabelece R$ 500 mil por danos morais. Em 24 de fevereiro, a Câmara Criminal do TJPB nega novo pedido de habeas corpus.",
    ],
    sources: [
      {
        label: "Base44 — conteúdo inicial das autoras",
        url: "https://narededaverdade.base44.app/",
        collectedAt: "2026-10-10",
      },
      {
        label: "Referência original e atualização a confirmar pelas autoras",
      },
    ],
    status: "received",
  },
  {
    id: "eca-digital",
    dateLabel: "17 mar 2026",
    dateISO: "2026-03-17",
    category: "Institucional",
    title: "Entrada em vigor da Lei Felca (ECA Digital — Lei Nº 15.211)",
    paragraphs: [
      'A chamada Lei Felca entra em vigor, representando um desdobramento institucional diretamente ligado ao caso e ao debate público gerado pelo vídeo "Adultização".',
    ],
    sources: [
      {
        label: "Base44 — conteúdo inicial das autoras",
        url: "https://narededaverdade.base44.app/",
        collectedAt: "2026-10-10",
      },
      {
        label: "Referência original e atualização a confirmar pelas autoras",
      },
    ],
    status: "received",
  },
  {
    id: "novos-desdobramentos",
    dateLabel: "[DATA A CONFIRMAR]",
    category: "A confirmar",
    title: "[EVENTO A INSERIR]",
    paragraphs: [
      "[DESDOBRAMENTO A APURAR — novos acontecimentos relacionados ao caso ou ao debate público sobre adultização e proteção infantil digital]",
    ],
    sources: [
      {
        label: "Base44 — conteúdo inicial das autoras",
        url: "https://narededaverdade.base44.app/",
        collectedAt: "2026-10-10",
      },
      {
        label: "Referência original e atualização a confirmar pelas autoras",
      },
    ],
    status: "placeholder",
  },
] satisfies TimelineEntry[];
