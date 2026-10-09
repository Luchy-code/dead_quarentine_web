export async function GET(request) {
  return Response.redirect(new URL('/?view=ranking', request.url), 302);
}
