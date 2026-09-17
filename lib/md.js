/** Small markdown subset: ###/#### headings, bullets, numbers, quotes, **bold**, *italic*. */
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function md(src) {
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  function inline(t) {
    return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
          .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  const lines = String(src || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { close(); continue; }

    // pipe table: | a | b |  /  |---|---|  /  rows
    if (line.trim().startsWith("|")) {
      close();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^-{2,}$/.test(c) || c === "")) rows.push(cells);
        i++;
      }
      i--;
      if (rows.length) {
        const head = rows[0];
        const body = rows.slice(1);
        out.push('<div class="tw"><table>');
        out.push("<thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead>");
        if (body.length) {
          out.push("<tbody>" + body.map((r) =>
            "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody>");
        }
        out.push("</table></div>");
      }
      continue;
    }

    let m;
    if ((m = line.match(/^#{3,4}\s+(.*)$/))) { close(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = line.match(/^[-*]\s+(.*)$/))) {
      if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    close(); out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join("");
}

export function plain(src) {
  return String(src || "").replace(/[#*>]/g, "").trim();
}

export function when(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
