export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": "token=; Path=/; Max-Age=0; SameSite=Lax",
    },
  });
}
