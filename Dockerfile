FROM oven/bun:1.3.10-debian
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY index.ts ./
COPY src ./src
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
