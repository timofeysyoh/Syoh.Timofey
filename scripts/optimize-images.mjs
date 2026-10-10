import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const publicDirectory = join(projectRoot, 'public');
const sourcePath = join(projectRoot, 'source-assets', 'logo.png');
const widths = [480, 960, 1440];

const jobs = widths.flatMap((width) => [
  sharp(sourcePath)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .avif({ quality: 55, effort: 6 })
    .toFile(join(publicDirectory, `logo-${width}.avif`)),
  sharp(sourcePath)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78, effort: 5 })
    .toFile(join(publicDirectory, `logo-${width}.webp`))
]);

jobs.push(
  sharp(sourcePath)
    .rotate()
    .resize({ width: 960, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(join(publicDirectory, 'logo-960.jpg')),
  sharp(sourcePath)
    .rotate()
    .resize(64, 64, { fit: 'cover', position: 'attention' })
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(publicDirectory, 'favicon-64.png')),
  sharp(sourcePath)
    .rotate()
    .resize(180, 180, { fit: 'cover', position: 'attention' })
    .png({ compressionLevel: 9 })
    .toFile(join(publicDirectory, 'apple-touch-icon.png'))
);

await Promise.all(jobs);

const shareBackground = await sharp(sourcePath)
  .rotate()
  .resize(1200, 630, { fit: 'cover', position: 'attention' })
  .blur(22)
  .modulate({ brightness: 0.72, saturation: 0.68 })
  .jpeg({ quality: 78, mozjpeg: true })
  .toBuffer();

const shareForeground = await sharp(sourcePath)
  .rotate()
  .resize({ height: 630, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 86, mozjpeg: true })
  .toBuffer({ resolveWithObject: true });

await sharp(shareBackground)
  .composite([
    {
      input: shareForeground.data,
      left: Math.round((1200 - shareForeground.info.width) / 2),
      top: 0
    }
  ])
  .jpeg({ quality: 82, progressive: true, mozjpeg: true })
  .toFile(join(publicDirectory, 'share-preview.jpg'));

const generatedFiles = [
  ...widths.flatMap((width) => [`logo-${width}.avif`, `logo-${width}.webp`]),
  'logo-960.jpg',
  'favicon-64.png',
  'apple-touch-icon.png',
  'share-preview.jpg'
];

const sizes = await Promise.all(
  generatedFiles.map(async (file) => {
    const fileStats = await stat(join(publicDirectory, file));
    return { file, kilobytes: Math.round(fileStats.size / 1024) };
  })
);

console.table(sizes);
