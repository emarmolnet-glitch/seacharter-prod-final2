import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cerebroSource = await readFile(
  new URL("../netlify/functions/cerebro-ia.js", import.meta.url),
  "utf8"
);

// Mock chatAssistant import for isolated testing of proxyRequest
const mockedSource = cerebroSource.replace(
  `import chatAssistant from "./chat-assistant.js";`,
  `const chatAssistant = async (req) => {
     const contentType = req.headers.get("content-type") || "";
     if (contentType.includes("multipart/form-data")) {
       const fd = await req.formData();
       const file = fd.get("documento_0");
       return new Response(JSON.stringify({
         success: true,
         fallback: true,
         fileName: file ? file.name : null,
         fields: Array.from(fd.keys())
       }), { status: 200, headers: { "Content-Type": "application/json" } });
     }
     const json = await req.json();
     return new Response(JSON.stringify({ success: true, fallback: true, json }), { status: 200, headers: { "Content-Type": "application/json" } });
   };`
);

const { default: proxyRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(mockedSource, "utf8").toString("base64")}`
);

test("proxyRequest handles multipart/form-data file uploads and falls back gracefully without body stream collision", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Data Bridge network unreachable (simulated)");
  };

  try {
    const formData = new FormData();
    formData.append("body", JSON.stringify({ mensaje: "Analiza el manifiesto de carga adjunto" }));
    formData.append("documento_0", new Blob(["col1,col2\n100,200"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }), "manifiesto.xlsx");

    const req = new Request("http://localhost:8888/api/cerebro-ia", {
      method: "POST",
      body: formData,
    });

    const res = await proxyRequest(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.fallback, true);
    assert.equal(data.fileName, "manifiesto.xlsx");
    assert.ok(data.fields.includes("body"));
    assert.ok(data.fields.includes("documento_0"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxyRequest handles image file uploads without 'Body is unusable' error", async () => {
  const originalFetch = globalThis.fetch;
  let receivedBodyLength = 0;
  let receivedContentType = "";

  globalThis.fetch = async (_url, options) => {
    receivedContentType = options.headers["Content-Type"];
    receivedBodyLength = options.body.byteLength;
    return new Response(JSON.stringify({
      success: true,
      reply: "Imagen marítima inspeccionada",
      cargo_type: "General Cargo"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const formData = new FormData();
    formData.append("body", JSON.stringify({ mensaje: "Foto de la escotilla" }));
    formData.append("documento_0", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
      type: "image/png"
    }), "escotilla.png");

    const req = new Request("http://localhost:8888/api/cerebro-ia", {
      method: "POST",
      body: formData,
    });

    const res = await proxyRequest(req);
    assert.equal(res.status, 200);
    assert.ok(receivedContentType.includes("multipart/form-data"));
    assert.ok(receivedBodyLength > 0);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.reply, "Imagen marítima inspeccionada");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxyRequest handles JSON payload correctly and applies packaging override", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({
      success: true,
      reply: "Carga clasificada",
      cargo_type: "Bulk"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const req = new Request("http://localhost:8888/api/cerebro-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensaje: "Transporte de cemento en big bags",
      }),
    });

    const res = await proxyRequest(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.packingType, "Big Bags");
    assert.equal(data.isBulk, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
