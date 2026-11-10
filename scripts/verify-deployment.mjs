import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const [baseUrl, expectedCommit, workerUrl = baseUrl] = process.argv.slice(2);
assert(baseUrl && expectedCommit, "Informe a URL e o commit esperado.");
const origin = new URL(baseUrl);
const worker = new URL(workerUrl);
assert.equal(origin.protocol, "https:");
assert.equal(worker.protocol, "https:");
const externalWorker = worker.origin !== origin.origin;

async function request(path, options = {}, base = origin) {
  const url = new URL(path, base);
  url.searchParams.set("validation", expectedCommit);
  return fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
}

async function verify() {
  const release = await request("/release.json");
  assert.equal(release.status, 200);
  assert.equal((await release.json()).commit, expectedCommit);

  const page = await request("/");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert(html.includes('id="contexto"'), "Capítulo de abertura ausente.");
  assert(
    html.includes(`rel="canonical" href="${origin.href}"`),
    "URL pública incorreta.",
  );

  for (const path of [
    "/media/teaser-longform.mp4",
    "/media/duas-trajetorias.m4a",
    "/media/quem-informa.m4a",
    "/media/comparacao.mp4",
    "/media/adultizacao-revisado.mp4",
  ]) {
    if (externalWorker) {
      assert(
        html.includes(`src="${new URL(path, worker).href}"`),
        `Origem da mídia incorreta em ${path}`,
      );
    }
    const media = await request(
      path,
      { headers: { Range: "bytes=0-255" } },
      worker,
    );
    assert.equal(media.status, 206, `Range indisponível em ${path}`);
    assert.match(
      media.headers.get("content-range") ?? "",
      /^bytes 0-255\/\d+$/,
    );
    const body = Buffer.from(await media.arrayBuffer());
    const local = await readFile(`public${path}`);
    assert.deepEqual(body, local.subarray(0, 256));
  }

  const pdf = await request("/documents/infancia-acelerada.pdf");
  assert.equal(pdf.status, 200);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );

  if (externalWorker) {
    const metrics = await request(
      "/api/felca-metrics",
      { headers: { Origin: origin.origin } },
      worker,
    );
    assert.equal(metrics.status, 200, "Contador do YouTube indisponível.");
    assert.equal(
      metrics.headers.get("access-control-allow-origin"),
      origin.origin,
    );
    const { views, comments } = await metrics.json();
    assert(
      [views, comments].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ),
    );
  }
}

const attempts = externalWorker ? 30 : 6;
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    await verify();
    console.log(`Publicação confirmada: ${expectedCommit} em ${origin.origin}`);
    break;
  } catch (error) {
    if (attempt === attempts) throw error;
    console.warn(`Verificação ${attempt}/${attempts}: ${error.message}`);
    await setTimeout(externalWorker ? 10_000 : 5_000);
  }
}
