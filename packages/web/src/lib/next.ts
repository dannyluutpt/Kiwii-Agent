// Where to go after signing in: the page that sent the person to login, as long as it is a path on
// this site (never "//other.host" or an absolute URL, which would make login an open redirect).
export function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/"
}
