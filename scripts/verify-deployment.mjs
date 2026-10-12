import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const [baseUrl, expectedCommit] = process.argv.slice(2);
assert(baseUrl && expectedCommit, "Informe a URL e o commit esperado.");
const origin = new URL(baseUrl);
assert.equal(origin.protocol, "https:");

async function request(path, options = {}) {
  const url = new URL(path, origin);
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
  assert(html.includes(origin.origin), "URL pública incorreta.");

  for (const path of [
    "/media/opening-test.mp4",
    "/media/checking-future-test.m4a",
  ]) {
    const media = await request(path, { headers: { Range: "bytes=0-255" } });
    assert.equal(media.status, 206, `Range indisponível em ${path}`);
    assert.match(
      media.headers.get("content-range") ?? "",
      /^bytes 0-255\/\d+$/,
    );
    const body = Buffer.from(await media.arrayBuffer());
    const local = await readFile(`public${path}`);
    assert.deepEqual(body, local.subarray(0, 256));
  }

  const pdf = await request("/documents/cartilha-teste.pdf");
  assert.equal(pdf.status, 200);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
}

for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    await verify();
    console.log(`Publicação confirmada: ${expectedCommit} em ${origin.origin}`);
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    console.warn(`Verificação ${attempt}/6: ${error.message}`);
    await setTimeout(5_000);
  }
}
