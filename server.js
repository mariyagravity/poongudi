const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3050;
const RESPONSES_DIR = path.join(__dirname, "responses");

if (!fs.existsSync(RESPONSES_DIR)) {
  fs.mkdirSync(RESPONSES_DIR, { recursive: true });
}

function escapeXml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function jsonToXml(data) {
  const meta = data.metadata || {};
  const resp = data.respondent || {};
  const sum = data.result || data.summary || {};
  const pillars = sum.pillars || [];
  const remedies = sum.remedies || [];
  const responses = data.detailedResponses || [];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<readinessAssessment>\n`;

  // Metadata
  xml += `  <metadata>\n`;
  xml += `    <timestamp>${escapeXml(meta.timestamp || new Date().toISOString())}</timestamp>\n`;
  xml += `    <source>${escapeXml(meta.source || "KCSS 2026")}</source>\n`;
  xml += `    <version>${escapeXml(meta.version || "1.0")}</version>\n`;
  xml += `  </metadata>\n`;

  // Respondent
  xml += `  <respondent>\n`;
  xml += `    <name>${escapeXml(resp.name || "Anonymous")}</name>\n`;
  xml += `    <email>${escapeXml(resp.email || "")}</email>\n`;
  xml += `    <company>${escapeXml(resp.company || "General")}</company>\n`;
  xml += `    <phone>${escapeXml(resp.phone || "")}</phone>\n`;
  xml += `    <consentGiven>${resp.consentGiven ? "true" : "false"}</consentGiven>\n`;
  xml += `  </respondent>\n`;

  // Summary
  xml += `  <summary>\n`;
  xml += `    <readiness score="${escapeXml(sum.readiness ?? "")}" band="${escapeXml(sum.band || "")}">\n`;
  xml += `      <note>${escapeXml(sum.readinessNote || "")}</note>\n`;
  xml += `    </readiness>\n`;
  xml += `    <exposure score="${escapeXml(sum.exposure ?? "")}" band="${escapeXml(sum.exposureBand || "")}">\n`;
  xml += `      <note>${escapeXml(sum.exposureNote || "")}</note>\n`;
  xml += `    </exposure>\n`;
  if (sum.verdict) {
    xml += `    <verdict title="${escapeXml(sum.verdict)}">\n`;
    xml += `      <description>${escapeXml(sum.verdictNote || "")}</description>\n`;
    xml += `    </verdict>\n`;
  }
  xml += `    <significantDataFiduciaryApplicable>${sum.sdfApplicable ? "true" : "false"}</significantDataFiduciaryApplicable>\n`;
  xml += `  </summary>\n`;

  // Pillars
  xml += `  <pillars>\n`;
  if (Array.isArray(pillars)) {
    pillars.forEach(p => {
      xml += `    <pillar id="${escapeXml(p.id || p.name)}" name="${escapeXml(p.name)}" scorePercent="${escapeXml(p.pct)}" />\n`;
    });
  } else if (typeof pillars === "object") {
    Object.entries(pillars).forEach(([k, v]) => {
      xml += `    <pillar name="${escapeXml(k)}" scorePercent="${escapeXml(v)}" />\n`;
    });
  }
  xml += `  </pillars>\n`;

  // Top Remedies
  if (remedies.length > 0) {
    xml += `  <topRemedies>\n`;
    remedies.forEach((r, idx) => {
      xml += `    <remedy rank="${idx + 1}" questionId="${escapeXml(r.id || "")}">\n`;
      xml += `      <title>${escapeXml(r.title || "")}</title>\n`;
      xml += `      <description>${escapeXml(r.description || "")}</description>\n`;
      xml += `    </remedy>\n`;
    });
    xml += `  </topRemedies>\n`;
  }

  // Detailed Responses
  if (responses.length > 0) {
    xml += `  <responses>\n`;
    responses.forEach(sec => {
      xml += `    <section id="${escapeXml(sec.id)}" name="${escapeXml(sec.name)}">\n`;
      (sec.questions || []).forEach(q => {
        xml += `      <question id="${escapeXml(q.id)}">\n`;
        xml += `        <text>${escapeXml(q.text)}</text>\n`;
        xml += `        <selectedOptions>\n`;
        (q.selectedOptions || []).forEach(opt => {
          xml += `          <option score="${escapeXml(opt.score)}">${escapeXml(opt.text)}</option>\n`;
        });
        xml += `        </selectedOptions>\n`;
        xml += `      </question>\n`;
      });
      xml += `    </section>\n`;
    });
    xml += `  </responses>\n`;
  }

  xml += `</readinessAssessment>\n`;
  return xml;
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && parsedUrl.pathname === "/api/responses") {
    try {
      const files = fs.readdirSync(RESPONSES_DIR)
        .filter(f => f.endsWith(".xml"))
        .map(f => {
          const stat = fs.statSync(path.join(RESPONSES_DIR, f));
          return {
            filename: f,
            url: `/responses/${encodeURIComponent(f)}`,
            size: stat.size,
            updatedAt: stat.mtime
          };
        })
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, count: files.length, files }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && (parsedUrl.pathname === "/api/save-response" || parsedUrl.pathname === "/save-response.php")) {
    let body = "";
    req.on("data", chunk => { body += chunk; });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        let xmlContent = data.xmlString;
        if (!xmlContent) {
          xmlContent = jsonToXml(data);
        }

        const compName = (data.respondent && data.respondent.company)
          ? data.respondent.company.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 30)
          : "Assessment";
        const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `response_${compName}_${dateStr}.xml`;
        const filePath = path.join(RESPONSES_DIR, filename);

        fs.writeFileSync(filePath, xmlContent, "utf8");
        console.log(`[SAVED] XML saved to: ${filePath}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          message: "Response saved successfully",
          filename: filename,
          filePath: filePath,
          url: `/responses/${encodeURIComponent(filename)}`
        }));
      } catch (err) {
        console.error("[ERROR]", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Serve static files
  let filePath = parsedUrl.pathname === "/" || parsedUrl.pathname === "/index.html"
    ? path.join(__dirname, "f9-readiness-check.html")
    : path.join(__dirname, decodeURIComponent(parsedUrl.pathname));

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".xml": "application/xml"
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`F9 Readiness Check running at http://localhost:${PORT}/`);
  console.log(`XML responses will be automatically saved in: ${RESPONSES_DIR}`);
});
