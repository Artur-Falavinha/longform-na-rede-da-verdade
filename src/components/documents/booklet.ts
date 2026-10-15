import type { Dispose } from "../../data/types";
import { initBookletMotion } from "./booklet-motion";

export function initBooklet(root: HTMLElement): Dispose {
  const disposeMotion = initBookletMotion(root);
  const controller = new AbortController();
  const error = root.querySelector<HTMLElement>("[data-document-error]")!;
  root.addEventListener(
    "click",
    async (event) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        "[data-booklet-action]",
      );
      if (!link) return;
      error.hidden = true;
      root.dispatchEvent(
        new CustomEvent("longform:booklet-action", {
          bubbles: true,
          detail: { action: link.dataset.bookletAction, documentId: "booklet" },
        }),
      );
      try {
        const response = await fetch(link.href, { signal: controller.signal });
        if (!response.ok) throw new Error("Documento indisponível");
        const buffer = await response.arrayBuffer();
        const start = new TextDecoder().decode(buffer.slice(0, 5));
        const end = new TextDecoder().decode(
          buffer.slice(Math.max(0, buffer.byteLength - 1024)),
        );
        if (start !== "%PDF-" || !end.includes("%%EOF"))
          throw new Error("Documento inválido");
      } catch {
        if (!controller.signal.aborted) error.hidden = false;
      }
    },
    { signal: controller.signal },
  );
  return () => {
    controller.abort();
    disposeMotion();
  };
}
