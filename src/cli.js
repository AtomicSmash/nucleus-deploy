import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export async function run(argv) {
  const args = argv ?? process.argv.slice(2);

  const [command = 'help', ...rest] = args;

  const commands = {
    help: async () => {
      console.log('ads-cli');
      console.log('Usage: ads <command> [options]');
      console.log('Commands:');
      console.log('  help                Show this help');
      console.log('  hello [name]        Print a greeting');
      console.log('  deploy              Run the built-in deploy script');
    },
    hello: async () => {
      const name = rest[0] || 'world';
      console.log(`Hello, ${name}!`);
    },
    deploy: async () => {
      // Load nucleus.yaml from the consumer project root
      const consumerCwd = process.env.INIT_CWD || process.cwd();
      const { readFile } = await import('node:fs/promises');
      const { resolve } = await import('node:path');
      const { parse } = await import('yaml');
      const configPath = resolve(consumerCwd, 'nucleus.yaml');
      let cfg = {};
      try {
        const raw = await readFile(configPath, 'utf8');
        cfg = parse(raw) ?? {};
      } catch (err) {
        console.error(`Could not read nucleus.yaml at ${configPath}:`, err.message || err);
        process.exitCode = 1;
        return;
      }
      const mod = await import('./scripts/deploy.js');
      if (typeof mod.deploy !== 'function') {
        console.error('Deploy module does not export a deploy function');
        process.exitCode = 1;
        return;
      }
      await mod.deploy(cfg, { args: rest, cwd: consumerCwd });
    },
  };

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    await commands.help();
    process.exitCode = 1;
    return;
  }

  await handler();
}

// If invoked directly (node src/cli.js), run with process args
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2));
}


