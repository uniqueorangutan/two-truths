export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const error = (message, status = 400) => json({ error: message }, status);

export async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// Returns an error Response if the PIN is missing or wrong, otherwise null.
export function checkHostPin(req) {
  const pin = process.env.HOST_PIN;
  if (!pin) return error('HOST_PIN is not configured on the server.', 500);
  if (req.headers.get('x-host-pin') !== pin) return error('Wrong PIN.', 401);
  return null;
}
