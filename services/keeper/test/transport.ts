export function transport(url: string) {
  return {
    async request({ method, params }: { method: string; params?: unknown }) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = (await response.json()) as { result?: unknown; error?: { message: string } };
      if (body.error) throw new Error(body.error.message);
      return body.result;
    },
  };
}
