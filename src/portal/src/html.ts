// HTML for the portal: escaping, a very small markdown, and the page frame.
//
// No dependencies, deliberately. The text rendered here is ours — generated
// documentation notes and guide prose — so it needs code spans, emphasis,
// headings, lists and paragraphs, and nothing a markdown library would add.

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Inline markdown: `code`, **strong**, *emphasis*, [text](href). Escapes first. */
export function inline(text: string): string {
  const codes: string[] = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c: string) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${codes[Number(i)]}</code>`);
}

/** Block markdown: `## ` headings, `* ` lists, fenced code, `---`, paragraphs. Line-based. */
export function markdown(text: string): string {
  const out: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  let ordered = false;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    const tag = ordered ? "ol" : "ul";
    if (list.length) out.push(`<${tag}>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</${tag}>`);
    para = [];
    list = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      flush();
      const body: string[] = [];
      while (++i < lines.length && !lines[i]!.startsWith("```")) body.push(lines[i]!);
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
    } else if (/^#{2,4} /.test(line)) {
      flush();
      const level = line.match(/^#+/)![0].length;
      out.push(`<h${level}>${inline(line.replace(/^#+ /, ""))}</h${level}>`);
    } else if (line.trim() === "---") {
      flush();
      out.push("<hr>");
    } else if (/^(\* |\d+\. )/.test(line)) {
      const isOrdered = /^\d+\. /.test(line);
      if (para.length || (list.length && isOrdered !== ordered)) flush();
      ordered = isOrdered;
      list.push(line.replace(/^(\* |\d+\. )/, ""));
    } else if (/^\s+\S/.test(line) && list.length) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else if (line.trim() === "") {
      flush();
    } else {
      if (list.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join("\n");
}

export interface NavGroup {
  readonly title: string;
  readonly links: readonly { readonly href: string; readonly label: string }[];
}

export function layout(opts: {
  readonly title: string;
  readonly siteTitle: string;
  readonly nav: readonly NavGroup[];
  readonly current: string;
  readonly body: string;
}): string {
  const nav = opts.nav
    .map(
      (g) =>
        `<div class="group"><div class="group-title">${esc(g.title)}</div>` +
        g.links
          .map((l) => `<a href="${esc(l.href)}"${l.href === opts.current ? ' aria-current="page"' : ""}>${esc(l.label)}</a>`)
          .join("") +
        `</div>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)} · ${esc(opts.siteTitle)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="top"><a class="brand" href="/">${esc(opts.siteTitle)}</a></header>
<div class="shell">
<nav class="side" aria-label="Contents">${nav}</nav>
<main>${opts.body}</main>
</div>
</body>
</html>`;
}

const CSS = `
:root{--bg:#fbfbf9;--panel:#fff;--ink:#1d1d1b;--muted:#66665f;--line:#e3e3dc;--accent:#2f5fb3;--code:#f1f1ec;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--panel:#1d1d1b;--ink:#ecece7;--muted:#a3a39b;--line:#34342f;--accent:#8db1ee;--code:#262624;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent)}
code,pre{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:13px}
code{background:var(--code);padding:1px 4px;border-radius:4px}
pre{background:var(--code);padding:10px 12px;border-radius:6px;overflow-x:auto}
pre code{background:none;padding:0}
.top{padding:12px 20px;border-bottom:1px solid var(--line);background:var(--panel)}
.brand{font-weight:600;color:var(--ink);text-decoration:none}
.shell{display:grid;grid-template-columns:250px minmax(0,1fr);max-width:1200px;margin:0 auto}
.side{padding:18px 16px;border-right:1px solid var(--line);min-height:calc(100vh - 50px)}
.group{margin-bottom:16px}
.group-title{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:4px}
.side a{display:block;padding:3px 8px;border-radius:5px;text-decoration:none;color:var(--ink);font-size:14px}
.side a[aria-current=page]{background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent)}
main{padding:20px 32px 60px;min-width:0}
h1{font-size:26px;margin:4px 0 12px}
h2{font-size:19px;margin:28px 0 8px;padding-top:6px;border-top:1px solid var(--line)}
h3{font-size:16px;margin:20px 0 6px}
.lede{color:var(--muted);font-size:16px}
.endpoint{display:inline-block;font-family:ui-monospace,Consolas,monospace;font-size:14px;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
.method{font-weight:700;margin-right:6px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;margin:8px 0 14px;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:500;font-size:12.5px}
td.field{white-space:nowrap}
.req{color:var(--muted);font-size:12px}
.note{border-left:3px solid var(--accent);padding:4px 12px;margin:12px 0;background:var(--panel)}
.warn{border-left-color:#c2410c}
@media (max-width:760px){.shell{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--line);min-height:0}main{padding:16px}}
`;
