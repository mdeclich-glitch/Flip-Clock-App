const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const svgIcon = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>
  <rect width='512' height='512' rx='100' fill='#0a0a0a'/>
  <rect x='40' y='40' width='432' height='432' rx='60' fill='#141414'/>
  <path d='M40 256h432' stroke='#000000' stroke-width='16'/>
  <text x='256' y='370' font-family='Arial, sans-serif' font-weight='bold' font-size='270' fill='#ffffff' text-anchor='middle'>12</text>
</svg>`;

async function buildIco() {
  const buildDir = path.join(__dirname, 'build');
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);

  const pngPath = path.join(buildDir, 'temp_icon.png');
  const icoPath = path.join(buildDir, 'icon.ico');

  // Genera il PNG di partenza
  await sharp(Buffer.from(svgIcon))
    .resize(256, 256)
    .png()
    .toFile(pngPath);

  // Gestione compatibilità CommonJS per png-to-ico
  const convert = pngToIco.default || pngToIco;

  // Converte ufficialmente in un vero file ICO valido per electron-builder
  const icoBuffer = await convert(pngPath);
  fs.writeFileSync(icoPath, icoBuffer);

  // Pulisce il file temporaneo
  fs.unlinkSync(pngPath);
  console.log('File icon.ico valido generato con successo in build/icon.ico!');
}

buildIco().catch(console.error);