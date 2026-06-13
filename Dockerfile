# BucketFillers landing page + server-side status API — zero-dependency Node stdlib.
# It probes the other sites by their public https://*.timhufnagel.org URLs, so a
# normal bridge network is fine. No persistent state → code is baked into the image.
FROM node:22-slim
WORKDIR /app
COPY server.js index.html ./
ENV NODE_ENV=production PORT=3004
EXPOSE 3004
CMD ["node", "server.js"]
