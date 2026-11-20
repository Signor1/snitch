import { forward } from "../../server/pimlico";

export const onRequestPost = async ({ request, env }: { request: Request; env: { PIMLICO_API_KEY?: string } }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  return forward(body, env.PIMLICO_API_KEY);
};
