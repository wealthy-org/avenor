// One HTTP entry point for the app, so an API error is always an `ApiError` with a code the UI can
// explain. A non-JSON body is reported as such instead of becoming "undefined" somewhere downstream.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type FetchLike = (input: string, init?: { cache?: string }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export async function fetchJson(url: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<unknown> {
  const response = await fetchImpl(url, { cache: "no-store" });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(response.status, "not_json", `API membalas ${response.status} tanpa JSON`);
  }
  if (!response.ok) {
    const error = (body as { error?: { code?: unknown; message?: unknown } }).error;
    const code = typeof error?.code === "string" ? error.code : "http_error";
    const message = typeof error?.message === "string" ? error.message : `API membalas ${response.status}`;
    throw new ApiError(response.status, code, message);
  }
  return body;
}