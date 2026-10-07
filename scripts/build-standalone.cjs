const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function buildStandaloneHtml() {
  let html = fs.readFileSync(path.join(root, 'renderer-3d.html'), 'utf8');
  const scripts = [];
  html = html.replace(/<script\s+src="([^"]+)"\s+defer><\/script>/g, (_, file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    scripts.push(
      `<script>\n// Source: ${file}\n${source.replace(/<\/script/gi, '<\\/script')}\n</script>`,
    );
    return '';
  });
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/>/g, (_, file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    return `<style>\n${source.replace(/<\/style/gi, '<\\/style')}\n</style>`;
  });
  if (!scripts.length || !html.includes('</body>')) {
    throw new Error('Cannot locate the application scripts or body in renderer-3d.html.');
  }
  // Inline scripts ignore defer. Put them after the page and templates so startup sees the DOM.
  return html.replace('</body>', () => scripts.join('\n') + '\n  </body>');
}

if (require.main === module) {
  const output = path.join(root, 'dist', 'forma-3d.html');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, buildStandaloneHtml(), 'utf8');
  process.stdout.write('Built dist/forma-3d.html — copy this one file to your phone.\n');
}

module.exports = { buildStandaloneHtml };
