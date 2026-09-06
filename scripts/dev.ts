export {};
const api = Bun.spawn(['bun', '--watch', 'server/index.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
});
const web = Bun.spawn(
  ['bun', 'x', 'vinext', 'dev', '--host', '127.0.0.1', '--port', '3000'],
  { stdout: 'inherit', stderr: 'inherit' },
);
function stop() {
  api.kill();
  web.kill();
  process.exit();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await Promise.race([api.exited, web.exited]);
stop();
