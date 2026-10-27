const LOCAL_MEDIA_URL = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api\/media\//g;

/**
 * Media URLs are persisted as absolute URLs, and any record created while SERVER_URL was unset
 * holds http://localhost:<port>/api/media/... Rewrite those to this API's public origin on the
 * way out so browsers never get a localhost URL from a deployed server.
 */
export const rewriteLocalMediaUrls = (req, res, next) => {
  const host = req.get('host');
  if (!host || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return next();

  const origin = process.env.SERVER_URL ? process.env.SERVER_URL.replace(/\/$/, '') : `${req.protocol}://${host}`;
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (body === undefined || body === null) return originalJson(body);
    try {
      const text = JSON.stringify(body);
      if (typeof text === 'string' && text.includes('/api/media/')) {
        return originalJson(JSON.parse(text.replace(LOCAL_MEDIA_URL, `${origin}/api/media/`)));
      }
    } catch {
      // never fail a response over URL rewriting; send it untouched
    }
    return originalJson(body);
  };
  next();
};
