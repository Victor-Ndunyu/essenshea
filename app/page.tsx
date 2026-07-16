import { promises as fs } from 'fs';
import path from 'path';

const WEBSITE_DIR = path.join(process.cwd(), 'website');

export default async function HomePage() {
  try {
    const html = await fs.readFile(path.join(WEBSITE_DIR, 'index.html'), 'utf-8');
    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Essenshea - Natural Beauty Boutique</title>
          <link rel="stylesheet" href="/assets/css/styles.css" />
        </head>
        <body dangerouslySetInnerHTML={{ __html: html }} />
      </html>
    );
  } catch (err) {
    return <div>Not found</div>;
  }
}
