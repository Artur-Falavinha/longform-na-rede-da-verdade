import { describe, expect, it } from "vitest";
import { createMediaCoordinator } from "../src/components/media/coordinator";

class Media extends EventTarget {
  paused = true;
  muted = false;
  volume = 1;
  currentTime = 42;
  ended = false;
  play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  element() {
    return this as unknown as HTMLMediaElement;
  }
}

describe("coordenação de áudio e motivos de pausa", () => {
  it("permite retorno por visibilidade, mas pausa manual requer ação", async () => {
    const coordinator = createMediaCoordinator();
    const video = new Media();
    video.muted = true;
    coordinator.register("opening", video.element());
    await coordinator.play("opening", "automatic");
    coordinator.pause("opening", "visibility");
    expect(video.paused).toBe(true);
    expect(coordinator.canAutoplay("opening")).toBe(true);
    await coordinator.play("opening", "automatic");
    video.pause();
    expect(coordinator.reason("opening")).toBe("manual");
    expect(coordinator.canAutoplay("opening")).toBe(false);
  });
  it("última mídia audível pausa a anterior sem zerar posição nem retomá-la", async () => {
    const coordinator = createMediaCoordinator();
    const first = new Media();
    const next = new Media();
    coordinator.register("checking-future", first.element());
    coordinator.register("felca", next.element());
    await coordinator.play("checking-future", "user");
    await coordinator.play("felca", "user");
    expect(first.paused).toBe(true);
    expect(first.currentTime).toBe(42);
    expect(coordinator.reason("checking-future")).toBe("coordinator");
    next.pause();
    expect(coordinator.canAutoplay("checking-future")).toBe(false);
  });
  it("unmute coordena concorrência; vídeo silencioso pode continuar", async () => {
    const coordinator = createMediaCoordinator();
    const ambient = new Media();
    const podcast = new Media();
    ambient.muted = true;
    coordinator.register("opening", ambient.element());
    coordinator.register("checking-future", podcast.element());
    await coordinator.play("opening", "automatic");
    await coordinator.play("checking-future", "user");
    expect(ambient.paused).toBe(false);
    ambient.muted = false;
    ambient.dispatchEvent(new Event("volumechange"));
    expect(podcast.paused).toBe(true);
    expect(podcast.currentTime).toBe(42);
  });
  it("rejeição de autoplay fica aguardando ação manual", async () => {
    const coordinator = createMediaCoordinator();
    const video = new Media();
    video.muted = true;
    video.play = () => Promise.reject(new Error("NotAllowedError"));
    coordinator.register("opening", video.element());
    expect(await coordinator.play("opening", "automatic")).toBe(false);
    expect(coordinator.canAutoplay("opening")).toBe(false);
  });
});
