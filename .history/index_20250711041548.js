const express = require("express");
const path = require("path");
const mysql = require("mysql2");
const QRCode = require("qrcode");
const crypto = require("crypto");
const puppeteer = require('puppeteer');

const app = express();

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MySQL Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "king",
  database: "Traval",
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to the database");
});

// GET All Records
app.get("/api/", (req, res) => {
  db.query("SELECT * FROM PersonRecord", (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

// POST: Insert and Generate QR
app.post("/", (req, res) => {
  const {
    id_number,
    nationality,
    profession,
    salary,
    validity_date,
    issued_by,
    created_by,
    tel_fax,
    unified_code,
    commercial_reg,
    request_date_hijri,
    reference_number,
    first_party,
    second_party,
    passport_number,
    visa_number,
  } = req.body;

  const qrToken = crypto.randomBytes(16).toString("hex");
  const qrUrl = `http://localhost:3000/pdf?token=${qrToken}`;

  QRCode.toDataURL(qrUrl, (err, qrBase64) => {
    if (err) {
      console.error("QR Generation Failed:", err);
      return res.status(500).json({ error: "QR Code generation failed" });
    }

    const insertQuery = `
      INSERT INTO PersonRecord (
        id_number, nationality, profession, salary, validity_date,
        issued_by, created_by, tel_fax, unified_code, commercial_reg,
        request_date_hijri, reference_number, first_party, second_party,
        passport_number, visa_number, qr_token, qrcode_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertValues = [
      id_number, nationality, profession, salary, validity_date,
      issued_by, created_by, tel_fax, unified_code, commercial_reg,
      request_date_hijri, reference_number, first_party, second_party,
      passport_number, visa_number, qrToken, qrBase64
    ];

    db.query(insertQuery, insertValues, (err, result) => {
      if (err) {
        console.error("Insert Failed:", err);
        return res.status(500).json({ error: "Insert failed" });
      }

      res.status(201).json({
        message: "Person added with QR",
        personId: result.insertId,
        token: qrToken,
        qrcode: qrBase64
      });
    });
  });
});

app.get('/api/download-pdf', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  // Fetch the person from DB
  db.query('SELECT * FROM PersonRecord WHERE qr_token = ?', [token], async (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).json({ error: 'Data not found' });
    }

    const person = results[0];

    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      const url = `http://localhost:3000/pdf.html?token=${token}`;
      await page.goto(url, { waitUntil: 'networkidle0' });

      // ✅ Inject QR code manually into DOM before capturing PDF
      await page.evaluate((qrcodeUrl) => {
        const img = document.getElementById("qrcode");
        if (img) {
          img.setAttribute("src", qrcodeUrl);
        }
      }, person.qrcode_url);

      // Wait for the image to render
      await page.waitForSelector('#qrcode[src]', { timeout: 5000 });

     const pdfBuffer = await page.pdf({
     format: 'A4',
       printBackground: true,
     scale: 0.8 // Try 0.8, or 0.7 if still too large
      });


      await browser.close();
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="record_${token}.pdf"`,
      });
      res.send(pdfBuffer);

    } catch (err) {
      console.error("PDF generation error:", err);
      res.status(500).send('Failed to generate PDF');
    }
  });
});


app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});