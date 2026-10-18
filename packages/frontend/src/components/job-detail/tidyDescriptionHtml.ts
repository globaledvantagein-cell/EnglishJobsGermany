/**
 * Normalises scraped ATS description HTML (already sanitised at ingest) into
 * clean, scannable structure before rendering:
 *
 *   <p><b>Job Purpose</b><br><br>Text…        →  <h3>Job Purpose</h3><p>Text…
 *   <p><b>Main Responsibility</b></p>         →  <h3>Main Responsibility</h3>
 *   text<br><br>more                          →  text</p><p>more
 *   <li><p>item</p></li>                      →  <li>item</li>
 *   <p>&nbsp;</p>, leading/trailing <br>      →  removed
 *
 * Pure string work so the server HTML and the hydrated client HTML are
 * identical. Bold-only lines become <h3> — under the page's <h1> title and
 * <h2> "About the role" that keeps the heading outline valid for crawlers.
 */
const BR = '<br\\s*/?>';
const BOLD_LINE = '<(b|strong)>([^<]{2,90}?)\\s*</\\1>';

export function tidyDescriptionHtml(html: string): string {
  return html
    .replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi, '<li>$1</li>')
    .replace(new RegExp(`<p>(\\s*${BR})+`, 'gi'), '<p>')
    .replace(new RegExp(`(${BR}\\s*)+</p>`, 'gi'), '</p>')
    .replace(new RegExp(`<p>\\s*${BOLD_LINE}\\s*</p>`, 'gi'), '<h3>$2</h3>')
    .replace(new RegExp(`<p>\\s*${BOLD_LINE}\\s*(${BR}\\s*)+`, 'gi'), '<h3>$2</h3><p>')
    .replace(new RegExp(`(${BR}\\s*)+${BOLD_LINE}\\s*(${BR}\\s*)+`, 'gi'), '</p><h3>$3</h3><p>')
    .replace(new RegExp(`(${BR}\\s*){2,}`, 'gi'), '</p><p>')
    .replace(/<p>(\s|&nbsp;|&#160;)*<\/p>/gi, '')
    // Splitting on <br><br> can leave new bold-only paragraphs behind.
    .replace(new RegExp(`<p>\\s*${BOLD_LINE}\\s*</p>`, 'gi'), '<h3>$2</h3>');
}
