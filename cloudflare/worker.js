const UNAUTHORIZED_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
  "WWW-Authenticate": 'Basic realm="PLMS Protected Preview", charset="UTF-8"',
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export default {
  async fetch(request, env) {
    if (!env.PLMS_AUTH_PASSWORD) {
      return new Response("PLMS deployment is locked: authentication secret is not configured.", {
        status: 503,
        headers: {
          ...UNAUTHORIZED_HEADERS,
          "WWW-Authenticate": 'Basic realm="PLMS Locked"',
        },
      });
    }

    const credentials = readBasicCredentials(request.headers.get("Authorization"));
    const expectedUsername = env.PLMS_AUTH_USERNAME || "plms";
    const authenticated =
      credentials !== null &&
      constantTimeEqual(credentials.username, expectedUsername) &&
      constantTimeEqual(credentials.password, env.PLMS_AUTH_PASSWORD);

    if (!authenticated) {
      return new Response("Authentication required.", {
        status: 401,
        headers: UNAUTHORIZED_HEADERS,
      });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

function readBasicCredentials(value) {
  if (!value?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(value.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function constantTimeEqual(left, right) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
