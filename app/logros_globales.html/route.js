export async function GET(request) {
  return Response.redirect(new URL('/?view=logros', request.url), 302);
}
