// Shared helpers for the Pages Functions. A file under functions/ whose name
// starts with "_" is NOT routed — this is a library, not an endpoint.

/** JSON response with the right content-type. */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
