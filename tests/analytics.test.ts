import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMetrics,
  createExposureTracker,
  type MetricEnvelope,
} from "../src/scripts/analytics";
afterEach(() => vi.useRealTimers());
describe("métricas por documento", () => {
  it("deduplica acesso, temas e reprodução; preserva cada ação de PDF", () => {
    const events: MetricEnvelope[] = [];
    const metrics = createMetrics((event) => events.push(event));
    metrics.record({ name: "page_load" });
    metrics.record({ name: "page_load" });
    for (const groupId of ["journalism", "opposition", "journalism"] as const)
      metrics.record({ name: "comment_group_opened", groupId });
    for (let i = 0; i < 3; i++)
      metrics.record({
        name: "media_started",
        mediaId: "checking-future",
        purpose: "editorial",
      });
    metrics.record({ name: "booklet_opened", documentId: "booklet" });
    metrics.record({ name: "booklet_opened", documentId: "booklet" });
    metrics.record({ name: "booklet_download_clicked", documentId: "booklet" });
    expect(events.map((e) => e.name)).toEqual([
      "page_load",
      "comment_group_opened",
      "comment_group_opened",
      "media_started",
      "booklet_opened",
      "booklet_opened",
      "booklet_download_clicked",
    ]);
    expect(new Set(events.map((e) => e.eventId)).size).toBe(events.length);
    expect(new Set(events.map((e) => e.pageLoadId)).size).toBe(1);
    const other: MetricEnvelope[] = [];
    createMetrics((e) => other.push(e)).record({ name: "page_load" });
    expect(other[0].pageLoadId).not.toBe(events[0].pageLoadId);
  });
  it("falha do provedor e descarte não interrompem a página", () => {
    const sink = vi.fn(() => {
      throw new Error("blocked");
    });
    const metrics = createMetrics(sink);
    expect(() => metrics.record({ name: "page_load" })).not.toThrow();
    metrics.dispose();
    metrics.record({ name: "booklet_opened", documentId: "booklet" });
    expect(sink).toHaveBeenCalledTimes(1);
  });
  it("400 ms + 600 ms não equivalem a um segundo contínuo", () => {
    vi.useFakeTimers();
    const reached = vi.fn();
    const exposure = createExposureTracker(reached);
    exposure.setVisible("contexto", true);
    vi.advanceTimersByTime(400);
    exposure.setVisible("contexto", false);
    exposure.setVisible("contexto", true);
    vi.advanceTimersByTime(600);
    expect(reached).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(reached).toHaveBeenCalledExactlyOnceWith("contexto");
    exposure.setVisible("contexto", false);
    exposure.setVisible("contexto", true);
    vi.advanceTimersByTime(1500);
    expect(reached).toHaveBeenCalledTimes(1);
    exposure.dispose();
  });
  it("aba oculta zera exposição e descarte cancela timers", () => {
    vi.useFakeTimers();
    const reached = vi.fn();
    const exposure = createExposureTracker(reached);
    exposure.setVisible("comentarios", true);
    vi.advanceTimersByTime(700);
    exposure.setDocumentVisible(false);
    vi.advanceTimersByTime(5000);
    exposure.setDocumentVisible(true);
    vi.advanceTimersByTime(400);
    expect(reached).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(reached).toHaveBeenCalledExactlyOnceWith("comentarios");
    exposure.setVisible("cartilha", true);
    exposure.dispose();
    vi.advanceTimersByTime(1200);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});
